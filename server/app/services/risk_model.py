"""
Habitat Risk Scoring Model for Project Pelican.
Risk = w1(DeclineRate) + w2(LowRichness) + w3(PopulationVariability) + w4(DeltaX)
Delta-X predictors: elevation decline, sediment stress, water variability (proxy from geography).
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

# Louisiana: Atchafalaya (west, ~-91.5) growing; Terrebonne (east, ~-90) sinking (Delta-X study areas)
LON_WEST_GROWING = -91.8
LON_EAST_SINKING = -89.8


def _delta_x_proxies(lat: float, lon: float, site_index: int) -> Dict[str, float]:
    """
    Proxy Delta-X predictors from location (Atchafalaya vs Terrebonne).
    West = less elevation decline, more sediment; East = more decline, sediment starvation.
    Real data would come from Delta-X DEM/sediment products.
    """
    t = (lon - LON_EAST_SINKING) / (LON_WEST_GROWING - LON_EAST_SINKING)  # 0 = east, 1 = west
    t = max(0, min(1, t))
    h = hashlib.md5(str(site_index).encode()).hexdigest()
    # Elevation decline rate (higher = more sinking)
    elevation_decline_rate = round(0.15 + (1 - t) * 0.75 + int(h[:2], 16) % 20 / 100, 3)
    # Sediment deposition (lower = starvation)
    sediment_deposition_rate = round(0.2 + t * 0.6 + int(h[2:4], 16) % 15 / 100, 3)
    # Water surface variability
    water_surface_variability = round(0.1 + (1 - t) * 0.4 + int(h[4:6], 16) % 20 / 100, 3)
    return {
        "elevation_decline_rate": elevation_decline_rate,
        "sediment_deposition_rate": sediment_deposition_rate,
        "water_surface_variability": water_surface_variability,
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
        dx = _delta_x_proxies(lat, lon, site_index)
        result.append({
            "colony_id": first["colony_id"],
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
            "elevation_decline_rate": dx["elevation_decline_rate"],
            "sediment_deposition_rate": dx["sediment_deposition_rate"],
            "water_surface_variability": dx["water_surface_variability"],
        })

    # Normalize for scoring (higher = worse)
    dr_min = min(decline_rates) if decline_rates else 0
    dr_max = max(decline_rates) if decline_rates else 1
    r_min = min(richments) if richments else 1
    r_max = max(richments) if richments else 1
    v_min = min(variabilities) if variabilities else 0
    v_max = max(variabilities) if variabilities else 1

    # Delta-X vulnerability: high elevation decline + low sediment + high water var = worse
    dx_vals = [(row["elevation_decline_rate"] + (1 - row["sediment_deposition_rate"]) + row["water_surface_variability"]) / 3 for row in result]
    dx_min = min(dx_vals) if dx_vals else 0
    dx_max = max(dx_vals) if dx_vals else 1

    for row in result:
        decline_norm = _normalize(row["decline_rate"], dr_min, dr_max)
        richness_norm = 1 - _normalize(row["species_richness"], r_min, r_max)
        var_norm = _normalize(row["population_variability"], v_min, v_max)
        dx_norm = _normalize((row["elevation_decline_rate"] + (1 - row["sediment_deposition_rate"]) + row["water_surface_variability"]) / 3, dx_min, dx_max)
        row["habitat_vulnerability"] = round(dx_norm, 4)  # 0–1, Delta-X derived
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
