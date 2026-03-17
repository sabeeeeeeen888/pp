from fastapi import APIRouter, Query, Body, HTTPException
from typing import List, Optional, Tuple
from app.data.colony_data import COLONY_RECORDS
from app.services.risk_model import compute_risk_metrics

router = APIRouter()


def _filter_records(year: Optional[int], species: Optional[str]):
    records = list(COLONY_RECORDS)
    if year is not None:
        records = [r for r in records if r["year"] == year]
    if species:
        records = [r for r in records if r["species"] == species]
    return records


@router.get("/risk")
def get_risk_scores(
    year: Optional[int] = Query(None, ge=2010, le=2021),
    species: Optional[str] = Query(None),
    ndvi_date: Optional[str] = Query(
        None,
        description=(
            "Optional YYYY-MM month. When supplied, MODIS NDVI-derived vegetation "
            "health scores from NASA GIBS are fetched and injected into the risk "
            "model, overriding the Delta-X vegetation_health proxy. "
            "Adds ~1-2 s per request due to tile fetching."
        ),
        pattern=r"^\d{4}-\d{2}$",
    ),
) -> List[dict]:
    """
    Habitat risk scores per colony: species richness, decline rate,
    population variability, and risk category (Low/Moderate/High).

    Pass ndvi_date=YYYY-MM to enhance scores with current MODIS satellite data.
    """
    records = _filter_records(year, species)

    ndvi_overrides: Optional[dict] = None
    if ndvi_date:
        try:
            from app.services.earthdata import fetch_ndvi_for_colonies, ndvi_to_health_score
            # Build minimal colony list from unfiltered records for NDVI fetching
            all_scores_raw = compute_risk_metrics(list(COLONY_RECORDS))
            colony_list = [
                {"colony_id": s["colony_id"], "latitude": s["latitude"], "longitude": s["longitude"]}
                for s in all_scores_raw
            ]
            ndvi_rows = fetch_ndvi_for_colonies(colony_list, ndvi_date)
            ndvi_overrides = {
                r["colony_id"]: r["vegetation_health"]
                for r in ndvi_rows
                if r["imagery_available"] and r["vegetation_health"] is not None
            }
        except Exception:
            # NDVI enrichment is optional — fall back silently to base scoring
            ndvi_overrides = None

    return compute_risk_metrics(records, ndvi_overrides=ndvi_overrides)


@router.get("/species-richness")
def species_richness(
    year: Optional[int] = Query(None, ge=2010, le=2021),
) -> List[dict]:
    """Species richness (unique species per colony) for biodiversity hotspots."""
    records = _filter_records(year, None)
    return compute_risk_metrics(records)


@router.get("/trends")
def colony_trends(
    year: Optional[int] = Query(None, ge=2010, le=2021),
    species: Optional[str] = Query(None),
) -> List[dict]:
    """Colony trend analysis: decline rate = Initial Count - Final Count."""
    records = _filter_records(year, species)
    return compute_risk_metrics(records)


# Zone split fallback (only used if risk_model didn't already populate deltax_trend)
LON_BOUNDARY = -91.2


def _in_sinking_zone(score: dict) -> bool:
    """
    Use the deltax_trend field if the risk model populated it (from real NASA CSV or
    zone GeoJSON), otherwise fall back to the longitude boundary rule.
    """
    trend = score.get("deltax_trend")
    if trend == "sinking":
        return True
    if trend == "growing":
        return False
    # Legacy / synthetic fallback
    try:
        from app.data.deltax_data import LON_BOUNDARY_FALLBACK
        lon = score.get("longitude")
        return lon is not None and lon >= LON_BOUNDARY_FALLBACK
    except Exception:
        lon = score.get("longitude")
        return lon is not None and lon >= LON_BOUNDARY


