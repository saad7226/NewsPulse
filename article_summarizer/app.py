import os
import re
import asyncio
import logging
import hashlib
import time
import json
from typing import Optional
from contextlib import asynccontextmanager
from collections import Counter as PyCounter

from fastapi import FastAPI, HTTPException, Response, Request, Depends
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from cachetools import TTLCache
from sqlalchemy.orm import Session

import models
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

try:
    import redis.asyncio as aioredis
except Exception:
    aioredis = None

try:
    from transformers import pipeline as hf_pipeline
    _HF_AVAILABLE = True
except Exception:
    hf_pipeline = None
    _HF_AVAILABLE = False

from prometheus_client import CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST
from prometheus_client import Counter as PromCounter, Histogram
try:
    from prometheus_client.multiprocess import MultiProcessCollector
except Exception:
    MultiProcessCollector = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("article_summarizer")


# ─── Settings ──────────────────────────────────────────────────────────────────
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    # HuggingFace summarization model — small & fast for CPU
    HF_SUMMARIZER_MODEL: str = Field(
        "sshleifer/distilbart-cnn-12-6",
        env="HF_SUMMARIZER_MODEL"
    )
    HF_LOCAL_DIR: Optional[str] = Field("/models/summarizer_model", env="HF_LOCAL_DIR")

    # Token limits — keep the model safe on constrained hardware
    MAX_INPUT_CHARS: int = Field(2500, env="MAX_INPUT_CHARS")   # hard truncation before tokenisation (Inverted Pyramid: ~500-600 words)
    HF_MAX_LENGTH: int = Field(200, env="HF_MAX_LENGTH")         # max summary tokens to generate
    HF_MIN_LENGTH: int = Field(40,  env="HF_MIN_LENGTH")         # min summary tokens

    REDIS_URL: Optional[str] = Field(None, env="REDIS_URL")
    SUMMARY_CACHE_TTL: int = Field(3600, env="SUMMARY_CACHE_TTL")


settings = Settings()

# ─── Globals ───────────────────────────────────────────────────────────────────
redis_client = None
use_redis = False
summarizer = None          # the loaded HF pipeline
summary_cache_local = TTLCache(maxsize=2048, ttl=settings.SUMMARY_CACHE_TTL)

# ─── Prometheus ────────────────────────────────────────────────────────────────
PROM_MULTIPROC_DIR = os.environ.get("PROMETHEUS_MULTIPROC_DIR")

REQUEST_COUNT = PromCounter(
    "summarizer_requests_total", "Total summarize requests", ["status"]
)
REQUEST_LATENCY = Histogram(
    "summarizer_request_latency_seconds", "Summarize request latency"
)
CACHE_HITS = PromCounter(
    "summarizer_cache_hit_total", "Cache hits for summarizer", ["type"]
)

# ─── Stop-words for extractive fallback ────────────────────────────────────────
_STOPWORDS = {
    "the","and","a","an","of","in","to","is","it","that","for","on","with","as","are",
    "was","were","be","by","this","which","or","from","at","his","her","their","has",
    "have","had","but","not","they","you","we","he","she","its"
}


# ─── Pydantic models ───────────────────────────────────────────────────────────
class SummarizeRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=100_000)
    article_url: Optional[str] = None
    article_title: Optional[str] = None


# ─── Helpers ───────────────────────────────────────────────────────────────────
def _sha256_key(*parts: str) -> str:
    m = hashlib.sha256()
    for p in parts:
        m.update(str(p or "").encode("utf-8", errors="ignore"))
        m.update(b"\x00")
    return m.hexdigest()


def preprocess_article(article: str) -> str:
    if not article:
        return ""
    a = re.sub(r"(?im)^\s*related stories.*?$", "", article)
    a = re.sub(r"\r\n?", "\n", a)
    paragraphs = [re.sub(r'\s+', ' ', p).strip() for p in re.split(r'\n\s*\n', a) if p.strip()]
    return "\n\n".join(paragraphs).strip()


def split_into_sentences(text: str):
    text = text.strip()
    if not text:
        return []
    text = re.sub(r"(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St)\.", lambda m: m.group(1) + "<ABBR>", text)
    sents = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])", text)
    return [s.replace("<ABBR>", ".").strip() for s in sents if s.strip()]


