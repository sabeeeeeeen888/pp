from typing import Optional
from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Project Pelican API",
    description="Geospatial decision-support system for Louisiana coastal restoration",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register change-detection FIRST so it always exists even if other routers fail to load
LON_BOUNDARY = -91.2


def _imagery_confirms(risk_category: str, vegetation_change_pct: Optional[float], in_sinking_zone: bool) -> Optional[bool]:
    if vegetation_change_pct is None:
        return None
    loss = vegetation_change_pct < -5
    if risk_category == "High" and loss:
        return True
    if in_sinking_zone and loss:
        return True
    if risk_category == "Low" and vegetation_change_pct >= -5:
        return True
    if risk_category == "High" and not loss:
        return False
    if in_sinking_zone and not loss:
        return False
    return None


@app.get("/api/analytics/change-detection")
@app.get("/api/change-detection")
def change_detection_info():
    """Confirm change-detection endpoint exists. POST with body: { colony_ids: [], year_a: 2010, year_b: 2024 }."""
    return {"status": "ok", "message": "POST with colony_ids, year_a, year_b to run change detection."}


@app.post("/api/analytics/change-detection")
@app.post("/api/change-detection")
def change_detection_endpoint(body: Optional[dict] = Body(default=None)):
    """Automated aerial change detection (2010 vs 2024 imagery + Delta-X comparison)."""
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
        from app.data.colony_data import COLONY_RECORDS
        from app.services.risk_model import compute_risk_metrics
        from app.services import change_detection as change_detection_service
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Change detection unavailable: {e!s}")
    try:
        scores = compute_risk_metrics(list(COLONY_RECORDS))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk data error: {e!s}")
    by_id = {str(s.get("colony_id", "")): s for s in scores}
    results = []
    for cid in colony_ids:
        row = by_id.get(cid)
        if not row:
            results.append({"colony_id": cid, "error": "Colony not found", "latitude": None, "longitude": None})
            continue
        lat, lon = row.get("latitude"), row.get("longitude")
        if lat is None or lon is None:
            results.append({"colony_id": cid, "error": "No coordinates", "latitude": None, "longitude": None})
            continue
        risk_category = row.get("risk_category", "Moderate")
        in_sinking = lon >= LON_BOUNDARY
        try:
            cd = change_detection_service.run_change_detection(lat, lon, year_a, year_b)
        except Exception as e:
            results.append({
                "colony_id": cid, "latitude": lat, "longitude": lon, "error": f"Analysis error: {e!s}",
                "vegetation_change_pct": None, "visible_change_pct": None, "imagery_available": False,
                "year_a": year_a, "year_b": year_b, "delta_x_risk": risk_category,
                "in_sinking_zone": in_sinking, "imagery_confirms": None,
            })
            continue
        imagery_confirms = _imagery_confirms(risk_category, cd.get("vegetation_change_pct"), in_sinking)
        results.append({
            "colony_id": cid, "latitude": lat, "longitude": lon,
            "vegetation_change_pct": cd.get("vegetation_change_pct"),
            "visible_change_pct": cd.get("visible_change_pct"),
            "shoreline_retreat_proxy_pct": cd.get("shoreline_retreat_proxy_pct"),
            "imagery_available": cd.get("imagery_available", False),
            "year_a": year_a, "year_b": year_b, "delta_x_risk": risk_category,
            "habitat_vulnerability": row.get("habitat_vulnerability"),
            "in_sinking_zone": in_sinking, "imagery_confirms": imagery_confirms,
            "message": cd.get("message"),
        })
    return {"results": results}

# Now load and include other routers
from app.routers import colonies, analytics, ai, auth

app.include_router(colonies.router, prefix="/api/colonies", tags=["colonies"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])


# Ensure classify is always available; use CLIP when possible
from app.routers.ai import _classify_image_placeholder, MAX_IMAGE_BYTES
from app.services.clip_classifier import classify_image_clip


def _classify(content: bytes) -> dict:
    result = classify_image_clip(content)
    if result is not None:
        return result
    return _classify_image_placeholder(content)


@app.post("/api/ai/classify")
async def api_ai_classify(file: UploadFile = File(...)):
    """Classify aerial image: High / Low / No colony (CLIP when available)."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file. Choose an image and try again.")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 50 MB).")
    try:
        return _classify(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification error: {e!s}")


@app.post("/api/classify")
@app.post("/classify")
async def classify_root(file: UploadFile = File(...)):
    """Same as /api/ai/classify (CLIP when available). /api/classify for Vercel rewrite."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file. Choose an image and try again.")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 50 MB).")
    try:
        return _classify(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification error: {e!s}")


@app.get("/")
async def root():
    return {"status": "API is working", "message": "Hello from FastAPI"}


@app.get("/test")
@app.get("/api/test")
async def test():
    return {"test": "success"}


@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok"}
