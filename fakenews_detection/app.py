import os
import re
import time
import json
import asyncio
import logging
import hashlib
import httpx
import urllib.parse
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, Response, Depends
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
    from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
    _TRANSFORMERS_AVAILABLE = True
except Exception:
    pipeline = AutoTokenizer = AutoModelForSequenceClassification = None
    _TRANSFORMERS_AVAILABLE = False

try:
    import torch
except Exception:
    torch = None

from prometheus_client import CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST
from prometheus_client import Counter as PromCounter, Histogram
try:
    from prometheus_client.multiprocess import MultiProcessCollector
except Exception:
    MultiProcessCollector = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("fakenews_detection")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    NEWSAPI_KEY: Optional[str] = Field(None, env="NEWSAPI_KEY")
    NEWSDATA_KEY: Optional[str] = Field(None, env="NEWSDATA_KEY")
    GNEWS_KEY: Optional[str] = Field(None, env="GNEWS_KEY")
    FAKE_MODEL: str = Field("dhruvpal/fake-news-bert", env="FAKE_MODEL")
    HF_LOCAL_DIR: Optional[str] = Field("/models/fake_news_models", env="HF_LOCAL_DIR")
    CACHE_TTL: int = Field(1800, env="CACHE_TTL")
    REDIS_URL: Optional[str] = Field(None, env="REDIS_URL")

settings = Settings()

redis_client = None
use_redis = False
USE_TRANSFORMERS = False
fake_classifier = None

cache_local = TTLCache(maxsize=4096, ttl=settings.CACHE_TTL)

# Prometheus
PROM_MULTIPROC_DIR = os.environ.get("PROMETHEUS_MULTIPROC_DIR")

REQUEST_COUNT = PromCounter("fake_news_requests_total", "Total requests", ["status"])
REQUEST_LATENCY = Histogram("fake_news_request_latency_seconds", "Latency")
CACHE_HITS = PromCounter("fake_news_cache_hit_total", "Cache hits", ["type"])

# ---------- Stylometric word lists ----------
_SENSATIONAL_WORDS = {
    "shocking", "bombshell", "hoax", "secret", "exposed", "conspiracy",
    "scandal", "explosive", "outrage", "unbelievable", "stunning", "exclusive",
    "banned", "suppressed", "cover-up", "coverup", "miracle", "cure",
    "they don't want you to know", "wake up", "sheeple", "nwo", "illuminati",
    "plandemic", "scamdemic", "false flag", "deep state", "globalists",
    "mainstream media lies", "fake news", "censored", "whistleblower",
    "proof", "caught", "leaked", "alarming", "urgent", "must see",
    "share before deleted", "breaking", "revealed", "truth about"
}
_RE_WORD = re.compile(r"\b\w+\b")
_RE_EXCLAIM = re.compile(r"!")
_RE_CAPS_WORD = re.compile(r"\b[A-Z]{2,}\b")

# ---------- v9-Sentinel Advanced Stylometrics ----------
_RE_CLICKBAIT = re.compile(r"(will blow your mind|the truth about|what they don'?t want you to know|number \d will shock you|you won'?t believe|secret revealed|shocking truth)", re.IGNORECASE)
_SUBJECTIVE_WORDS = {"shocking", "terrifying", "miracle", "amazing", "disgusting", "horrific", "unbelievable", "massive", "outrageous", "stunning", "evil", "insane", "ridiculous"}
_OBJECTIVE_WORDS = {"stated", "reported", "according to", "announced", "published", "investigation", "official", "data", "analysis", "spokesperson", "documented"}

def calculate_lexical_diversity(text: str) -> float:
    words = _RE_WORD.findall(text.lower())
    if not words: return 1.0
    return len(set(words)) / len(words)

def detect_clickbait(text: str) -> float:
    hits = len(_RE_CLICKBAIT.findall(text))
    return min(hits * 0.2, 1.0) # max 1.0 penalty

def analyze_emotion_vs_fact(text: str) -> float:
    words = _RE_WORD.findall(text.lower())
    subj_count = sum(1 for w in words if w in _SUBJECTIVE_WORDS)
    obj_count = sum(1 for w in words if w in _OBJECTIVE_WORDS)
    total = subj_count + obj_count
    if total == 0: return 0.5
    return subj_count / total

