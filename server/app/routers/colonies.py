from fastapi import APIRouter, Query
from typing import List, Optional
from app.data.colony_data import COLONY_RECORDS

router = APIRouter()


@router.get("/")
def list_colonies(
    year: Optional[int] = Query(None, ge=2010, le=2021),
    species: Optional[str] = Query(None),
) -> List[dict]:
    """List colony records with optional filters by year and species."""
    result = list(COLONY_RECORDS)
    if year is not None:
        result = [r for r in result if r["year"] == year]
    if species:
        result = [r for r in result if r["species"] == species]
    return result


@router.get("/years")
def list_years() -> List[int]:
    """Survey years that actually have data in the dataset (no gaps)."""
    years = sorted(set(r["year"] for r in COLONY_RECORDS))
    return years if years else list(range(2010, 2022))


@router.get("/species")
def list_species() -> List[str]:
    """All species in the dataset."""
    return sorted(set(r["species"] for r in COLONY_RECORDS))
