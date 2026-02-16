"""
Real image classification using CLIP (zero-shot). No training required.
Classifies aerial images as High-density colony / Low-density colony / No colony.
"""
import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Labels we output (and CLIP candidate descriptions)
OUTPUT_LABELS = [
    ("high_density", "High-density colony"),
    ("low_density", "Low-density colony"),
    ("no_colony", "No colony"),
]

# Text prompts for CLIP — describe what each class looks like
CANDIDATE_LABELS = [
    "aerial photograph of a dense bird nesting colony, many birds and nests visible",
    "aerial photograph of a sparse or small bird colony, few birds or nests",
    "aerial photograph of empty coastline, marsh, or water with no visible bird colony",
]

_pipeline = None


def _get_pipeline():
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    try:
        from transformers import pipeline
        from PIL import Image
        # Smaller model for faster load and less memory
        _pipeline = pipeline(
            task="zero-shot-image-classification",
            model="openai/clip-vit-base-patch32",
        )
        return _pipeline
    except Exception as e:
        logger.warning("CLIP pipeline not available: %s", e)
        return None


def classify_image_clip(image_bytes: bytes) -> Optional[dict]:
    """
    Run CLIP zero-shot classification. Returns None if CLIP unavailable.
    """
    pipe = _get_pipeline()
    if pipe is None:
        return None
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        logger.warning("Could not load image: %s", e)
        return None
    try:
        out = pipe(img, candidate_labels=CANDIDATE_LABELS)
        # out is list of {"label": str, "score": float} sorted by score desc
        if not out:
            return None
        best = out[0]
        label_from_model = best.get("label") or ""
        score = float(best.get("score") or 0)
        idx = 0
        for i, c in enumerate(CANDIDATE_LABELS):
            if c == label_from_model or label_from_model in c or c in label_from_model:
                idx = i
                break
        class_id, label_text = OUTPUT_LABELS[idx]
        return {
            "class": class_id,
            "label": label_text,
            "confidence": round(min(1.0, max(0.0, score)), 2),
        }
    except Exception as e:
        logger.warning("CLIP inference failed: %s", e)
        return None
