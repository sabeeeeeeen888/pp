# Project Pelican — Backend

API for colony data, risk analytics, and **real AI image classification** (CLIP zero-shot). Deps: FastAPI, uvicorn, openpyxl, and for AI: torch, transformers, Pillow. Works with Python 3.10–3.12 (torch may be picky on 3.14).

## Quick start

From the **project root** (`nx2026/`):

```bash
./run-backend.sh
```

Or from this folder:

```bash
cd server
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# If you get SSL errors:
# pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Then open http://localhost:8000/docs and http://localhost:3000 (frontend).

## Endpoints

- `GET /` — API info
- `GET /health` — health check
- `GET /api/colonies/years` — list years
- `GET /api/colonies/species` — list species
- `GET /api/colonies/?year=2021&species=...` — colony records
- `GET /api/analytics/risk` — habitat risk scores
- `POST /classify` or `POST /api/ai/classify` — **AI image classification** (CLIP): send form field `file` (image); returns High/Low/No colony. First request may be slow while the model downloads (~400MB).

## Data

Place `Colibri2010-21ColonyTotalsMayJuneCombined_8Nov22.xlsx` in the **project root** (`nx2026/`). If missing or invalid, the API uses synthetic demo data.
