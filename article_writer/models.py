from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from datetime import datetime
from database import Base


class WriterArticle(Base):
    """An article written by a NewsPulse user (writer)."""
    __tablename__ = "writer_articles"

    id             = Column(Integer, primary_key=True, index=True)
    author_id      = Column(String(50), index=True, nullable=False)
    author_name    = Column(String(200), nullable=False)
    author_username= Column(String(200), nullable=False)

    title          = Column(String(500), nullable=False)
    excerpt        = Column(String(1000), nullable=True)   # short description / subtitle
    content        = Column(Text, nullable=False)           # full article body (markdown-friendly)
    category       = Column(String(100), default="General")
    tags           = Column(String(500), default="[]")      # JSON list of tags

    # Lifecycle status: draft → submitted → published | rejected
    status         = Column(String(30), default="draft", index=True)
    rejection_reason = Column(String(1000), nullable=True)

    ai_assisted    = Column(Boolean, default=False)  # true if user used AI help
    views          = Column(Integer, default=0)

    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at   = Column(DateTime, nullable=True)
