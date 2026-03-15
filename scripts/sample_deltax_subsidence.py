"""
Step 1-3: Sample real NASA Delta-X subsidence rates for each colony.
Dataset: doi:10.3334/ORNLDAAC/2307 (Delta-X: Subsidence and Sea Level Rise Rates, MRD, Louisiana)

Usage
-----
1. Create a free NASA Earthdata account at https://urs.earthdata.nasa.gov
2. Download the subsidence GeoTIFF from https://daac.ornl.gov/cgi-bin/dsviewer.pl?ds_id=2307
   (file will be something like DeltaX_SubsidenceRate_v2.tif or similar — check the ORNL DAAC page for exact filename)
3. Place the .tif file in:   data/deltax/DeltaX_SubsidenceRate.tif
   (or pass --tif /path/to/file.tif)
4. Run:
   pip install rasterio geopandas pandas numpy openpyxl
   python scripts/sample_deltax_subsidence.py
5. Output: data/deltax/deltax_colony_subsidence.csv
   Then update the .env or just run the backend — it will auto-load that CSV.

Delta-X bounding box (from ORNL DAAC metadata):
  longitude: -91.59 to -90.18
  latitude:   29.06 to  29.81
"""
import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

# ── Bounding box of the Delta-X study area ──────────────────────────────────
DELTAX_LON_MIN = -91.59
DELTAX_LON_MAX = -90.18
DELTAX_LAT_MIN =  29.06
DELTAX_LAT_MAX =  29.81

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_colony_sites(project_root: Path) -> List[Dict[str, Any]]:
    """Load unique colony sites (colony_id, lat, lon) from the colony dataset."""
    sys.path.insert(0, str(project_root / "server"))
    try:
        from app.data.colony_data import COLONY_RECORDS  # type: ignore
        seen = {}
        for r in COLONY_RECORDS:
            cid = r["colony_id"]
            if cid not in seen:
                seen[cid] = {"colony_id": cid, "latitude": r["latitude"], "longitude": r["longitude"]}
        sites = list(seen.values())
        print(f"Loaded {len(sites)} unique colony sites from colony_data.py")
        return sites
    except Exception as e:
        print(f"Could not load from colony_data.py: {e}")
        print("Falling back to reading Excel directly (requires openpyxl).")
        return _load_from_excel(project_root)


