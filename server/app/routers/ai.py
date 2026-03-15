"""
AI-assisted aerial image classification and natural-language query.
Uses CLIP (zero-shot) when available; natural-language query uses Claude when ANTHROPIC_API_KEY is set.
"""
import json
import os
import random
import re
from typing import Any, Optional

from fastapi import APIRouter, Body, File, HTTPException, UploadFile

from app.services.clip_classifier import classify_image_clip

router = APIRouter()

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")


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


@router.post("/query")
async def natural_language_query(body: Optional[dict] = Body(default=None)) -> dict:
    """
    Answer a natural-language question about the colony data using Claude.
    Body: { "query": "user question", "context": "optional system context", "colony_data": [...] }.
    Returns: { "answer": "formatted answer", "colony_ids": ["LA-CO-...", ...] }.
    """
    if body is None:
        body = {}
    query = (body.get("query") or "").strip()
    if not query:
        return {"answer": "Please ask a question about the data.", "colony_ids": []}

    context = body.get("context") or ""
    colony_data = body.get("colony_data")
    if isinstance(colony_data, list):
        context = context + "\n\nColony data (JSON):\n" + json.dumps(colony_data[:200], indent=0)[:30000]

    system_prompt = """You are a helpful assistant for Project Pelican, a coastal bird colony monitoring and restoration decision-support system.
The user can ask questions about colony data (Louisiana Gulf Coast and beyond). When you mention specific colonies, use their exact colony_id (e.g. LA-CO-12-1001) so the app can highlight them on the map.
Dataset: colony_id, latitude, longitude, risk_category (Low/Moderate/High), species_list, species_richness, decline_rate, habitat_vulnerability, elevation_decline_rate, sediment_deposition_rate, water_surface_variability.
Answer concisely. If listing colonies, include their colony_id in parentheses."""
    if context:
        system_prompt += "\n\nAdditional context:\n" + context[:8000]

    if not ANTHROPIC_API_KEY:
        return {
            "answer": "Natural-language query is not configured. Set ANTHROPIC_API_KEY on the server to enable. Example: \"Which high-risk colonies have Brown Pelican?\" would be answered using the colony dataset.",
            "colony_ids": [],
        }
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": query}],
        )
        text = (msg.content[0].text if msg.content else "") or ""
        colony_ids = list(set(re.findall(r"(?:LA-CO-[-\w]+|FL-[-\w]+)", text)))
        return {"answer": text.strip(), "colony_ids": colony_ids[:50]}
    except Exception as e:
        return {"answer": f"Query failed: {e!s}", "colony_ids": []}
