import os, re, json, time, logging, hashlib, asyncio
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
    import torch
    from transformers import T5ForConditionalGeneration, T5Tokenizer
    _TORCH_AVAILABLE = True
except Exception:
    _TORCH_AVAILABLE = False

from prometheus_client import CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST
from prometheus_client import Counter as PromCounter, Histogram
try:
    from prometheus_client.multiprocess import MultiProcessCollector
except Exception:
    MultiProcessCollector = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("counter_argument")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    COUNTER_CACHE_TTL: int = Field(3600, env="COUNTER_CACHE_TTL")
    REDIS_URL: Optional[str] = Field(None, env="REDIS_URL")
    MAX_INPUT_CHARS: int = Field(5000, env="MAX_INPUT_CHARS")
    HF_PRIMARY_MODEL: str = Field("MBZUAI/LaMini-Flan-T5-248M", env="HF_PRIMARY_MODEL")
    HF_FALLBACK_MODEL: str = Field("google/flan-t5-base", env="HF_FALLBACK_MODEL")
    HF_LOCAL_DIR: Optional[str] = Field("/models/counter_model", env="HF_LOCAL_DIR")
    INFERENCE_TIMEOUT: int = Field(90, env="INFERENCE_TIMEOUT")

settings = Settings()

redis_client = None
use_redis = False
_local_cache: TTLCache = TTLCache(maxsize=2048, ttl=settings.COUNTER_CACHE_TTL)

# Global model handles — set at startup
_tokenizer = None
_model = None
_engine_type = "nlp_template"  # tracks which engine is active

_PROM_DIR = os.environ.get("PROMETHEUS_MULTIPROC_DIR")
REQUEST_COUNT  = PromCounter("counter_requests_total", "Total requests", ["status"])
REQUEST_LATENCY = Histogram("counter_request_latency_seconds", "Latency")
CACHE_HITS     = PromCounter("counter_cache_hit_total", "Cache hits", ["type"])


class CounterArgumentRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=100_000)
    article_url: Optional[str] = None
    article_title: Optional[str] = None


def _sha256(*parts: str) -> str:
    m = hashlib.sha256()
    for p in parts:
        m.update(str(p or "").encode("utf-8", errors="ignore"))
        m.update(b"\x00")
    return m.hexdigest()


# ---------------------------------------------------------------------------
# ORIGINAL RULE-BASED NLP ENGINE (Fallback L2 — always available, zero deps)
# ---------------------------------------------------------------------------
_STOPWORDS = {
    "the","and","a","an","of","in","to","is","it","that","for","on","with","as","are",
    "was","were","be","by","this","which","or","from","at","his","her","their","has",
    "have","had","but","not","they","you","we","he","she","its","said","also","who"
}

_DOMAINS = {
    "political":     ["parliament","speaker","mp","election","vote","congress","senate",
                      "democrat","republican","government","policy","law","democratic",
                      "lawmakers","president","minister","legislation","political","party",
                      "campaign","opposition","coalition","constitution","regime","diplomat"],
    "business":      ["merger","acquisition","deal","fund","investment","investors","billion",
                      "million","shares","company","market","economy","finance","ceo",
                      "revenue","corporate","startup","venture","profit","stock","nasdaq"],
    "crime":         ["fraud","convicted","police","court","sentence","prison","stolen",
                      "victim","justice","scam","murder","theft","illegal","investigation",
                      "arrest","suspect","charges","bail","prosecution","felony"],
    "climate":       ["climate","emissions","global","warming","carbon","environment",
                      "temperature","greenhouse","pollution","sustainability","fossil",
                      "renewable","deforestation","biodiversity","net zero","paris"],
    "technology":    ["ai","artificial intelligence","algorithm","software","hardware","tech",
                      "data","pixel","apple","google","cyber","hack","device","app","patch",
                      "bug","user","openai","chatgpt","model","neural","robot","automation"],
    "health":        ["vaccine","disease","health","hospital","patient","medical","doctor",
                      "virus","cancer","diet","symptoms","treatment","medicine","clinical",
                      "outbreak","pandemic","fda","drug","mental health","pharmaceutical"],
    "entertainment": ["movie","film","actor","oscars","celebrity","music","hollywood",
                      "director","star","album","premiere","box office","streaming","netflix"],
    "sports":        ["football","match","manager","team","player","coach","stadium",
                      "tournament","league","champion","goal","referee","athletics","fifa",
                      "olympics","transfer","contract","injury","season"],
    "science":       ["nasa","space","study","research","scientists","physics","discovery",
                      "experiment","quantum","lab","theory","evidence","genome","particle"],
    "education":     ["school","university","student","teacher","education","college",
                      "campus","tuition","degree","curriculum","academic","enrollment"]
}