@router.get("/deltax-summary")
def deltax_summary() -> dict:
    """
    Summary for judges: colonies in sinking vs growing zones, and top 5 priority colonies
    to protect (highest risk + habitat vulnerability, optionally in sinking zone).
    Uses real Delta-X zones from data/deltax/ when available.
    """
    scores = compute_risk_metrics(list(COLONY_RECORDS))
    in_sinking = sum(1 for s in scores if _in_sinking_zone(s))
    in_growing = sum(1 for s in scores if s.get("longitude") is not None and not _in_sinking_zone(s))

    # Check whether real NASA data is loaded
    try:
        from app.data.deltax_data import real_data_loaded as _rdl, real_data_source_label
        real_data_loaded = _rdl()
        data_source = real_data_source_label()
    except Exception:
        real_data_loaded = False
        data_source = "Synthetic longitude-based proxy"

    with_dx = [s for s in scores if s.get("habitat_vulnerability") is not None]
    top5 = sorted(with_dx, key=lambda s: (s["habitat_risk_score"], (s.get("habitat_vulnerability") or 0)), reverse=True)[:5]
    return {
        "colonies_in_sinking_zone": in_sinking,
        "colonies_in_growing_zone": in_growing,
        "total_colonies": len(scores),
        "real_deltax_data_loaded": real_data_loaded,
        "data_source": "NASA Delta-X doi:10.3334/ORNLDAAC/2307" if real_data_loaded else "Synthetic longitude-based proxy (run scripts/sample_deltax_subsidence.py to upgrade)",
        "top_5_priority": [
            {
                "colony_id": s["colony_id"],
                "risk_category": s["risk_category"],
                "habitat_risk_score": round(s["habitat_risk_score"], 3),
                "habitat_vulnerability": round(s["habitat_vulnerability"], 2) if s.get("habitat_vulnerability") is not None else None,
                "in_sinking_zone": _in_sinking_zone(s),
                # Raw NASA measurements
                "elevation_m_navd88": s.get("elevation_m_navd88"),
                "sediment_accretion_mm_year": s.get("sediment_accretion_mm_year"),
                "biomass_g_m2": s.get("biomass_g_m2"),
                "water_surface_height_m": s.get("water_surface_height_m"),
                "subsidence_rate_mm_year": s.get("subsidence_rate_mm_year"),
                "vegetation_health": s.get("vegetation_health"),
                "datasets_used": s.get("datasets_used", ""),
                "deltax_coverage_tier": s.get("deltax_coverage_tier", "outside Delta-X coverage — using NOAA fallback"),
            }
            for s in top5
        ],
    }


# Early-warning: precursor thresholds (proxy data; tune with real Delta-X/imagery)
THRESHOLD_ELEVATION_DECLINE = 0.5   # above = elevation loss signal
THRESHOLD_SEDIMENT_LOW = 0.4        # below = sediment starvation
THRESHOLD_WATER_VARIABILITY = 0.4   # above = water pooling signal
THRESHOLD_DECLINE_NESTS = 30        # nest loss above = colony decline signal


def _early_warning_signals(row: dict) -> Tuple[List[str], float]:
    """Return (list of triggered signal names, collapse_risk_score 0-1)."""
    signals = []
    elev = row.get("elevation_decline_rate")
    if elev is not None and elev >= THRESHOLD_ELEVATION_DECLINE:
        signals.append("elevation_loss")
    sed = row.get("sediment_deposition_rate")
    if sed is not None and sed <= THRESHOLD_SEDIMENT_LOW:
        signals.append("sediment_starvation")
    # Shoreline stress: prefer deltax_trend from real data, else lon boundary
    trend = row.get("deltax_trend")
    if trend == "sinking":
        signals.append("shoreline_stress")
    elif trend not in ("growing", "sinking"):
        lon = row.get("longitude")
        if lon is not None and lon >= LON_BOUNDARY:
            signals.append("shoreline_stress")
    water = row.get("water_surface_variability")
    if water is not None and water >= THRESHOLD_WATER_VARIABILITY:
        signals.append("water_pooling")
    decline = row.get("decline_rate", 0) or 0
    if decline >= THRESHOLD_DECLINE_NESTS:
        signals.append("colony_decline")
    n = len(signals) / 5.0
    vuln = row.get("habitat_vulnerability") or 0
    collapse_score = min(1.0, 0.4 * n + 0.6 * vuln)
    return signals, round(collapse_score, 3)


