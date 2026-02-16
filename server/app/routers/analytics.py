from fastapi import APIRouter, Query
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
) -> List[dict]:
    """
    Habitat risk scores per colony: species richness, decline rate,
    population variability, and risk category (Low/Moderate/High).
    """
    records = _filter_records(year, species)
    return compute_risk_metrics(records)


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


# Zone split: Terrebonne (sinking) lon >= -91.2; Atchafalaya (growing) lon < -91.2
LON_BOUNDARY = -91.2


@router.get("/deltax-summary")
def deltax_summary() -> dict:
    """
    Summary for judges: colonies in sinking vs growing zones, and top 5 priority colonies
    to protect (highest risk + habitat vulnerability, optionally in sinking zone).
    """
    scores = compute_risk_metrics(list(COLONY_RECORDS))
    in_sinking = sum(1 for s in scores if s.get("longitude") is not None and s["longitude"] >= LON_BOUNDARY)
    in_growing = sum(1 for s in scores if s.get("longitude") is not None and s["longitude"] < LON_BOUNDARY)
    # Top 5: sort by risk score desc, then habitat_vulnerability desc
    with_dx = [s for s in scores if s.get("habitat_vulnerability") is not None]
    top5 = sorted(with_dx, key=lambda s: (s["habitat_risk_score"], (s.get("habitat_vulnerability") or 0)), reverse=True)[:5]
    return {
        "colonies_in_sinking_zone": in_sinking,
        "colonies_in_growing_zone": in_growing,
        "total_colonies": len(scores),
        "top_5_priority": [
            {
                "colony_id": s["colony_id"],
                "risk_category": s["risk_category"],
                "habitat_risk_score": round(s["habitat_risk_score"], 3),
                "habitat_vulnerability": round(s["habitat_vulnerability"], 2) if s.get("habitat_vulnerability") is not None else None,
                "in_sinking_zone": s.get("longitude") is not None and s["longitude"] >= LON_BOUNDARY,
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
    lon = row.get("longitude")
    if lon is not None and lon >= LON_BOUNDARY:
        signals.append("shoreline_stress")
    water = row.get("water_surface_variability")
    if water is not None and water >= THRESHOLD_WATER_VARIABILITY:
        signals.append("water_pooling")
    decline = row.get("decline_rate", 0) or 0
    if decline >= THRESHOLD_DECLINE_NESTS:
        signals.append("colony_decline")
    # Collapse risk score: more signals + higher habitat vulnerability -> higher score
    n = len(signals) / 5.0  # max 5 signals
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
            "decline_rate": row.get("decline_rate"),
            "signals": signals,
            "collapse_risk": collapse_risk,
            "collapse_risk_score": collapse_score,
            "early_warning": early_warning,
        })
    return out


@router.get("/land-loss-zones")
def land_loss_zones() -> dict:
    """
    Delta-X style land loss / elevation change zones for map overlay.
    Simplified Atchafalaya (growing) and Terrebonne (sinking) basins.
    Real data would come from Delta-X DEM/sediment products.
    """
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
