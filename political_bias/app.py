"""
NewsPulse — Political Bias Service  (v5 — News-Aware Multi-Signal Detector)
===========================================================================
Architecture:
  1. Preprocessing   — clean text, deduplicate paragraphs
  2. Topic Gate      — detect apolitical domains (tech/science/sports) and
                       apply a confidence penalty so pure-tech articles
                       never get a high bias score
  3. Multi-Chunk BERT — split full article into overlapping 512-token windows,
                        run d4data/bias-detection-model on every chunk,
                        aggregate softmax probabilities
  4. Political Framing Detector — curated left / right keyword lexicon to
                                  derive the ideological *direction*
  5. Label Fusion    — combine BERT "biased" probability + framing direction
                       into Left-Leaning / Center / Right-Leaning
  6. Calibrated Confidence — entropy-normalized, topic-penalised score

Model: d4data/bias-detection-model (DistilBERT, trained on MBAD news dataset)
       81.7 % accuracy on news-bias classification
"""
import os
import re
import math
import asyncio
import logging
import hashlib
import time
import json
from typing import List, Optional, Dict, Any
from collections import Counter as PyCounter
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response, Request, Depends
from pydantic import BaseModel, Field
import httpx
from cachetools import TTLCache
from pydantic_settings import BaseSettings, SettingsConfigDict
from difflib import SequenceMatcher
import numpy as np
from sqlalchemy.orm import Session

import models
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

import torch
from scipy.special import softmax as sp_softmax
import redis.asyncio as aioredis
from transformers import AutoTokenizer, AutoModelForSequenceClassification

from prometheus_client import CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST
from prometheus_client import Counter as PromCounter, Histogram
try:
    from prometheus_client.multiprocess import MultiProcessCollector
except Exception:
    MultiProcessCollector = None

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("political_bias")

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    MODEL_API_URL: str = Field("http://ollama:11434/api/generate", env="MODEL_API_URL")
    MODEL_NAME: str = Field("qwen2.5:0.5b", env="MODEL_NAME")
    HF_MODEL_NAME: str = Field("d4data/bias-detection-model", env="HF_MODEL_NAME")
    HF_LOCAL_DIR: Optional[str] = Field("/models/political_bias_model", env="HF_LOCAL_DIR")
    BERT_MAX_LENGTH: int = Field(512, env="BERT_MAX_LENGTH")
    CHUNK_OVERLAP_TOKENS: int = Field(64, env="CHUNK_OVERLAP_TOKENS")
    CACHE_TTL: int = Field(3600, env="CACHE_TTL")
    REDIS_URL: Optional[str] = Field(None, env="REDIS_URL")
    MAX_CONCURRENT_REQUESTS: int = Field(2, env="MAX_CONCURRENT_REQUESTS")


settings = Settings()

# ---------------------------------------------------------------------------
# App lifespan — load model once
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global client, redis_client, use_redis
    global USE_TRANSFORMERS, hf_tokenizer, hf_model

    client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))
    logger.info("HTTP client initialized")

    REDIS_URL = os.getenv("REDIS_URL")
    if REDIS_URL and aioredis:
        try:
            redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await redis_client.ping()
            use_redis = True
            logger.info("Connected to Redis")
        except Exception as exc:
            logger.warning("Redis not available: %s", exc)
            use_redis = False
    else:
        use_redis = False

    # Load valurank/distilroberta-bias
    try:
        load_path = settings.HF_LOCAL_DIR or settings.HF_MODEL_NAME
        hf_tokenizer = AutoTokenizer.from_pretrained(load_path)
        hf_model = AutoModelForSequenceClassification.from_pretrained(load_path)
        hf_model.eval()
        USE_TRANSFORMERS = True
        logger.info("Bias model loaded from %s — labels: %s",
                    load_path, hf_model.config.id2label)
    except Exception as exc:
        logger.warning("Bias model load failed: %s. Framing-only mode.", exc)
        USE_TRANSFORMERS = False
        hf_tokenizer = hf_model = None

    yield

    if client:
        await client.aclose()
    if redis_client:
        await redis_client.close()
    logger.info("Shutdown complete")


app = FastAPI(title="Political Bias Service (v5 — News-Aware)", lifespan=lifespan)

semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_REQUESTS)
cache_local: TTLCache = TTLCache(maxsize=4096, ttl=settings.CACHE_TTL)

redis_client = None
use_redis = False
client = None
USE_TRANSFORMERS = False
hf_tokenizer = None
hf_model = None

