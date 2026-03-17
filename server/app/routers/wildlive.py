"""
WildLive — Near Real-time Visual Wildlife Tracking onboard UAVs
Based on: https://github.com/dat-nguyenvn/DC12

Uses SAHI (Slicing Aided Hyper Inference) + YOLOv5 to detect small
wildlife (birds) in high-resolution aerial imagery, matching the
architecture described in the WildLive paper.

Only birds are returned.
"""

import base64
import io
import time
import tempfile
import os
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile, Query
from fastapi.responses import JSONResponse
from PIL import Image

router = APIRouter()

_sahi_model = None
_model_name = "yolov5su"


def _get_sahi_model():
    global _sahi_model
    if _sahi_model is None:
        from sahi import AutoDetectionModel
        _sahi_model = AutoDetectionModel.from_pretrained(
            model_type="ultralytics",
            model_path=_model_name,
            confidence_threshold=0.05,
            device="cpu",
        )
    return _sahi_model


def _draw_wildlive_boxes(img_pil: Image.Image, detections: list) -> str:
    """Draw WildLive-style bounding boxes (teal/green for birds)."""
    try:
        img_cv = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)
        for i, d in enumerate(detections):
            x1, y1, x2, y2 = [int(v) for v in d["bbox"]]
            color = (0, 210, 130)  # teal-green
            cv2.rectangle(img_cv, (x1, y1), (x2, y2), color, 2)
            label_text = f"bird {d['confidence']:.2f}"
            (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
            cv2.rectangle(img_cv, (x1, y1 - th - 5), (x1 + tw + 4, y1), color, -1)
            cv2.putText(img_cv, label_text, (x1 + 2, y1 - 3),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 1, cv2.LINE_AA)

        # Count label in top-left
        count_text = f"WildLive  birds: {len(detections)}"
        cv2.rectangle(img_cv, (8, 8), (len(count_text) * 8 + 12, 28), (0, 0, 0), -1)
        cv2.putText(img_cv, count_text, (12, 23),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 210, 130), 1, cv2.LINE_AA)

        _, buf = cv2.imencode(".jpg", img_cv, [cv2.IMWRITE_JPEG_QUALITY, 88])
        return base64.b64encode(buf.tobytes()).decode()
    except Exception:
        return ""


@router.get("/status")
def wildlive_status():
    try:
        _get_sahi_model()
        return {"status": "ready", "model": _model_name, "method": "SAHI + YOLOv5", "target": "birds only"}
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}