def extractive_summary(article: str, max_sentences: int = 5) -> str:
    """TF-weighted extractive fallback — no external model needed."""
    sents = split_into_sentences(article)
    if not sents:
        return article[:500]
    if len(sents) <= max_sentences:
        return " ".join(sents)
    tf: PyCounter = PyCounter()
    sent_tokens = []
    for s in sents:
        toks = [t.lower().strip(".,;:()[]\"'") for t in re.split(r'\W+', s)
                if t and t.lower() not in _STOPWORDS]
        sent_tokens.append(toks)
        tf.update(toks)
    scores = []
    for idx, toks in enumerate(sent_tokens):
        score = sum(tf[t] for t in toks) / (len(toks) ** 0.5) if toks else 0.0
        scores.append((idx, score))
    top_idx = sorted(scores, key=lambda x: x[1], reverse=True)[:max_sentences]
    top_sorted = sorted(i for i, _ in top_idx)
    return " ".join(sents[i] for i in top_sorted)


async def _redis_get(key: str) -> Optional[str]:
    if not use_redis or not redis_client:
        return None
    try:
        return await redis_client.get(key)
    except Exception as e:
        logger.warning("Redis get failed: %s", e)
        return None


async def _redis_set(key: str, value: str, ttl: int):
    if not use_redis or not redis_client:
        return
    try:
        await redis_client.set(key, value, ex=ttl)
    except Exception as e:
        logger.warning("Redis set failed: %s", e)


# ─── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, use_redis, summarizer

    # Redis (optional)
    REDIS_URL = os.getenv("REDIS_URL") or settings.REDIS_URL
    if REDIS_URL and aioredis:
        try:
            redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await redis_client.ping()
            use_redis = True
            logger.info("Connected to Redis")
        except Exception as e:
            logger.warning("Redis unavailable: %s — using in-memory cache", e)
            use_redis = False

    # Load HuggingFace summarization pipeline
    summarizer = None
    if _HF_AVAILABLE:
        model_name = settings.HF_SUMMARIZER_MODEL
        # Determine load path — try paths in order of priority
        load_path = None
        base_dir = settings.HF_LOCAL_DIR  # e.g. /models/summarizer_model

        if base_dir and os.path.isdir(base_dir):
            # Check if config.json sits directly at base_dir root (snapshot_download puts it here)
            if os.path.isfile(os.path.join(base_dir, "config.json")):
                load_path = base_dir
                logger.info("Model found at volume root: %s", load_path)
            else:
                # Try a per-model named subdirectory
                subdir = os.path.join(base_dir, model_name.replace("/", "_"))
                if os.path.isdir(subdir) and os.path.isfile(os.path.join(subdir, "config.json")):
                    load_path = subdir
                    logger.info("Model found in subdir: %s", load_path)

        try:
            if load_path:
                logger.info("Loading summarizer from local path: %s", load_path)
                summarizer = hf_pipeline(
                    "summarization",
                    model=load_path,
                    tokenizer=load_path,
                    device=-1,       # CPU-only — never use GPU
                )
            else:
                # Volume empty — download from HuggingFace Hub on first start
                logger.info("No local model found, downloading: %s", model_name)
                summarizer = hf_pipeline(
                    "summarization",
                    model=model_name,
                    device=-1,
                )
            logger.info("Summarizer model ready: %s", model_name)
        except Exception as e:
            logger.warning("Failed to load HF summarizer: %s — will use extractive fallback", e)
            summarizer = None

    yield

    if redis_client:
        await redis_client.close()
    logger.info("Shutdown complete")


app = FastAPI(title="Article Summarizer (HF Local)", lifespan=lifespan)


# ─── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "summarizer": "hf_pipeline" if summarizer else "extractive_fallback",
        "model": settings.HF_SUMMARIZER_MODEL,
        "redis": "ok" if use_redis else "unavailable"
    }


@app.get("/metrics")
async def metrics():
    if PROM_MULTIPROC_DIR and MultiProcessCollector:
        registry = CollectorRegistry()
        MultiProcessCollector(registry)
    else:
        from prometheus_client import REGISTRY
        registry = REGISTRY
    return Response(content=generate_latest(registry), media_type=CONTENT_TYPE_LATEST)