_TEMPLATES = {
    "political": [
        "While {subject} presents a compelling legislative stance, the analysis omits key structural inequalities that this policy fails to address at the grassroots level.",
        "The political framing surrounding {subject} risks oversimplifying a deeply contested issue; dissenting parliamentary voices and minority stakeholders are systematically marginalized in this narrative.",
        "Historical precedent demonstrates that policies championed by {subject} often generate significant unintended consequences that only manifest years after implementation, a dimension entirely absent from this reporting.",
        "The article's portrayal of {subject} reflects a single ideological lens; independent fiscal analysis and cross-party expert testimony could fundamentally alter the conclusions drawn here.",
        "Democratic accountability demands scrutiny of {subject}'s track record — the correlation between public promises and actual legislative outcomes reveals a pattern of strategic ambiguity that this piece overlooks.",
    ],
    "business": [
        "Although the {subject} strategy promises capital influx, it raises unaddressed concerns regarding ultimate editorial or operational independence.",
        "The heavy involvement of foreign or private funds surrounding {subject} could introduce regulatory conflicts that the article systematically downplays.",
        "Short-term financial prioritization in the {subject} transaction may risk long-term audience trust or market stability, a trade-off the reporting fails to quantify.",
        "Market concentration resulting from {subject}'s trajectory could harm competition and consumer choice, dimensions that antitrust regulators are increasingly scrutinizing globally.",
        "The optimistic projections cited for {subject} fail to account for macroeconomic headwinds, interest rate volatility, and the systemic risks embedded in leveraged expansion strategies.",
    ],
    "crime": [
        "While {subject} is rightfully scrutinized, the focus on individual malice obscures potential institutional failures and regulatory gaps that enabled the abuse to occur at scale.",
        "The narrative around {subject} lacks a comprehensive examination of systemic safeguards, treating the event as an isolated anomaly rather than a symptom of broader structural dysfunction.",
        "Emotional appeals regarding {subject}'s actions may overshadow necessary evidence-based discussions about preventative legislation and rehabilitation policy reform.",
        "Attributing causality solely to {subject} risks creating a convenient scapegoat while shielding the organizational and supervisory failures that created the conditions for this outcome.",
        "The article's framing raises critical due process concerns; media portrayal of {subject} at this stage of proceedings can irrevocably prejudice judicial outcomes and public perception alike.",
    ],
    "climate": [
        "While the specific claims about {subject} are alarming, relying on singular short-term datasets often obscures the complexity of multi-decade macro climate trends.",
        "Proposed policy solutions surrounding {subject} heavily favor developed nations, systematically ignoring the economic constraints and developmental aspirations of the Global South.",
        "The emotional framing of {subject} risks inducing public apathy rather than outlining the concrete, scalable policy reforms and behavioral shifts that science demands.",
        "Technological optimism regarding {subject} should be tempered; carbon capture and geoengineering solutions remain unproven at scale and may introduce unforeseen ecological risks.",
        "Market-based climate mechanisms proposed around {subject} have a demonstrably poor track record of delivering equitable outcomes; regulatory mandates may prove far more effective.",
    ],
    "technology": [
        "While the rapid deployment of {subject} addresses immediate technical demands, its frequency suggests systemic flaws in Quality Assurance pipelines that a patch alone cannot resolve.",
        "The narrative focuses heavily on the technical capabilities of {subject}, rather than scrutinizing the deeper implications for user privacy, algorithmic accountability, and data sovereignty.",
        "The concentration of power represented by {subject}'s ecosystem creates dangerous dependencies; open-source alternatives and interoperability mandates deserve serious policy consideration.",
        "The societal impact of {subject} on labor displacement and cognitive dependency patterns requires urgent interdisciplinary analysis that purely technical reporting consistently fails to provide.",
        "Ethical AI governance frameworks surrounding {subject} remain dangerously underdeveloped relative to the pace of commercial deployment, creating unquantified societal risks.",
    ],
    "health": [
        "Although the findings regarding {subject} present optimistic outcomes, the narrative lacks transparency regarding conflicts of interest in research funding and sample-size limitations.",
        "The heavy emphasis on population-level benefits of {subject} may obscure significant disparities in efficacy and access across diverse socioeconomic and demographic groups.",
        "Immediate adoption policies advocated for {subject} must be critically weighed against long-term physiological effects that only emerge from longitudinal multi-decade studies.",
        "The commodification of healthcare surrounding {subject} raises fundamental equity concerns; access to this treatment will likely remain stratified along lines of wealth and geography.",
        "Regulatory expedience in approving {subject} reflects political pressures rather than scientific consensus; independent replication of the core trial data remains critically absent.",
    ],
    "entertainment": [
        "The widespread praise for {subject} often functions as a calculated PR strategy, masking potential exploitative labor practices within the production pipeline.",
        "By framing {subject} purely through a lens of artistic achievement, the article ignores the monopolistic financial incentives driving its distribution and the homogenization of creative culture.",
        "The cultural impact attributed to {subject} may be artificially inflated by coordinated marketing spend rather than genuine organic audience consensus and critical longevity.",
        "Streaming dominance exemplified by {subject}'s release model contributes to the devaluation of creative labor and the algorithmic homogenization of content that stifles artistic risk-taking.",
        "The awards recognition garnered by {subject} reflects the internal politics and lobbying of a closed industry ecosystem, not necessarily the breadth of its cultural resonance.",
    ],
    "sports": [
        "The tactical brilliance attributed to {subject} may reflect vast financial disparities rather than genuine competitive innovation, raising fundamental questions about sporting integrity.",
        "Blaming individual performance in the context of {subject} is a reductive narrative that shields executive management from accountability for structural and developmental failures.",
        "The media cycle surrounding {subject} prioritizes sensationalized personal drama over substantive analysis of governance failures, refereeing inconsistencies, and financial fair play.",
        "The unprecedented commercialization surrounding {subject} risks destroying the grassroots sporting culture and community identity from which these institutions originally derived their legitimacy.",
        "Performance data analysis around {subject} reveals a consistent pattern of regression to the mean; what the media frames as genius is often variance within statistically predictable ranges.",
    ],
    "science": [
        "While the breakthrough regarding {subject} is celebrated, the results may prove difficult to independently reproduce outside highly controlled, well-funded laboratory environments.",
        "The framing of {subject} as a revolutionary discovery conflates theoretical models with actionable real-world utility; the gap between laboratory proof-of-concept and scalable application remains vast.",
        "Funding imperatives surrounding {subject} can inadvertently incentivize researchers to overstate the certainty of preliminary data, a form of publication bias that distorts scientific discourse.",
        "The ethical implications of the research direction pioneered by {subject} require broader societal deliberation; scientific capability must not automatically translate into scientific practice.",
        "Peer review processes surrounding {subject} remain vulnerable to groupthink and institutional prestige bias, calling into question whether truly heterodox findings receive fair evaluation.",
    ],
    "education": [
        "The educational reforms proposed around {subject} frequently prioritize easily quantifiable standardized metrics over holistic student well-being, creativity, and critical thinking capacity.",
        "By championing the technological integration of {subject}, the narrative overlooks the widening digital divide and the structural inequalities that persist among underfunded school districts.",
        "The focus on administrative success regarding {subject} minimizes ground-level burnout, chronic underfunding, and the resource constraints faced by actual classroom educators.",
        "Privatization models implicit in the {subject} agenda historically correlate with increased segregation and reduced accountability, outcomes the piece fails to address with empirical rigor.",
        "The imported educational paradigm surrounding {subject} neglects crucial local pedagogical context; evidence from high-performing systems suggests culturally adaptive curricula outperform transplanted models.",
    ],
    "default": [
        "The primary claims surrounding {subject} reflect a specific ideological viewpoint; independent verification of the underlying data and methodology is strongly recommended.",
        "The narrative presented regarding {subject} may overlook alternative systemic, historical, or structural explanations for the events described, limiting analytical depth.",
        "The immediate implications outlined for {subject} must be carefully weighed against potential long-term, unintended socioeconomic and institutional consequences.",
        "Key stakeholder perspectives directly affected by {subject} are conspicuously absent from this account, rendering the analysis incomplete and potentially misleading.",
        "The evidence base cited in relation to {subject} warrants careful scrutiny; the distinction between correlation and causation is a critical analytical gap in the reporting.",
    ]
}