# Prometheus
PROM_MULTIPROC_DIR = os.environ.get("PROMETHEUS_MULTIPROC_DIR")

REQUEST_COUNT = PromCounter("bias_requests_total", "Total bias requests",
                            ["status"])
REQUEST_LATENCY = Histogram("bias_request_latency_seconds", "Bias latency")
CACHE_HITS = PromCounter("bias_cache_hit_total", "Cache hits",
                         ["type"])

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class BiasDetectionRequest(BaseModel):
    text: str = Field(..., min_length=10)
    source: Optional[str] = Field(None)
    article_url: Optional[str] = None
    article_title: Optional[str] = None


class BiasDetectionResponse(BaseModel):
    version: str = "news-pulse-v5-news-aware"
    bias_score: str
    confidence: float
    highlight_phrase: Optional[str] = None
    generation_time_seconds: float


# ---------------------------------------------------------------------------
# Text preprocessing
# ---------------------------------------------------------------------------
_STOPWORDS = {
    "the", "and", "a", "an", "of", "in", "to", "is", "it", "that", "for",
    "on", "with", "as", "are", "was", "were", "be", "by", "this", "which",
    "or", "from", "at", "his", "her", "their", "has", "have", "had", "but",
    "not", "they", "you", "we", "he", "she", "its", "also", "said", "will",
    "would", "could", "been", "into", "about", "more", "than", "some",
}


def preprocess_article(article: str) -> str:
    if not article:
        return ""
    a = re.sub(r"(?im)^\s*related stories.*?$", "", article)
    a = re.sub(r"\r\n?", "\n", a)
    paragraphs = [
        re.sub(r'\s+', ' ', p).strip()
        for p in re.split(r'\n\s*\n', a)
        if p.strip()
    ]
    return "\n\n".join(paragraphs)


# ---------------------------------------------------------------------------
# Topic Gate — penalise apolitical domains
# ---------------------------------------------------------------------------
_TECH_SCIENCE_KEYWORDS = {
    # consumer tech
    "smartphone", "iphone", "android", "samsung", "galaxy", "display", "tv",
    "television", "oled", "qled", "micro led", "micro rgb", "pixel density",
    "refresh rate", "screen", "monitor", "laptop", "gpu", "cpu", "chip",
    "semiconductor", "processor", "battery", "charging", "wearable",
    "smartwatch", "airpods", "headphones", "camera megapixel",
    # science / medical
    "telescope", "nasa", "spacex", "rocket", "satellite", "orbit",
    "vaccine trial", "clinical trial", "genome", "dna", "crispr",
    "photosynthesis", "quantum computing", "supercomputer",
    "particle physics", "neuroscience", "archaeology",
    # sports
    "nba", "nfl", "nhl", "mlb", "premier league", "champions league",
    "world cup", "olympics", "grand slam", "formula one", "f1",
    "touchdown", "goal scored", "hat trick",
    # entertainment pure
    "box office", "album release", "concert tour", "movie sequel",
    "grammy", "oscar", "emmy", "golden globe",
    # sleep / health product
    "circadian", "blue light", "melatonin", "sleep study",
    "certification", "vde certified", "eye strain",
}

_POLITICAL_ANCHOR_WORDS = {
    # must be present to make a non-political article political
    "congress", "senate", "parliament", "legislation", "executive order",
    "president", "prime minister", "election", "vote", "ballot",
    "political party", "democrat", "republican", "conservative", "liberal",
    "socialist", "capitalist", "administration", "white house", "kremlin",
    "policy reform", "lobbying", "filibuster", "geopolitics",
    "diplomacy", "treaty", "sanction", "tariff war",
}


def get_topic_penalty(text: str) -> float:
    """
    Returns a penalty in [0.0, 0.70].
    0.0  = no penalty (clearly political article)
    0.70 = strong penalty (apolitical tech/science/sports article)
    """
    lower = text.lower()
    words = set(re.findall(r'\b\w+\b', lower))

    tech_hits = sum(1 for kw in _TECH_SCIENCE_KEYWORDS if kw in lower)
    political_hits = sum(1 for kw in _POLITICAL_ANCHOR_WORDS if kw in lower)

    if tech_hits == 0:
        return 0.0  # no tech/science signals → no penalty

    # If tech signals are present but so are strong political anchors,
    # the article is likely a tech-policy piece — reduce penalty
    if political_hits >= 2:
        return 0.15  # mild penalty

    # Graduated penalty: more tech signals → higher penalty
    if tech_hits >= 4:
        return 0.70
    elif tech_hits >= 2:
        return 0.50
    else:
        return 0.30


