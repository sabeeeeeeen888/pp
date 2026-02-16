"""
Vercel serverless entry: run FastAPI for all /api/* and /classify requests.
"""
import os
import sys
from pathlib import Path

# Repo root (parent of api/)
repo_root = Path(__file__).resolve().parent.parent
server_dir = repo_root / "server"

# So server can find Colibri Excel and other files
os.chdir(repo_root)

if str(server_dir) not in sys.path:
    sys.path.insert(0, str(server_dir))

from mangum import Mangum
from app.main import app

handler = Mangum(app, lifespan="off")