def _extract_proper_nouns(text: str) -> str:
    text_clean = re.sub(r'(^|\.\s+)[A-Z]', ' ', text)
    words = re.findall(r'\b[A-Z][a-z]+\b', text_clean)
    if not words:
        return "the subject"
    counter = PyCounter(words)
    for word, _ in counter.most_common(5):
        if word.lower() not in _STOPWORDS and len(word) > 3:
            return word
    return "the subject"


def _determine_domain(text: str) -> str:
    text_lower = text.lower()
    scores = {
        domain: sum(1 for kw in kws if re.search(r'\b' + re.escape(kw) + r'\b', text_lower))
        for domain, kws in _DOMAINS.items()
    }
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "default"


def _nlp_template_counter(article: str) -> dict:
    """Original rule-based engine — zero external dependencies."""
    subject = _extract_proper_nouns(article)
    domain  = _determine_domain(article)
    templates = _TEMPLATES.get(domain, _TEMPLATES["default"])
    # Use all 5 templates for maximum richness
    bullets = [f"• {t.format(subject=subject)}" for t in templates]
    return {
        "counter_argument": "\n".join(bullets),
        "detected_domain":  domain,
        "extracted_subject": subject,
    }


# ---------------------------------------------------------------------------
# HF GENERATIVE ENGINE — LaMini-Flan-T5-248M + INT8 Quantization
# ---------------------------------------------------------------------------

