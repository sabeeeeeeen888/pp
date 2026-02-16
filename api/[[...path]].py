"""
Vercel serverless entry: run FastAPI for all /api/* and /classify requests.
"""
import sys
from pathlib import Path

# Allow importing server app (repo root = cwd on Vercel)
server_dir = Path(__file__).resolve().parent.parent / "server"
if str(server_dir) not in sys.path:
    sys.path.insert(0, str(server_dir))

from mangum import Mangum
from app.main import app

handler = Mangum(app, lifespan="off")
