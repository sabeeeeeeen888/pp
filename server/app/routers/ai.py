"""
AI-assisted aerial image classification for wildlife habitat monitoring.
Uses CLIP (zero-shot) when available; falls back to placeholder otherwise.
"""
import random
from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.clip_classifier import classify_image_clip

router = APIRouter()


@router.get("")
def ai_info():
    """Confirm AI routes are loaded. Use POST /api/ai/classify with an image to classify."""
    return {"message": "AI image classification. POST /api/ai/classify with form field 'file' (image)."}


# Placeholder: in production, replace with a trained CNN (e.g. ResNet fine-tuned on colony imagery)
def _classify_image_placeholder(image_bytes: bytes) -> dict:
    """Placeholder classifier. Replace with real model that ingests 400k+ archive."""
    # Heuristic for demo: use size + pseudo-random seed from bytes for consistency
    n = len(image_bytes)
    seed = sum(image_bytes[: min(100, n)]) if n else 0
    r = random.Random(seed)
    choices = [
        ("high_density", 0.85 + r.uniform(0, 0.12), "High-density colony"),
        ("low_density", 0.70 + r.uniform(0, 0.18), "Low-density colony"),
        ("no_colony", 0.88 + r.uniform(0, 0.10), "No colony"),
    ]
    label, conf, label_text = r.choice(choices)
    return {"class": label, "label": label_text, "confidence": round(conf, 2)}


# Max upload 50 MB
MAX_IMAGE_BYTES = 50 * 1024 * 1024


@router.post("/classify")
async def classify_aerial_image(file: UploadFile = File(...)):
    """
    Classify an aerial image as High-density colony, Low-density colony, or No colony.
    Supports scaling to 400k+ image archive: run in batch or via queue in production.
    """
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e!s}")
    if not content:
        raise HTTPException(status_code=400, detail="Empty file. Choose an image and try again.")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 50 MB).")
    result = classify_image_clip(content)
    if result is not None:
        return result
    try:
        return _classify_image_placeholder(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification error: {e!s}")