def _load_from_excel(project_root: Path) -> List[Dict[str, Any]]:
    """Fallback: load from Excel (SummaryFileGenerated.xlsx or Colibri file)."""
    try:
        import openpyxl
    except ImportError:
        print("openpyxl not installed: pip install openpyxl")
        return []
    for fname in ["SummaryFileGenerated.xlsx", "Colibri2010-21ColonyTotalsMayJuneCombined_8Nov22.xlsx"]:
        p = project_root / fname
        if p.exists():
            wb = openpyxl.load_workbook(p, data_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                continue
            headers = [str(h).strip().lower() if h else "" for h in rows[0]]
            lat_i = next((i for i, h in enumerate(headers) if "lat" in h), None)
            lon_i = next((i for i, h in enumerate(headers) if "lon" in h), None)
            name_i = next((i for i, h in enumerate(headers) if "colony" in h or "name" in h), None)
            if lat_i is None or lon_i is None:
                continue
            seen = {}
            for row in rows[1:]:
                try:
                    lat = float(row[lat_i]) if row[lat_i] is not None else None
                    lon = float(row[lon_i]) if row[lon_i] is not None else None
                    cid = str(row[name_i]).strip() if name_i is not None and row[name_i] else f"site-{lat}-{lon}"
                    if lat is not None and lon is not None and cid not in seen:
                        seen[cid] = {"colony_id": cid, "latitude": lat, "longitude": lon}
                except (ValueError, TypeError):
                    continue
            sites = list(seen.values())
            print(f"Loaded {len(sites)} unique colony sites from {fname}")
            return sites
    print("No Excel file found. Run from the project root or use --colonies path.")
    return []


def in_deltax_bbox(lat: float, lon: float) -> bool:
    return DELTAX_LAT_MIN <= lat <= DELTAX_LAT_MAX and DELTAX_LON_MIN <= lon <= DELTAX_LON_MAX


def sample_geotiff(tif_path: Path, lat: float, lon: float):
    """Sample a raster at (lat, lon) and return the value (or None on error)."""
    try:
        import rasterio  # type: ignore
        from rasterio.transform import rowcol  # type: ignore
        with rasterio.open(tif_path) as src:
            # Convert geographic coords to pixel row/col
            row, col = rowcol(src.transform, lon, lat)
            if row < 0 or col < 0 or row >= src.height or col >= src.width:
                return None
            window = rasterio.windows.Window(col, row, 1, 1)
            data = src.read(1, window=window)
            val = float(data[0][0])
            nodata = src.nodata
            if nodata is not None and abs(val - nodata) < 1e-6:
                return None
            return val
    except Exception as e:
        print(f"  rasterio error at ({lat:.5f},{lon:.5f}): {e}")
        return None


def run(tif_path: Path, sites: List[Dict[str, Any]], output_path: Path) -> None:
    print(f"\nUsing GeoTIFF: {tif_path}")
    if not tif_path.exists():
        print(f"\n❌  GeoTIFF not found: {tif_path}")
        print("  1. Download from https://daac.ornl.gov/cgi-bin/dsviewer.pl?ds_id=2307")
        print("  2. Place the .tif at: data/deltax/DeltaX_SubsidenceRate.tif")
        print("     or pass --tif /path/to/file.tif")
        sys.exit(1)

    try:
        import rasterio  # type: ignore
        print(f"rasterio {rasterio.__version__} found.")
    except ImportError:
        print("rasterio not installed. Run: pip install rasterio")
        sys.exit(1)

    print(f"Processing {len(sites)} colony sites...")
    rows_out = []
    n_inside = 0
    n_sampled = 0

    for site in sites:
        cid = site["colony_id"]
        lat = site["latitude"]
        lon = site["longitude"]
        inside = in_deltax_bbox(lat, lon)

        if inside:
            n_inside += 1
            val = sample_geotiff(tif_path, lat, lon)
        else:
            val = None

        if inside and val is not None:
            n_sampled += 1
            # Delta-X subsidence product: positive = sinking (subsidence), negative = growing (accretion)
            # Adjust sign convention if needed — ORNL DAAC product 2307 uses mm/yr positive = subsidence
            # So: subsidence_rate_mm_year > 0 means sinking; < 0 means growing
            trend = "sinking" if val >= 0 else "growing"
            # Convert to our internal elevation_decline_rate (normalised 0-1 approx):
            #   subsidence range in MRD is typically 0–30 mm/yr; normalise to 0–1
            elev_decline = round(min(1.0, max(0.0, val / 30.0)), 4) if val >= 0 else 0.0
            coverage = "Delta-X (high precision)"
        elif inside:
            # Inside bbox but raster was NoData at this point
            trend = "unknown"
            elev_decline = None
            coverage = "Delta-X (high precision)"
        else:
            trend = "outside_deltax"
            elev_decline = None
            coverage = "outside Delta-X coverage — using NOAA fallback"

        rows_out.append({
            "colony_id": cid,
            "latitude": lat,
            "longitude": lon,
            "subsidence_rate_mm_year": round(val, 4) if val is not None else "",
            "trend": trend,
            "elevation_decline_rate": elev_decline if elev_decline is not None else "",
            "in_deltax_coverage": "yes" if inside else "no",
            "deltax_coverage_tier": coverage,
        })

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows_out[0].keys())
        writer.writeheader()
        writer.writerows(rows_out)

    print(f"\n✅  Done.")
    print(f"   Colonies inside Delta-X bbox:   {n_inside}")
    print(f"   Sampled (non-NoData):            {n_sampled}")
    print(f"   Outside bbox (NOAA fallback):    {len(sites) - n_inside}")
    print(f"   Output CSV:                      {output_path}")
    print("\nNext: restart the backend. It will load this CSV automatically.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sample Delta-X subsidence GeoTIFF for colonies.")
    parser.add_argument(
        "--tif",
        default=str(PROJECT_ROOT / "data" / "deltax" / "DeltaX_SubsidenceRate.tif"),
        help="Path to the Delta-X subsidence GeoTIFF (doi:10.3334/ORNLDAAC/2307)",
    )
    parser.add_argument(
        "--output",
        default=str(PROJECT_ROOT / "data" / "deltax" / "deltax_colony_subsidence.csv"),
        help="Output CSV path",
    )
    args = parser.parse_args()

    sites = load_colony_sites(PROJECT_ROOT)
    if not sites:
        print("No colony sites found. Cannot continue.")
        sys.exit(1)

    run(Path(args.tif), sites, Path(args.output))
