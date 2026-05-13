"""
One-shot script to seed the Super Admin into the existing users.db.
Run this from the project root:  python seed_superadmin.py
"""
import sqlite3
from passlib.context import CryptContext

SUPER_ADMIN_USERNAME = "superadmin"
SUPER_ADMIN_PASSWORD = "NewsPulse@SuperAdmin2026!"
SUPER_ADMIN_EMAIL    = "superadmin@newspulse.internal"
DB_PATH = r"f:\SAAD\UNIVERSITY\FYP\NewsPulse\auth_data\users.db"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
hashed = pwd_context.hash(SUPER_ADMIN_PASSWORD)

conn = sqlite3.connect(DB_PATH)
cur  = conn.cursor()

# ── 1. Show current schema ────────────────────────────────────────────────────
cur.execute("PRAGMA table_info(admins)")
cols = [row[1] for row in cur.fetchall()]
print(f"[INFO] Current 'admins' columns: {cols}")

# ── 2. Add missing columns (idempotent) ───────────────────────────────────────
for col_def in ["is_approved BOOLEAN DEFAULT 0", "is_super_admin BOOLEAN DEFAULT 0"]:
    col_name = col_def.split()[0]
    if col_name not in cols:
        cur.execute(f"ALTER TABLE admins ADD COLUMN {col_def}")
        print(f"[INFO] Added column: {col_name}")

# ── 3. Check for existing record ──────────────────────────────────────────────
cur.execute("SELECT id, username, is_approved, is_super_admin FROM admins WHERE username=?", (SUPER_ADMIN_USERNAME,))
existing = cur.fetchone()

if existing:
    print(f"[INFO] Found existing record: id={existing[0]}, is_approved={existing[2]}, is_super_admin={existing[3]}")
    cur.execute(
        "UPDATE admins SET hashed_password=?, is_approved=1, is_super_admin=1 WHERE username=?",
        (hashed, SUPER_ADMIN_USERNAME)
    )
    print(f"[OK]   Updated '{SUPER_ADMIN_USERNAME}' → is_approved=1, is_super_admin=1, password refreshed.")
else:
    cur.execute(
        "INSERT INTO admins (username, email, hashed_password, is_approved, is_super_admin) VALUES (?,?,?,1,1)",
        (SUPER_ADMIN_USERNAME, SUPER_ADMIN_EMAIL, hashed)
    )
    print(f"[OK]   Inserted new Super Admin record for '{SUPER_ADMIN_USERNAME}'.")

conn.commit()

# ── 4. Verify ─────────────────────────────────────────────────────────────────
cur.execute(
    "SELECT id, username, email, is_approved, is_super_admin FROM admins WHERE username=?",
    (SUPER_ADMIN_USERNAME,)
)
row = cur.fetchone()
print(f"\n[VERIFIED] id={row[0]}  username={row[1]}  email={row[2]}  is_approved={row[3]}  is_super_admin={row[4]}")
conn.close()
print("\n✅ Super Admin seeded successfully. You can delete this script now.")