import urllib.parse
def get_source_credibility(url: Optional[str]) -> float:
    if not url: return 1.0
    try:
        domain = urllib.parse.urlparse(url).netloc.lower().replace("www.", "")
        high_trust = {"reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "npr.org", "pbs.org", "wsj.com", "ft.com", "bloomberg.com"}
        low_trust = {"theonion.com", "infowars.com", "breitbart.com", "babylonbee.com", "naturalnews.com"}
        if domain in high_trust: return 0.8
        if domain in low_trust: return 1.3
        return 1.0
    except Exception:
        return 1.0


class DetectRequest(BaseModel):
    text: str = Field(..., min_length=10)
    source: Optional[str] = Field(None)
    article_url: Optional[str] = None
    article_title: Optional[str] = None


class DetectResponse(BaseModel):
    is_fake: bool
    confidence: float
    verified_by_factcheck: bool
    ml_score: float
    style_score: float
    verdict_method: str          # "factcheck_override" | "consensus"
    highlight_phrase: Optional[str] = None
    generation_time_seconds: float


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
    # Strip truncation/read more warnings from API providers so the ML isn't confused
    a = re.sub(r"(\[Content truncated.*?\]|\.{3,}\s*Read more.*?$|Read full article.*?$|Click here to read.*?$)", "", a, flags=re.IGNORECASE)
    a = re.sub(r"\r\n?", "\n", a)
    paragraphs = [re.sub(r'\s+', ' ', p).strip() for p in re.split(r'\n\s*\n', a) if p.strip()]
    return "\n\n".join(paragraphs)


def analyze_stylometrics(text: str) -> dict:
    """
    Linguistic/stylometric fake-news signal. Returns a dict with score and highlight sentence.
    """
    if not text:
        return {"score": 0.0, "highlight": None}

    words = _RE_WORD.findall(text.lower())
    total_words = max(len(words), 1)

    # 1. Sensational vocabulary — count unique sensational words present
    sensational_hits = sum(1 for w in set(words) if w in _SENSATIONAL_WORDS)
    # Normalise: 3+ unique sensational words = max score
    sensational_ratio = min(sensational_hits / 3.0, 1.0)

    # 2. ALL-CAPS words ratio (exclude very short abbreviations like "AI", "US")
    caps_words = [w for w in _RE_CAPS_WORD.findall(text) if len(w) > 2]
    caps_ratio = min(len(caps_words) / max(total_words * 0.05, 1), 1.0)

    # 3. Exclamation marks per 100 words
    exclaim_count = len(_RE_EXCLAIM.findall(text))
    exclaim_ratio = min((exclaim_count / total_words) * 100 / 3.0, 1.0)

    style_score = (
        sensational_ratio * 0.55 +
        caps_ratio       * 0.30 +
        exclaim_ratio    * 0.15
    )
    score = round(min(style_score, 1.0), 4)
    
    highlight = None
    if score > 0.15:
        sentences = [s.strip() for s in text.split('.') if len(s.strip()) > 20]
        max_hits = -1
        for s in sentences:
            s_lower = s.lower()
            s_words = _RE_WORD.findall(s_lower)
            hits = sum(1 for w in s_words if w in _SENSATIONAL_WORDS)
            caps = sum(1 for w in _RE_CAPS_WORD.findall(s) if len(w) > 2)
            exclaims = len(_RE_EXCLAIM.findall(s))
            
            # Weighted scoring for sentence impact
            sentence_impact = (hits * 2) + caps + exclaims
            if sentence_impact > max_hits and sentence_impact > 0:
                max_hits = sentence_impact
                highlight = s + "."

    return {"score": score, "highlight": highlight}


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


import httpx

async def fact_check_multi_api(query: str) -> bool:
    short_query = query[:100].strip()
    
    # 1. NewsAPI Fact Check
    if settings.NEWSAPI_KEY:
        try:
            from newsapi import NewsApiClient
            newsapi_client = NewsApiClient(api_key=settings.NEWSAPI_KEY)
            articles = newsapi_client.get_everything(q=short_query, language='en', page_size=1)
            if len(articles.get('articles', [])) > 0: return True
        except Exception as e:
            logger.warning("NewsAPI fact-check failed: %s", e)

    # 2. GNews Fact Check
    if settings.GNEWS_KEY:
        try:
            async with httpx.AsyncClient() as client:
                params = {"q": short_query, "apikey": settings.GNEWS_KEY, "lang": "en", "max": 1}
                resp = await client.get("https://gnews.io/api/v4/search", params=params, timeout=5.0)
                if resp.status_code == 200 and len(resp.json().get("articles", [])) > 0: return True
        except Exception as e:
            logger.warning("GNews fact-check failed: %s", e)
            
    return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, use_redis, USE_TRANSFORMERS, fake_classifier

    REDIS_URL = os.getenv("REDIS_URL") or settings.REDIS_URL
    if REDIS_URL and aioredis:
        try:
            redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await redis_client.ping()
            use_redis = True
            logger.info("Connected to Redis")
        except Exception as e:
            logger.warning("Redis unavailable: %s", e)
            use_redis = False

    USE_TRANSFORMERS = False
    fake_classifier = None
    if _TRANSFORMERS_AVAILABLE and settings.HF_LOCAL_DIR:
        model_name = settings.FAKE_MODEL
        try:
            load_path = os.path.join(settings.HF_LOCAL_DIR, model_name.replace("/", "_"))
            if not os.path.isdir(load_path):
                load_path = settings.HF_LOCAL_DIR

            tok = AutoTokenizer.from_pretrained(load_path, local_files_only=True, use_fast=True)
            mdl = AutoModelForSequenceClassification.from_pretrained(load_path, local_files_only=True)
            fake_classifier = pipeline(
                "text-classification",
                model=mdl,
                tokenizer=tok,
                device=-1,
                truncation=True,
                max_length=512
            )
            USE_TRANSFORMERS = True
            logger.info("Loaded model: %s from %s", model_name, load_path)
        except Exception as e:
            logger.warning("Failed to load %s: %s — will use neutral fallback (0.5)", model_name, e)

    yield

    if redis_client:
        await redis_client.close()
    logger.info("Shutdown complete")


app = FastAPI(title="Fake News Detection (v8-consensus)", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "transformers": USE_TRANSFORMERS,
        "model": settings.FAKE_MODEL if USE_TRANSFORMERS else "none",
        "newsapi": bool(settings.NEWSAPI_KEY)
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


@app.post("/detect_fake_news", response_model=DetectResponse)
async def detect(req: DetectRequest, request: Request, db: Session = Depends(get_db)):
    start = time.monotonic()
    try:
        text = (req.text or "").strip()
        if not text:
            raise HTTPException(400, "Text required")

        cache_key = _sha256_key("fake_news_v9_sentinel", text)
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

        article = preprocess_article(text)

        # ── Signal 1: dhruvpal/fake-news-bert ML score ───────────────────────
        ml_prob = 0.5          # neutral fallback when model unavailable
        if USE_TRANSFORMERS and fake_classifier:
            try:
                # Truncation happens automatically via pipeline tokenization now
                pred = fake_classifier(article)[0]
                score = float(pred.get("score", 0.5))
                label = pred.get("label", "").lower()
                # LABEL_1 / "fake" / "false" → high fake probability
                if "fake" in label or "label_1" in label or "false" in label:
                    ml_prob = score
                else:
                    ml_prob = 1.0 - score
            except Exception as e:
                logger.warning("Classifier inference failed: %s", e)
                ml_prob = 0.5
                
        # Dampen ML confidence on exceptionally short snippets
        word_count = len(_RE_WORD.findall(article))
        if word_count < 40 and ml_prob != 0.5:
            ml_prob = 0.5 + (ml_prob - 0.5) * 0.5

        # ── Signal 2: V9 Advanced Stylometrics ────────────────────────────
        style_result = analyze_stylometrics(article)
        base_style_prob = style_result["score"]
        clickbait_penalty = detect_clickbait(article)
        style_prob = min(base_style_prob + (clickbait_penalty * 0.5), 1.0)
        highlight_phrase = style_result["highlight"]

        # ── Signal 3: V9 Cognitive Complexity & Objectivity ───────────────
        lex_div = calculate_lexical_diversity(article)
        # Low diversity (<0.45) increases fake probability.
        lex_penalty = max(0.0, 0.45 - lex_div) * 2.0
        emotion_ratio = analyze_emotion_vs_fact(article)
        cog_prob = (lex_penalty * 0.5) + (emotion_ratio * 0.5)

        # ── Signal 4: V9 Source Credibility ───────────────────────────────
        source_multiplier = get_source_credibility(req.article_url or req.source)

        # ── Signal 5: V9 Multi-API Fact-Check ─────────────────────────────
        # Use the article title as the search query — it is more precise
        # than raw body text. Fall back to the first 150 chars if no title.
        fact_query = (req.article_title or article[:150]).strip()
        verified = await fact_check_multi_api(fact_query)

        # ── Consensus formula v9-Sentinel ─────────────────────────────────
        if verified:
            base_prob = ml_prob * 0.25
            verdict_method = "factcheck_override_v9"
        else:
            # V9 Weights: 45% ML, 25% Style, 20% Cognitive, 10% Source (Baseline 0.5)
            # We incorporate Source via multiplier on the final result for safety.
            weighted_prob = (ml_prob * 0.45) + (style_prob * 0.25) + (cog_prob * 0.20) + (0.5 * 0.10)
            base_prob = weighted_prob
            verdict_method = "v9_consensus"

        final_fake_prob = base_prob * source_multiplier

        # Pristine Style Cap: extremely clean text shouldn't be overridden by hallucinations.
        if not verified and style_prob < 0.1 and cog_prob < 0.3:
            if final_fake_prob >= 0.5:
                final_fake_prob = 0.49
            verdict_method = "pristine_style_cap_v9"

        final_fake_prob = max(0.0, min(1.0, final_fake_prob))
        is_fake = final_fake_prob > 0.5
        confidence = round(abs(final_fake_prob - 0.5) * 2, 4)

        elapsed = round(time.monotonic() - start, 3)

        final = {
            "is_fake": is_fake,
            "confidence": confidence,
            "verified_by_factcheck": verified,
            "ml_score": round(ml_prob, 4),
            "style_score": round(style_prob, 4),
            "verdict_method": verdict_method,
            "highlight_phrase": highlight_phrase,
            "generation_time_seconds": elapsed
        }

        if use_redis:
            await _redis_set(cache_key, json.dumps(final), settings.CACHE_TTL)
        else:
            cache_local[cache_key] = final

        REQUEST_COUNT.labels(status="ok").inc()
        REQUEST_LATENCY.observe(time.monotonic() - start)
        logger.info(
            "v9-sentinel: ml=%.3f style=%.3f cog=%.3f src_mult=%.2f verified=%s final=%.3f is_fake=%s method=%s (%.2fs)",
            ml_prob, style_prob, cog_prob, source_multiplier, verified, final_fake_prob, is_fake, verdict_method, elapsed
        )

        user_id = request.headers.get("X-User-Id")
        if user_id and req.article_url:
            try:
                # Deduplicate: only insert if it doesn't already exist for this user/url
                existing = db.query(models.FakeNewsLog).filter(
                    models.FakeNewsLog.user_id == user_id, 
                    models.FakeNewsLog.article_url == req.article_url
                ).first()
                
                if not existing:
                    log_entry = models.FakeNewsLog(
                        user_id=user_id,
                        article_url=req.article_url,
                        article_title=req.article_title,
                        is_fake=is_fake,
                        confidence=confidence,
                        ml_score=ml_prob,
                        style_score=style_prob,
                        highlight_phrase=final.get("highlight_phrase")
                    )
                    db.add(log_entry)
                    db.commit()
            except Exception as e:
                logger.warning("Failed to save fakenews to db for user_id=%s: %s", user_id, e)

        return final

    except HTTPException:
        raise
    except Exception:
        logger.exception("Error in detect")
        REQUEST_COUNT.labels(status="error").inc()
        raise HTTPException(500, "Internal error")

@app.get("/global_stats")
async def get_global_stats(db: Session = Depends(get_db)):
    try:
        total = db.query(models.FakeNewsLog).count()
        fake = db.query(models.FakeNewsLog).filter(models.FakeNewsLog.is_fake == True).count()
        return {
            "total": total,
            "fake_count": fake,
            "credible_count": total - fake
        }
    except Exception as e:
        logger.error("Failed to fetch global stats: %s", e)
        raise HTTPException(500, "Database error")

@app.get("/history/{user_id}")
async def get_fakenews_history(user_id: str, db: Session = Depends(get_db)):
    try:
        logs = db.query(models.FakeNewsLog).filter(models.FakeNewsLog.user_id == user_id).order_by(models.FakeNewsLog.created_at.desc()).all()
        return [
            {
                "id": log.id,
                "article_url": log.article_url,
                "article_title": log.article_title,
                "is_fake": log.is_fake,
                "confidence": log.confidence,
                "ml_score": log.ml_score,
                "style_score": log.style_score,
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
        query = db.query(models.FakeNewsLog).filter(models.FakeNewsLog.article_url == url)
        if user_id:
            query = query.filter(models.FakeNewsLog.user_id == user_id)
        log = query.order_by(models.FakeNewsLog.created_at.desc()).first()
        if not log:
            return {"found": False}
        return {
            "found": True,
            "is_fake": log.is_fake,
            "confidence": log.confidence,
            "ml_score": log.ml_score,
            "style_score": log.style_score,
            "highlight_phrase": getattr(log, 'highlight_phrase', None),
            "created_at": log.created_at.isoformat()
        }
    except Exception as e:
        logger.error("Failed to fetch analysis for url %s: %s", url, e)
        raise HTTPException(status_code=500, detail="Internal database error")