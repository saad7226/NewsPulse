import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr

import models
from database import SessionLocal, engine, Base

# Create tables
Base.metadata.create_all(bind=engine)

# ── Runtime migrations: add new columns that create_all won't touch ──
import sqlalchemy as _sa
with engine.connect() as _conn:
    # Add 'preferences' column if missing
    try:
        _conn.execute(_sa.text("ALTER TABLE users ADD COLUMN preferences VARCHAR DEFAULT '[\"General\"]'"))
        _conn.commit()
    except Exception:
        pass  # Already exists — ignore

    # Add profile columns if missing
    for col in ["full_name", "bio", "profile_picture"]:
        try:
            _conn.execute(_sa.text(f"ALTER TABLE users ADD COLUMN {col} VARCHAR"))
            _conn.commit()
        except Exception:
            pass  # Already exists — ignore

    # Add admin hierarchy columns if missing
    for col_def in [
        "is_approved BOOLEAN DEFAULT FALSE",
        "is_super_admin BOOLEAN DEFAULT FALSE",
    ]:
        col_name = col_def.split()[0]
        try:
            _conn.execute(_sa.text(f"ALTER TABLE admins ADD COLUMN {col_def}"))
            _conn.commit()
        except Exception:
            pass  # Already exists — ignore

# Removed super admin seeding from here, moved down below pwd_context

app = FastAPI(title="NewsPulse Auth Service")

# Security — fail fast if JWT_SECRET is not set or is the insecure default
_JWT_SECRET_RAW = os.getenv("JWT_SECRET", "")
_INSECURE_DEFAULTS = {"", "your-super-secret-key-change-this", "change-me", "secret"}
if _JWT_SECRET_RAW in _INSECURE_DEFAULTS:
    raise RuntimeError(
        "FATAL: JWT_SECRET is not set or is using an insecure default value. "
        "Set a strong JWT_SECRET in your .env file before starting the auth service."
    )
SECRET_KEY = _JWT_SECRET_RAW
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# ── Super Admin seeding ───────────────────────────────────────────────────────
# The super admin is never registered via the UI — they are seeded from .env.
# This runs idempotently: if a super admin already exists, nothing happens.
def _seed_super_admin():
    _sa_username = os.getenv("SUPER_ADMIN_USERNAME", "").strip()
    _sa_password = os.getenv("SUPER_ADMIN_PASSWORD", "").strip()
    if not _sa_username or not _sa_password:
        return  # Not configured — skip
    db = SessionLocal()
    try:
        # ── Case 1: A properly-flagged super admin already exists ──────────
        existing_super = db.query(models.Admin).filter(
            models.Admin.is_super_admin == True
        ).first()
        if existing_super:
            # Idempotent: ensure it's approved and credentials match .env
            changed = False
            if not existing_super.is_approved:
                existing_super.is_approved = True
                changed = True
            if not pwd_context.verify(_sa_password, existing_super.hashed_password):
                existing_super.hashed_password = pwd_context.hash(_sa_password)
                changed = True
            if changed:
                db.commit()
                print(f"[auth_service] Super Admin '{existing_super.username}' credentials refreshed.")
            return

        # ── Case 2: Username exists but is_super_admin flag is missing/False ──
        # This happens when the DB was created before the is_super_admin column
        # was added (migration sets DEFAULT FALSE on old rows). The old code tried
        # to INSERT, hit a UNIQUE constraint on username, and silently failed.
        existing_by_name = db.query(models.Admin).filter(
            models.Admin.username == _sa_username
        ).first()
        if existing_by_name:
            existing_by_name.is_super_admin = True
            existing_by_name.is_approved = True
            existing_by_name.hashed_password = pwd_context.hash(_sa_password)
            db.commit()
            print(f"[auth_service] Super Admin '{_sa_username}' upgraded from existing record.")
            return

        # ── Case 3: No record at all — fresh seed ─────────────────────────
        super_admin = models.Admin(
            username=_sa_username,
            email=f"{_sa_username}@newspulse.internal",
            hashed_password=pwd_context.hash(_sa_password),
            is_approved=True,
            is_super_admin=True,
        )
        db.add(super_admin)
        db.commit()
        print(f"[auth_service] Super Admin '{_sa_username}' seeded successfully.")
    except Exception as e:
        db.rollback()
        print(f"[auth_service] Super Admin seeding failed: {e}")
    finally:
        db.close()

_seed_super_admin()

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic Schemas
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    username: Optional[str] = None
    is_admin: Optional[bool] = False
    is_super_admin: Optional[bool] = False

class SaveArticleReq(BaseModel):
    user_id: int
    article_url: str
    article_title: str

class UnsaveArticleReq(BaseModel):
    user_id: int
    article_url: str

class UpdatePreferencesReq(BaseModel):
    user_id: int
    preferences: str

