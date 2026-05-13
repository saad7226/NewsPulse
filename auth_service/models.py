from sqlalchemy import Column, Integer, String, Boolean, DateTime
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    preferences = Column(String, default='["General"]')
    full_name = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    profile_picture = Column(String, nullable=True)

class SavedArticle(Base):
    __tablename__ = "saved_articles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    article_url = Column(String, index=True, nullable=False)
    article_title = Column(String, nullable=False)
    saved_at = Column(DateTime, default=datetime.datetime.utcnow)

class Admin(Base):
    """Separate admins table — completely isolated from regular users."""
    __tablename__ = "admins"

    id             = Column(Integer, primary_key=True, index=True)
    username       = Column(String, unique=True, index=True, nullable=False)
    email          = Column(String, unique=True, index=True, nullable=False)
    hashed_password= Column(String, nullable=False)
    is_approved    = Column(Boolean, default=False)   # Must be True to login
    is_super_admin = Column(Boolean, default=False)   # Only the seeded super admin
    created_at     = Column(DateTime, default=datetime.datetime.utcnow)