# ---------------------------------------------------------------------------
# Political Framing Detector — keyword lexicon
# ---------------------------------------------------------------------------
_LEFT_FRAMING = {
    # economic / social
    "universal healthcare", "single payer", "medicare for all","social justice",
    "systemic racism", "systemic inequality", "income inequality", "wealth gap",
    "living wage", "workers rights", "labor union", "labour union",
    "workers strike", "collective bargaining", "unionize",
    "climate justice", "climate action", "green new deal",
    "affordable housing", "food insecurity", "poverty alleviation",
    "progressive tax", "tax the rich", "billionaire tax",
    "welfare state", "social safety net", "universal basic income",
    # identity / civil rights
    "immigrant rights", "undocumented immigrants", "asylum seeker",
    "lgbtq rights", "transgender rights", "gender equality", "pay equity",
    "reproductive rights", "abortion rights", "womens rights",
    "racial equity", "reparations", "affirmative action",
    "police reform", "defund police", "racial profiling",
    # political labels
    "progressive", "left-wing", "far-left", "socialist", "social democrat",
    "democratic socialist", "green party", "antifa",
    # rhetoric markers
    "equity", "inclusion", "diversity", "marginalized", "oppressed",
    "grassroots", "solidarity", "empower",
}

_RIGHT_FRAMING = {
    # economic
    "free market", "deregulation", "lower taxes", "tax cuts", "flat tax",
    "fiscal conservative", "small government", "limited government",
    "supply side", "trickle down", "privatization", "school choice",
    "charter school", "economic freedom", "free enterprise",
    # security / immigration
    "border security", "illegal immigration", "illegal aliens",
    "build the wall", "deportation", "strict immigration",
    "merit based immigration", "law and order",
    # identity / culture
    "traditional values", "family values", "religious freedom",
    "second amendment", "gun rights", "right to bear arms",
    "america first", "america first policy", "national sovereignty",
    "patriotism", "patriot", "pro life",
    # political labels
    "conservative", "right-wing", "far-right", "republican", "gop",
    "libertarian", "trump", "maga", "tea party",
    # rhetoric markers
    "freedom", "liberty", "constitution", "founding fathers",
}


def detect_political_framing(text: str) -> Dict[str, float]:
    """
    Returns:
      framing_score   in [-1.0, +1.0]   (-1 = hard left, 0 = neutral, +1 = hard right)
      framing_strength in [0.0, 1.0]    proportion of political keywords to total words
    """
    lower = text.lower()
    total_words = max(len(re.findall(r'\b\w+\b', lower)), 1)

    left_hits = sum(1 for kw in _LEFT_FRAMING if kw in lower)
    right_hits = sum(1 for kw in _RIGHT_FRAMING if kw in lower)
    total_hits = left_hits + right_hits

    if total_hits == 0:
        return {"framing_score": 0.0, "framing_strength": 0.0}

    framing_score = (right_hits - left_hits) / total_hits  # [-1, +1]
    framing_strength = min(total_hits / max(total_words / 20, 1), 1.0)

    return {
        "framing_score": round(framing_score, 4),
        "framing_strength": round(framing_strength, 4),
    }


# ---------------------------------------------------------------------------
# Multi-Chunk BERT Inference
# ---------------------------------------------------------------------------
def _chunk_token_ids(token_ids: List[int],
                     max_len: int = 510,
                     overlap: int = 64) -> List[List[int]]:
    """Split a flat list of token IDs into overlapping windows."""
    stride = max_len - overlap
    chunks = []
    start = 0
    while start < len(token_ids):
        chunks.append(token_ids[start: start + max_len])
        if start + max_len >= len(token_ids):
            break
        start += stride
    return chunks