class ProfileUpdateReq(BaseModel):
    user_id: int
    full_name: Optional[str] = None
    bio: Optional[str] = None
    profile_picture: Optional[str] = None

# Helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/register", response_model=Token)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(
        (models.User.email == user.email) | (models.User.username == user.username)
    ).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username or email already registered")
        
    hashed_password = get_password_hash(user.password)
    new_user = models.User(username=user.username, email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    # No automatic admin grant at registration — admins use /admin-login

    access_token = create_access_token(
        data={"sub": new_user.username, "user_id": new_user.id, "is_admin": new_user.is_admin}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "is_admin": new_user.is_admin}

@app.post("/login", response_model=Token)
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": db_user.username, "user_id": db_user.id, "is_admin": db_user.is_admin}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "is_admin": db_user.is_admin}

from google.oauth2 import id_token
from google.auth.transport import requests

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "25984854718-nrffdtkmr4m28js1obmf51miq3b9ha75.apps.googleusercontent.com")

# ─── Admin Auth (separate admins table) ────────────────────────────────────

class AdminRegisterReq(BaseModel):
    username: str
    email: EmailStr
    password: str
    # No register_code needed — Super Admin approves via the dashboard

class AdminLoginReq(BaseModel):
    username: str
    password: str

@app.post("/admin-register")
def admin_register(req: AdminRegisterReq, db: Session = Depends(get_db)):
    """
    Register a new admin account (open registration).
    New admins are created with is_approved=False — they CANNOT login until
    a Super Admin approves them from the Admin Management panel.
    """
    if db.query(models.Admin).filter(models.Admin.username == req.username).first():
        raise HTTPException(status_code=400, detail="Admin username already exists.")
    if db.query(models.Admin).filter(models.Admin.email == req.email).first():
        raise HTTPException(status_code=400, detail="Admin email already registered.")

    new_admin = models.Admin(
        username=req.username,
        email=req.email,
        hashed_password=get_password_hash(req.password),
        is_approved=False,
        is_super_admin=False,
    )
    db.add(new_admin)
    db.commit()
    db.refresh(new_admin)
    return {"message": f"Registration submitted. Awaiting Super Admin approval."}

@app.post("/admin-login", response_model=Token)
def admin_login(req: AdminLoginReq, db: Session = Depends(get_db)):
    """
    Admin login — checks the `admins` table only.
    Blocks login if is_approved=False.
    Returns JWT with is_admin=True and is_super_admin flag.
    """
    db_admin = db.query(models.Admin).filter(
        models.Admin.username == req.username
    ).first()

    if not db_admin or not verify_password(req.password, db_admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials."
        )

    # Block unapproved admins
    if not db_admin.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending Super Admin approval."
        )

    access_token = create_access_token(
        data={
            "sub": db_admin.username,
            "user_id": db_admin.id,
            "is_admin": True,
            "is_super_admin": db_admin.is_super_admin,
        },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "is_admin": True,
        "is_super_admin": db_admin.is_super_admin,
    }

# ─── Super Admin Management Endpoints ───────────────────────────────────────

def _require_super_admin(super_admin_token: str, db: Session):
    """Validate that the caller is a super admin. Raises 403 otherwise."""
    try:
        payload = jwt.decode(super_admin_token, SECRET_KEY, algorithms=[ALGORITHM])
        admin_id = payload.get("user_id")
        is_super = payload.get("is_super_admin", False)
        if not is_super:
            raise HTTPException(status_code=403, detail="Super Admin privileges required.")
        admin = db.query(models.Admin).filter(models.Admin.id == admin_id).first()
        if not admin or not admin.is_super_admin:
            raise HTTPException(status_code=403, detail="Super Admin privileges required.")
        return admin
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

class SuperAdminTokenReq(BaseModel):
    token: str

@app.post("/admin/pending")
def list_pending_admins(req: SuperAdminTokenReq, db: Session = Depends(get_db)):
    """List all admins awaiting approval. Super Admin only."""
    _require_super_admin(req.token, db)
    pending = db.query(models.Admin).filter(
        models.Admin.is_approved == False,
        models.Admin.is_super_admin == False
    ).order_by(models.Admin.created_at.desc()).all()
    return [
        {"id": a.id, "username": a.username, "email": a.email,
         "created_at": a.created_at.isoformat()}
        for a in pending
    ]

@app.post("/admin/approved")
def list_approved_admins(req: SuperAdminTokenReq, db: Session = Depends(get_db)):
    """List all approved non-super admins. Super Admin only."""
    _require_super_admin(req.token, db)
    approved = db.query(models.Admin).filter(
        models.Admin.is_approved == True,
        models.Admin.is_super_admin == False
    ).order_by(models.Admin.created_at.desc()).all()
    return [
        {"id": a.id, "username": a.username, "email": a.email,
         "created_at": a.created_at.isoformat()}
        for a in approved
    ]

class AdminActionReq(BaseModel):
    token: str
    admin_id: int

