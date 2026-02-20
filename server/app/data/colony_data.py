"""
Multi-year avian colony data for Louisiana Gulf Coast (2010-2021).
Loads from Colibri Excel file when present; falls back to synthetic demo data.
"""
import random
from pathlib import Path
from typing import List, Dict, Any

from app.data.excel_loader import load_colony_data_from_excel

# Louisiana coastal region bounds (approx) — used for synthetic fallback
LAT_MIN, LAT_MAX = 28.8, 30.2
LON_MIN, LON_MAX = -93.5, -89.0

SPECIES = [
    "Brown Pelican",
    "Laughing Gull",
    "Royal Tern",
    "Sandwich Tern",
    "Black Skimmer",
    "Great Egret",
    "Snowy Egret",
    "Tricolored Heron",
    "White Ibis",
    "Roseate Spoonbill",
]


def _gen_colony_id(i: int) -> str:
    return f"LA-CO-{2010 + (i % 12):02d}-{1000 + i}"


def generate_synthetic_records() -> List[Dict[str, Any]]:
    """Generate colony records for demo when Excel is not available."""
    random.seed(42)
    records = []
    n_sites = 85
    base_year = 2010
    end_year = 2021
    for site_id in range(n_sites):
        lat = round(LAT_MIN + (LAT_MAX - LAT_MIN) * random.random(), 5)
        lon = round(LON_MIN + (LON_MAX - LON_MIN) * random.random(), 5)
        n_species = random.randint(1, min(6, len(SPECIES)))
        species_at_site = random.sample(SPECIES, n_species)
        for year in range(base_year, end_year + 1):
            for species in species_at_site:
                trend = random.choice([-0.05, 0, 0.02, -0.08, 0.05])
                base_count = random.randint(20, 800)
                years_from_start = year - base_year
                count = max(0, int(base_count * (1 + trend * years_from_start) * (0.7 + 0.6 * random.random())))
                if count == 0:
                    continue
                records.append({
                    "colony_id": _gen_colony_id(site_id),
                    "site_index": site_id,
                    "year": year,
                    "species": species,
                    "nest_count": count,
                    "latitude": lat,
                    "longitude": lon,
                })
    return records


def _load_records() -> List[Dict[str, Any]]:
    """Use SummaryFileGenerated.xlsx (preferred, has real coordinates) or Colibri Excel if present, else synthetic."""
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    # Try SummaryFileGenerated first (has real GPS coordinates)
    summary_file = project_root / "SummaryFileGenerated.xlsx"
    colibri_file = project_root / "Colibri2010-21ColonyTotalsMayJuneCombined_8Nov22.xlsx"
    
    for xlsx_file in [summary_file, colibri_file]:
        if xlsx_file.exists():
            try:
                records = load_colony_data_from_excel(xlsx_file)
                if records:
                    return records
            except Exception:
                continue
    
    return generate_synthetic_records()


COLONY_RECORDS = _load_records()
