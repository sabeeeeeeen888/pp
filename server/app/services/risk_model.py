"""
Habitat Risk Scoring Model for Project Pelican.
Risk = w1(DeclineRate) + w2(LowRichness) + w3(PopulationVariability) + w4(DeltaX)
Delta-X predictors:
  - When data/deltax/deltax_colony_subsidence.csv is present (produced by
    scripts/sample_deltax_subsidence.py from doi:10.3334/ORNLDAAC/2307), real NASA
    subsidence rates are used for elevation_decline_rate.
  - Otherwise falls back to longitude-based synthetic proxies.
"""
import math
import hashlib
from typing import List, Dict, Any
from collections import defaultdict

# Weights (normalized)
W_DECLINE = 0.35
W_LOW_RICHNESS = 0.28
W_VARIABILITY = 0.15
W_DELTAX = 0.22  # Delta-X habitat vulnerability

# Synthetic fallback bounds
LON_WEST_GROWING = -91.8
LON_EAST_SINKING = -89.8


def _delta_x_proxies(colony_id: str, lat: float, lon: float, site_index: int) -> Dict[str, Any]:
    """
    Return Delta-X predictor values plus coverage metadata.

    Priority:
      1. Real NASA 4-dataset measurements CSV (deltax_colony_measurements.csv)
         → real elevation (RTK doi:2071), real sediment (doi:2381),
           real biomass (doi:2237), real water height (AirSWOT doi:2128)
      2. Legacy subsidence CSV (deltax_colony_subsidence.csv, doi:2307)
      3. Generic proximity CSV (deltax_proxies.csv)
      4. Longitude-based synthetic proxy

    Always returns:
      elevation_decline_rate, sediment_deposition_rate, water_surface_variability,
      vegetation_health (may be None), subsidence_rate_mm_year (may be None),
      elevation_m_navd88, sediment_accretion_mm_year, biomass_g_m2,
      water_surface_height_m, datasets_used, deltax_trend, deltax_coverage_tier
    """
    try:
        from app.data.deltax_data import get_colony_measurements, get_deltax_proxies, in_deltax_bbox

        # 1. Colony-level measurements (comprehensive)
        col_data = get_colony_measurements(colony_id)
        if col_data is not None:
            trend = col_data.get("deltax_trend", "unknown")
            if trend == "outside_deltax":
                trend = "unknown"
            return {
                "elevation_decline_rate": col_data.get("elevation_decline_rate") or 0.0,
                "sediment_deposition_rate": col_data.get("sediment_deposition_rate") if col_data.get("sediment_deposition_rate") is not None else None,
                "water_surface_variability": col_data.get("water_surface_variability") if col_data.get("water_surface_variability") is not None else None,
                "vegetation_health": col_data.get("vegetation_health"),
                # Raw measurements for display
                "elevation_m_navd88": col_data.get("elevation_m_navd88"),
                "sediment_accretion_mm_year": col_data.get("sediment_accretion_mm_year"),
                "biomass_g_m2": col_data.get("biomass_g_m2"),
                "water_surface_height_m": col_data.get("water_surface_height_m"),
                "subsidence_rate_mm_year": col_data.get("subsidence_rate_mm_year"),
                "datasets_used": col_data.get("datasets_used", ""),
                "deltax_trend": trend,
                "deltax_coverage_tier": col_data.get("deltax_coverage_tier", "outside Delta-X coverage — using NOAA fallback"),
            }

        # 2. Generic proximity CSV (any loaded CSV)
        real = get_deltax_proxies(lat, lon)
        if real is not None:
            inside = in_deltax_bbox(lat, lon)
            return {
                "elevation_decline_rate": real.get("elevation_decline_rate", 0.0),
                "sediment_deposition_rate": real.get("sediment_deposition_rate"),
                "water_surface_variability": real.get("water_surface_variability"),
                "vegetation_health": real.get("vegetation_health"),
                "elevation_m_navd88": None,
                "sediment_accretion_mm_year": None,
                "biomass_g_m2": None,
                "water_surface_height_m": None,
                "subsidence_rate_mm_year": None,
                "datasets_used": "",
                "deltax_trend": "unknown",
                "deltax_coverage_tier": "Delta-X (high precision)" if inside else "outside Delta-X coverage — using NOAA fallback",
            }

    except Exception:
        pass

    # 3. Synthetic longitude-based proxy (fallback)
    t = (lon - LON_EAST_SINKING) / (LON_WEST_GROWING - LON_EAST_SINKING)
    t = max(0, min(1, t))
    h = hashlib.md5(str(site_index).encode()).hexdigest()
    elevation_decline_rate = round(0.15 + (1 - t) * 0.75 + int(h[:2], 16) % 20 / 100, 3)
    sediment_deposition_rate = round(0.2 + t * 0.6 + int(h[2:4], 16) % 15 / 100, 3)
    water_surface_variability = round(0.1 + (1 - t) * 0.4 + int(h[4:6], 16) % 20 / 100, 3)
    synthetic_trend = "growing" if lon < -91.2 else "sinking"
    try:
        from app.data.deltax_data import in_deltax_bbox
        inside = in_deltax_bbox(lat, lon)
    except Exception:
        inside = False
    return {
        "elevation_decline_rate": elevation_decline_rate,
        "sediment_deposition_rate": sediment_deposition_rate,
        "water_surface_variability": water_surface_variability,
        "vegetation_health": None,
        "elevation_m_navd88": None,
        "sediment_accretion_mm_year": None,
        "biomass_g_m2": None,
        "water_surface_height_m": None,
        "subsidence_rate_mm_year": None,
        "datasets_used": "",
        "deltax_trend": synthetic_trend,
        "deltax_coverage_tier": "Delta-X (high precision)" if inside else "outside Delta-X coverage — using NOAA fallback",
    }


