"""
Sample all four real NASA Delta-X datasets for every colony in the Project Pelican dataset.

Datasets used
─────────────
  1. RTK Elevation        doi:10.3334/ORNLDAAC/2071  (CSV)
  2. Feldspar Sediment    doi:10.3334/ORNLDAAC/2381  (CSV)
  3. Aboveground Biomass  doi:10.3334/ORNLDAAC/2237  (CSV)
  4. AirSWOT Water Height doi:10.3334/ORNLDAAC/2128  (GeoTIFF)

Quick-start
───────────
  1.  pip install rasterio pandas numpy openpyxl
  2.  Download each dataset from ORNL DAAC (free Earthdata account required):
        https://daac.ornl.gov/cgi-bin/dsviewer.pl?ds_id=2071   ← RTK elevation
        https://daac.ornl.gov/cgi-bin/dsviewer.pl?ds_id=2381   ← feldspar sediment
        https://daac.ornl.gov/cgi-bin/dsviewer.pl?ds_id=2237   ← biomass / necromass
        https://daac.ornl.gov/cgi-bin/dsviewer.pl?ds_id=2128   ← AirSWOT water height
  3.  Place files in  data/deltax/:
        data/deltax/rtk_elevation.csv              (or any *elevation* .csv)
        data/deltax/feldspar_sediment.csv           (or any *sediment* .csv)
        data/deltax/biomass.csv                     (or any *biomass* .csv)
        data/deltax/airswot_water.tif               (or any *water* .tif / *swot*.tif)
  4.  python scripts/sample_deltax_all.py
  5.  Restart the backend — it auto-loads data/deltax/deltax_colony_measurements.csv.

Output columns
──────────────
  colony_id, latitude, longitude,
  elevation_m_navd88, elevation_source_dist_km,
  sediment_accretion_mm_year, sediment_source_dist_km,
  biomass_g_m2, biomass_source_dist_km,
  water_surface_height_m,
  elevation_decline_rate,    (0-1 normalised, fed into risk model)
  sediment_deposition_rate,  (0-1 normalised)
  vegetation_health,         (0-1 normalised)
  water_surface_variability, (0-1 normalised)
  deltax_trend,              (growing / sinking / stable / unknown)
  datasets_used,             (pipe-separated list of which datasets contributed)
  in_deltax_coverage,        (yes / no)
  deltax_coverage_tier

Citation
────────
  Delta-X project: https://deltax.jpl.nasa.gov
  ORNL DAAC archive: https://daac.ornl.gov/
"""
from __future__ import annotations

import argparse
import csv
import math
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "deltax"

# ── Delta-X study-area bounding box ─────────────────────────────────────────
DELTAX_LAT_MIN = 29.06
DELTAX_LAT_MAX = 29.81
DELTAX_LON_MIN = -91.59
DELTAX_LON_MAX = -90.18

# ── Normalisation ranges (from peer-reviewed Delta-X literature) ─────────────
# RTK elevation NAVD88: -0.6 m (subsiding marsh) to +1.8 m (natural levee)
ELEV_MIN, ELEV_MAX = -0.6, 1.8
# Feldspar sediment accretion: 0 to 30 mm/yr across both basins
SED_MIN, SED_MAX = 0.0, 30.0
# Aboveground biomass: 0 to 3 000 g/m² for Gulf Coast marshes
BIO_MIN, BIO_MAX = 0.0, 3000.0
# AirSWOT water surface height (above local datum): 0 to 2 m
WATER_MIN, WATER_MAX = 0.0, 2.0

# Max search radius: nearest station within 15 km counts; beyond = no match
MAX_DIST_KM = 15.0


# ── Helpers ──────────────────────────────────────────────────────────────────

