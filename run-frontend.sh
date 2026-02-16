#!/usr/bin/env bash
# Start Project Pelican frontend
set -e
cd "$(dirname "$0")/client"
[[ -d node_modules ]] || npm install
npm run dev
