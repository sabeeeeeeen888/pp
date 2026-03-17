"""
NASA Earthdata imagery analysis for Project Pelican.

Uses NASA GIBS (Global Imagery Browse Services) — free, no authentication required —
for MODIS Terra NDVI and EVI tiles. Uses the NASA CMR (Common Metadata Repository)
API — also free, no auth — for SAR granule metadata search.

NDVI is approximated from true-color MODIS reflectance tiles using the visible
vegetation index (G-R)/(G+R+1), which correlates strongly with actual NDVI over
Louisiana coastal wetlands. Full NDVI band-ratio calculations require raw
HDF/NetCDF granule downloads (Earthdata credentials required).
"""
import base64
import io
import json
import ssl
import urllib.parse
import urllib.request
from typing import Optional

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

from PIL import Image

# ── Geographic constants ──────────────────────────────────────────────────────
# Gulf Coast study area: Louisiana coast + Mississippi delta
GULF_COAST_BBOX = (-93.5, 28.5, -88.5, 31.0)   # (min_lon, min_lat, max_lon, max_lat)

# NASA GIBS WMS endpoints
GIBS_WMS_4326 = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
# GIBS WMTS tile template (Web Mercator, compatible with Leaflet's default CRS)
GIBS_WMTS_3857 = (
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best"
    "/{layer}/default/{date}/GoogleMapsCompatible/{z}/{y}/{x}.png"
)

# GIBS layer names used
NDVI_LAYER       = "MODIS_Terra_L3_NDVI_Monthly"
EVI_LAYER        = "MODIS_Terra_L3_EVI_Monthly"
TRUE_COLOR_LAYER = "MODIS_Terra_CorrectedReflectance_TrueColor"

# NASA CMR granule search endpoint
CMR_SEARCH = "https://cmr.earthdata.nasa.gov/search/granules.json"

# Per-colony tile: small bbox around each colony point
COLONY_TILE_W    = 64
COLONY_TILE_H    = 64
COLONY_BBOX_DEG  = 0.05   # ~5 km half-width at this latitude

# Region overview tile dimensions
REGION_TILE_W = 512
REGION_TILE_H = 256

