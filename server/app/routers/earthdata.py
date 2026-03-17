"""
NASA Earthdata router for Project Pelican.
Provides NDVI analysis, surface-water extent, SAR granule search, and
vegetation-health scores derived from NASA GIBS / CMR — all unauthenticated.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

router = APIRouter()

# ── /ndvi ─────────────────────────────────────────────────────────────────────

@router.get("/ndvi")
def get_ndvi(
    date: str = Query(
        ...,
        description="Month to analyse, format YYYY-MM (e.g. 2024-07). "
                    "MODIS Terra composites are available from 2000 onwards.",
        pattern=r"^\d{4}-\d{2}$",
    ),
):
    """
    Fetch MODIS Terra true-color tiles for each colony location and compute
    a visible vegetation index (NDVI proxy) + vegetation health score (0–1).

    Also returns a base64-encoded PNG overview tile of the Gulf Coast NDVI
    colorization layer for display in the frontend map legend.
    """
    try:
        from app.data.colony_data import COLONY_RECORDS
        from app.services.risk_model import compute_risk_metrics
        from app.services.earthdata import (
            fetch_ndvi_for_colonies, fetch_region_tile_b64,
            NDVI_LAYER, gibs_wmts_url,
        )
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Service unavailable: {exc!s}")

    try:
        scores = compute_risk_metrics(list(COLONY_RECORDS))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Colony data error: {exc!s}")

    # Build compact colony list for tile fetching
    colonies = [
        {"colony_id": s["colony_id"], "latitude": s["latitude"], "longitude": s["longitude"]}
        for s in scores
    ]

    try:
        colony_ndvi = fetch_ndvi_for_colonies(colonies, date)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"NDVI fetch error: {exc!s}")

    # Region overview tile (colorized NDVI layer from GIBS)
    try:
        overview_b64 = fetch_region_tile_b64(NDVI_LAYER, date)
    except Exception:
        overview_b64 = None

    available = sum(1 for c in colony_ndvi if c["imagery_available"])
    return {
        "date": date,
        "colony_ndvi": colony_ndvi,
        "total_colonies": len(colony_ndvi),
        "imagery_available_count": available,
        "overview_tile_b64": overview_b64,
        "leaflet_tile_url": gibs_wmts_url(NDVI_LAYER, date),
        "source": "NASA GIBS / MODIS Terra True Color (WMS)",
        "note": (
            "NDVI values are derived from the visible vegetation index (G-R)/(G+R+1) "
            "computed from MODIS true-color reflectance. Actual band-ratio NDVI "
            "requires Earthdata credentials for raw granule access."
        ),
    }


# ── /surface-water ────────────────────────────────────────────────────────────

@router.get("/surface-water")
def get_surface_water(
    date: str = Query(
        ...,
        description="Month to analyse, format YYYY-MM.",
        pattern=r"^\d{4}-\d{2}$",
    ),
):
    """
    Estimate surface water extent per colony from MODIS Terra true-color tiles.
    Water pixels are identified by low luminance or strong blue dominance.
    Returns per-colony water_extent_pct (0–100) and a base64 EVI overview tile.
    """
    try:
        from app.data.colony_data import COLONY_RECORDS
        from app.services.risk_model import compute_risk_metrics
        from app.services.earthdata import (
            fetch_ndvi_for_colonies, fetch_region_tile_b64,
            EVI_LAYER, gibs_wmts_url,
        )
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Service unavailable: {exc!s}")

    try:
        scores = compute_risk_metrics(list(COLONY_RECORDS))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Colony data error: {exc!s}")

    colonies = [
        {"colony_id": s["colony_id"], "latitude": s["latitude"], "longitude": s["longitude"]}
        for s in scores
    ]

    # fetch_ndvi_for_colonies also returns water_extent_pct
    try:
        colony_data = fetch_ndvi_for_colonies(colonies, date)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Water extent fetch error: {exc!s}")

    water_data = [
        {
            "colony_id": c["colony_id"],
            "latitude": c["latitude"],
            "longitude": c["longitude"],
            "water_extent_pct": c["water_extent_pct"],
            "imagery_available": c["imagery_available"],
        }
        for c in colony_data
    ]

    # EVI overview tile: low EVI = water / flooded marsh
    try:
        overview_b64 = fetch_region_tile_b64(EVI_LAYER, date)
    except Exception:
        overview_b64 = None

    return {
        "date": date,
        "colony_water": water_data,
        "total_colonies": len(water_data),
        "overview_tile_b64": overview_b64,
        "leaflet_tile_url": gibs_wmts_url(EVI_LAYER, date),
        "source": "NASA GIBS / MODIS Terra EVI + true-color water detection",
    }


# ── /sar-search ───────────────────────────────────────────────────────────────

@router.get("/sar-search")
def sar_search(
    date_start: str = Query(
        "2020-01-01",
        description="Start date YYYY-MM-DD for granule temporal search.",
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    ),
    date_end: str = Query(
        "2025-01-01",
        description="End date YYYY-MM-DD for granule temporal search.",
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    ),
    page_size: int = Query(10, ge=1, le=20),
):
    """
    Search NASA CMR (Common Metadata Repository) for SAR granules over the
    Gulf Coast bounding box. Returns granule metadata — title, acquisition time,
    browse image URL, and CMR download link — without requiring authentication.
    Actual file downloads require a free NASA Earthdata Login account.
    """
    try:
        from app.services.earthdata import search_sar_granules
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Service unavailable: {exc!s}")

    try:
        granules = search_sar_granules(date_start, date_end, page_size=page_size)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"CMR search error: {exc!s}")

    return {
        "granules": granules,
        "total": len(granules),
        "date_start": date_start,
        "date_end": date_end,
        "search_bbox": {
            "min_lon": -93.5, "min_lat": 28.5,
            "max_lon": -88.5, "max_lat": 31.0,
        },
        "source": "NASA CMR API (unauthenticated search)",
        "note": (
            "Download links require a free NASA Earthdata Login account at "
            "https://urs.earthdata.nasa.gov/"
        ),
    }


# ── /vegetation-scores ────────────────────────────────────────────────────────

@router.get("/vegetation-scores")
def get_vegetation_scores(
    date: str = Query(
        ...,
        description="Month YYYY-MM to derive vegetation health scores from.",
        pattern=r"^\d{4}-\d{2}$",
    ),
):
    """
    Return a mapping of colony_id → vegetation_health (0–1) derived from
    MODIS NDVI proxy for the given month. These scores can be fed back into
    the habitat risk priority model via /api/analytics/risk?ndvi_date=YYYY-MM.
    """
    try:
        from app.data.colony_data import COLONY_RECORDS
        from app.services.risk_model import compute_risk_metrics
        from app.services.earthdata import fetch_ndvi_for_colonies
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"Service unavailable: {exc!s}")

    try:
        scores = compute_risk_metrics(list(COLONY_RECORDS))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Colony data error: {exc!s}")

    colonies = [
        {"colony_id": s["colony_id"], "latitude": s["latitude"], "longitude": s["longitude"]}
        for s in scores
    ]

    try:
        ndvi_data = fetch_ndvi_for_colonies(colonies, date)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"NDVI fetch error: {exc!s}")

    scores_map = {
        c["colony_id"]: c["vegetation_health"]
        for c in ndvi_data
        if c["imagery_available"] and c["vegetation_health"] is not None
    }

    return {
        "date": date,
        "vegetation_scores": scores_map,
        "covered_colonies": len(scores_map),
        "total_colonies": len(colonies),
    }