@app.post("/summarize")
async def summarize(req: SummarizeRequest, request: Request, db: Session = Depends(get_db)):
    start = time.monotonic()
    try:
        text = (req.text or "").strip()
        if not text:
            raise HTTPException(400, "Text cannot be empty")

        cache_key = _sha256_key("summary_hf_v1", text)

        # Cache lookup
        if use_redis:
            cached = await _redis_get(cache_key)
            if cached:
                CACHE_HITS.labels(type="redis").inc()
                REQUEST_COUNT.labels(status="ok").inc()
                return json.loads(cached)
        else:
            cached = summary_cache_local.get(cache_key)
            if cached:
                CACHE_HITS.labels(type="local").inc()
                REQUEST_COUNT.labels(status="ok").inc()
                return cached

        article = preprocess_article(text)

        # ── Token-safe truncation ──────────────────────────────────────────────
        # DistilBART / BART have a 1024-token hard limit.
        # We truncate input chars to MAX_INPUT_CHARS so the tokeniser never
        # raises IndexError on constrained hardware.
        if len(article) > settings.MAX_INPUT_CHARS:
            logger.info(
                "Article truncated from %d to %d chars for model safety",
                len(article), settings.MAX_INPUT_CHARS
            )
            article = article[:settings.MAX_INPUT_CHARS]

        # ── Run summarisation in thread pool (CPU-bound) ───────────────────────
        final_summary = ""
        if summarizer is not None:
            loop = asyncio.get_running_loop()
            try:
                result = await loop.run_in_executor(
                    None,
                    lambda: summarizer(
                        article,
                        max_length=settings.HF_MAX_LENGTH,
                        min_length=settings.HF_MIN_LENGTH,
                        do_sample=False,
                        truncation=True    # extra safety: tokeniser-level truncation
                    )
                )
                raw = (result[0].get("summary_text") or "") if result else ""
                final_summary = raw.strip()
            except Exception as e:
                logger.warning("HF pipeline inference failed: %s — falling back to extractive", e)
                final_summary = ""

        # ── Extractive fallback ────────────────────────────────────────────────
        if not final_summary:
            logger.info("Using extractive fallback summary")
            final_summary = extractive_summary(article, max_sentences=5)

        if not final_summary:
            final_summary = article[:500]

        elapsed = round(time.monotonic() - start, 3)
        response = {
            "summary": final_summary,
            "generation_time_seconds": elapsed,
            "summary_type": "abstractive" if summarizer else "extractive",
            "length_sentences": len(split_into_sentences(final_summary))
        }

        # Cache store
        if use_redis:
            await _redis_set(cache_key, json.dumps(response), settings.SUMMARY_CACHE_TTL)
        else:
            summary_cache_local[cache_key] = response

        REQUEST_COUNT.labels(status="ok").inc()
        logger.info(
            "Summary done in %.2fs — %d chars → %d chars (%s)",
            elapsed, len(article), len(final_summary), response["summary_type"]
        )

        user_id = request.headers.get("X-User-Id")
        if user_id and req.article_url:
            try:
                # Deduplicate: only insert if it doesn't already exist for this user/url
                existing = db.query(models.SummaryLog).filter(
                    models.SummaryLog.user_id == user_id, 
                    models.SummaryLog.article_url == req.article_url
                ).first()
                
                if not existing:
                    log_entry = models.SummaryLog(
                        user_id=user_id,
                        article_url=req.article_url,
                        article_title=req.article_title,
                        summary_text=final_summary
                    )
                    db.add(log_entry)
                    db.commit()
            except Exception as e:
                logger.warning("Failed to save summary to db for user_id=%s: %s", user_id, e)

        return response

    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error in summarize")
        REQUEST_COUNT.labels(status="error").inc()
        raise HTTPException(500, "Internal server error")
    finally:
        REQUEST_LATENCY.observe(time.monotonic() - start)

@app.get("/analysis_by_url")
async def get_analysis_by_url(url: str, user_id: str = None, db: Session = Depends(get_db)):
    """Background check for user's previous analysis."""
    try:
        query = db.query(models.SummaryLog).filter(models.SummaryLog.article_url == url)
        if user_id:
            query = query.filter(models.SummaryLog.user_id == user_id)
        log = query.order_by(models.SummaryLog.created_at.desc()).first()
        if log:
            return {
                "found": True, 
                "summary": {
                    "summary": log.summary_text,
                    "summary_type": "extractive",
                    "length_sentences": len(split_into_sentences(log.summary_text)),
                    "generation_time_seconds": None
                }
            }
        return {"found": False}
    except Exception as e:
        logger.error("Failed to fetch system analysis by url %s: %s", url, e)
        return {"found": False}

@app.get("/history/{user_id}")
async def get_summary_history(user_id: str, db: Session = Depends(get_db)):
    try:
        logs = db.query(models.SummaryLog).filter(models.SummaryLog.user_id == user_id).order_by(models.SummaryLog.created_at.desc()).all()
        return [
            {
                "id": log.id,
                "article_url": log.article_url,
                "article_title": log.article_title,
                "summary_text": log.summary_text,
                "created_at": log.created_at.isoformat()
            }
            for log in logs
        ]
    except Exception as e:
        logger.error("Failed to fetch history for user %s: %s", user_id, e)
        raise HTTPException(status_code=500, detail="Internal database error")