# SSL context — bypasses macOS certificate chain issues common with NASA servers
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _fetch_url(url: str, timeout: int = 20) -> Optional[bytes]:
    """Fetch a URL and return raw bytes, or None on any failure."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ProjectPelican/1.0"})
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as resp:
            return resp.read()
    except Exception:
        return None


def _wms_colony_url(layer: str, lon: float, lat: float, date: str) -> str:
    """Build a GIBS WMS GetMap URL centred on a colony coordinate (EPSG:4326)."""
    bbox = (
        f"{lon - COLONY_BBOX_DEG},{lat - COLONY_BBOX_DEG},"
        f"{lon + COLONY_BBOX_DEG},{lat + COLONY_BBOX_DEG}"
    )
    params = {
        "SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.3.0",
        "LAYERS": layer, "CRS": "EPSG:4326", "BBOX": bbox,
        "WIDTH": COLONY_TILE_W, "HEIGHT": COLONY_TILE_H,
        "FORMAT": "image/png", "TRANSPARENT": "TRUE", "TIME": date,
    }
    return f"{GIBS_WMS_4326}?{urllib.parse.urlencode(params)}"


def _wms_region_url(layer: str, date: str) -> str:
    """Build a GIBS WMS GetMap URL for the full Gulf Coast region (EPSG:4326)."""
    min_lon, min_lat, max_lon, max_lat = GULF_COAST_BBOX
    bbox = f"{min_lon},{min_lat},{max_lon},{max_lat}"
    params = {
        "SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.3.0",
        "LAYERS": layer, "CRS": "EPSG:4326", "BBOX": bbox,
        "WIDTH": REGION_TILE_W, "HEIGHT": REGION_TILE_H,
        "FORMAT": "image/png", "TRANSPARENT": "TRUE", "TIME": date,
    }
    return f"{GIBS_WMS_4326}?{urllib.parse.urlencode(params)}"


# ── Pixel-level analysis ──────────────────────────────────────────────────────

def _analyse_tile(tile_bytes: bytes) -> Optional[dict]:
    """
    Decode a PNG tile and compute:
      - ndvi_mean: visible vegetation index (G-R)/(G+R+1), mean over valid pixels
      - water_pct: fraction of valid pixels classified as water (0-1)
      - valid_pixels: count of non-background pixels

    Returns None on decode error.
    """
    try:
        img = Image.open(io.BytesIO(tile_bytes)).convert("RGB")
    except Exception:
        return None

    w, h = img.size
    if HAS_NUMPY:
        arr = np.array(img, dtype=np.float32)
        r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
        # Background / no-data: near-black pixels (GIBS uses black fill)
        no_data = (r < 5) & (g < 5) & (b < 5)
        valid = ~no_data
        n_valid = int(valid.sum())
        if n_valid == 0:
            return {"ndvi_mean": 0.0, "water_pct": 0.0, "valid_pixels": 0}
        # Visible vegetation index proxy
        ndvi_arr = (g - r) / (g + r + 1.0)
        ndvi_mean = float(ndvi_arr[valid].mean())
        # Water: dark overall or strongly blue-dominant and dim
        brightness = (r + g + b) / 3.0
        water_mask = no_data | (
            (brightness < 40) |
            ((b > r * 1.3) & (b > g * 1.1) & (brightness < 90))
        )
        water_pct = float(water_mask[valid].sum()) / n_valid
    else:
        px = img.load()
        ndvi_vals, water_count, n_valid = [], 0, 0
        for x in range(w):
            for y in range(h):
                rv, gv, bv = px[x, y]
                if rv < 5 and gv < 5 and bv < 5:
                    continue
                n_valid += 1
                ndvi_vals.append((gv - rv) / (gv + rv + 1.0))
                br = (rv + gv + bv) / 3.0
                if br < 40 or (bv > rv * 1.3 and bv > gv * 1.1 and br < 90):
                    water_count += 1
        if n_valid == 0:
            return {"ndvi_mean": 0.0, "water_pct": 0.0, "valid_pixels": 0}
        ndvi_mean = sum(ndvi_vals) / len(ndvi_vals)
        water_pct = water_count / n_valid

    return {
        "ndvi_mean": round(float(ndvi_mean), 4),
        "water_pct": round(float(water_pct), 4),
        "valid_pixels": n_valid,
    }


def ndvi_to_health_score(ndvi: float) -> float:
    """
    Map visible NDVI proxy (-1..+1) to a vegetation health score (0..1).

    Calibration for Louisiana coastal marshes:
      ndvi <= -0.10 → 0.0  (open water, bare sediment, or heavily stressed)
      ndvi >= 0.40  → 1.0  (dense healthy Spartina / mangrove / emergent marsh)
      Linear between -0.10 and 0.40.
    """
    if ndvi <= -0.10:
        return 0.0
    if ndvi >= 0.40:
        return 1.0
    return round((ndvi + 0.10) / 0.50, 4)


# ── Public API ────────────────────────────────────────────────────────────────

def fetch_ndvi_for_colonies(colonies: list, date_ym: str) -> list:
    """
    For each colony dict {colony_id, latitude, longitude}, fetch a MODIS
    true-color tile from GIBS and derive NDVI proxy + vegetation health score.

    Args:
        colonies: list of dicts with colony_id, latitude, longitude
        date_ym:  "YYYY-MM" (the composite month to use, e.g. "2024-07")

    Returns list of dicts:
        colony_id, latitude, longitude, ndvi_mean, vegetation_health,
        water_extent_pct, imagery_available
    """
    date_str = date_ym + "-01"
    results = []
    for col in colonies:
        lat = col["latitude"]
        lon = col["longitude"]
        cid = col["colony_id"]
        url = _wms_colony_url(TRUE_COLOR_LAYER, lon, lat, date_str)
        tile_bytes = _fetch_url(url)
        if tile_bytes is None:
            results.append({
                "colony_id": cid, "latitude": lat, "longitude": lon,
                "ndvi_mean": None, "vegetation_health": None,
                "water_extent_pct": None, "imagery_available": False,
            })
            continue
        stats = _analyse_tile(tile_bytes)
        if stats is None or stats["valid_pixels"] == 0:
            results.append({
                "colony_id": cid, "latitude": lat, "longitude": lon,
                "ndvi_mean": None, "vegetation_health": None,
                "water_extent_pct": None, "imagery_available": False,
            })
            continue
        ndvi = stats["ndvi_mean"]
        results.append({
            "colony_id": cid,
            "latitude": lat,
            "longitude": lon,
            "ndvi_mean": round(ndvi, 4),
            "vegetation_health": ndvi_to_health_score(ndvi),
            "water_extent_pct": round(stats["water_pct"] * 100, 2),
            "imagery_available": True,
        })
    return results


def fetch_region_tile_b64(layer: str, date_ym: str) -> Optional[str]:
    """
    Fetch a region-overview tile for the Gulf Coast and return as base64 PNG string.
    Used to embed the overview image in API responses.
    """
    date_str = date_ym + "-01"
    url = _wms_region_url(layer, date_str)
    raw = _fetch_url(url)
    if raw is None:
        return None
    return base64.b64encode(raw).decode()


def gibs_wmts_url(layer: str, date_ym: str) -> str:
    """
    Return the GIBS WMTS tile URL template for a given layer and month.
    The {z}/{y}/{x} placeholders are left for Leaflet TileLayer to fill.
    Compatible with Leaflet's default EPSG:3857 (Web Mercator) CRS.
    """
    date_str = date_ym + "-01"
    return GIBS_WMTS_3857.format(layer=layer, date=date_str, z="{z}", y="{y}", x="{x}")


def search_sar_granules(
    date_start: str,
    date_end: str,
    bbox: Optional[tuple] = None,
    page_size: int = 20,
) -> list:
    """
    Search NASA CMR API for SAR granules over the Gulf Coast study area.
    No authentication required for search — only metadata and browse links
    are returned. Actual file downloads require Earthdata Login credentials.

    Args:
        date_start: ISO date string "YYYY-MM-DD"
        date_end:   ISO date string "YYYY-MM-DD"
        bbox:       (min_lon, min_lat, max_lon, max_lat); defaults to Gulf Coast bbox
        page_size:  max granules per dataset (capped at 20)

    Returns list of granule dicts with title, dataset, time_start, time_end,
    browse_url, download_url, cloud_cover, spatial_extent.
    """
    if bbox is None:
        bbox = GULF_COAST_BBOX
    min_lon, min_lat, max_lon, max_lat = bbox
    bbox_str = f"{min_lon},{min_lat},{max_lon},{max_lat}"
    temporal_str = f"{date_start}T00:00:00Z,{date_end}T23:59:59Z"

    # SAR datasets available through NASA Earthdata CMR
    datasets = [
        {"short_name": "UAVSAR_RSLC",          "label": "UAVSAR Range-Doppler SLC (NASA JPL)"},
        {"short_name": "UAVSAR_STOKES",         "label": "UAVSAR Stokes (NASA JPL)"},
        {"short_name": "UAVSAR_NISAR_SIM_RSLC", "label": "UAVSAR NISAR Simulated SLC"},
        {"short_name": "SMAP_L1C_S0_HALForbit", "label": "SMAP L1C S0 (active microwave, NASA)"},
    ]

    all_granules = []
    for ds in datasets:
        params = {
            "short_name": ds["short_name"],
            "bounding_box": bbox_str,
            "temporal[]": temporal_str,
            "page_size": str(min(page_size, 20)),
        }
        url = f"{CMR_SEARCH}?{urllib.parse.urlencode(params)}"
        raw = _fetch_url(url)
        if raw is None:
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue
        entries = data.get("feed", {}).get("entry", [])
        for e in entries:
            links = e.get("links", [])
            browse_url = next(
                (lk["href"] for lk in links
                 if "browse#" in lk.get("rel", "") or lk.get("type", "").startswith("image/")),
                None,
            )
            download_url = next(
                (lk["href"] for lk in links
                 if "data#" in lk.get("rel", "")),
                None,
            )
            all_granules.append({
                "title":          e.get("title", ""),
                "dataset":        ds["label"],
                "time_start":     e.get("time_start", ""),
                "time_end":       e.get("time_end", ""),
                "browse_url":     browse_url,
                "download_url":   download_url,
                "cloud_cover":    e.get("cloud_cover"),
                "spatial_extent": e.get("boxes") or e.get("polygons") or [],
            })

    return all_granules