def _truncate_to_words(text: str, max_words: int = 400) -> str:
    """Truncate to first `max_words` words to cap tokenization cost."""
    words = text.split()
    return " ".join(words[:max_words]) if len(words) > max_words else text


def _format_generated_text(raw: str, subject: str) -> str:
    """
    Convert a raw model output string into • bullet-point sentences.
    Includes heuristic filtering to drop "clunky" sentences typical of small T5 models.
    """
    # Remove any echo of the prompt that leaked into the output
    raw = re.sub(r"(?i)(read the|write a).*?counter-argument.*?:", "", raw).strip()
    
    # Split on sentence boundaries
    raw_sentences = re.split(r"(?<=[.!?])\s+", raw.strip())
    
    valid_sentences = []
    for s in raw_sentences:
        s = s.strip()
        if len(s) < 20: continue  # Too short to be a valid argument
        
        words = s.split()
        if len(words) > 40: continue  # Small T5 models hallucinate run-on sentences over 40 words
        if len(words) < 5: continue   # Fragment
        
        # Drop if it ends with a dangling conjunction/preposition (cut-off generation)
        last_word = words[-1].lower().strip(".!?")
        if last_word in {"and", "or", "the", "but", "that", "of", "in", "to", "a", "is", "by", "with", "for"}:
            continue
            
        # Drop if excessive repetition of substantive words (model looping)
        word_counts = PyCounter([w.lower() for w in words if len(w) > 3])
        if any(count > 3 for count in word_counts.values()):
            continue
            
        # Drop excessive negatives which usually means confused grammar
        if s.count(" not ") >= 2:
            continue
            
        valid_sentences.append(s)

    if not valid_sentences:
        # If the filter was too aggressive, return a safe fallback
        fallback = raw.strip()
        if fallback:
            # Cap at 150 chars to prevent UI breaking
            return f"• {fallback[:150]}..."
        return ""
        
    return "\n".join(f"• {s}" for s in valid_sentences[:3])   # cap at 3 to prevent logical drift


