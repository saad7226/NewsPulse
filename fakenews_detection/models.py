from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from datetime import datetime
from database import Base

class FakeNewsLog(Base):
    __tablename__ = "fakenews_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), index=True, nullable=False)
    article_url = Column(String(500), nullable=False)
    article_title = Column(String(500), nullable=True)
    is_fake = Column(Boolean, nullable=False)
    confidence = Column(Float, nullable=False)
    ml_score = Column(Float, nullable=False)
    style_score = Column(Float, nullable=False)
    highlight_phrase = Column(String(2000), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
