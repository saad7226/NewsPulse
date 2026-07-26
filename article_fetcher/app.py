import os
import re
import json
import logging
import hashlib
import asyncio
import socket
import ipaddress
import unicodedata
import httpx
import trafilatura
import redis.asyncio as aioredis
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import List, Optional, Dict
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from tenacity import retry, stop_after_attempt, wait_exponential

import models
from database import engine, SessionLocal
from rss_scraper import fetch_rss_articles

models.Base.metadata.create_all(bind=engine)


# ------------------- Settings -------------------
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    NEWSAPI_KEY: Optional[str] = Field(None, env="NEWSAPI_KEY")
    NEWSDATA_KEY: Optional[str] = Field(None, env="NEWSDATA_KEY")
    GNEWS_KEY: Optional[str] = Field(None, env="GNEWS_KEY")
    REDIS_URL: str = Field("redis://localhost:6379/0", env="REDIS_URL")
    MAX_NUM_ARTICLES: int = Field(20, env="MAX_NUM_ARTICLES")
    API_TIMEOUT: float = Field(10.0, env="API_TIMEOUT")
    # Timeout for fetching individual article HTML pages
    SCRAPE_TIMEOUT: float = Field(10.0, env="SCRAPE_TIMEOUT")
    URL_CACHE_TTL: int = Field(600, env="URL_CACHE_TTL")
    TOPIC_CACHE_TTL: int = Field(300, env="TOPIC_CACHE_TTL")
    # Only CPU-bound parser threads — no network blocking here anymore
    PARSER_THREADPOOL_WORKERS: int = Field(2, env="PARSER_THREADPOOL_WORKERS")
    RAW_TEXT_MAX_LEN: int = Field(50_000, env="RAW_TEXT_MAX_LEN")
    API_RETRIES: int = Field(3, env="API_RETRIES")
    # Minimum text length: filters out "Please enable cookies" pages etc. (~60 words)
    MIN_ARTICLE_TEXT_LEN: int = Field(100, env="MIN_ARTICLE_TEXT_LEN")


settings = Settings()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("article_fetcher")
logging.getLogger("trafilatura").setLevel(logging.CRITICAL)
logging.getLogger("urllib3.poolmanager").setLevel(logging.WARNING)

http_client: Optional[httpx.AsyncClient] = None
redis_client: Optional[aioredis.Redis] = None
# Thread pool is now CPU-only (trafilatura parse) — network I/O is fully async
thread_pool = ThreadPoolExecutor(max_workers=settings.PARSER_THREADPOOL_WORKERS)

# ------------------- Cleaning -------------------
_RE_AD = re.compile(r"\nAdvertisement\s*\n", flags=re.IGNORECASE)
_RE_READMORE = re.compile(r"\.\.\.\s*Read More\s*\.\.\.", flags=re.IGNORECASE)
_RE_BYLINE = re.compile(r"By\s+[\w\s]+(\s+•\s+\w+)?\s*,\s*\w+\s+\d{1,2},\s+\d{4}", flags=re.IGNORECASE)
_RE_SQUARE = re.compile(r"\[.*?\]")
_RE_PARENS = re.compile(r"\(.*?\)")
_RE_TAGS = re.compile(r"<[^>]+>")
_RE_FOOTER = re.compile(r"(Subscribe|Sign up|Follow us|Newsletter|All rights reserved|Get a note directly)\s*.*",
                         flags=re.IGNORECASE | re.DOTALL)
_RE_PUNCT = re.compile(r"[^\w\s]")
_RE_TRUNCATED = re.compile(r"(\[Content truncated.*?\]|\.{3,}\s*Read more.*?$|Read full article.*?$|Click here to read.*?$)", flags=re.IGNORECASE)

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
]

