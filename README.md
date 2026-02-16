# Project Pelican

Web-based decision-support system that helps wildlife resource managers **monitor wildlife habitat from an archive of 400,000+ aerial images**—combining survey data with AI image classification so restoration dollars can be prioritized where benefits are greatest.

## Challenge

Louisiana’s coast has rich biodiversity and faces intense storms and steady land loss. With limited conservation dollars, managers need to know where wildlife is. Partners routinely take aerial photos over coastal habitat to find bird nesting colonies. **The challenge: design an innovative solution that helps managers monitor habitat from an archive of over 400,000 aerial images.**

## Solution

1. **Survey data dashboard** — Map, risk scores, species richness, and trend analysis from existing colony monitoring (e.g. Colibri Excel). Identifies where colonies are and where they’re declining so restoration can be prioritized.
2. **AI image classification** — Upload (or batch-process) aerial images; classify each as **High-density colony**, **Low-density colony**, or **No colony**. Scales across the full archive so managers can triage imagery instead of manually reviewing 400k+ photos.
3. **Integration** — One place to see both “where we know colonies are” (survey data) and “what the aerial archive shows” (AI labels). Future: link image metadata (lat/lon, date) to the map for validation and gap-filling.

## Features

- **Interactive map** — Nesting colonies; filter by year (2010–2021) and species; colony density toggle.
- **Species richness & trend analysis** — Biodiversity hotspots and decline rates.
- **Habitat risk scoring** — Low / Moderate / High priority for restoration.
- **AI: Classify aerial image** — Upload an image → High / Low / No colony (placeholder classifier; replace with trained CNN on labeled imagery for production).

## Run locally

**Quick start (demo data only):** Run the frontend and open **http://localhost:3000**. If the backend is not running, the site still loads with embedded demo data and a notice at the top.

**Full setup (Excel/API data):**

1. **Frontend** (in one terminal):
   ```bash
   cd client
   npm install
   npm run dev
   ```
   Then open **http://localhost:3000**.

2. **Backend** (in a second terminal). Use **Python 3.11 or 3.12** (not 3.14):
   ```bash
   cd server
   python3.12 -m venv .venv    # or python3.11
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```
   API docs: http://localhost:8000/docs

3. Refresh the browser; the app will use the API and your Excel data (if `Colibri2010-21ColonyTotalsMayJuneCombined_8Nov22.xlsx` is in the project root).

## Stack

- **Frontend:** React, TypeScript, Vite, Leaflet (react-leaflet), Recharts
- **Backend:** Python, FastAPI, openpyxl (no pandas)
- **Data:** Place `Colibri2010-21ColonyTotalsMayJuneCombined_8Nov22.xlsx` in the project root (`nx2026/`); the API loads it automatically. If the file is missing, the app uses synthetic demo data. The Excel columns used are: Year, State, GeoRegion, ColonyName, SpeciesCode, Nests (and optionally CombinedMayJuneTotal? = Y).

## References

- Caro, T., & O'Doherty, G. (1999). On the use of surrogate species in conservation biology. *Conservation Biology*, 13(4), 805–814.
- NOAA Gulf Spill Restoration Portal — Deepwater Horizon restoration monitoring data.
