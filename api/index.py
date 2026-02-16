"""
Vercel serverless: single entry for all /api/*. Rewrite sends path as query; we restore it for FastAPI.
"""
import os
import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parent.parent
server_dir = repo_root / "server"
os.chdir(repo_root)
if str(server_dir) not in sys.path:
    sys.path.insert(0, str(server_dir))

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.main import app as _app


class VercelPathFixMiddleware(BaseHTTPMiddleware):
    """When path is /api/index and query has 'path', set scope path to /api/<path> so FastAPI routes correctly."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path.rstrip("/") in ("/api/index", "/api"):
            q = request.query_params.get("path") or ""
            if q:
                request.scope["path"] = "/api/" + q.lstrip("/")
            else:
                request.scope["path"] = "/"  # so /api and /api/index hit root()
            request.scope["raw_path"] = request.scope["path"].encode()
        return await call_next(request)


_app.add_middleware(VercelPathFixMiddleware)
app = _app