import random
def get_random_headers():
    return {
        "User-Agent": random.choice(_USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0"
    }


class ArticleOut(BaseModel):
    title: Optional[str]
    text: str
    source: Optional[str] = None
    source_url: Optional[str] = None
    published: Optional[str] = None
    api_source: Optional[str] = None
    category: Optional[str] = "General"
    image_url: Optional[str] = None


# ------------------- Helpers -------------------
_CATEGORY_KEYWORDS: dict = {
    "Politics": [
        "election", "president", "congress", "senate", "parliament", "government",
        "minister", "democrat", "republican", "legislation", "vote", "ballot",
        "political", "policy", "administration", "white house", "kremlin", "diplomacy",
        "treaty", "sanction", "geopolitics", "prime minister", "governor", "court", 
        "law", "scandal", "protest", "strike", "activist", "conflict", "clash", "security", 
        "defense", "military", "army", "police", "investigation", "blast", "attack", 
        "bomb", "killed", "casualty", "refugee", "crisis", "border", "summit", "nato", "un"
    ],
    "Technology": [
        "artificial intelligence", "machine learning", "software", "hardware",
        "cybersecurity", "data breach", "startup", "tech company", "smartphone",
        "iphone", "android", "google", "microsoft", "apple", "amazon", "meta",
        "chip", "semiconductor", "cloud computing", "blockchain", "crypto",
        "bitcoin", "robot", "automation", "app", "algorithm",
    ],
    "Sports": [
        "cricket", "football", "soccer", "basketball", "baseball", "tennis",
        "nba", "nfl", "premier league", "champions league", "world cup",
        "olympics", "grand slam", "formula one", "f1", "tournament", 
        "championship", "wicket", "innings", "stadium", "athlete", "sports", "rugby", "hockey",
        "sport", "player", "coach", "manager", "referee", "umpire", "league", "cup", "medal", 
        "olympic", "race", "match", "game", "score", "versus", "vs", "boxing", "golf", "fencing", 
        "wrestling", "swimming", "athletics", "nascar", "cycling"
    ],
    "Business": [
        "economy", "market", "stock", "trade", "investment", "inflation",
        "gdp", "recession", "bank", "finance", "revenue", "profit", "earnings",
        "company", "startup", "merger", "acquisition", "ceo", "ipo", "supply chain",
        "tariff", "export", "import", "commodity", "oil price", "money", "billion", 
        "million", "dollar", "funding", "backed", "valuation", "fintech", "jobs", 
        "labor", "industrial", "retail", "consumer", "sales", "housing", "real estate", 
        "rent", "lifestyle", "cost of living", "salary", "wage", "tax", "insurance"
    ],
    "Entertainment": [
        "movie", "film", "actor", "actress", "celebrity", "music", "album",
        "concert", "television", "series", "netflix", "oscar", "grammy", "emmy",
        "box office", "streaming", "gaming", "award show", "hollywood",
    ],
    "Health": [
        "health", "medicine", "vaccine", "hospital", "disease", "pandemic",
        "mental health", "cancer", "drug", "fda", "who", "clinical trial",
        "surgery", "doctor", "patient", "pharmaceutical", "outbreak",
    ],
    "Science": [
        "nasa", "spacex", "space", "climate", "environment", "research",
        "study", "scientist", "discovery", "experiment", "physics", "biology",
        "ecology", "earthquake", "hurricane", "genome", "dna",
    ],
}

def categorize_article(title: Optional[str], text: str) -> str:
    """Classify an article into a category using keyword heuristics."""
    combined = f"{title or ''} {text[:1500]}".lower()
    scores: dict = {cat: 0 for cat in _CATEGORY_KEYWORDS}
    for category, keywords in _CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if re.search(rf'\b{re.escape(kw)}\b', combined):
                scores[category] += 1
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "General"


def _topic_cache_key(topic: str, days_old: int, num_articles: int) -> str:
    h = hashlib.sha256(f"{topic}|{days_old}|{num_articles}|multi-api".encode("utf-8")).hexdigest()
    return f"topic:{h}"

def _url_cache_key(url: str) -> str:
    return f"url:{hashlib.sha256(url.encode()).hexdigest()}"

async def redis_get_json(key: str):
    if not redis_client: return None
    raw = await redis_client.get(key)
    return json.loads(raw) if raw else None

async def redis_set_json(key: str, value, ex: int):
    if redis_client:
        await redis_client.set(key, json.dumps(value, default=str), ex=ex)

def _is_ip_private(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
    except Exception:
        return True

async def _hostname_is_safe(hostname: str) -> bool:
    loop = asyncio.get_running_loop()
    def _resolve(name):
        try: return socket.getaddrinfo(name, None)
        except: return []
    infos = await loop.run_in_executor(thread_pool, _resolve, hostname)
    return all(not _is_ip_private(info[4][0]) for info in infos) if infos else False

def _extract_hostname(url: str) -> Optional[str]:
    try:
        from urllib.parse import urlparse
        return urlparse(url).hostname
    except Exception:
        return None

def clean_text(text: str) -> str:
    if not text: return ""
    for regex in (_RE_AD, _RE_READMORE, _RE_BYLINE, _RE_SQUARE, _RE_PARENS, _RE_TAGS, _RE_FOOTER, _RE_TRUNCATED):
        text = regex.sub(" ", text)
    # Preserve paragraphs while collapsing extra horizontal whitespace
    raw_lines = [re.sub(r'[ \t]+', ' ', line).strip() for line in text.split('\n')]
    
    final_lines = []
    for line in raw_lines:
        if not line: continue
        # Remove pull-quotes (short standalone lines that appear as substrings in longer paragraphs)
        if 10 < len(line) < 150:
            is_pull_quote = any(line in other for other in raw_lines if other != line and len(other) > len(line))
            if is_pull_quote:
                continue
        final_lines.append(line)
        
    return '\n\n'.join(final_lines)

def _normalize_for_dedup(title: str) -> str:
    """Lowercase, strip accents, strip punctuation, collapse whitespace."""
    title = title.lower()
    title = "".join(c for c in unicodedata.normalize("NFD", title) if unicodedata.category(c) != "Mn")
    title = _RE_PUNCT.sub(" ", title)
    return re.sub(r"\s+", " ", title).strip()


# ------------------- Async-split HTML Fetcher -------------------
def _parse_html_sync(html: str):
    """
    CPU-bound only: extract text + metadata from already-downloaded HTML.
    Runs in the ThreadPoolExecutor so it never blocks the async event loop.
    Includes aggressive BeautifulSoup search for og:image and twitter:image tags.
    """
    try:
        metadata = trafilatura.metadata.extract_metadata(html)
        text = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=True,
            favor_precision=True,
            no_fallback=False
        )
        title = metadata.title if metadata else None
        publish_date = metadata.date if metadata else None
        image_url = metadata.image if metadata else None
        
        # Aggressive BS4 OpenGraph fallback if Trafilatura missed the image
        if not image_url and html:
            try:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(html, "html.parser")
                og_img = soup.find("meta", property="og:image")
                if og_img and og_img.get("content"):
                    image_url = og_img.get("content")
                else:
                    tw_img = soup.find("meta", name="twitter:image")
                    if tw_img and tw_img.get("content"):
                        image_url = tw_img.get("content")
                    else:
                        link_img = soup.find("link", rel="image_src")
                        if link_img and link_img.get("href"):
                            image_url = link_img.get("href")
            except Exception as e:
                logger.debug("BS4 OpenGraph parsing failed: %s", e)

        if isinstance(publish_date, str):
            try:
                publish_date = datetime.fromisoformat(publish_date)
            except Exception:
                publish_date = None
        if not text and metadata:
            text = metadata.description or ""
        return title, text, publish_date, image_url
    except Exception as e:
        logger.warning("_parse_html_sync error: %s", e)
        return None, None, None, None


async def fetch_and_parse_url(url: str, api_image_url: Optional[str] = None) -> Optional[ArticleOut]:
    """
    1. Check cache.
    2. Async-fetch HTML with the shared httpx client (non-blocking network I/O).
    3. Offload CPU parsing to the thread pool.
    4. Filter articles shorter than MIN_ARTICLE_TEXT_LEN characters.
    5. Enforce priority: API Image > Scraped/OG Image (never overwrite with None).
    """
    key = _url_cache_key(url)
    cached = await redis_get_json(key)
    if cached:
        out = ArticleOut(**cached)
        if not out.image_url and api_image_url:
            out.image_url = api_image_url
            asyncio.create_task(redis_set_json(key, out.model_dump(), ex=settings.URL_CACHE_TTL))
        return out

    def _check_db():
        with SessionLocal() as db:
            db_art = db.query(models.Article).filter(models.Article.url == url).first()
            if db_art:
                return ArticleOut(
                    title=db_art.title, text=db_art.content, source=url, source_url=url,
                    published=db_art.published_at, api_source=db_art.api_source,
                    image_url=api_image_url
                )
            return None

    loop = asyncio.get_running_loop()
    db_out = await loop.run_in_executor(thread_pool, _check_db)
    if db_out:
        await redis_set_json(key, db_out.model_dump(), ex=settings.URL_CACHE_TTL)
        return db_out

    hostname = _extract_hostname(url)
    if not hostname or not await _hostname_is_safe(hostname):
        logger.warning("Unsafe hostname, skipping: %s", url)
        return None

    # --- Async network fetch (Primary: HTTPX with Spoofed Headers) ---
    html = None
    try:
        resp = await http_client.get(
            url,
            timeout=settings.SCRAPE_TIMEOUT,
            follow_redirects=True,
            headers=get_random_headers()
        )
        resp.raise_for_status()
        html = resp.text
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (403, 401, 503):
            logger.info("HTTPX blocked (%s) for %s — attempting Trafilatura fallback", e.response.status_code, url)
        else:
            logger.warning("HTTPStatusError for %s: %s", url, e.response.status_code)
    except httpx.ConnectError:
        logger.warning("HTTPX ConnectError evaluating %s (Host timed out or blocked TCP handshake)", url)
    except Exception as e:
        logger.warning("Failed to fetch %s via HTTPX: %s", url, type(e).__name__)

    # --- Sync fetch (Secondary: Trafilatura Native Fallback) ---
    if not html:
        loop = asyncio.get_running_loop()
        try:
            # Trafilatura uses urllib under the hood but is cleanly integrated
            html = await loop.run_in_executor(thread_pool, trafilatura.fetch_url, url)
        except Exception as e:
            logger.debug("Trafilatura native fetch fallback also failed for %s", url)

    # --- Sync fetch (Tertiary: Raw urllib3 with force disable TLS) ---
    if not html:
        try:
            import urllib3
            # Supress InsecureRequestWarning for our unverified request
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            http = urllib3.PoolManager(cert_reqs='CERT_NONE')
            
            def _ul3_fetch(url_target):
                r = http.request('GET', url_target, headers=get_random_headers(), timeout=settings.SCRAPE_TIMEOUT)
                if r.status == 200:
                    return r.data.decode('utf-8', errors='ignore')
                return None
                
            html = await loop.run_in_executor(thread_pool, _ul3_fetch, url)
            if html:
                logger.info("Successfully fetched %s via UL3 fallback bypassing SSL protections", url)
        except Exception as e:
            logger.warning("Tertiary UL3 fallback failed for %s: %s", url, type(e).__name__)
            
    if not html:
        return None

    # --- CPU parse in thread pool (does NOT block event loop) ---
    loop = asyncio.get_running_loop()
    title, text, published, scraped_image_url = await loop.run_in_executor(thread_pool, _parse_html_sync, html)

    cleaned = clean_text(text or "")

    # Filter out thin / cookie-wall content
    if len(cleaned) < settings.MIN_ARTICLE_TEXT_LEN:
        logger.info("Skipping %s — text too short (%d chars)", url, len(cleaned))
        return None

    # Priority resolution: API Image > Scraped/OpenGraph Image
    final_image_url = api_image_url if api_image_url else scraped_image_url

    out = ArticleOut(
        title=title,
        text=cleaned,
        source=url,
        source_url=url,
        published=published.isoformat() if published else None,
        api_source="trafilatura",
        category=categorize_article(title, cleaned),
        image_url=final_image_url
    )
    await redis_set_json(key, out.model_dump(), ex=settings.URL_CACHE_TTL)

    def _save_db():
        with SessionLocal() as db:
            try:
                if not db.query(models.Article).filter(models.Article.url == url).first():
                    new_art = models.Article(
                        url=url, title=title, content=cleaned,
                        published_at=published.isoformat() if published else None,
                        api_source="trafilatura"
                    )
                    db.add(new_art)
                    db.commit()
            except Exception as e:
                logger.warning("Failed to save article to sqlite: %s", e)

    await loop.run_in_executor(thread_pool, _save_db)

    return out


# ------------------- API Fetchers -------------------
@retry(stop=stop_after_attempt(settings.API_RETRIES), wait=wait_exponential(multiplier=1, min=4, max=10))
async def fetch_from_newsapi(topic: str, from_date: str, num: int, sort_by: str) -> List[Dict]:
    if not settings.NEWSAPI_KEY: return []
    params = {"q": topic, "apiKey": settings.NEWSAPI_KEY, "pageSize": num,
              "language": "en", "sortBy": sort_by, "from": from_date}
    resp = await http_client.get("https://newsapi.org/v2/everything", params=params)
    resp.raise_for_status()
    return [{"api_source": "newsapi", "image_url": art.get("urlToImage"), **art} for art in resp.json().get("articles", [])]

@retry(stop=stop_after_attempt(settings.API_RETRIES), wait=wait_exponential(multiplier=1, min=4, max=10))
async def fetch_from_newsdata(topic: str, from_date: str, num: int) -> List[Dict]:
    if not settings.NEWSDATA_KEY: return []
    params = {"q": topic, "apikey": settings.NEWSDATA_KEY, "language": "en",
              "size": min(num, 10)}
    resp = await http_client.get("https://newsdata.io/api/1/news", params=params)
    resp.raise_for_status()
    articles = resp.json().get("results", [])
    return [{"api_source": "newsdata", "url": art.get("link", ""), "publishedAt": art.get("pubDate"),
             "source": {"name": art.get("source_name")}, "image_url": art.get("image_url"), **art} for art in articles]

@retry(stop=stop_after_attempt(settings.API_RETRIES), wait=wait_exponential(multiplier=1, min=4, max=10))
async def fetch_from_gnews(topic: str, from_date: str, num: int) -> List[Dict]:
    if not settings.GNEWS_KEY: return []
    params = {"q": topic, "apikey": settings.GNEWS_KEY, "lang": "en",
              "max": min(num, 10), "from": from_date}
    resp = await http_client.get("https://gnews.io/api/v4/search", params=params)
    resp.raise_for_status()
    return [{"api_source": "gnews", "image_url": art.get("image"), **art} for art in resp.json().get("articles", [])]


# ------------------- Multi API Logic -------------------
async def fetch_multi_api_articles(topic: str, days_old: int, num_articles: int, sort_by: str, strict: bool = False) -> List[dict]:
    key = _topic_cache_key(topic, days_old, num_articles)
    cached = await redis_get_json(key)
    if cached: return cached

    from_date = (datetime.utcnow() - timedelta(days=days_old)).strftime("%Y-%m-%d")

    tasks = [
        fetch_rss_articles(topic, strict=strict),
        fetch_from_newsapi(topic, from_date, num_articles, sort_by),
        fetch_from_newsdata(topic, from_date, num_articles),
        fetch_from_gnews(topic, from_date, num_articles)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    all_articles = [art for res in results if not isinstance(res, Exception) for art in res]

    # --- Fast deduplication: normalised string exact-match (no fuzzy O(n²) SequenceMatcher) ---
    seen_urls: set = set()
    seen_norm_titles: set = set()
    deduped = []
    for art in all_articles:
        url = art.get("url", "")
        raw_title = art.get("title", "")
        norm_title = _normalize_for_dedup(raw_title)

        if url and url in seen_urls:
            continue
        if norm_title and norm_title in seen_norm_titles:
            continue

        if url:
            seen_urls.add(url)
        if norm_title:
            seen_norm_titles.add(norm_title)
        deduped.append(art)

    deduped.sort(key=lambda x: x.get("publishedAt") or "0000-00-00", reverse=True)
    deduped = deduped[:num_articles]

    if not deduped:
        logger.warning("All APIs returned 0 articles. Falling back to static_demo_articles.json")
        try:
            with open("static_demo_articles.json", "r", encoding="utf-8") as f:
                static_arts = json.load(f).get("articles", [])
                q = topic.lower()
                filtered_static = [
                    a for a in static_arts
                    if q in (a.get("title") or "").lower() or q in (a.get("description") or "").lower() or q in (a.get("content") or "").lower()
                ]
                deduped = filtered_static[:num_articles]
        except Exception as e:
            logger.error("Failed to load static fallback: %s", e)

    await redis_set_json(key, deduped, ex=settings.TOPIC_CACHE_TTL)
    return deduped


# ------------------- Startup / Shutdown -------------------
bg_task: Optional[asyncio.Task] = None

# Removed trigger_ml_analysis function to strictly enforce On-Demand AI usage

async def bg_fetch_loop():
    logger.info("Background fetcher daemon started — per-category mode")

    # Search queries that reliably surface articles for each category
    CATEGORY_QUERIES = {
        "General":       "latest news today",
        "Politics":      "election",
        "Technology":    "technology",
        "Sports":        "sport",
        "Business":      "economy",
        "Entertainment": "entertainment",
        "Health":        "health",
        "Science":       "science",
    }
    MIN_PER_CAT = 5  # guarantee at least this many articles per category

    while True:
        try:
            logger.info("Background fetch: starting per-category article collection...")
            merged: dict = {}  # url → ArticleOut, for deduplication

            async def fetch_category(cat_name: str, query: str):
                """Fetch articles for one category and merge into `merged`."""
                try:
                    arts_meta = await fetch_multi_api_articles(query, 1, max(MIN_PER_CAT + 3, 8), "publishedAt")
                    tasks_local = []
                    stubs_local: List[ArticleOut] = []

                    for art_meta in arts_meta:
                        art_url = art_meta.get("url")
                        if art_url:
                            tasks_local.append((art_url, art_meta))
                        else:
                            raw = art_meta.get("description") or art_meta.get("content") or ""
                            cleaned = clean_text(raw)
                            if len(cleaned) >= settings.MIN_ARTICLE_TEXT_LEN:
                                a = ArticleOut(
                                    title=art_meta.get("title"),
                                    text=cleaned,
                                    source=art_meta.get("source", {}).get("name"),
                                    source_url=art_meta.get("url"),
                                    published=art_meta.get("publishedAt"),
                                    api_source=art_meta.get("api_source"),
                                    category=categorize_article(art_meta.get("title"), cleaned),
                                    image_url=art_meta.get("image_url")
                                )
                                stubs_local.append(a)

                    if tasks_local:
                        gathered = await asyncio.gather(
                            *[fetch_and_parse_url(u, api_image_url=meta.get("image_url")) for u, meta in tasks_local],
                            return_exceptions=True
                        )
                        for result, (url, art_meta) in zip(gathered, tasks_local):
                            if isinstance(result, Exception) or result is None:
                                raw = art_meta.get("description") or art_meta.get("content") or ""
                                cleaned = clean_text(raw)
                                if len(cleaned) >= settings.MIN_ARTICLE_TEXT_LEN:
                                    stubs_local.append(ArticleOut(
                                        title=art_meta.get("title"), text=cleaned,
                                        source=art_meta.get("source", {}).get("name") or "News Provider",
                                        source_url=url,
                                        published=art_meta.get("publishedAt"),
                                        api_source=art_meta.get("api_source"),
                                        category=categorize_article(art_meta.get("title"), cleaned),
                                        image_url=art_meta.get("image_url")
                                    ))
                                continue
                            result.source_url = url
                            result.category = categorize_article(result.title, result.text)
                            # Backup priority fallback:
                            if not result.image_url and art_meta.get("image_url"):
                                result.image_url = art_meta.get("image_url")
                            stubs_local.append(result)

                    for art in stubs_local:
                        key = art.source_url or art.title or ""
                        if key and key not in merged:
                            merged[key] = art

                    logger.info("  [%s] fetched %d articles (query=%r)", cat_name, len(stubs_local), query)
                except Exception as e:
                    logger.warning("  [%s] fetch failed: %s", cat_name, e)

            # Fetch all categories concurrently
            await asyncio.gather(*[
                fetch_category(cat, query)
                for cat, query in CATEGORY_QUERIES.items()
            ])

            all_articles = list(merged.values())
            # Sort by published date descending — newest first
            all_articles.sort(key=lambda a: a.published or "", reverse=True)

            if redis_client and all_articles:
                dumped = [x.model_dump() for x in all_articles]
                await redis_client.set("hot_news", json.dumps(dumped))
                # Count per category for logging
                cat_counts = {}
                for a in all_articles:
                    cat_counts[a.category or "General"] = cat_counts.get(a.category or "General", 0) + 1
                logger.info("hot_news updated: %d total articles. Per-category: %s", len(dumped), cat_counts)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Background fetcher error: %s", e)

        await asyncio.sleep(15 * 60)  # ← refresh every 15 mins

@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client, redis_client, bg_task
    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(settings.API_TIMEOUT, connect=5.0),
        limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        verify=False
    )
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await redis_client.ping()
        logger.info("Redis connected")
    except Exception as e:
        logger.warning("Redis unavailable at startup: %s — caching disabled", e)
        redis_client = None
    logger.info("Article Fetcher started (async-split scraping, %d CPU threads)",
                settings.PARSER_THREADPOOL_WORKERS)
    
    bg_task = asyncio.create_task(bg_fetch_loop())
    yield
    if bg_task:
        bg_task.cancel()
    if http_client:
        await http_client.aclose()
    if redis_client:
        await redis_client.close()
    thread_pool.shutdown(wait=False)
    logger.info("Article Fetcher shut down")

app = FastAPI(title="Article Fetcher", lifespan=lifespan)


# ------------------- Health Check (NO external API calls) -------------------
@app.get("/health")
async def health():
    """
    Lightweight health check — only verifies the app is up and Redis is reachable.
    Does NOT call NewsAPI / NewsData / GNews — that would waste free-tier quota.
    """
    redis_ok = False
    if redis_client:
        try:
            await redis_client.ping()
            redis_ok = True
        except Exception:
            redis_ok = False

    return {
        "status": "ok",
        "redis": "ok" if redis_ok else "unavailable",
        "apis_configured": {
            "newsapi": bool(settings.NEWSAPI_KEY),
            "newsdata": bool(settings.NEWSDATA_KEY),
            "gnews": bool(settings.GNEWS_KEY),
        }
    }


# ------------------- Main Endpoint -------------------
@app.get("/fetch", response_model=List[ArticleOut])
async def fetch_articles(
    topic: Optional[str] = Query(None),
    url: Optional[str] = Query(None),
    raw_text: Optional[str] = Query(None)
):
    """
    Zero-Latency Hot News feed mapping.
    If no topic/url is supplied, instantly return cached background news. 
    """
    if raw_text:
        cleaned = clean_text(raw_text)
        return [ArticleOut(title="User Provided Content", text=cleaned, source="Direct", source_url=None, api_source="direct")]

    if url:
        result = await fetch_and_parse_url(url)
        if not result:
            raise HTTPException(422, "Could not extract content from the provided URL.")
        return [result]

    if not topic:
        # Zero-latency background cache return
        if redis_client:
            raw = await redis_client.get("hot_news")
            if raw:
                try:
                    cached = json.loads(raw)
                    articles = []
                    for x in cached:
                        # Back-fill category for articles cached before categorization was added
                        if not x.get("category") or x.get("category") == "General":
                            x["category"] = categorize_article(x.get("title"), x.get("text", ""))
                        articles.append(ArticleOut(**x))
                    return articles
                except Exception as e:
                    logger.warning("Failed to parse hot_news cache: %s", e)
        return []

    # If legacy topic fallback is called, bypass background cache and search
    return await search_articles(topic, 1, settings.MAX_NUM_ARTICLES, "relevancy")


@app.get("/search", response_model=List[ArticleOut])
async def search_articles(
    query: str = Query(...),
    days_old: int = 1,
    num_articles: int = Query(10, le=settings.MAX_NUM_ARTICLES),
    sort_by: str = Query("publishedAt", enum=["relevancy", "popularity", "publishedAt"])
):
    """
    Live Search via News APIs. Bypasses the Zero-Latency cache.
    """
    if not any([settings.NEWSAPI_KEY, settings.NEWSDATA_KEY, settings.GNEWS_KEY]):
        raise HTTPException(400, "At least one API key required")
    
    articles_meta = await fetch_multi_api_articles(query, days_old, num_articles, sort_by, strict=True)
    tasks = []
    stub_results: List[ArticleOut] = []

    for art_meta in articles_meta:
        art_url = art_meta.get("url")
        if art_url:
            tasks.append(fetch_and_parse_url(art_url, api_image_url=art_meta.get("image_url")))
        else:
            raw = art_meta.get("description") or art_meta.get("content") or ""
            cleaned = clean_text(raw)
            if len(cleaned) >= settings.MIN_ARTICLE_TEXT_LEN:
                stub_results.append(ArticleOut(
                    title=art_meta.get("title"),
                    text=cleaned,
                    source=art_meta.get("source", {}).get("name"),
                    source_url=art_meta.get("url"),
                    published=art_meta.get("publishedAt"),
                    api_source=art_meta.get("api_source"),
                    category=categorize_article(art_meta.get("title"), cleaned),
                    image_url=art_meta.get("image_url")
                ))

    parsed_results: List[ArticleOut] = []
    if tasks:
        gathered = await asyncio.gather(*tasks, return_exceptions=True)
        for item, art_meta in zip(gathered, [m for m in articles_meta if m.get("url")]):
            if isinstance(item, Exception) or item is None:
                raw = art_meta.get("description") or art_meta.get("content") or ""
                cleaned = clean_text(raw)
                if len(cleaned) >= settings.MIN_ARTICLE_TEXT_LEN / 2:
                    logger.info("Gracefully degrading %s to News API description snippet", art_meta.get("url"))
                    parsed_results.append(ArticleOut(
                        title=art_meta.get("title"),
                        text=cleaned,
                        source=art_meta.get("source", {}).get("name") or "News Provider",
                        source_url=art_meta.get("url"),
                        published=art_meta.get("publishedAt"),
                        api_source=art_meta.get("api_source"),
                        category=categorize_article(art_meta.get("title"), cleaned),
                        image_url=art_meta.get("image_url")
                    ))
                continue
            item.source_url = art_meta.get("url")
            if not item.category or item.category == 'General':
                item.category = categorize_article(item.title, item.text)
            
            # Backup priority safety check
            if not item.image_url and art_meta.get("image_url"):
                item.image_url = art_meta.get("image_url")
                
            parsed_results.append(item)
            
    parsed_results.extend(stub_results)
    return parsed_results
