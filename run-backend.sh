#!/usr/bin/env bash
# Start Project Pelican API (requires Python 3.11 or 3.12 — 3.14 can crash)
set -e
cd "$(dirname "$0")/server"
PYTHON=
for p in python3.12 python3.11; do
  if command -v "$p" &>/dev/null; then
    PYTHON=$p
    break
  fi
done
[[ -n "$PYTHON" ]] || { echo "Install Python 3.11 or 3.12 (e.g. brew install python@3.12)"; exit 1; }
echo "Using $PYTHON: $($PYTHON --version)"
# Recreate venv if it was made with wrong Python (e.g. 3.14)
VENV_PYTHON=.venv/bin/python
if [[ -d .venv ]] && ! "$VENV_PYTHON" -c "import sys; exit(0 if sys.version_info[:2] in ((3,11),(3,12)) else 1)" 2>/dev/null; then
  echo "Recreating .venv with $PYTHON (current venv is wrong version)"
  rm -rf .venv
fi
if [[ ! -d .venv ]]; then
  "$PYTHON" -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt 2>/dev/null || .venv/bin/pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
fi
# If venv exists but deps missing (e.g. fastapi), reinstall
if ! .venv/bin/python -c "import fastapi" 2>/dev/null; then
  echo "Installing dependencies..."
  .venv/bin/pip install -r requirements.txt 2>/dev/null || .venv/bin/pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
fi
echo "Starting backend... When you see 'Uvicorn running on http://127.0.0.1:8000', open http://localhost:3000 and click 'Connect to backend'."
.venv/bin/uvicorn app.main:app --reload --port 8000
