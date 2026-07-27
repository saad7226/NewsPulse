"""
NewsPulse — Article Writer Service
====================================
Allows registered users to write, draft, and publish articles on the platform.
AI writing assistance is powered by Groq API.

Lifecycle:  draft → submitted → published | rejected

Endpoints:
  POST   /articles                    — create draft
  PUT    /articles/{id}               — update draft
  DELETE /articles/{id}               — delete draft
  POST   /articles/{id}/submit        — submit for admin review
  GET    /articles/{id}               — get single article (increments views if published)
  GET    /my_articles/{user_id}       — list all articles for a user
  GET    /published                   — list all published articles (public)
  POST   /ai_assist                   — AI writing help (outline / improve / title / intro / expand / excerpt)
  GET    /admin/pending               — admin: list submitted articles awaiting review
  POST   /admin/{id}/approve          — admin: approve and publish
  POST   /admin/{id}/reject           — admin: reject with reason
  GET    /health                      — health check
"""
import os
import json
import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.orm import Session
from groq import Groq

import models
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("article_writer")


# ── Settings ──────────────────────────────────────────────────────────────────
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    GROQ_API_KEY: Optional[str] = Field(None, env="GROQ_API_KEY")
    GROQ_MODEL: str = Field("llama-3.1-8b-instant", env="GROQ_MODEL")

settings = Settings()

groq_client: Optional[Groq] = None

CATEGORIES = [
    "General", "Politics", "Technology", "Science", "Health",
    "Sports", "Business", "Entertainment", "World", "Opinion"
]


# ── Pydantic Schemas ───────────────────────────────────────────────────────────
class CreateArticleRequest(BaseModel):
    author_id: str
    author_name: str
    author_username: str
    title: str = Field(..., min_length=5, max_length=500)
    content: str = Field(..., min_length=50)
    excerpt: Optional[str] = Field(None, max_length=1000)
    category: str = Field("General")
    tags: Optional[List[str]] = Field(default_factory=list)
    ai_assisted: bool = False


class UpdateArticleRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=5, max_length=500)
    content: Optional[str] = Field(None, min_length=50)
    excerpt: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    ai_assisted: Optional[bool] = None


class RejectArticleRequest(BaseModel):
    reason: str = Field(..., min_length=10)


class AIAssistRequest(BaseModel):
    action: str  # outline | improve | title | intro | expand | excerpt | grammar
    content: Optional[str] = ""
    topic: Optional[str] = ""
    author_id: str


# ── Helpers ────────────────────────────────────────────────────────────────────
def article_to_dict(a: models.WriterArticle) -> dict:
    return {
        "id": a.id,
        "author_id": a.author_id,
        "author_name": a.author_name,
        "author_username": a.author_username,
        "title": a.title,
        "excerpt": a.excerpt,
        "content": a.content,
        "category": a.category,
        "tags": json.loads(a.tags or "[]"),
        "status": a.status,
        "rejection_reason": a.rejection_reason,
        "ai_assisted": a.ai_assisted,
        "views": a.views,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        "published_at": a.published_at.isoformat() if a.published_at else None,
    }


# ── AI Writing Assistance ──────────────────────────────────────────────────────
AI_PROMPTS = {
    "outline": (
        "You are a professional news writer and journalist. "
        "Generate a detailed article outline with 5-7 sections for the topic: '{topic}'. "
        "Format it as a numbered list with section titles and 2-3 bullet points each. "
        "Be specific and journalistic."
    ),
    "improve": (
        "You are a professional editor. Improve the following paragraph to make it "
        "more engaging, clear, and well-written. Keep the same meaning but enhance "
        "the language, flow, and impact. Return ONLY the improved paragraph:\n\n{content}"
    ),
    "title": (
        "You are a news headline writer. Generate 3 compelling, click-worthy but "
        "accurate headline options for an article about: '{topic}'. "
        "Consider the content: {content}\n"
        "Return exactly 3 numbered options, one per line."
    ),
    "intro": (
        "You are a journalist. Write a strong, engaging introduction paragraph (3-4 sentences) "
        "for a news article about: '{topic}'. "
        "Make it hook the reader immediately. Return ONLY the introduction paragraph."
    ),
    "expand": (
        "You are a professional writer. Expand the following brief notes/bullet points "
        "into a well-written, detailed paragraph for a news article:\n\n{content}\n\n"
        "Return ONLY the expanded paragraph, journalistic style."
    ),
    "excerpt": (
        "You are a news editor. Write a concise, compelling excerpt/summary (2-3 sentences, "
        "max 150 words) for the following article that would appear in a news feed preview:\n\n"
        "{content}\n\nReturn ONLY the excerpt."
    ),
    "grammar": (
        "You are a professional proofreader. Fix all grammar, spelling, punctuation, "
        "and style issues in the following text. Keep the original meaning intact. "
        "Return ONLY the corrected text:\n\n{content}"
    ),
}

