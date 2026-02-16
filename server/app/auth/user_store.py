"""
Simple user store for sign-in. In-memory with optional JSON file persistence.
"""
import json
import os
from pathlib import Path
from typing import Dict, Optional

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# email -> { "email", "hashed_password", "display_name" }
_users: Dict[str, dict] = {}
_storage_path: Optional[Path] = None


def _get_storage_path() -> Path:
    if _storage_path is not None:
        return _storage_path
    # Vercel serverless: only /tmp is writable
    if os.environ.get("VERCEL"):
        return Path("/tmp") / "pelican_users.json"
    return Path(__file__).resolve().parent.parent.parent / "data" / "users.json"


def set_storage_path(path: Path) -> None:
    global _storage_path
    _storage_path = path


def load_users() -> None:
    """Load users from JSON file if it exists."""
    path = _get_storage_path()
    if not path.exists():
        return
    try:
        data = json.loads(path.read_text())
        _users.clear()
        for email, rec in data.get("users", {}).items():
            _users[email] = rec
    except Exception:
        pass


def save_users() -> None:
    """Persist users to JSON file."""
    path = _get_storage_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"users": _users}, indent=2))


def get_user_by_email(email: str) -> Optional[dict]:
    return _users.get(email.lower().strip())


def create_user(email: str, password: str, display_name: Optional[str] = None) -> dict:
    """Register a new user. Raises ValueError if email already exists."""
    email = email.lower().strip()
    if email in _users:
        raise ValueError("Email already registered")
    hashed = pwd_context.hash(password)
    display_name = (display_name or email).strip() or email
    _users[email] = {
        "email": email,
        "hashed_password": hashed,
        "display_name": display_name,
    }
    try:
        save_users()
    except Exception:
        pass
    return {"email": email, "display_name": display_name}


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# Load on import so persisted users are available
load_users()