@router.get("/early-warning")
def early_warning() -> List[dict]:
    """
    Early-warning collapse detection: flag colonies by precursor signals
    (elevation loss, sediment starvation, shoreline stress, water pooling, colony decline).
    Returns colonies with signals, collapse_risk (High/Medium/Low), and early_warning flag.
    """
    scores = compute_risk_metrics(list(COLONY_RECORDS))
    out = []
    for row in scores:
        signals, collapse_score = _early_warning_signals(row)
        if collapse_score >= 0.6:
            collapse_risk = "High"
        elif collapse_score >= 0.3:
            collapse_risk = "Medium"
        else:
            collapse_risk = "Low"
        early_warning = collapse_risk in ("High", "Medium") or len(signals) >= 2
        out.append({
            "colony_id": row["colony_id"],
            "latitude": row.get("latitude"),
            "longitude": row.get("longitude"),
            "risk_category": row["risk_category"],
            "habitat_risk_score": row.get("habitat_risk_score"),
            "habitat_vulnerability": row.get("habitat_vulnerability"),
            "elevation_decline_rate": row.get("elevation_decline_rate"),
            "sediment_deposition_rate": row.get("sediment_deposition_rate"),
            "water_surface_variability": row.get("water_surface_variability"),
            "subsidence_rate_mm_year": row.get("subsidence_rate_mm_year"),
            "elevation_m_navd88": row.get("elevation_m_navd88"),
            "sediment_accretion_mm_year": row.get("sediment_accretion_mm_year"),
            "biomass_g_m2": row.get("biomass_g_m2"),
            "water_surface_height_m": row.get("water_surface_height_m"),
            "vegetation_health": row.get("vegetation_health"),
            "datasets_used": row.get("datasets_used", ""),
            "deltax_trend": row.get("deltax_trend", "unknown"),
            "deltax_coverage_tier": row.get("deltax_coverage_tier", "outside Delta-X coverage — using NOAA fallback"),
            "decline_rate": row.get("decline_rate"),
            "signals": signals,
            "collapse_risk": collapse_risk,
            "collapse_risk_score": collapse_score,
            "early_warning": early_warning,
        })
    return out


def _imagery_confirms_deltax(
    risk_category: str,
    vegetation_change_pct: Optional[float],
    in_sinking_zone: bool,
) -> Optional[bool]:
    """
    True = imagery agrees with Delta-X (e.g. High risk + vegetation loss, or sinking zone + loss).
    False = diverges. None = can't tell (no imagery).
    """
    if vegetation_change_pct is None:
        return None
    # Vegetation loss (negative) + High risk or sinking zone -> confirms
    loss = vegetation_change_pct < -5
    if risk_category == "High" and loss:
        return True
    if in_sinking_zone and loss:
        return True
    # Low risk + vegetation gain or stable -> confirms
    if risk_category == "Low" and vegetation_change_pct >= -5:
        return True
    # High risk but no loss in imagery -> diverges
    if risk_category == "High" and not loss:
        return False
    if in_sinking_zone and not loss:
        return False
    return None


