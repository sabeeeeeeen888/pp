from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.routers import colonies, analytics, ai, auth

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
def root():
    return {"message": "Project Pelican API", "docs": "/docs"}


@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok"}