@app.post("/admin/approve")
def approve_admin(req: AdminActionReq, db: Session = Depends(get_db)):
    """Approve a pending admin. Super Admin only."""
    _require_super_admin(req.token, db)
    target = db.query(models.Admin).filter(models.Admin.id == req.admin_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found.")
    if target.is_super_admin:
        raise HTTPException(status_code=403, detail="Cannot modify the Super Admin.")
    target.is_approved = True
    db.commit()
    return {"message": f"Admin '{target.username}' approved successfully."}

@app.delete("/admin/delete")
def delete_admin(req: AdminActionReq, db: Session = Depends(get_db)):
    """Delete any non-super admin (pending or approved). Super Admin only."""
    _require_super_admin(req.token, db)
    target = db.query(models.Admin).filter(models.Admin.id == req.admin_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found.")
    if target.is_super_admin:
        raise HTTPException(status_code=403, detail="The Super Admin cannot be deleted.")
    db.delete(target)
    db.commit()
    return {"message": f"Admin '{target.username}' deleted."}

class GoogleLogin(BaseModel):
    token: str

@app.post("/google-login", response_model=Token)
def google_login(data: GoogleLogin, db: Session = Depends(get_db)):
    try:
        idinfo = id_token.verify_oauth2_token(
            data.token, 
            requests.Request(), 
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=86400  # Allow 24h clock skew for Docker Windows VM sleep drift
        )
        
        email = idinfo.get('email')
        name = idinfo.get('name')
        if not email:
            raise HTTPException(status_code=400, detail="Invalid Google token payload")

        db_user = db.query(models.User).filter(models.User.email == email).first()

        if not db_user:
            # Create user if doesn't exist. Generate a very long random password so standard logins fail.
            random_pwd = os.urandom(24).hex()
            hashed_password = get_password_hash(random_pwd)
            db_user = models.User(username=name or email.split('@')[0], email=email, hashed_password=hashed_password)
            db.add(db_user)
            db.commit()
            db.refresh(db_user)

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": db_user.username, "user_id": db_user.id, "is_admin": db_user.is_admin}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer", "username": db_user.username, "is_admin": db_user.is_admin}

    except ValueError as e:
        import sys
        print(f"DEBUG: ValueError verifying token: {e}", file=sys.stderr)
        raise HTTPException(status_code=400, detail="Invalid Google token")
    except Exception as e:
        import sys
        print(f"DEBUG: Exception verifying token: {e}", file=sys.stderr)
        raise HTTPException(status_code=400, detail=f"Invalid Google token payload: {e}")
@app.post("/save_article")
def save_article(req: SaveArticleReq, db: Session = Depends(get_db)):
    existing = db.query(models.SavedArticle).filter(
        models.SavedArticle.user_id == req.user_id,
        models.SavedArticle.article_url == req.article_url
    ).first()
    if existing:
        return {"status": "ok", "message": "Already saved"}
    
    new_save = models.SavedArticle(
        user_id=req.user_id,
        article_url=req.article_url,
        article_title=req.article_title
    )
    db.add(new_save)
    db.commit()
    return {"status": "ok"}

@app.post("/unsave_article")
def unsave_article(req: UnsaveArticleReq, db: Session = Depends(get_db)):
    db.query(models.SavedArticle).filter(
        models.SavedArticle.user_id == req.user_id,
        models.SavedArticle.article_url == req.article_url
    ).delete()
    db.commit()
    return {"status": "ok"}

@app.get("/saved_articles/{user_id}")
def get_saved_articles(user_id: int, db: Session = Depends(get_db)):
    articles = db.query(models.SavedArticle).filter(models.SavedArticle.user_id == user_id).order_by(models.SavedArticle.saved_at.desc()).all()
    return [
        {
            "id": a.id,
            "article_url": a.article_url,
            "article_title": a.article_title,
            "saved_at": a.saved_at.isoformat()
        } for a in articles
    ]

@app.get("/preferences/{user_id}")
def get_preferences(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "ok", "preferences": user.preferences}

@app.post("/preferences")
def update_preferences(req: UpdatePreferencesReq, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.preferences = req.preferences
    db.commit()
    return {"status": "ok"}

# ─── Profile Management ─────────────────────────────────────────────────────

@app.get("/profile/{user_id}")
def get_profile(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "user_id": db_user.id,
        "username": db_user.username,
        "email": db_user.email,
        "full_name": db_user.full_name,
        "bio": db_user.bio,
        "profile_picture": db_user.profile_picture
    }

@app.post("/profile")
def update_profile(req: ProfileUpdateReq, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == req.user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if req.full_name is not None:
        db_user.full_name = req.full_name
    if req.bio is not None:
        db_user.bio = req.bio
    if req.profile_picture is not None:
        db_user.profile_picture = req.profile_picture
        
    db.commit()
    db.refresh(db_user)
    return {"status": "ok", "message": "Profile updated successfully"}
