"""
Sign-in (demo: any email works) and current-user (JWT) endpoints.
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.auth.jwt_handler import create_access_token, decode_token

router = APIRouter()
security = HTTPBearer(auto_error=False)


ALLOWED_ROLES = {"Public", "Citizen Scientist", "Research"}


class SignInBody(BaseModel):
    email: str
    password: str | None = None  # optional for demo
    role: str | None = None  # Public | Citizen Scientist | Research


def _get_token(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> str | None:
    if credentials and credentials.scheme == "Bearer":
        return credentials.credentials
    return None


@router.post("/signin")
def signin(body: SignInBody):
    """Demo: sign in with any email and role. Returns user info and access_token."""
    email = (body.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    display_name = email.split("@")[0] if "@" in email else email
    role = (body.role or "Public").strip()
    if role not in ALLOWED_ROLES:
        role = "Public"
    token = create_access_token(email, display_name, role)
    return {
        "user": {"email": email, "display_name": display_name, "role": role},
        "access_token": token,
        "token_type": "bearer",
    }


@router.get("/me")
def me(token: str | None = Depends(_get_token)):
    """Return current user if token is valid."""
    if not token:
        raise HTTPException(status_code=401, detail="Not signed in")
    payload = decode_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {
        "email": payload["sub"],
        "display_name": payload.get("display_name") or payload["sub"],
        "role": payload.get("role") or "Public",
    }
