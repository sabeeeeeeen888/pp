#!/usr/bin/env bash
# Start Project Pelican API (Python 3.10–3.12 recommended)
set -e
cd "$(dirname "$0")/server"
PYTHON=
for p in python3.12 python3.11 python3.10 python3; do
  if command -v "$p" &>/dev/null; then
    PYTHON=$p
    break
  fi
done
[[ -n "$PYTHON" ]] || { echo "Install Python 3.10+ (e.g. brew install python@3.12)"; exit 1; }
echo "Using $PYTHON: $($PYTHON --version 2>/dev/null || true)"

# If .venv exists but Python inside it cannot run (bad interpreter path), remove it
if [[ -d .venv ]] && [[ -f .venv/bin/python ]]; then
  if ! .venv/bin/python -c "import sys" 2>/dev/null; then
    echo "Removing broken .venv (bad interpreter path)."
    rm -rf .venv
  fi
fi

NEED_VENV=
if [[ ! -d .venv ]]; then
  NEED_VENV=1
elif ! .venv/bin/python -c "import sys; exit(0 if sys.version_info[:2] >= (3,10) and sys.version_info[:2] < (3,14) else 1)" 2>/dev/null; then
  echo "Recreating .venv with $PYTHON (current venv is wrong version)"
  rm -rf .venv
  NEED_VENV=1
fi

if [[ -n "$NEED_VENV" ]]; then
  echo "Creating new .venv..."
  "$PYTHON" -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt 2>/dev/null || .venv/bin/pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
fi

if ! .venv/bin/python -c "import fastapi" 2>/dev/null; then
  echo "Installing dependencies..."
  .venv/bin/pip install -r requirements.txt 2>/dev/null || .venv/bin/pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
fi

echo "Starting backend... When you see 'Uvicorn running on http://127.0.0.1:8000', open the app (e.g. http://localhost:3000) and use Change detection."
.venv/bin/uvicorn app.main:app --reload --port 8000 || {
  EXIT=$?
  if [[ $EXIT -eq 126 ]] || [[ $EXIT -eq 127 ]]; then
    echo "Venv uvicorn not runnable. Installing uvicorn for $PYTHON and starting..."
    "$PYTHON" -m pip install --user uvicorn fastapi 2>/dev/null || "$PYTHON" -m pip install uvicorn fastapi 2>/dev/null || true
    exec "$PYTHON" -m uvicorn app.main:app --reload --port 8000
  fi
  exit $EXIT
}