@router.post("/track")
async def track(
    file: UploadFile = File(...),
    conf: Optional[float] = 0.50,
    slice_size: Optional[int] = 512,
    overlap: Optional[float] = 0.2,
):
    """
    Run SAHI sliced inference (WildLive-style) on an uploaded image.
    Detects birds only. Returns annotated image + detection list.

    - slice_size: tile size in pixels (default 512, matches WildLive config)
    - overlap: fractional overlap between slices (default 0.2 = 20%)
    - conf: minimum confidence to show (default 0.50)
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 50 MB).")

    try:
        pil_img = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image.")

    try:
        model = _get_sahi_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model unavailable: {e}")

    W, H = pil_img.size

    try:
        from sahi.predict import get_sliced_prediction
        t0 = time.perf_counter()
        result = get_sliced_prediction(
            pil_img,
            model,
            slice_height=slice_size,
            slice_width=slice_size,
            overlap_height_ratio=overlap,
            overlap_width_ratio=overlap,
            verbose=0,
            perform_standard_pred=True,
        )
        inference_ms = round((time.perf_counter() - t0) * 1000, 1)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {e}")

    # Filter to birds only at user confidence threshold
    detections = []
    for obj in result.object_prediction_list:
        label = obj.category.name.lower()
        if label != "bird":
            continue
        c = round(float(obj.score.value), 3)
        if c < conf:
            continue
        bbox = obj.bbox
        detections.append({
            "label": "bird",
            "confidence": c,
            "bbox": [round(bbox.minx, 1), round(bbox.miny, 1),
                     round(bbox.maxx, 1), round(bbox.maxy, 1)],
        })

    detections.sort(key=lambda x: x["confidence"], reverse=True)
    annotated_b64 = _draw_wildlive_boxes(pil_img, detections) or None

    return JSONResponse({
        "detections": detections,
        "total": len(detections),
        "inference_ms": inference_ms,
        "model": _model_name,
        "method": "SAHI sliced inference",
        "image_size": [W, H],
        "slice_size": slice_size,
        "overlap": overlap,
        "annotated_image": annotated_b64,
    })


def _capture_frame_from_url(stream_url: str) -> Image.Image:
    """
    Capture a single frame from a stream or snapshot URL.

    Supported formats:
    - Direct image URL (.jpg / .jpeg / .png) → fetched as a still image
    - YouTube live / Twitch / Vimeo  → resolved via yt-dlp then OpenCV
    - HLS (.m3u8), RTSP              → opened directly by OpenCV
    """
    import urllib.request

    low = stream_url.lower().split("?")[0]

    # ── Direct image snapshot (NOAA cams, MJPEG snapshots, etc.) ──
    if any(low.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp")):
        try:
            import ssl
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(stream_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
                data = resp.read()
            img = Image.open(io.BytesIO(data)).convert("RGB")
            return img
        except Exception as e:
            raise RuntimeError(f"Could not fetch image: {e}")

    # ── YouTube / platform streams → resolve via yt-dlp ──
    direct_url = stream_url
    if any(x in stream_url for x in ["youtube.com", "youtu.be", "twitch.tv", "vimeo.com"]):
        try:
            import yt_dlp
            ydl_opts = {
                "format": "best[height<=1080][ext=mp4]/best[height<=1080]/best",
                "quiet": True,
                "no_warnings": True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(stream_url, download=False)
                direct_url = info.get("url") or info.get("manifest_url") or stream_url
        except Exception as e:
            # Surface the original yt-dlp error clearly
            msg = str(e)
            if "Video unavailable" in msg:
                raise RuntimeError(
                    "YouTube stream is unavailable or offline. "
                    "Try a different live stream URL or paste an HLS/RTSP address directly."
                )
            raise RuntimeError(f"Could not resolve stream: {msg[:120]}")

    # ── HLS / RTSP / direct video → OpenCV ──
    cap = cv2.VideoCapture(direct_url)
    if not cap.isOpened():
        raise RuntimeError(
            "Could not open stream. Check the URL is a live/active HLS, RTSP, or direct video link."
        )

    for _ in range(3):
        cap.read()

    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        raise RuntimeError("Connected to stream but could not read a frame.")

    return Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))


@router.get("/live-detect")
async def live_detect(
    url: str = Query(..., description="Stream URL: YouTube live, HLS, RTSP, or direct video"),
    conf: float = Query(0.15, description="Minimum confidence threshold"),
    slice_size: int = Query(512, description="SAHI slice size in pixels"),
):
    """
    Capture one frame from a live stream or video URL, run SAHI bird
    detection, and return the annotated frame + detection list.

    Supports YouTube live, HLS (.m3u8), RTSP, and direct video URLs.
    """
    try:
        pil_img = _capture_frame_from_url(url)
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Frame capture error: {e}")

    W, H = pil_img.size

    try:
        model = _get_sahi_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model unavailable: {e}")

    try:
        from sahi.predict import get_sliced_prediction
        t0 = time.perf_counter()
        result = get_sliced_prediction(
            pil_img,
            model,
            slice_height=slice_size,
            slice_width=slice_size,
            overlap_height_ratio=0.2,
            overlap_width_ratio=0.2,
            verbose=0,
            perform_standard_pred=True,
        )
        inference_ms = round((time.perf_counter() - t0) * 1000, 1)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {e}")

    detections = []
    for obj in result.object_prediction_list:
        if obj.category.name.lower() != "bird":
            continue
        c = round(float(obj.score.value), 3)
        if c < conf:
            continue
        bbox = obj.bbox
        detections.append({
            "label": "bird",
            "confidence": c,
            "bbox": [round(bbox.minx, 1), round(bbox.miny, 1),
                     round(bbox.maxx, 1), round(bbox.maxy, 1)],
        })

    detections.sort(key=lambda x: x["confidence"], reverse=True)
    annotated_b64 = _draw_wildlive_boxes(pil_img, detections) or None

    return JSONResponse({
        "detections": detections,
        "total": len(detections),
        "inference_ms": inference_ms,
        "model": _model_name,
        "method": "SAHI sliced inference — live frame",
        "image_size": [W, H],
        "slice_size": slice_size,
        "annotated_image": annotated_b64,
        "source_url": url[:120],
    })
