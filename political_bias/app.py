"""
NewsPulse — Political Bias Service  (v6 — Groq API)
====================================================
Architecture:
  1. Preprocessing          — clean text, deduplicate paragraphs
  2. Topic Gate             — detect apolitical domains (tech/science/sports)
                              apply confidence penalty so pure-tech articles
                              never get a high bias score
  3. Political Framing Detector — curated left/right keyword lexicon to
                                  derive the ideological direction (kept — free, fast)
  4. Groq LLM Analysis      — llama-3.1-8b-instant classifies bias with nuance
  5. Label Fusion           — combine Groq probability + framing direction
                              into Left-Leaning / Center / Right-Leaning
  6. Calibrated Confidence  — topic-penalised final score

No PyTorch. No local model. Zero GPU/CPU RAM for models.
"""
import os
import re
import asyncio
import logging
import hashlib
import time
import json
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Response, Request, Depends
from pydantic import BaseModel, Field
import httpx
from cachetools import TTLCache
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.orm import Session
from groq import Groq

import models
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

try:
    import redis.asyncio as aioredis
except Exception:
    aioredis = None

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

    GROQ_API_KEY: Optional[str] = Field(None, env="GROQ_API_KEY")
    GROQ_MODEL: str = Field("llama-3.1-8b-instant", env="GROQ_MODEL")
    CACHE_TTL: int = Field(3600, env="CACHE_TTL")
    REDIS_URL: Optional[str] = Field(None, env="REDIS_URL")
    MAX_CONCURRENT_REQUESTS: int = Field(5, env="MAX_CONCURRENT_REQUESTS")


settings = Settings()

# ---------------------------------------------------------------------------
# App globals
# ---------------------------------------------------------------------------
redis_client = None
use_redis = False
groq_client: Optional[Groq] = None
semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_REQUESTS)
cache_local: TTLCache = TTLCache(maxsize=4096, ttl=settings.CACHE_TTL)