async def run_bert_chunks(text: str) -> Dict[str, Any]:
    """
    Run d4data/bias-detection-model across the full article using chunking.
    Returns averaged softmax probabilities keyed by label name, and the most biased highlight phrase.
    """
    if not USE_TRANSFORMERS or hf_tokenizer is None or hf_model is None:
        return {}

    def _forward():
        # Tokenize without truncation to get all tokens
        # We explicitly suppress the warning by slicing if needed, but
        # the model complains if the raw tokenizer output exceeds model_max_length
        # before we even chunk it. 
        encoding = hf_tokenizer(
            text,
            add_special_tokens=False,
            truncation=False,
        )
        all_ids = encoding["input_ids"]

        # RoBERTa max length is typically 514 (but practically 512 for user tokens).
        # We use 510 to leave 2 spaces for bos_token and eos_token.
        # Fail-safe clamp for the vocabulary size to avoid IndexError edge-cases
        vocab_size = getattr(hf_model.config, "vocab_size", 50265)
        clipped_ids = [min(tid, vocab_size - 1) for tid in all_ids]

        id_chunks = _chunk_token_ids(clipped_ids, max_len=510, overlap=64)

        # fallback to 0/2 for RoBERTa if cls/sep are None
        bos_id = hf_tokenizer.bos_token_id if hf_tokenizer.bos_token_id is not None else 0
        eos_id = hf_tokenizer.eos_token_id if hf_tokenizer.eos_token_id is not None else 2
        
        # RoBERTa uses 1 for padding
        pad_id = hf_tokenizer.pad_token_id if hf_tokenizer.pad_token_id is not None else 1

        chunk_probs = []
        max_bias_prob = -1.0
        max_bias_chunk_ids = []

        with torch.no_grad():
            for chunk_ids in id_chunks:
                # RoBERTa expects exactly BOS + tokens + EOS
                full_ids = [bos_id] + chunk_ids + [eos_id]
                
                # Dynamic padding and hard-clamping to max sequence length
                max_model_length = getattr(hf_model.config, "max_position_embeddings", 514)
                safe_max_length = min(512, max_model_length - 2)

                if len(full_ids) > safe_max_length:
                    full_ids = full_ids[:safe_max_length - 1] + [eos_id]
                    
                length = len(full_ids)
                input_ids = torch.tensor([full_ids])
                
                # Mask handles the padding gracefully so we don't index empty space
                attention_mask = torch.ones(1, length, dtype=torch.long)
                
                try:
                    outputs = hf_model(input_ids=input_ids, attention_mask=attention_mask)
                    probs = torch.softmax(outputs.logits, dim=-1)[0].tolist()
                    chunk_probs.append(probs)
                    
                    id2label = getattr(hf_model.config, "id2label", {0: "non-biased", 1: "biased"})
                    for i, label_name in id2label.items():
                        if "bias" in str(label_name).lower() and "non" not in str(label_name).lower():
                            if probs[i] > max_bias_prob:
                                max_bias_prob = probs[i]
                                max_bias_chunk_ids = chunk_ids
                            break
                except Exception as e:
                    logger.error(f"Failed to infer chunk of length {length}: {e}")
                    continue

        if not chunk_probs:
            return {}

        highlight_phrase = None
        if max_bias_chunk_ids:
            decoded_chunk = hf_tokenizer.decode(max_bias_chunk_ids, skip_special_tokens=True)
            sentences = [s.strip() for s in decoded_chunk.split('.') if len(s.strip()) > 30]
            if sentences:
                highlight_phrase = sentences[len(sentences) // 2] + "."

        # Weight chunks by position — first and last chunks carry more signal
        n = len(chunk_probs)
        if n == 1:
            weights = [1.0]
        else:
            weights = []
            for i in range(n):
                # First and last chunk weighted 1.5x, middle chunks 1.0x
                w = 1.5 if i == 0 or i == n - 1 else 1.0
                weights.append(w)
        total_w = sum(weights)
        avg_probs = [
            sum(chunk_probs[i][j] * weights[i] for i in range(n)) / total_w
            for j in range(len(chunk_probs[0]))
        ]

        id2label = hf_model.config.id2label
        return {
            "probs": {str(id2label[i]).lower(): avg_probs[i] for i in range(len(avg_probs))},
            "highlight_phrase": highlight_phrase
        }

    return await asyncio.to_thread(_forward)


# ---------------------------------------------------------------------------
# Label fusion & Calibrated Confidence
# ---------------------------------------------------------------------------
def fuse_labels(biased_prob: float,
                framing_score: float,
                framing_strength: float,
                topic_penalty: float,
                class_probs: List[float]) -> Dict[str, Any]:
    """
    Combine BERT bias probability and framing direction into a final label
    with calibrated confidence based on the fusion rule.
    """
    # Rule 1 — Hard override for clearly apolitical content (Tech/Sports/Science)
    if topic_penalty >= 0.50:
        # If the gate blocks it, we are highly confident it's Center. 
        # e.g., topic_penalty = 0.70 -> confidence 0.40 + 0.50 = 0.90
        conf = min(0.95, 0.40 + topic_penalty)
        return {"bias_score": "Center", "confidence": round(conf, 2)}

    # Rule 2 — Both signals say strongly neutral
    if biased_prob < 0.42 and abs(framing_score) < 0.20:
        # Lower bias prob = higher confidence it's Center
        conf = min(0.95, (1.0 - biased_prob) + (0.20 - abs(framing_score)))
        return {"bias_score": "Center", "confidence": round(conf, 2)}

    # Rules 3 & 4 — Use framing direction for Biased articles
    # Base confidence is the model's output, boosted by framing strength, penalized by stray keywords
    bias_conf = biased_prob * (1.0 + (framing_strength * 0.5)) * (1.0 - topic_penalty)
    bias_conf = min(0.95, max(0.20, bias_conf))

    if framing_score < -0.12:
        return {"bias_score": "Left-Leaning", "confidence": round(bias_conf, 2)}
    if framing_score > 0.12:
        return {"bias_score": "Right-Leaning", "confidence": round(bias_conf, 2)}

    # Rule 5 — Biased in writing style but no specific ideological direction detected
    conf = min(0.75, biased_prob * (1.0 - topic_penalty))
    return {"bias_score": "Center", "confidence": round(conf, 2)}


# ---------------------------------------------------------------------------
# Redis cache helpers
# ---------------------------------------------------------------------------
async def _redis_get(key: str) -> Optional[str]:
    if not use_redis or not redis_client:
        return None
    try:
        return await redis_client.get(key)
    except Exception:
        return None


async def _redis_set(key: str, value: str, ttl: int):
    if not use_redis or not redis_client:
        return
    try:
        await redis_client.set(key, value, ex=ttl)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Prometheus metrics endpoint
# ---------------------------------------------------------------------------
@app.get("/metrics")
async def metrics():
    if PROM_MULTIPROC_DIR and MultiProcessCollector:
        registry = CollectorRegistry()
        MultiProcessCollector(registry)
    else:
        from prometheus_client import REGISTRY
        registry = REGISTRY
    data = generate_latest(registry)
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "bert_loaded": USE_TRANSFORMERS,
        "model": settings.HF_MODEL_NAME,
        "version": "v5-news-aware",
    }


