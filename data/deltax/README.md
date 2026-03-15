# data/deltax — Real NASA Delta-X Files

Place real Delta-X data files here.  
When present they **replace** the longitude-based synthetic proxy entirely.

---

## Step-by-step: integrate real subsidence rates

### 1 — Download the GeoTIFF

1. Create a free NASA Earthdata account: <https://urs.earthdata.nasa.gov>
2. Visit: <https://daac.ornl.gov/cgi-bin/dsviewer.pl?ds_id=2307>
3. Download the subsidence rate GeoTIFF (usually named something like  
   `DeltaX_SubsidenceRate_v2.tif`)
4. Place it here:  
   ```
   data/deltax/DeltaX_SubsidenceRate.tif
   ```

### 2 — Install Python dependencies

```bash
pip install rasterio geopandas pandas numpy openpyxl
```

### 3 — Run the sampling script

```bash
# from the project root
python scripts/sample_deltax_subsidence.py
```

Optional flags:
```
--tif   /path/to/DeltaX_SubsidenceRate.tif   (default: data/deltax/DeltaX_SubsidenceRate.tif)
--output /path/to/output.csv                  (default: data/deltax/deltax_colony_subsidence.csv)
```

### 4 — Restart the backend

The backend automatically loads `data/deltax/deltax_colony_subsidence.csv` on startup.

```bash
./run-backend.sh
```

---

## Output CSV columns

| Column | Description |
|--------|-------------|
| `colony_id` | Matches the colony in the app |
| `latitude` | Colony latitude |
| `longitude` | Colony longitude |
| `subsidence_rate_mm_year` | Real NASA measurement (mm/yr). Positive = sinking, negative = growing |
| `trend` | `growing` / `sinking` / `outside_deltax` / `unknown` |
| `elevation_decline_rate` | Normalised 0–1 value (subsidence / 30 mm/yr max) used in risk model |
| `in_deltax_coverage` | `yes` / `no` |
| `deltax_coverage_tier` | Full label string surfaced in the UI |

---

## Optional: polygon zones

You can also place `deltax_zones.json` (GeoJSON FeatureCollection) here for drawing  
growing/sinking polygons on the map. Each feature needs `properties.trend = "growing"` or  
`"sinking"`.

---

## Dataset citation

> Delta-X: Subsidence and Sea Level Rise Rates in the Mississippi River Delta, Louisiana, USA  
> doi: [10.3334/ORNLDAAC/2307](https://doi.org/10.3334/ORNLDAAC/2307)  
> NASA Delta-X project: <https://deltax.jpl.nasa.gov>