def _load_model_safe(model_name: str):
    """
    Attempt to load a T5 model + tokenizer and apply INT8 Dynamic Quantization.
    Returns (tokenizer, quantized_model) or raises on failure.
    """
    import torch
    from transformers import T5ForConditionalGeneration, T5Tokenizer

    logger.info("Loading tokenizer: %s", model_name)
    tokenizer = T5Tokenizer.from_pretrained(model_name)

    logger.info("Loading model weights: %s", model_name)
    model = T5ForConditionalGeneration.from_pretrained(model_name, torch_dtype=torch.float32)
    model.eval()

    logger.info("Applying PyTorch Dynamic INT8 Quantization (Linear layers)...")
    quantized = torch.quantization.quantize_dynamic(
        model,
        {torch.nn.Linear},
        dtype=torch.qint8
    )
    logger.info("Quantization complete — model ready for CPU inference.")
    return tokenizer, quantized


# ---------------------------------------------------------------------------
# Redis helpers
# ---------------------------------------------------------------------------
async def _redis_get(key: str) -> Optional[str]:
    if not use_redis or not redis_client:
        return None
    try:
        return await redis_client.get(key)
    except Exception as e:
        logger.warning("Redis get error: %s", e)
        return None


async def _redis_set(key: str, value: str, ttl: int) -> None:
    if not use_redis or not redis_client:
        return
    try:
        await redis_client.set(key, value, ex=ttl)
    except Exception as e:
        logger.warning("Redis set error: %s", e)


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, use_redis, _tokenizer, _model, _engine_type

    # ── Redis ──────────────────────────────────────────────────────────────
    REDIS_URL = os.getenv("REDIS_URL") or settings.REDIS_URL
    if REDIS_URL and aioredis:
        try:
            redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await redis_client.ping()
            use_redis = True
            logger.info("Redis connected.")
        except Exception as e:
            logger.warning("Redis unavailable: %s — using local cache.", e)

    # ── HF Model Loading (in thread so startup doesn't block) ─────────────
    if _TORCH_AVAILABLE:
        loop = asyncio.get_running_loop()
        loaded = False

        # Try primary model first, then fallback L1
        for attempt_model in (settings.HF_PRIMARY_MODEL, settings.HF_FALLBACK_MODEL):
            if loaded:
                break

            # Check if local volume has a pre-downloaded copy
            local_path = None
            if settings.HF_LOCAL_DIR and os.path.isdir(settings.HF_LOCAL_DIR):
                if os.path.isfile(os.path.join(settings.HF_LOCAL_DIR, "config.json")):
                    local_path = settings.HF_LOCAL_DIR

            source = local_path or attempt_model
            try:
                logger.info("Attempting to load counter-argument model from: %s", source)
                tokenizer, quantized_model = await loop.run_in_executor(
                    None, lambda s=source: _load_model_safe(s)
                )
                _tokenizer = tokenizer
                _model = quantized_model
                _engine_type = "hf_lamini_t5_int8"
                logger.info("✅ HF model loaded & quantized — engine: %s", _engine_type)
                loaded = True
            except Exception as e:
                logger.warning("Failed to load model '%s': %s — trying next fallback.", attempt_model, e)

        if not loaded:
            logger.warning("⚠️  All HF models failed. Running on NLP Template Engine (Fallback L2).")
            _engine_type = "nlp_template"
    else:
        logger.warning("PyTorch not available. Running on NLP Template Engine.")
        _engine_type = "nlp_template"

    logger.info("Counter Argument Service ready — engine: %s", _engine_type)
    yield

    if redis_client:
        await redis_client.close()
    logger.info("Shutdown complete.")


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(title="CounterArgumentService_v2_LaMini", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "engine": _engine_type,
        "primary_model": settings.HF_PRIMARY_MODEL,
        "redis": "ok" if use_redis else "unavailable",
    }


