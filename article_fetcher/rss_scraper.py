import asyncio
import feedparser
from bs4 import BeautifulSoup
from typing import List, Dict
import logging
from datetime import datetime
from email.utils import parsedate_to_datetime

logger = logging.getLogger("rss_scraper")

RSS_FEEDS = {
    # --- Global News & Top Newspapers ---
    "BBC": "http://feeds.bbci.co.uk/news/rss.xml",
    "CNN": "http://rss.cnn.com/rss/edition.rss",
    "NYT": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
    "The Guardian": "https://www.theguardian.com/world/rss",
    "Washington Post": "https://feeds.washingtonpost.com/rss/world",
    "Fox News": "http://feeds.foxnews.com/foxnews/world",
    "NBC News": "https://feeds.nbcnews.com/nbcnews/public/news",
    "CBS News": "https://www.cbsnews.com/latest/rss/world",
    "NPR": "https://feeds.npr.org/1004/rss.xml",
    "DW News": "https://rss.dw.com/rdf/rss-en-all",
    "France 24": "https://www.france24.com/en/rss",
    "Euronews": "https://www.euronews.com/rss",
    "Wall Street Journal": "https://feeds.a.dj.com/rss/RSSWorldNews.xml",
    "Independent": "https://www.independent.co.uk/news/world/rss",
    "Sky News": "https://feeds.skynews.com/feeds/rss/world.xml",
    "ABC News": "https://abcnews.go.com/abcnews/internationalheadlines",
    "Los Angeles Times": "https://www.latimes.com/world-nation/rss2.0.xml",
    "USA Today": "https://rssfeeds.usatoday.com/usatoday-NewsTopStories",
    "Time Magazine": "https://time.com/feed/",
    "The Telegraph": "https://www.telegraph.co.uk/world-news/rss.xml",
    "South China Morning Post": "https://www.scmp.com/rss/91/feed",
    "The Hindu": "https://www.thehindu.com/news/international/feeder/default.rss",
    "Sydney Morning Herald": "https://www.smh.com.au/rss/world.xml",
    "Globe and Mail": "https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/world/",
    "Newsweek": "https://www.newsweek.com/rss",

    # --- Business & Finance ---
    "Forbes": "https://www.forbes.com/business/feed/",
    "Bloomberg": "https://feeds.bloomberg.com/markets/news.rss",
    "Business Insider": "https://feeds.businessinsider.com/custom/all",
    "Economist": "https://www.economist.com/business/rss.xml",
    "Financial Times": "https://www.ft.com/?format=rss",
    "Fortune": "https://fortune.com/feed/",
    
    # --- Technology & Science ---
    "TechCrunch": "https://techcrunch.com/feed/",
    "Wired": "https://www.wired.com/feed/rss",
    "The Verge": "https://www.theverge.com/rss/index.xml",
    "Ars Technica": "https://feeds.arstechnica.com/arstechnica/index",
    "Engadget": "https://www.engadget.com/rss.xml",
    "Scientific American": "http://rss.sciam.com/ScientificAmerican-Global",
    "Nature": "https://www.nature.com/nature.rss",
    "NASA": "https://www.nasa.gov/rss/dyn/breaking_news.rss",
    "MIT Tech Review": "https://www.technologyreview.com/feed/",

    # --- Sports & Entertainment ---
    "ESPN": "https://www.espn.com/espn/rss/news",
    "Variety": "https://variety.com/feed/",
    "Rolling Stone": "https://www.rollingstone.com/feed/"
}

def clean_html(raw_html: str) -> str:
    if not raw_html: return ""
    if len(raw_html) < 256 and not ('<' in raw_html and '>' in raw_html):
        return raw_html.strip()
    try:
        soup = BeautifulSoup(raw_html, "html.parser")
        return soup.get_text(separator="\n\n", strip=True)
    except Exception:
        return raw_html

async def fetch_feed(source: str, url: str) -> List[Dict]:
    loop = asyncio.get_running_loop()
    try:
        # feedparser is blocking, so run in executor
        parsed = await loop.run_in_executor(None, feedparser.parse, url)
        articles = []
        for entry in parsed.entries[:20]: # Get top 20 from each feed
            published_dt = None
            if hasattr(entry, 'published'):
                try:
                    published_dt = parsedate_to_datetime(entry.published)
                except Exception:
                    pass
            
            pub_iso = published_dt.isoformat() if published_dt else datetime.utcnow().isoformat()
            
            # Extract description and content
            desc = clean_html(getattr(entry, 'description', ''))
            content_list = getattr(entry, 'content', [])
            content = clean_html(content_list[0].get('value', '')) if content_list else ''
            
            # Combine desc and content
            text = f"{desc} {content}".strip()
            if not text:
                text = getattr(entry, 'title', '')
            
            articles.append({
                "title": getattr(entry, 'title', ''),
                "text": text,
                "url": getattr(entry, 'link', ''),
                "source": {"name": source},
                "publishedAt": pub_iso,
                "api_source": "rss"
            })
        return articles
    except Exception as e:
        logger.warning("Failed to fetch RSS for %s: %s", source, e)
        return []

async def fetch_rss_articles(topic: str = None, strict: bool = False) -> List[Dict]:
    tasks = [fetch_feed(source, url) for source, url in RSS_FEEDS.items()]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    all_articles = []
    for res in results:
        if not isinstance(res, Exception):
            all_articles.extend(res)
            
    # Filter by topic if a specific topic is requested
    if topic:
        q = topic.lower().strip()
        # Ignore filtering if the query is too generic
        if q not in ["latest news today", "general", "news", ""]:
            keywords = [kw.strip() for kw in q.split() if len(kw.strip()) > 3]
            if keywords:
                if strict:
                    # STRICT mode (user search): ALL keywords must appear in title+text
                    all_articles = [
                        a for a in all_articles
                        if all(
                            kw in (a.get("title", "") + " " + a.get("text", "")).lower()
                            for kw in keywords
                        )
                    ]
                else:
                    # LOOSE mode (background category fetch): ANY keyword matches
                    all_articles = [
                        a for a in all_articles
                        if any(
                            kw in a.get("title", "").lower() or kw in a.get("text", "").lower()
                            for kw in keywords
                        )
                    ]

    return all_articles