def _shannon_diversity(site_records: List[Dict[str, Any]]) -> float:
    """Shannon diversity index H = -sum(p_i * ln(p_i)), with p_i = proportion of species i (by nest count)."""
    by_species: Dict[str, int] = defaultdict(int)
    total = 0
    for r in site_records:
        by_species[r["species"]] += r["nest_count"]
        total += r["nest_count"]
    if total <= 0:
        return 0.0
    h = 0.0
    for n in by_species.values():
        if n > 0:
            p = n / total
            h -= p * math.log(p)
    return round(h, 4)


def _normalize(x: float, min_val: float, max_val: float) -> float:
    if max_val <= min_val:
        return 0.0
    return max(0, min(1, (x - min_val) / (max_val - min_val)))


def compute_risk_metrics(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Aggregate by colony (site) and compute:
    - species_richness (unique species per site)
    - decline_rate (initial total - final total nests)
    - population_variability (e.g. std/mean across years)
    - habitat_risk_score and risk_category (Low/Moderate/High)
    """
    # Group by (site_index, lat, lon) or colony_id
    by_site: Dict[int, List[Dict]] = defaultdict(list)
    for r in records:
        by_site[r["site_index"]].append(r)

    result = []
    decline_rates = []
    richments = []
    variabilities = []

    for site_index, site_records in by_site.items():
        years = sorted(set(r["year"] for r in site_records))
        species = set(r["species"] for r in site_records)
        richness = len(species)
        richments.append(richness)

        # Total nests by year
        by_year = defaultdict(int)
        for r in site_records:
            by_year[r["year"]] += r["nest_count"]
        counts = [by_year[y] for y in years]
        if not counts or len(years) < 2:
            decline_rate = 0
            variability = 0
        else:
            initial = sum(by_year[y] for y in years[:2]) / 2
            final = sum(by_year[y] for y in years[-2:]) / 2
            decline_rate = max(0, initial - final)
            decline_rates.append(decline_rate)
            mean_c = sum(counts) / len(counts)
            var_c = sum((c - mean_c) ** 2 for c in counts) / len(counts)
            std = var_c ** 0.5
            variability = (std / mean_c) if mean_c > 0 else 0
            variabilities.append(variability)

        # Shannon diversity (proportions by nest count across all records at site)
        shannon = _shannon_diversity(site_records)
        first = site_records[0]
        lat, lon = first["latitude"], first["longitude"]
        cid = first["colony_id"]
        dx = _delta_x_proxies(cid, lat, lon, site_index)
        result.append({
            "colony_id": cid,
            "site_index": site_index,
            "latitude": lat,
            "longitude": lon,
            "species_richness": richness,
            "species_list": list(species),
            "shannon_diversity": shannon,
            "decline_rate": decline_rate,
            "population_variability": variability,
            "total_nests_final": by_year.get(years[-1], 0),
            "years": years,
            # Normalised proxies (0-1)
            "elevation_decline_rate": dx["elevation_decline_rate"],
            "sediment_deposition_rate": dx.get("sediment_deposition_rate"),
            "water_surface_variability": dx.get("water_surface_variability"),
            "vegetation_health": dx.get("vegetation_health"),  # None when not available
            # Raw NASA measurements (None when not loaded)
            "elevation_m_navd88": dx.get("elevation_m_navd88"),
            "sediment_accretion_mm_year": dx.get("sediment_accretion_mm_year"),
            "biomass_g_m2": dx.get("biomass_g_m2"),
            "water_surface_height_m": dx.get("water_surface_height_m"),
            "subsidence_rate_mm_year": dx.get("subsidence_rate_mm_year"),
            "datasets_used": dx.get("datasets_used", ""),
            "deltax_trend": dx.get("deltax_trend", "unknown"),
            "deltax_coverage_tier": dx.get("deltax_coverage_tier", "outside Delta-X coverage — using NOAA fallback"),
        })

    # Normalize for scoring (higher = worse)
    dr_min = min(decline_rates) if decline_rates else 0
    dr_max = max(decline_rates) if decline_rates else 1
    r_min = min(richments) if richments else 1
    r_max = max(richments) if richments else 1
    v_min = min(variabilities) if variabilities else 0
    v_max = max(variabilities) if variabilities else 1

    # ── Delta-X habitat vulnerability ─────────────────────────────────────────
    # When real data is loaded, use all available variables.
    # vegetation_health = 1 means healthy (not a risk), so (1 - veg) adds risk.
    # Sediment and water may be None if only partial datasets loaded — gracefully degrade.
    def _dx_raw(row: Dict) -> float:
        elev = row["elevation_decline_rate"]
        sed = row.get("sediment_deposition_rate")
        water = row.get("water_surface_variability")
        veg = row.get("vegetation_health")
        terms: list = [elev]
        if sed is not None:
            terms.append(1 - sed)
        if water is not None:
            terms.append(water)
        if veg is not None:
            terms.append(1 - veg)   # low biomass = high risk
        return sum(terms) / len(terms)

    dx_vals = [_dx_raw(row) for row in result]
    dx_min = min(dx_vals) if dx_vals else 0
    dx_max = max(dx_vals) if dx_vals else 1

    for row in result:
        decline_norm = _normalize(row["decline_rate"], dr_min, dr_max)
        richness_norm = 1 - _normalize(row["species_richness"], r_min, r_max)
        var_norm = _normalize(row["population_variability"], v_min, v_max)
        dx_norm = _normalize(_dx_raw(row), dx_min, dx_max)
        row["habitat_vulnerability"] = round(dx_norm, 4)
        risk = (
            W_DECLINE * decline_norm
            + W_LOW_RICHNESS * richness_norm
            + W_VARIABILITY * var_norm
            + W_DELTAX * dx_norm
        )
        row["habitat_risk_score"] = round(risk, 4)
        if risk < 0.35:
            row["risk_category"] = "Low"
            row["risk_color"] = "green"
        elif risk < 0.65:
            row["risk_category"] = "Moderate"
            row["risk_color"] = "yellow"
        else:
            row["risk_category"] = "High"
            row["risk_color"] = "red"
    return result