# ---------------------------------------------------------------------------
# Main endpoint
# ---------------------------------------------------------------------------
@app.post("/detect_bias")
async def detect_bias(req: BiasDetectionRequest, request: Request, db: Session = Depends(get_db)):
    start_time = time.time()
    REQUEST_COUNT.labels(status="attempt").inc()

    try:
        text = req.text.strip()
        if not text:
            raise HTTPException(400, "Text required")

        # ── Cache lookup ────────────────────────────────────────────────────
        cache_key = hashlib.sha256(f"biasv5:{text}".encode()).hexdigest()
        if use_redis:
            cached = await _redis_get(cache_key)
            if cached:
                CACHE_HITS.labels(type="redis").inc()
                return json.loads(cached)
        else:
            cached = cache_local.get(cache_key)
            if cached:
                CACHE_HITS.labels(type="local").inc()
                return cached

        # ── Preprocessing ───────────────────────────────────────────────────
        article = preprocess_article(text)

        # ── Topic gate ──────────────────────────────────────────────────────
        topic_penalty = get_topic_penalty(article)
        logger.info("topic_penalty=%.2f", topic_penalty)

        # ── Political framing ───────────────────────────────────────────────
        framing = detect_political_framing(article)
        framing_score = framing["framing_score"]
        framing_strength = framing["framing_strength"]
        logger.info("framing_score=%.3f  framing_strength=%.3f",
                    framing_score, framing_strength)

        # ── Multi-chunk BERT ────────────────────────────────────────────────
        bert_probs: Dict[str, float] = {}
        highlight_phrase = None
        async with semaphore:
            res = await run_bert_chunks(article)
            if res:
                bert_probs = res["probs"]
                highlight_phrase = res["highlight_phrase"]

        logger.info("bert_probs=%s", bert_probs)

        # ── Label fusion ────────────────────────────────────────────────────
        # d4data/bias-detection-model labels: "biased" and "non-biased"
        # (capitalisation may vary — we lower-cased in run_bert_chunks)
        biased_prob = 0.50  # neutral default if model unavailable
        class_probs = [0.50, 0.50]

        if bert_probs:
            # Find the biased probability regardless of exact label string
            for key, val in bert_probs.items():
                if "bias" in key and "non" not in key:
                    biased_prob = val
                    break
            class_probs = list(bert_probs.values())

        if not highlight_phrase and framing_strength > 0:
            # Fallback to lexical highlight if BERT didn't yield one
            highlight_phrase = "Detected heavy usage of political framing keywords."

        result = fuse_labels(
            biased_prob=biased_prob,
            framing_score=framing_score,
            framing_strength=framing_strength,
            topic_penalty=topic_penalty,
            class_probs=class_probs,
        )

        generation_time = round(time.time() - start_time, 2)
        final = {
            "bias_score": result["bias_score"],
            "confidence": result["confidence"],
            "highlight_phrase": highlight_phrase,
            "generation_time_seconds": generation_time,
        }
        logger.info("Result: %s (conf=%.2f) in %.2fs",
                    final["bias_score"], final["confidence"], generation_time)

        # ── Cache write ─────────────────────────────────────────────────────
        if use_redis:
            await _redis_set(cache_key, json.dumps(final), settings.CACHE_TTL)
        else:
            cache_local[cache_key] = final

        REQUEST_COUNT.labels(status="success").inc()

        user_id = request.headers.get("X-User-Id")
        if user_id and req.article_url:
            try:
                existing = db.query(models.BiasLog).filter(
                    models.BiasLog.user_id == user_id, 
                    models.BiasLog.article_url == req.article_url
                ).first()
                
                if not existing:
                    log_entry = models.BiasLog(
                        user_id=user_id,
                        article_url=req.article_url,
                        article_title=req.article_title,
                        bias_score=final["bias_score"],
                        confidence=final["confidence"],
                        highlight_phrase=final.get("highlight_phrase")
                    )
                    db.add(log_entry)
                    db.commit()
            except Exception as e:
                logger.warning("Failed to save bias to db for user_id=%s: %s", user_id, e)

        return final

    except HTTPException:
        REQUEST_COUNT.labels(status="client_error").inc()
        raise
    except Exception as exc:
        REQUEST_COUNT.labels(status="error").inc()
        logger.exception("Unhandled error: %s", exc)
        raise HTTPException(500, "Internal error")
    finally:
        REQUEST_LATENCY.observe(time.time() - start_time)