@app.get("/metrics")
async def metrics():
    if _PROM_DIR and MultiProcessCollector:
        registry = CollectorRegistry()
        MultiProcessCollector(registry)
    else:
        from prometheus_client import REGISTRY
        registry = REGISTRY
    return Response(content=generate_latest(registry), media_type=CONTENT_TYPE_LATEST)


# ---------------------------------------------------------------------------
# Core Generation Endpoint
# ---------------------------------------------------------------------------
@app.post("/generate_counter")
async def generate_counter(req: CounterArgumentRequest, request: Request, db: Session = Depends(get_db)):
    t_start = time.monotonic()
    try:
        text = (req.text or "").strip()
        if not text:
            raise HTTPException(400, "Text cannot be empty.")

        article = text[:settings.MAX_INPUT_CHARS]

        # Cache version bumped to v14 to invalidate old template-only cache entries
        cache_key = _sha256("counter_v14_lamini", article)

        if use_redis:
            cached = await _redis_get(cache_key)
            if cached:
                CACHE_HITS.labels(type="redis").inc()
                REQUEST_COUNT.labels(status="ok").inc()
                return json.loads(cached)
        else:
            hit = _local_cache.get(cache_key)
            if hit:
                CACHE_HITS.labels(type="local").inc()
                REQUEST_COUNT.labels(status="ok").inc()
                return hit

        # ── Always compute domain & subject (needed for fallback & schema) ──
        domain  = _determine_domain(article)
        subject = _extract_proper_nouns(article)

        # ── Primary path: HF Generative Model ───────────────────────────────
        final_counter = None
        used_engine   = _engine_type

        if _model is not None and _tokenizer is not None:
            try:
                # Truncate to 250 words so the small model isn't overwhelmed with facts
                truncated = _truncate_to_words(article, max_words=250)

                # Much stronger prompt forcing disagreement and argumentation
                prompt = (
                    f"Read the following text and write a strong counter-argument. "
                    f"Do not summarize. Disagree with the claims and provide an alternative perspective.\n\n"
                    f"Text: {truncated}\n\nCounter-argument:"
                )

                def _infer():
                    import torch
                    inputs = _tokenizer(
                        prompt,
                        return_tensors="pt",
                        max_length=384,
                        truncation=True,
                        padding=False,
                    )
                    with torch.no_grad():
                        output_ids = _model.generate(
                            **inputs,
                            max_new_tokens=200,   # Give it more room to argue
                            do_sample=True,       # Force generative diversity, avoid extractive summary
                            temperature=0.7,
                            top_p=0.9,
                            repetition_penalty=1.1,
                        )
                    return _tokenizer.decode(output_ids[0], skip_special_tokens=True)

                loop = asyncio.get_running_loop()
                raw_output = await asyncio.wait_for(
                    loop.run_in_executor(None, _infer),
                    timeout=settings.INFERENCE_TIMEOUT   # 90s hard cap
                )

                formatted = _format_generated_text(raw_output, subject)
                if formatted and len(formatted) > 30:
                    final_counter = formatted
                    used_engine   = "hf_lamini_t5_int8"
                    logger.info("HF generation succeeded in %.2fs.", time.monotonic() - t_start)

            except asyncio.TimeoutError:
                logger.warning("HF inference timed out after %ds — falling back to NLP templates.", settings.INFERENCE_TIMEOUT)
            except Exception as e:
                logger.warning("HF inference failed (%s) — falling back to NLP templates.", e)

        # ── Fallback L2: Original NLP Template Engine ────────────────────────
        if not final_counter:
            nlp_result    = _nlp_template_counter(article)
            final_counter = nlp_result["counter_argument"]
            used_engine   = "nlp_template_fallback"
            logger.info("Using NLP template fallback engine.")

        latency = time.monotonic() - t_start
        REQUEST_LATENCY.observe(latency)
        REQUEST_COUNT.labels(status="ok").inc()
        logger.info("Counter argument generated in %.4fs via [%s].", latency, used_engine)

        data = {
            "counter_argument":  final_counter,
            "detected_domain":   domain,
            "extracted_subject": subject,
            "engine_used":       used_engine,          # extra debug field — frontend ignores it
            "generation_time_seconds": round(latency, 3),
        }

        if use_redis:
            await _redis_set(cache_key, json.dumps(data), settings.COUNTER_CACHE_TTL)
        else:
            _local_cache[cache_key] = data

        # ── DB Logging ───────────────────────────────────────────────────────
        user_id = request.headers.get("X-User-Id")
        if user_id and req.article_url:
            try:
                existing = db.query(models.CounterLog).filter(
                    models.CounterLog.user_id    == user_id,
                    models.CounterLog.article_url == req.article_url
                ).first()
                if existing:
                    existing.counter_argument = final_counter
                else:
                    db.add(models.CounterLog(
                        user_id          = user_id,
                        article_url      = req.article_url,
                        article_title    = req.article_title or "Unknown",
                        counter_argument = final_counter,
                    ))
                db.commit()
            except Exception as e:
                logger.warning("DB save failed: %s", e)

        return data

    except HTTPException:
        REQUEST_COUNT.labels(status="error").inc()
        raise
    except Exception as e:
        REQUEST_COUNT.labels(status="error").inc()
        logger.exception("Unexpected error in generate_counter")
        raise HTTPException(500, f"Internal Error: {str(e)}")