# Prometheus
PROM_MULTIPROC_DIR = os.environ.get("PROMETHEUS_MULTIPROC_DIR")
REQUEST_COUNT = PromCounter("bias_requests_total", "Total bias requests", ["status"])
REQUEST_LATENCY = Histogram("bias_request_latency_seconds", "Bias latency")
CACHE_HITS = PromCounter("bias_cache_hit_total", "Cache hits", ["type"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class BiasDetectionRequest(BaseModel):
    text: str = Field(..., min_length=10)
    source: Optional[str] = Field(None)
    article_url: Optional[str] = None
    article_title: Optional[str] = None


class BiasDetectionResponse(BaseModel):
    version: str = "news-pulse-v6-groq"
    bias_score: str
    confidence: float
    highlight_phrase: Optional[str] = None
    generation_time_seconds: float


# ---------------------------------------------------------------------------
# Text preprocessing
# ---------------------------------------------------------------------------
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
# Topic Gate — penalise apolitical domains (kept — free, instant)
# ---------------------------------------------------------------------------
_TECH_SCIENCE_KEYWORDS = {
    "smartphone", "iphone", "android", "samsung", "galaxy", "display", "tv",
    "television", "oled", "qled", "pixel density", "refresh rate", "screen",
    "monitor", "laptop", "gpu", "cpu", "chip", "semiconductor", "processor",
    "battery", "charging", "wearable", "smartwatch", "airpods", "headphones",
    "telescope", "nasa", "spacex", "rocket", "satellite", "orbit",
    "vaccine trial", "clinical trial", "genome", "dna", "crispr",
    "photosynthesis", "quantum computing", "supercomputer", "particle physics",
    "neuroscience", "archaeology", "nba", "nfl", "nhl", "mlb", "premier league",
    "champions league", "world cup", "olympics", "grand slam", "formula one",
    "f1", "touchdown", "goal scored", "hat trick", "box office", "album release",
    "concert tour", "movie sequel", "grammy", "oscar", "emmy", "golden globe",
    "circadian", "blue light", "melatonin", "sleep study", "eye strain",
}

_POLITICAL_ANCHOR_WORDS = {
    "congress", "senate", "parliament", "legislation", "executive order",
    "president", "prime minister", "election", "vote", "ballot",
    "political party", "democrat", "republican", "conservative", "liberal",
    "socialist", "capitalist", "administration", "white house", "kremlin",
    "policy reform", "lobbying", "filibuster", "geopolitics",
    "diplomacy", "treaty", "sanction", "tariff war",
}


def get_topic_penalty(text: str) -> float:
    lower = text.lower()
    tech_hits = sum(1 for kw in _TECH_SCIENCE_KEYWORDS if kw in lower)
    political_hits = sum(1 for kw in _POLITICAL_ANCHOR_WORDS if kw in lower)

    if tech_hits == 0:
        return 0.0
    if political_hits >= 2:
        return 0.15
    if tech_hits >= 4:
        return 0.70
    elif tech_hits >= 2:
        return 0.50
    else:
        return 0.30


# ---------------------------------------------------------------------------
# Political Framing Detector — keyword lexicon (kept — free, adds direction)
# ---------------------------------------------------------------------------
_LEFT_FRAMING = {
    "universal healthcare", "single payer", "medicare for all", "social justice",
    "systemic racism", "systemic inequality", "income inequality", "wealth gap",
    "living wage", "workers rights", "labor union", "labour union",
    "workers strike", "collective bargaining", "unionize",
    "climate justice", "climate action", "green new deal",
    "affordable housing", "food insecurity", "poverty alleviation",
    "progressive tax", "tax the rich", "billionaire tax",
    "welfare state", "social safety net", "universal basic income",
    "immigrant rights", "undocumented immigrants", "asylum seeker",
    "lgbtq rights", "transgender rights", "gender equality", "pay equity",
    "reproductive rights", "abortion rights", "womens rights",
    "racial equity", "reparations", "affirmative action",
    "police reform", "defund police", "racial profiling",
    "progressive", "left-wing", "far-left", "socialist", "social democrat",
    "democratic socialist", "green party", "antifa",
    "equity", "inclusion", "diversity", "marginalized", "oppressed",
    "grassroots", "solidarity", "empower",
}

_RIGHT_FRAMING = {
    "free market", "deregulation", "lower taxes", "tax cuts", "flat tax",
    "fiscal conservative", "small government", "limited government",
    "supply side", "trickle down", "privatization", "school choice",
    "charter school", "economic freedom", "free enterprise",
    "border security", "illegal immigration", "illegal aliens",
    "build the wall", "deportation", "strict immigration",
    "merit based immigration", "law and order",
    "traditional values", "family values", "religious freedom",
    "second amendment", "gun rights", "right to bear arms",
    "america first", "america first policy", "national sovereignty",
    "patriotism", "patriot", "pro life",
    "conservative", "right-wing", "far-right", "republican", "gop",
    "libertarian", "trump", "maga", "tea party",
    "freedom", "liberty", "constitution", "founding fathers",
}


def detect_political_framing(text: str) -> Dict[str, float]:
    lower = text.lower()
    total_words = max(len(re.findall(r'\b\w+\b', lower)), 1)

    left_hits = sum(1 for kw in _LEFT_FRAMING if kw in lower)
    right_hits = sum(1 for kw in _RIGHT_FRAMING if kw in lower)
    total_hits = left_hits + right_hits

    if total_hits == 0:
        return {"framing_score": 0.0, "framing_strength": 0.0}

    framing_score = (right_hits - left_hits) / total_hits
    framing_strength = min(total_hits / max(total_words / 20, 1), 1.0)

    return {
        "framing_score": round(framing_score, 4),
        "framing_strength": round(framing_strength, 4),
    }


# ---------------------------------------------------------------------------
# Groq LLM Analysis — primary signal
# ---------------------------------------------------------------------------
async def analyze_bias_with_groq(text: str, title: Optional[str]) -> dict:
    """Use Groq LLM to detect political bias. Returns biased_prob and highlight."""
    if not groq_client:
        return {"biased_prob": 0.5, "highlight_phrase": None}

    text_snippet = text[:2500]
    title_part = f"Title: {title}\n\n" if title else ""

    prompt = (
        f"{title_part}Article:\n{text_snippet}\n\n"
        "Analyze the political bias in this news article.\n"
        "Respond with ONLY a JSON object in this exact format:\n"
        '{"biased_probability": 0.0, "lean": "left|center|right", '
        '"highlight": "most biased phrase or null"}\n'
        "biased_probability: 0.0 = completely neutral, 1.0 = heavily biased.\n"
        "lean: which direction the bias leans (always provide one of the three values)."
    )

    try:
        def _call_groq():
            return groq_client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert political bias analyst. "
                            "Analyze news articles for political framing and bias. "
                            "Respond ONLY with valid JSON. No extra text."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                max_tokens=200,
                temperature=0.1,
                response_format={"type": "json_object"}
            )

        response = await asyncio.to_thread(_call_groq)
        raw = response.choices[0].message.content.strip()
        parsed = json.loads(raw)

        biased_prob = float(parsed.get("biased_probability", 0.5))
        biased_prob = max(0.0, min(1.0, biased_prob))
        lean = parsed.get("lean", "center").lower().strip()
        highlight = parsed.get("highlight") or None

        logger.info("Groq bias: prob=%.3f lean=%s", biased_prob, lean)
        return {"biased_prob": biased_prob, "lean": lean, "highlight_phrase": highlight}
    except Exception as e:
        logger.warning("Groq bias analysis failed: %s — using framing-only mode", e)
        return {"biased_prob": 0.5, "lean": "center", "highlight_phrase": None}


# ---------------------------------------------------------------------------
# Label Fusion
# ---------------------------------------------------------------------------
def fuse_labels(
    biased_prob: float,
    groq_lean: str,
    framing_score: float,
    framing_strength: float,
    topic_penalty: float,
) -> Dict[str, Any]:
    """Combine Groq bias probability + framing direction into a final label."""

    # Rule 1 — Hard override for clearly apolitical content
    if topic_penalty >= 0.50:
        conf = min(0.95, 0.40 + topic_penalty)
        return {"bias_score": "Center", "confidence": round(conf, 2)}

    # Rule 2 — Both signals say strongly neutral
    if biased_prob < 0.42 and abs(framing_score) < 0.20:
        conf = min(0.95, (1.0 - biased_prob) + (0.20 - abs(framing_score)))
        return {"bias_score": "Center", "confidence": round(conf, 2)}

    # Rule 3 & 4 — Use combined direction (Groq lean + framing lexicon)
    bias_conf = biased_prob * (1.0 + (framing_strength * 0.5)) * (1.0 - topic_penalty)
    bias_conf = min(0.95, max(0.20, bias_conf))

    # Determine direction: Groq is primary, framing lexicon is secondary tiebreaker
    lean_left = groq_lean == "left" or (groq_lean == "center" and framing_score < -0.12)
    lean_right = groq_lean == "right" or (groq_lean == "center" and framing_score > 0.12)

    if lean_left:
        return {"bias_score": "Left-Leaning", "confidence": round(bias_conf, 2)}
    if lean_right:
        return {"bias_score": "Right-Leaning", "confidence": round(bias_conf, 2)}

    # Biased in style but no specific ideological direction
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
# App lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, use_redis, groq_client

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

    if settings.GROQ_API_KEY:
        groq_client = Groq(api_key=settings.GROQ_API_KEY)
        logger.info("Groq client initialized with model: %s", settings.GROQ_MODEL)
    else:
        logger.warning("GROQ_API_KEY not set — framing-only mode active")

    yield

    if redis_client:
        await redis_client.close()
    logger.info("Shutdown complete")


app = FastAPI(title="Political Bias Service (v6 — Groq API)", lifespan=lifespan)


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
        "engine": "groq",
        "model": settings.GROQ_MODEL,
        "groq_ready": groq_client is not None,
        "version": "v6-groq",
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

        # Cache lookup
        cache_key = hashlib.sha256(f"biasv6:{text}".encode()).hexdigest()
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

        # Preprocessing
        article = preprocess_article(text)

        # Topic gate
        topic_penalty = get_topic_penalty(article)
        logger.info("topic_penalty=%.2f", topic_penalty)

        # Political framing (lexicon — free, instant)
        framing = detect_political_framing(article)
        framing_score = framing["framing_score"]
        framing_strength = framing["framing_strength"]
        logger.info("framing_score=%.3f  framing_strength=%.3f", framing_score, framing_strength)

        # Groq LLM analysis (primary signal)
        async with semaphore:
            groq_result = await analyze_bias_with_groq(article, req.article_title)

        biased_prob = groq_result["biased_prob"]
        groq_lean = groq_result.get("lean", "center")
        highlight_phrase = groq_result.get("highlight_phrase")

        # Framing-lexicon fallback highlight
        if not highlight_phrase and framing_strength > 0:
            highlight_phrase = "Detected political framing keywords in the article."

        # Label fusion
        result = fuse_labels(
            biased_prob=biased_prob,
            groq_lean=groq_lean,
            framing_score=framing_score,
            framing_strength=framing_strength,
            topic_penalty=topic_penalty,
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

        # Cache write
        if use_redis:
            await _redis_set(cache_key, json.dumps(final), settings.CACHE_TTL)
        else:
            cache_local[cache_key] = final

        REQUEST_COUNT.labels(status="success").inc()

        # DB logging
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
        logs = (
            db.query(models.BiasLog)
            .filter(models.BiasLog.user_id == user_id)
            .order_by(models.BiasLog.created_at.desc())
            .all()
        )
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