@app.get("/global_stats")
async def get_global_stats(db: Session = Depends(get_db)):
    try:
        total = db.query(models.BiasLog).count()
        left = db.query(models.BiasLog).filter(models.BiasLog.bias_score == "Left-Leaning").count()
        right = db.query(models.BiasLog).filter(models.BiasLog.bias_score == "Right-Leaning").count()
        center = db.query(models.BiasLog).filter(models.BiasLog.bias_score == "Center").count()
        return {
            "total": total,
            "distribution": {"left": left, "right": right, "center": center}
        }
    except Exception as e:
        logger.error("Failed to fetch global stats: %s", e)
        raise HTTPException(500, "Database error")

@app.get("/history/{user_id}")
async def get_bias_history(user_id: str, db: Session = Depends(get_db)):
    try:
        logs = db.query(models.BiasLog).filter(models.BiasLog.user_id == user_id).order_by(models.BiasLog.created_at.desc()).all()
        return [
            {
                "id": log.id,
                "article_url": log.article_url,
                "article_title": log.article_title,
                "bias_score": log.bias_score,
                "confidence": log.confidence,
                "created_at": log.created_at.isoformat()
            }
            for log in logs
        ]
    except Exception as e:
        logger.error("Failed to fetch history for user %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Internal database error")

@app.get("/analysis_by_url")
async def get_analysis_by_url(url: str, user_id: str = None, db: Session = Depends(get_db)):
    try:
        query = db.query(models.BiasLog).filter(models.BiasLog.article_url == url)
        if user_id:
            query = query.filter(models.BiasLog.user_id == user_id)
        log = query.order_by(models.BiasLog.created_at.desc()).first()
        if not log:
            return {"found": False}
        return {
            "found": True,
            "bias_score": log.bias_score,
            "confidence": log.confidence,
            "highlight_phrase": getattr(log, 'highlight_phrase', None),
            "created_at": log.created_at.isoformat()
        }
    except Exception as e:
        logger.error("Failed to fetch analysis for url %s: %s", url, e)
        raise HTTPException(status_code=500, detail="Internal database error")