# ---------------------------------------------------------------------------
# History & URL Analysis Endpoints (unchanged)
# ---------------------------------------------------------------------------
@app.get("/history/{user_id}")
def get_user_history(user_id: str, db: Session = Depends(get_db)):
    try:
        logs = db.query(models.CounterLog).filter(
            models.CounterLog.user_id == user_id
        ).order_by(models.CounterLog.created_at.desc()).limit(50).all()
        return [
            {
                "id":             l.id,
                "article_url":    l.article_url,
                "article_title":  l.article_title,
                "arguments_json": l.counter_argument,
                "created_at":     l.created_at.isoformat(),
            }
            for l in logs
        ]
    except Exception as e:
        logger.error("History fetch failed for %s: %s", user_id, e)
        raise HTTPException(500, "Internal database error")


@app.get("/analysis_by_url")
def get_analysis_by_url(url: str, user_id: str = None, db: Session = Depends(get_db)):
    try:
        query = db.query(models.CounterLog).filter(models.CounterLog.article_url == url)
        if user_id:
            query = query.filter(models.CounterLog.user_id == user_id)
        log = query.order_by(models.CounterLog.created_at.desc()).first()
        if log:
            return {
                "found":            True,
                "counter_argument": log.counter_argument,
                "timestamp":        log.created_at.isoformat(),
            }
        return {"found": False}
    except Exception as e:
        logger.error("analysis_by_url failed for %s: %s", url, e)
        return {"found": False}
