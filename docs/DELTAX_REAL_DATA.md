# Using Real NASA Delta-X Data in Project Pelican

## Current state (placeholder)

Right now the app **does not use real Delta-X data**. It uses:

- A **longitude cutoff at -91.2°**: west = "growing" (Atchafalaya), east = "sinking" (Terrebonne).
- **Synthetic proxies** for elevation decline, sediment, and water variability derived from that same geography.

So growing vs sinking is **not** from measurements—it's a simplified stand-in for the real science.

---

## Where real Delta-X data lives

- **Mission site:** https://deltax.jpl.nasa.gov  
- **Data download:** https://deltax.jpl.nasa.gov/data/download/  
- **Final products:** **Oak Ridge National Laboratory DAAC (ORNL DAAC)**  
  - Project list: https://daac.ornl.gov/cgi-bin/dataset_lister.pl?p=41  
  - Search "Delta-X" at https://daac.ornl.gov  

You may need a **NASA Earthdata login** (free) to download: https://urs.earthdata.nasa.gov

---

## Products that matter for “growing vs sinking”

| What we need           | Real Delta-X product (examples)                          | Use in app                          |
|------------------------|----------------------------------------------------------|-------------------------------------|
| Where is land sinking? | L4 **bathymetry/elevation**; L4 **Delft3D / ANUGA** basin outputs | Replace -91.2 rule with real zones or elevation |
| Elevation / subsidence | L4 map of **bathymetry/elevation**; UAVSAR-derived products | Per-colony elevation decline proxy |
| Sediment / accretion   | L4 **soil accretion** (annual to 2024/2100); accretion model at Wax Lake | Sediment deposition / starvation proxy |
| Water / inundation    | L3 **water level maps**; UAVSAR water vs time            | Water variability proxy             |

Exact dataset IDs and formats are on ORNL DAAC (search “Delta-X”, filter by level L3/L4).

---

## How to integrate real data (options)

### Option A: Preprocess and drop files into the repo

1. Download the Delta-X products you need from ORNL DAAC (e.g. elevation map, accretion map, or basin polygons).
2. Convert to something the app can read:
   - **Zones (growing/sinking):** GeoJSON polygons with a property like `trend: "growing"` or `"sinking"` (e.g. from model basin boundaries).
   - **Per-point values:** CSV with `lat,lon,elevation_decline_rate,sediment_deposition_rate,water_surface_variability` (one row per grid cell or colony), or a GeoTIFF/NetCDF that you sample at colony lat/lon in a script and export as CSV.
3. Put the file(s) in `server/data/` (e.g. `deltax_zones.json`, `deltax_proxies.csv`) and wire the backend to load them (see `server/app/data/deltax_data.py`). The app already has a fallback: if no file is present, it keeps using the longitude rule.

### Option B: Backend script that pulls from ORNL DAAC / Earthdata

- Use NASA’s **Earthdata API** or direct HTTP to ORNL DAAC dataset URLs (with auth if required).
- Script: download → convert to zones + per-location proxies → write `deltax_zones.json` and `deltax_proxies.csv` (or similar) → same as Option A from there.

### Option C: Backend API that samples rasters on the fly

- Store GeoTIFF/NetCDF in `server/data/` or on S3.
- Use **rasterio** (GeoTIFF) or **netCDF4** (NetCDF) in Python to sample at `(lat, lon)` for each colony and return elevation change, accretion, etc. Then the risk model and land-loss zones use these values instead of the synthetic proxies.

---

## What to change in the codebase

1. **Land-loss zones**  
   - Today: `server/app/routers/analytics.py` → `land_loss_zones()` returns hardcoded rectangles at -91.2°.  
   - With real data: load GeoJSON from e.g. `server/data/deltax_zones.json` (or from a URL) and return that. If the file is missing, keep returning the current hardcoded zones.

2. **Risk model Delta-X proxies**  
   - Today: `server/app/services/risk_model.py` → `_delta_x_proxies(lat, lon, site_index)` uses longitude and a hash.  
   - With real data: if `server/data/deltax_proxies.csv` (or a raster) exists, sample elevation decline, sediment, and water variability at `(lat, lon)` and return those; otherwise keep the current synthetic proxies.

3. **Sinking vs growing count**  
   - Today: `analytics.py` uses `longitude >= -91.2` for “sinking”.  
   - With real data: for each colony, determine zone from the real zones GeoJSON (point-in-polygon) or from a real “trend” raster; then count growing vs sinking from that.

4. **UI**  
   - No change required for basic use: the map and Delta-X page already show “growing” vs “sinking” and the same risk fields; they will just be driven by real data once the backend uses the new files or rasters.

---

## Citation

If you use Delta-X data in your project, cite it. Example from the mission:

> The NASA Delta-X project is funded by the Science Mission Directorate’s Earth Science Division through the Earth Venture Suborbital-3 Program NNH17ZDA001N-EVS3.

Check https://deltax.jpl.nasa.gov and the ORNL DAAC dataset pages for the exact citation and DOI for each product you use.
