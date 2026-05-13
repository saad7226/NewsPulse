from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
from database import Base

class CounterLog(Base):
    __tablename__ = "counter_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), index=True, nullable=False)
    article_url = Column(String(500), nullable=False)
    article_title = Column(String(500), nullable=True)
    counter_argument = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
