from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
from database import Base

class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(500), unique=True, index=True, nullable=False)
    title = Column(String(500), nullable=True)
    content = Column(Text, nullable=False)
    published_at = Column(String(100), nullable=True)
    api_source = Column(String(50), nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)