@router.post("/change-detection")
def run_change_detection(
    body: Optional[dict] = Body(default=None),
) -> dict:
    """
    Automated aerial change detection: compare imagery from two years for 2–3 colony sites,
    compute vegetation/reflectance change, and return results alongside Delta-X risk.
    Body: { "colony_ids": ["LA-CO-12-1001", ...], "year_a": 2010, "year_b": 2024 }
    Returns: { "results": [ ... ] }
    """
    if body is None:
        body = {}
    try:
        colony_ids = body.get("colony_ids")
        if not isinstance(colony_ids, list):
            colony_ids = []
        else:
            colony_ids = [str(c) for c in colony_ids][:5]
        year_a = int(body.get("year_a", 2010))
        year_b = int(body.get("year_b", 2024))
    except (TypeError, ValueError):
        return {"results": [], "message": "Invalid body: need colony_ids (list), year_a, year_b."}
    if not colony_ids:
        return {"results": [], "message": "Provide at least one colony_id."}
    try:
        from app.services import change_detection as change_detection_service
    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail="Change detection requires Pillow. Run: pip install Pillow",
        )
    try:
        scores = compute_risk_metrics(list(COLONY_RECORDS))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk data error: {e!s}")
    by_id = {str(s.get("colony_id", "")): s for s in scores}
    results = []
    for cid in colony_ids:
        row = by_id.get(cid)
        if not row:
            results.append({
                "colony_id": cid,
                "error": "Colony not found",
                "latitude": None,
                "longitude": None,
            })
            continue
        lat = row.get("latitude")
        lon = row.get("longitude")
        if lat is None or lon is None:
            results.append({
                "colony_id": cid,
                "error": "No coordinates",
                "latitude": None,
                "longitude": None,
            })
            continue
        risk_category = row.get("risk_category", "Moderate")
        in_sinking = _in_sinking_zone(row)
        try:
            cd = change_detection_service.run_change_detection(lat, lon, year_a, year_b)
        except Exception as e:
            results.append({
                "colony_id": cid,
                "latitude": lat,
                "longitude": lon,
                "error": f"Analysis error: {e!s}",
                "vegetation_change_pct": None,
                "visible_change_pct": None,
                "imagery_available": False,
                "year_a": year_a,
                "year_b": year_b,
                "delta_x_risk": risk_category,
                "in_sinking_zone": in_sinking,
                "imagery_confirms": None,
            })
            continue
        imagery_confirms = _imagery_confirms_deltax(
            risk_category,
            cd.get("vegetation_change_pct"),
            in_sinking,
        )
        results.append({
            "colony_id": cid,
            "latitude": lat,
            "longitude": lon,
            "vegetation_change_pct": cd.get("vegetation_change_pct"),
            "visible_change_pct": cd.get("visible_change_pct"),
            "shoreline_retreat_proxy_pct": cd.get("shoreline_retreat_proxy_pct"),
            "imagery_available": cd.get("imagery_available", False),
            "year_a": year_a,
            "year_b": year_b,
            "delta_x_risk": risk_category,
            "habitat_vulnerability": row.get("habitat_vulnerability"),
            "in_sinking_zone": in_sinking,
            "imagery_confirms": imagery_confirms,
            "message": cd.get("message"),
        })
    return {"results": results}


@router.get("/land-loss-zones")
def land_loss_zones() -> dict:
    """
    Delta-X style land loss / elevation change zones for map overlay.
    Uses real Delta-X zones from data/deltax/deltax_zones.json if present;
    otherwise simplified Atchafalaya (growing) and Terrebonne (sinking) by longitude.
    """
    try:
        from app.data.deltax_data import get_land_loss_zones_geojson
        features = get_land_loss_zones_geojson()
        if features:
            return {"type": "FeatureCollection", "features": features}
    except Exception:
        pass
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"zone": "Atchafalaya", "trend": "growing", "label": "Growing (sediment building)"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-92.0, 29.0], [-91.2, 29.0], [-91.2, 29.8], [-92.0, 29.8], [-92.0, 29.0]
                    ]],
                },
            },
            {
                "type": "Feature",
                "properties": {"zone": "Terrebonne", "trend": "sinking", "label": "Sinking (land loss)"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-91.2, 29.0], [-90.0, 29.0], [-90.0, 29.8], [-91.2, 29.8], [-91.2, 29.0]
                    ]],
                },
            },
        ],
    }