async def call_groq_assist(action: str, content: str, topic: str) -> str:
    if not groq_client:
        raise HTTPException(503, "AI service unavailable — GROQ_API_KEY not configured")

    if action not in AI_PROMPTS:
        raise HTTPException(400, f"Unknown AI action. Valid: {list(AI_PROMPTS.keys())}")

    prompt = AI_PROMPTS[action].format(content=content[:3000], topic=topic)

    def _call():
        return groq_client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional journalist and news article writer. Be concise and high-quality."
                },
                {"role": "user", "content": prompt}
            ],
            max_tokens=800,
            temperature=0.7,
        )

    try:
        response = await asyncio.to_thread(_call)
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error("Groq AI assist failed: %s", e)
        raise HTTPException(503, f"AI service error: {str(e)}")


# ── Lifespan ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global groq_client
    if settings.GROQ_API_KEY:
        groq_client = Groq(api_key=settings.GROQ_API_KEY)
        logger.info("Groq client initialized with model: %s", settings.GROQ_MODEL)
    else:
        logger.warning("GROQ_API_KEY not set — AI assist disabled")
    yield
    logger.info("Article Writer service shutdown")


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="NewsPulse Article Writer Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ─────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "article_writer",
        "groq_ready": groq_client is not None,
    }


# ── Create Draft ───────────────────────────────────────────────────────────────
@app.post("/articles")
async def create_article(req: CreateArticleRequest, db: Session = Depends(get_db)):
    category = req.category if req.category in CATEGORIES else "General"
    article = models.WriterArticle(
        author_id=req.author_id,
        author_name=req.author_name,
        author_username=req.author_username,
        title=req.title.strip(),
        content=req.content.strip(),
        excerpt=(req.excerpt or "").strip() or None,
        category=category,
        tags=json.dumps(req.tags or []),
        status="draft",
        ai_assisted=req.ai_assisted,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    logger.info("Draft created: id=%d author=%s", article.id, req.author_id)
    return article_to_dict(article)


# ── Update Draft ───────────────────────────────────────────────────────────────
@app.put("/articles/{article_id}")
async def update_article(
    article_id: int,
    req: UpdateArticleRequest,
    author_id: str = Query(...),
    db: Session = Depends(get_db)
):
    article = db.query(models.WriterArticle).filter(
        models.WriterArticle.id == article_id,
        models.WriterArticle.author_id == author_id
    ).first()
    if not article:
        raise HTTPException(404, "Article not found or not yours")
    if article.status not in ("draft", "rejected"):
        raise HTTPException(400, f"Cannot edit article in '{article.status}' status")

    if req.title is not None:
        article.title = req.title.strip()
    if req.content is not None:
        article.content = req.content.strip()
    if req.excerpt is not None:
        article.excerpt = req.excerpt.strip() or None
    if req.category is not None:
        article.category = req.category if req.category in CATEGORIES else article.category
    if req.tags is not None:
        article.tags = json.dumps(req.tags)
    if req.ai_assisted is not None:
        article.ai_assisted = req.ai_assisted
    # If it was rejected and now edited, move back to draft
    if article.status == "rejected":
        article.status = "draft"
        article.rejection_reason = None
    article.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(article)
    return article_to_dict(article)


# ── Delete Draft ───────────────────────────────────────────────────────────────
@app.delete("/articles/{article_id}")
async def delete_article(
    article_id: int,
    author_id: str = Query(...),
    db: Session = Depends(get_db)
):
    article = db.query(models.WriterArticle).filter(
        models.WriterArticle.id == article_id,
        models.WriterArticle.author_id == author_id
    ).first()
    if not article:
        raise HTTPException(404, "Article not found or not yours")
    if article.status == "published":
        raise HTTPException(400, "Cannot delete a published article")

    db.delete(article)
    db.commit()
    return {"success": True, "message": "Article deleted"}


# ── Submit for Review ──────────────────────────────────────────────────────────
@app.post("/articles/{article_id}/submit")
async def submit_article(
    article_id: int,
    author_id: str = Query(...),
    db: Session = Depends(get_db)
):
    article = db.query(models.WriterArticle).filter(
        models.WriterArticle.id == article_id,
        models.WriterArticle.author_id == author_id
    ).first()
    if not article:
        raise HTTPException(404, "Article not found or not yours")
    if article.status not in ("draft", "rejected"):
        raise HTTPException(400, f"Article is already '{article.status}'")
    if len(article.content.strip()) < 100:
        raise HTTPException(400, "Article content is too short (minimum 100 characters)")
    if not article.title.strip():
        raise HTTPException(400, "Article must have a title")

    article.status = "submitted"
    article.rejection_reason = None
    article.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(article)
    logger.info("Article submitted for review: id=%d", article_id)
    return {"success": True, "message": "Article submitted for admin review", "article": article_to_dict(article)}


# ── Get Single Article ─────────────────────────────────────────────────────────
@app.get("/articles/{article_id}")
async def get_article(
    article_id: int,
    requester_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    article = db.query(models.WriterArticle).filter(
        models.WriterArticle.id == article_id
    ).first()
    if not article:
        raise HTTPException(404, "Article not found")

    # Non-authors can only view published articles
    if article.status != "published" and article.author_id != requester_id:
        raise HTTPException(403, "This article is not yet published")

    # Increment view count for published articles viewed by others
    if article.status == "published" and article.author_id != requester_id:
        article.views += 1
        db.commit()

    return article_to_dict(article)


# ── My Articles ────────────────────────────────────────────────────────────────
@app.get("/my_articles/{user_id}")
async def get_my_articles(user_id: str, db: Session = Depends(get_db)):
    articles = (
        db.query(models.WriterArticle)
        .filter(models.WriterArticle.author_id == user_id)
        .order_by(models.WriterArticle.updated_at.desc())
        .all()
    )
    return [article_to_dict(a) for a in articles]


# ── Published Articles (Community Feed) ───────────────────────────────────────
@app.get("/published")
async def get_published_articles(
    category: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(models.WriterArticle).filter(
        models.WriterArticle.status == "published"
    )
    if category and category != "All":
        query = query.filter(models.WriterArticle.category == category)
    total = query.count()
    articles = query.order_by(models.WriterArticle.published_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "articles": [article_to_dict(a) for a in articles]
    }


# ── AI Writing Assistance ──────────────────────────────────────────────────────
@app.post("/ai_assist")
async def ai_assist(req: AIAssistRequest):
    start = time.monotonic()
    result = await call_groq_assist(
        action=req.action,
        content=req.content or "",
        topic=req.topic or ""
    )
    elapsed = round(time.monotonic() - start, 2)
    logger.info("AI assist: action=%s user=%s (%.2fs)", req.action, req.author_id, elapsed)
    return {
        "action": req.action,
        "result": result,
        "generation_time_seconds": elapsed
    }


# ── Admin: Pending Articles ────────────────────────────────────────────────────
@app.get("/admin/pending")
async def admin_get_pending(db: Session = Depends(get_db)):
    articles = (
        db.query(models.WriterArticle)
        .filter(models.WriterArticle.status == "submitted")
        .order_by(models.WriterArticle.updated_at.asc())
        .all()
    )
    return [article_to_dict(a) for a in articles]


# ── Admin: All Articles ────────────────────────────────────────────────────────
@app.get("/admin/all")
async def admin_get_all(db: Session = Depends(get_db)):
    articles = (
        db.query(models.WriterArticle)
        .order_by(models.WriterArticle.updated_at.desc())
        .all()
    )
    return [article_to_dict(a) for a in articles]


# ── Admin: Approve ─────────────────────────────────────────────────────────────
@app.post("/admin/{article_id}/approve")
async def admin_approve(article_id: int, db: Session = Depends(get_db)):
    article = db.query(models.WriterArticle).filter(
        models.WriterArticle.id == article_id
    ).first()
    if not article:
        raise HTTPException(404, "Article not found")
    if article.status != "submitted":
        raise HTTPException(400, f"Article is '{article.status}', not 'submitted'")

    article.status = "published"
    article.published_at = datetime.utcnow()
    article.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(article)
    logger.info("Article approved and published: id=%d", article_id)
    return {"success": True, "article": article_to_dict(article)}


# ── Admin: Reject ──────────────────────────────────────────────────────────────
@app.post("/admin/{article_id}/reject")
async def admin_reject(
    article_id: int,
    req: RejectArticleRequest,
    db: Session = Depends(get_db)
):
    article = db.query(models.WriterArticle).filter(
        models.WriterArticle.id == article_id
    ).first()
    if not article:
        raise HTTPException(404, "Article not found")
    if article.status != "submitted":
        raise HTTPException(400, f"Article is '{article.status}', not 'submitted'")

    article.status = "rejected"
    article.rejection_reason = req.reason
    article.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(article)
    logger.info("Article rejected: id=%d reason=%s", article_id, req.reason)
    return {"success": True, "article": article_to_dict(article)}


# ── Admin: Delete ──────────────────────────────────────────────────────────────
@app.post("/admin/{article_id}/delete")
@app.delete("/admin/{article_id}/delete")
async def admin_delete(
    article_id: int,
    db: Session = Depends(get_db)
):
    article = db.query(models.WriterArticle).filter(
        models.WriterArticle.id == article_id
    ).first()
    if not article:
        raise HTTPException(404, "Article not found")
    
    db.delete(article)
    db.commit()
    logger.info("Article deleted by admin: id=%d", article_id)
    return {"success": True, "message": "Article deleted permanently"}



# ── Stats ──────────────────────────────────────────────────────────────────────
@app.get("/stats")
async def get_stats(db: Session = Depends(get_db)):
    total = db.query(models.WriterArticle).count()
    published = db.query(models.WriterArticle).filter(models.WriterArticle.status == "published").count()
    pending = db.query(models.WriterArticle).filter(models.WriterArticle.status == "submitted").count()
    drafts = db.query(models.WriterArticle).filter(models.WriterArticle.status == "draft").count()
    return {
        "total": total,
        "published": published,
        "pending_review": pending,
        "drafts": drafts,
    }