def in_deltax_bbox(lat: float, lon: float) -> bool:
    return DELTAX_LAT_MIN <= lat <= DELTAX_LAT_MAX and DELTAX_LON_MIN <= lon <= DELTAX_LON_MAX


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def normalise(val: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 0.0
    return clamp01((val - lo) / (hi - lo))


def nearest_station(
    colony_lat: float, colony_lon: float,
    stations: List[Dict[str, Any]],
    lat_key: str, lon_key: str, max_km: float = MAX_DIST_KM
) -> Tuple[Optional[Dict[str, Any]], float]:
    """Return (nearest station dict, distance_km) or (None, inf)."""
    best, best_d = None, float("inf")
    for s in stations:
        try:
            slat, slon = float(s[lat_key]), float(s[lon_key])
        except (KeyError, ValueError, TypeError):
            continue
        d = haversine_km(colony_lat, colony_lon, slat, slon)
        if d < best_d:
            best_d, best = d, s
    if best_d <= max_km:
        return best, round(best_d, 3)
    return None, best_d


# ── CSV loaders with flexible column detection ────────────────────────────────

def _find_col(headers: List[str], candidates: List[str]) -> Optional[str]:
    """Case-insensitive header search."""
    hl = [h.lower().strip() for h in headers]
    for c in candidates:
        cl = c.lower()
        for i, h in enumerate(hl):
            if cl == h or cl in h:
                return headers[i]
    return None


def load_csv(path: Path) -> Optional[List[Dict[str, str]]]:
    if not path.exists():
        return None
    # Try comma, then tab
    for delim in (",", "\t"):
        try:
            rows = []
            with open(path, newline="", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f, delimiter=delim)
                rows = [r for r in reader if any(v.strip() for v in r.values())]
            if len(rows) > 0 and len(rows[0]) > 2:
                return rows
        except Exception:
            continue
    return None


def load_rtk_elevation(path: Path) -> Optional[List[Dict[str, Any]]]:
    """
    Dataset 1: RTK GPS elevation at wetland sites.
    doi:10.3334/ORNLDAAC/2071
    Expected columns (flexible): latitude/longitude, elevation/elev_m/elev_m_navd88
    """
    rows = load_csv(path)
    if not rows:
        return None
    hdrs = list(rows[0].keys())
    lat_col = _find_col(hdrs, ["latitude", "lat", "lat_dd", "y"])
    lon_col = _find_col(hdrs, ["longitude", "lon", "long", "lon_dd", "x"])
    elev_col = _find_col(hdrs, ["elevation_m_navd88", "elev_m_navd88", "elevation_m",
                                 "elev_m", "elevation", "elev", "navd88"])
    if not lat_col or not lon_col or not elev_col:
        print(f"  [RTK] Could not identify lat/lon/elevation columns. Found: {hdrs[:10]}")
        return None
    out = []
    for r in rows:
        try:
            out.append({
                "lat": float(r[lat_col]),
                "lon": float(r[lon_col]),
                "elevation_m_navd88": float(r[elev_col]),
                "_raw": r,
            })
        except (ValueError, TypeError):
            continue
    print(f"  [RTK] Loaded {len(out)} elevation measurements from {path.name}")
    return out or None


def load_sediment_accretion(path: Path) -> Optional[List[Dict[str, Any]]]:
    """
    Dataset 2: Feldspar sediment accretion rates.
    doi:10.3334/ORNLDAAC/2381
    Expected columns: latitude/longitude, accretion rate in mm/yr (many possible names)
    """
    rows = load_csv(path)
    if not rows:
        return None
    hdrs = list(rows[0].keys())
    lat_col = _find_col(hdrs, ["latitude", "lat", "lat_dd", "y"])
    lon_col = _find_col(hdrs, ["longitude", "lon", "long", "lon_dd", "x"])
    acc_col = _find_col(hdrs, [
        "accretion_mm_yr", "accretion_rate_mm_yr", "accretion_mm_year",
        "accretion_rate", "accretion", "sed_accretion_mm", "sed_mm_yr",
        "vertical_accretion", "vert_accretion", "rate_mm",
    ])
    if not lat_col or not lon_col or not acc_col:
        print(f"  [Sediment] Could not identify required columns. Found: {hdrs[:10]}")
        return None
    out = []
    for r in rows:
        try:
            val = float(r[acc_col])
            if val < 0:      # negative accretion = erosion; treat as 0 for normalisation
                val = 0.0
            out.append({
                "lat": float(r[lat_col]),
                "lon": float(r[lon_col]),
                "sediment_accretion_mm_year": val,
                "_raw": r,
            })
        except (ValueError, TypeError):
            continue
    print(f"  [Sediment] Loaded {len(out)} accretion measurements from {path.name}")
    return out or None


def load_biomass(path: Path) -> Optional[List[Dict[str, Any]]]:
    """
    Dataset 3: Aboveground biomass / necromass.
    doi:10.3334/ORNLDAAC/2237
    Expected columns: latitude/longitude, biomass value in g/m² (many possible names)
    Prefers total_agb or ag_biomass; falls back to carbon × conversion factor.
    """
    rows = load_csv(path)
    if not rows:
        return None
    hdrs = list(rows[0].keys())
    lat_col = _find_col(hdrs, ["latitude", "lat", "lat_dd", "y"])
    lon_col = _find_col(hdrs, ["longitude", "lon", "long", "lon_dd", "x"])
    # Try progressively broader names
    bio_col = _find_col(hdrs, [
        "agb_g_m2", "biomass_g_m2", "aboveground_biomass_g_m2",
        "total_agb", "ag_biomass", "agb", "biomass", "aboveground_biomass",
        "live_biomass", "above_biomass",
    ])
    # Fallback: carbon column (carbon ≈ biomass × 0.45 for wetland plants)
    carbon_col = None
    if not bio_col:
        carbon_col = _find_col(hdrs, ["carbon", "agb_c", "biomass_c", "c_g_m2"])
    if not lat_col or not lon_col or (not bio_col and not carbon_col):
        print(f"  [Biomass] Could not identify required columns. Found: {hdrs[:10]}")
        return None
    out = []
    for r in rows:
        try:
            if bio_col:
                val = float(r[bio_col])
            else:
                val = float(r[carbon_col]) / 0.45  # carbon → biomass conversion
            if val < 0:
                val = 0.0
            out.append({
                "lat": float(r[lat_col]),
                "lon": float(r[lon_col]),
                "biomass_g_m2": val,
                "_raw": r,
            })
        except (ValueError, TypeError):
            continue
    print(f"  [Biomass] Loaded {len(out)} biomass measurements from {path.name}")
    return out or None


def sample_airswot_raster(tif_path: Path, lat: float, lon: float) -> Optional[float]:
    """
    Dataset 4: AirSWOT water surface height raster.
    doi:10.3334/ORNLDAAC/2128
    Returns water surface height in metres, or None if no data.
    """
    try:
        import rasterio  # type: ignore
        from rasterio.transform import rowcol  # type: ignore
        with rasterio.open(tif_path) as src:
            row, col = rowcol(src.transform, lon, lat)
            if row < 0 or col < 0 or row >= src.height or col >= src.width:
                return None
            window = rasterio.windows.Window(col, row, 1, 1)
            val = float(src.read(1, window=window)[0][0])
            nodata = src.nodata
            if nodata is not None and abs(val - nodata) < 1e-4:
                return None
            return val if not math.isnan(val) else None
    except Exception:
        return None


# ── File discovery ────────────────────────────────────────────────────────────

def _find_file(data_dir: Path, patterns: List[str], cli_path: Optional[str]) -> Optional[Path]:
    """Return explicit CLI path if given, else search data_dir by pattern."""
    if cli_path:
        p = Path(cli_path)
        if p.exists():
            return p
        print(f"  File not found: {cli_path}")
        return None
    for pat in patterns:
        matches = list(data_dir.glob(pat))
        if matches:
            return sorted(matches)[0]
    return None


# ── Colony loader ─────────────────────────────────────────────────────────────

def load_colony_sites() -> List[Dict[str, Any]]:
    sys.path.insert(0, str(PROJECT_ROOT / "server"))
    try:
        from app.data.colony_data import COLONY_RECORDS  # type: ignore
        seen: Dict[str, Dict] = {}
        for r in COLONY_RECORDS:
            cid = r["colony_id"]
            if cid not in seen:
                seen[cid] = {"colony_id": cid, "latitude": r["latitude"], "longitude": r["longitude"]}
        sites = list(seen.values())
        print(f"Loaded {len(sites)} unique colony sites from app data layer")
        return sites
    except Exception as e:
        print(f"Warning: could not import from app.data.colony_data: {e}")
        return []


# ── Trend classification from real measurements ───────────────────────────────

def classify_trend(
    elevation_m: Optional[float],
    sediment_mm_yr: Optional[float],
    biomass_g_m2: Optional[float],
) -> str:
    """
    Growing:  elevation ≥ 0.3 m AND sediment ≥ 5 mm/yr
    Sinking:  elevation < 0.0 m  OR sediment < 2 mm/yr (when both present)
    Stable:   in between
    """
    has_elev = elevation_m is not None
    has_sed  = sediment_mm_yr is not None
    if has_elev and has_sed:
        if elevation_m >= 0.3 and sediment_mm_yr >= 5.0:
            return "growing"
        if elevation_m < 0.0 or sediment_mm_yr < 2.0:
            return "sinking"
        return "stable"
    if has_elev:
        if elevation_m >= 0.5:
            return "growing"
        if elevation_m < 0.0:
            return "sinking"
    if has_sed:
        if sediment_mm_yr >= 8.0:
            return "growing"
        if sediment_mm_yr < 2.0:
            return "sinking"
    return "unknown"


# ── Main ──────────────────────────────────────────────────────────────────────

def run(args: argparse.Namespace) -> None:
    data_dir = Path(args.data_dir)

    print("\n── Loading colony sites ──")
    sites = load_colony_sites()
    if not sites:
        print("ERROR: No colony sites found.")
        sys.exit(1)

    print("\n── Discovering dataset files ──")
    rtk_file = _find_file(data_dir, ["*elevation*.csv", "*rtk*.csv", "*RTK*.csv"], args.rtk)
    sed_file = _find_file(data_dir, ["*sediment*.csv", "*feldspar*.csv", "*accretion*.csv"], args.sediment)
    bio_file = _find_file(data_dir, ["*biomass*.csv", "*necromass*.csv", "*AGB*.csv"], args.biomass)
    swot_file = _find_file(data_dir, ["*water*.tif", "*swot*.tif", "*AirSWOT*.tif", "*airswot*.tif"], args.airswot)

    print(f"  RTK elevation : {rtk_file or '(not found)'}")
    print(f"  Sediment      : {sed_file  or '(not found)'}")
    print(f"  Biomass       : {bio_file  or '(not found)'}")
    print(f"  AirSWOT raster: {swot_file or '(not found)'}")

    if not any([rtk_file, sed_file, bio_file, swot_file]):
        print("\n❌  No dataset files found in", data_dir)
        print("    Download from ORNL DAAC (see script header) and place in data/deltax/")
        print("    Then run:  python scripts/sample_deltax_all.py")
        sys.exit(1)

    if swot_file:
        try:
            import rasterio  # type: ignore
        except ImportError:
            print("  rasterio not installed — AirSWOT raster will be skipped.")
            print("  Install: pip install rasterio")
            swot_file = None

    print("\n── Loading measurement datasets ──")
    rtk_stations  = load_rtk_elevation(rtk_file)  if rtk_file  else None
    sed_stations  = load_sediment_accretion(sed_file) if sed_file else None
    bio_stations  = load_biomass(bio_file)         if bio_file  else None

    print("\n── Processing colonies ──")
    rows_out: List[Dict[str, Any]] = []
    n_inside = 0
    counters = {"rtk": 0, "sed": 0, "bio": 0, "swot": 0}

    for site in sites:
        cid = site["colony_id"]
        lat = site["latitude"]
        lon = site["longitude"]
        inside = in_deltax_bbox(lat, lon)
        tier = "Delta-X (high precision)" if inside else "outside Delta-X coverage — using NOAA fallback"

        if not inside:
            rows_out.append(_outside_row(cid, lat, lon, tier))
            continue

        n_inside += 1
        datasets_used = []

        # ── Dataset 1: RTK elevation ──────────────────────────────────────────
        elev_m: Optional[float] = None
        elev_dist: Optional[float] = None
        if rtk_stations:
            st, dist = nearest_station(lat, lon, rtk_stations, "lat", "lon")
            if st:
                elev_m = st["elevation_m_navd88"]
                elev_dist = dist
                counters["rtk"] += 1
                datasets_used.append("RTK-elev(doi:2071)")

        # ── Dataset 2: Sediment accretion ────────────────────────────────────
        sed_mm: Optional[float] = None
        sed_dist: Optional[float] = None
        if sed_stations:
            st, dist = nearest_station(lat, lon, sed_stations, "lat", "lon")
            if st:
                sed_mm = st["sediment_accretion_mm_year"]
                sed_dist = dist
                counters["sed"] += 1
                datasets_used.append("sediment(doi:2381)")

        # ── Dataset 3: Biomass ───────────────────────────────────────────────
        bio: Optional[float] = None
        bio_dist: Optional[float] = None
        if bio_stations:
            st, dist = nearest_station(lat, lon, bio_stations, "lat", "lon")
            if st:
                bio = st["biomass_g_m2"]
                bio_dist = dist
                counters["bio"] += 1
                datasets_used.append("biomass(doi:2237)")

        # ── Dataset 4: AirSWOT raster ────────────────────────────────────────
        water_h: Optional[float] = None
        if swot_file:
            water_h = sample_airswot_raster(swot_file, lat, lon)
            if water_h is not None:
                counters["swot"] += 1
                datasets_used.append("AirSWOT(doi:2128)")

        # ── Compute normalised proxies ────────────────────────────────────────
        # elevation_decline_rate: LOW elevation = HIGH decline risk (inverse)
        elev_decline = round(1.0 - normalise(elev_m, ELEV_MIN, ELEV_MAX), 4) if elev_m is not None else None
        # sediment_deposition_rate: HIGH accretion = good (direct)
        sed_dep = round(normalise(sed_mm, SED_MIN, SED_MAX), 4) if sed_mm is not None else None
        # vegetation_health: HIGH biomass = healthy (direct)
        veg_health = round(normalise(bio, BIO_MIN, BIO_MAX), 4) if bio is not None else None
        # water_surface_variability: HIGH water = inundation risk (direct)
        water_var = round(normalise(water_h, WATER_MIN, WATER_MAX), 4) if water_h is not None else None

        trend = classify_trend(elev_m, sed_mm, bio)

        rows_out.append({
            "colony_id": cid,
            "latitude": lat,
            "longitude": lon,
            "elevation_m_navd88": _fmt(elev_m),
            "elevation_source_dist_km": _fmt(elev_dist),
            "sediment_accretion_mm_year": _fmt(sed_mm),
            "sediment_source_dist_km": _fmt(sed_dist),
            "biomass_g_m2": _fmt(bio),
            "biomass_source_dist_km": _fmt(bio_dist),
            "water_surface_height_m": _fmt(water_h),
            "elevation_decline_rate": _fmt(elev_decline),
            "sediment_deposition_rate": _fmt(sed_dep),
            "vegetation_health": _fmt(veg_health),
            "water_surface_variability": _fmt(water_var),
            "deltax_trend": trend,
            "datasets_used": "|".join(datasets_used) if datasets_used else "",
            "in_deltax_coverage": "yes",
            "deltax_coverage_tier": tier,
        })

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if rows_out:
        with open(out_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows_out[0].keys()))
            writer.writeheader()
            writer.writerows(rows_out)

    print(f"\n✅  Done.")
    print(f"   Total colonies              : {len(sites)}")
    print(f"   Inside Delta-X bbox         : {n_inside}")
    print(f"   Outside (NOAA fallback)     : {len(sites) - n_inside}")
    print(f"   RTK elevation matched       : {counters['rtk']}")
    print(f"   Sediment accretion matched  : {counters['sed']}")
    print(f"   Biomass matched             : {counters['bio']}")
    print(f"   AirSWOT water matched       : {counters['swot']}")
    print(f"   Output                      : {out_path}")
    print("\nNext: restart the backend — it will load this CSV automatically.\n")


