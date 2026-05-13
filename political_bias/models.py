from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from database import Base

class BiasLog(Base):
    __tablename__ = "bias_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), index=True, nullable=False)
    article_url = Column(String(500), nullable=False)
    article_title = Column(String(500), nullable=True)
    bias_score = Column(String(50), nullable=False) # "Left-Leaning", "Center", "Right-Leaning"
    confidence = Column(Float, nullable=False)
    highlight_phrase = Column(String(2000), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