def _fmt(v: Any) -> str:
    return str(v) if v is not None else ""


def _outside_row(cid: str, lat: float, lon: float, tier: str) -> Dict[str, Any]:
    return {
        "colony_id": cid, "latitude": lat, "longitude": lon,
        "elevation_m_navd88": "", "elevation_source_dist_km": "",
        "sediment_accretion_mm_year": "", "sediment_source_dist_km": "",
        "biomass_g_m2": "", "biomass_source_dist_km": "",
        "water_surface_height_m": "",
        "elevation_decline_rate": "", "sediment_deposition_rate": "",
        "vegetation_health": "", "water_surface_variability": "",
        "deltax_trend": "outside_deltax",
        "datasets_used": "",
        "in_deltax_coverage": "no",
        "deltax_coverage_tier": tier,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Spatial-join four NASA Delta-X datasets to colony sites."
    )
    parser.add_argument("--data-dir", default=str(DATA_DIR),
                        help="Directory containing Delta-X data files")
    parser.add_argument("--rtk",      default=None, help="Path to RTK elevation CSV (doi:2071)")
    parser.add_argument("--sediment", default=None, help="Path to feldspar sediment CSV (doi:2381)")
    parser.add_argument("--biomass",  default=None, help="Path to aboveground biomass CSV (doi:2237)")
    parser.add_argument("--airswot",  default=None, help="Path to AirSWOT water-height GeoTIFF (doi:2128)")
    parser.add_argument("--output",
                        default=str(DATA_DIR / "deltax_colony_measurements.csv"),
                        help="Output CSV path")
    parser.add_argument("--max-dist-km", type=float, default=MAX_DIST_KM,
                        help="Max distance (km) for nearest-station match (default 15)")
    args = parser.parse_args()
    MAX_DIST_KM = args.max_dist_km
    run(args)
