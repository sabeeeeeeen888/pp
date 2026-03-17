import { useState, useRef, useCallback, useEffect } from 'react'
import './FeaturePage.css'
import './DetectionShared.css'
import './WildLivePage.css'

const API_BASE = 'http://localhost:8000'
const REPO_URL = 'https://github.com/dat-nguyenvn/DC12'
const PAPER_URL = 'https://drive.google.com/file/d/1F5pAptwMLmd78ZhzqTsXVDpK_v-hEeLC/view'
const SAMPLE_IMAGE_URL = '/tir_sample.jpg'


type Detection = {
  label: string
  confidence: number
  bbox: [number, number, number, number]
}

type TrackResult = {
  detections: Detection[]
  total: number
  inference_ms: number
  model: string
  method: string
  image_size: [number, number]
  slice_size: number
  overlap: number
  annotated_image: string | null
  _autoRetried?: boolean
}

const PIPELINE_STEPS = [
  { step: '01', title: 'Frame ingested', desc: 'Aerial image from UAV camera loaded at full resolution.' },
  { step: '02', title: 'SAHI slicing', desc: 'Image divided into overlapping tiles (default 512 px, 20% overlap) so small birds are never sub-pixel.' },
  { step: '03', title: 'YOLOv5 per tile', desc: 'YOLOv5s runs on every tile independently — each bird is seen at full size regardless of flight altitude.' },
  { step: '04', title: 'NMS merge', desc: 'Non-maximum suppression stitches tile results back to full-image coordinates and removes duplicates.' },
  { step: '05', title: 'Bird-only output', desc: 'Only "bird" class detections are returned with confidence scores and bounding boxes.' },
]

const CONF_DEFAULT = 0.50
const SLICE_DEFAULT = 512


export function WildLivePage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<TrackResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conf, setConf] = useState(CONF_DEFAULT)
  const [sliceSize, setSliceSize] = useState(SLICE_DEFAULT)
  const [modelReady, setModelReady] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)


  useEffect(() => {
    fetch(`${API_BASE}/api/wildlive/status`)
      .then((r) => r.json())
      .then((d) => setModelReady(d.status === 'ready'))
      .catch(() => setModelReady(false))
  }, [])


  const handleFile = useCallback((f: File) => {
    setFile(f)
    setResult(null)
    setError(null)
    setPreview(URL.createObjectURL(f))
  }, [])

  const loadSample = async () => {
    try {
      const res = await fetch(SAMPLE_IMAGE_URL)
      const blob = await res.blob()
      handleFile(new File([blob], 'sample.jpg', { type: 'image/jpeg' }))
    } catch {
      setError('Could not load sample image.')
    }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('image/')) handleFile(f)
  }

  const runTracking = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const url = `${API_BASE}/api/wildlive/track?conf=${conf}&slice_size=${sliceSize}&overlap=0.2`
      const res = await fetch(url, { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        const detail = err.detail
        throw new Error(
          Array.isArray(detail)
            ? detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join('; ')
            : typeof detail === 'string' ? detail : JSON.stringify(detail)
        )
      }
      const data: TrackResult = await res.json()
      // Auto-retry at minimum conf if no detections
      if (data.total === 0 && conf > 0.05) {
        const form2 = new FormData()
        form2.append('file', file)
        const res2 = await fetch(
          `${API_BASE}/api/wildlive/track?conf=0.05&slice_size=${sliceSize}&overlap=0.2`,
          { method: 'POST', body: form2 }
        )
        if (res2.ok) {
          const data2: TrackResult = await res2.json()
          if (data2.total > 0) {
            setResult({ ...data2, _autoRetried: true })
            return
          }
        }
      }
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setFile(null); setPreview(null); setResult(null); setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const confColor = (c: number) => c >= 0.7 ? '#86efac' : c >= 0.45 ? '#fde047' : '#fca5a5'

  return (
    <div className="feature-page">

      {/* Header */}
      <div className="feature-header">
        <div className="wl-header-row">
          <div>
            <h1>WildLive Tracker</h1>
            <p className="tagline">
              Near real-time visual wildlife tracking onboard UAVs · SAHI + YOLOv5 · birds only
            </p>
          </div>
          <div className="wl-header-links">
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="tir-github-btn">
              <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
            <a href={PAPER_URL} target="_blank" rel="noopener noreferrer" className="tir-github-btn">
              Paper
            </a>
          </div>
        </div>
      </div>

      {/* Status + key facts */}
      <div className="tir-status-row">
        <span className={`tir-status-pill ${modelReady === true ? 'ready' : modelReady === false ? 'unavailable' : 'checking'}`}>
          {modelReady === true ? '● SAHI + YOLOv5 ready' : modelReady === false ? '● Model unavailable' : '● Checking…'}
        </span>
        <span className="muted">WildDrone project · CVPR 2025 · Jetson Orin AGX · birds only</span>
      </div>

      {/* About */}
      <div className="feature-section">
        <h2>About WildLive</h2>
        <p>
          WildLive is an ultra-fast wildlife tracking system designed to run directly onboard a UAV (Jetson Orin AGX),
          providing near real-time detection and tracking without sending data to a ground station.
          It uses <strong>SAHI</strong> (Slicing Aided Hyper Inference) to handle the challenge of detecting
          small animals from altitude — the image is sliced into overlapping tiles so each animal is seen
          at full resolution by the detector.
        </p>
        <p>
          Published at the <strong>5th CV4Animals Workshop, CVPR 2025</strong> as part of the WildDrone project.
        </p>
      </div>


      {/* Upload */}
      <div className="feature-section">
        <h2>Run SAHI detection</h2>

        <div
          className={`tir-dropzone${file ? ' tir-dropzone-has-file' : ''}`}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onInputChange} />
          {file ? (
            <>
              <span className="tir-drop-filename">{file.name}</span>
              <span className="muted" style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}>Click to change image</span>
            </>
          ) : (
            <>
              <span className="tir-drop-icon">↑</span>
              <span className="tir-drop-label">Drop an aerial image or click to browse</span>
              <span className="muted">JPEG, PNG, WebP</span>
            </>
          )}
        </div>

        {!file && (
          <div className="tir-sample-row">
            <span className="muted">No image?&nbsp;</span>
            <button className="btn-secondary tir-sample-btn" onClick={loadSample}>Try sample image</button>
          </div>
        )}

        {/* Controls */}
        <div className="wl-controls-row">
          <label className="tir-conf-label">
            Confidence: <strong>{conf.toFixed(2)}</strong>
            <input type="range" min="0.05" max="0.95" step="0.05" value={conf}
              onChange={(e) => setConf(parseFloat(e.target.value))} className="tir-conf-slider" />
          </label>
          <label className="tir-conf-label">
            Slice size: <strong>{sliceSize} px</strong>
            <input type="range" min="256" max="1024" step="128" value={sliceSize}
              onChange={(e) => setSliceSize(parseInt(e.target.value))} className="tir-conf-slider" />
          </label>
          <div className="tir-action-btns">
            <button className="btn-primary" onClick={runTracking} disabled={!file || loading}>
              {loading ? 'Running SAHI…' : 'Detect birds'}
            </button>
            {file && <button className="btn-secondary" onClick={reset}>Clear</button>}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && <div className="tir-error-box">{error}</div>}

      {/* Loading */}
      {loading && (
        <div className="tir-loading-box">
          <span className="tir-spinner" />
          Running SAHI sliced inference — tiling image for small-bird detection…
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="feature-section">
          {result._autoRetried && (
            <div className="tir-autoretry-notice">Auto-retried at confidence 0.05 — results shown at minimum threshold</div>
          )}

          {/* Stats */}
          <div className="tir-result-stats">
            <div className="tir-result-stat">
              <span className="tir-stat-val tir-wildlife-count">{result.total}</span>
              <span className="tir-stat-lbl">Birds detected</span>
            </div>
            <div className="tir-result-stat">
              <span className="tir-stat-val">{result.inference_ms} ms</span>
              <span className="tir-stat-lbl">Inference time</span>
            </div>
            <div className="tir-result-stat">
              <span className="tir-stat-val">{result.image_size[0]}×{result.image_size[1]}</span>
              <span className="tir-stat-lbl">Image size</span>
            </div>
            <div className="tir-result-stat">
              <span className="tir-stat-val">{result.slice_size} px</span>
              <span className="tir-stat-lbl">Slice size</span>
            </div>
            <div className="tir-result-stat">
              <span className="tir-stat-val">{(result.overlap * 100).toFixed(0)}%</span>
              <span className="tir-stat-lbl">Tile overlap</span>
            </div>
          </div>

          {/* Annotated image */}
          {result.annotated_image ? (
            <div className="tir-annotated-wrap">
              <img src={`data:image/jpeg;base64,${result.annotated_image}`} alt="WildLive detections" className="tir-annotated-img" />
            </div>
          ) : preview && (
            <div className="tir-annotated-wrap">
              <img src={preview} alt="Uploaded" className="tir-annotated-img" />
              {result.total === 0 && (
                <div className="tir-no-detect-overlay">No birds detected above threshold {conf.toFixed(2)}</div>
              )}
            </div>
          )}

          {/* Table */}
          {result.detections.length > 0 && (
            <div className="feature-table-wrap" style={{ marginTop: '1rem' }}>
              <table className="feature-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Label</th>
                    <th>Confidence</th>
                    <th>Bounding box</th>
                  </tr>
                </thead>
                <tbody>
                  {result.detections.map((d, i) => (
                    <tr key={i} className="tir-row-wildlife">
                      <td className="muted">{i + 1}</td>
                      <td><strong>bird</strong></td>
                      <td style={{ color: confColor(d.confidence) }}>{(d.confidence * 100).toFixed(1)}%</td>
                      <td className="muted" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        [{d.bbox.map((v) => v.toFixed(0)).join(', ')}]
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.total === 0 && (
            <div className="tir-zero-help">
              <strong>No birds detected above confidence {conf.toFixed(2)}</strong>
              <ul>
                <li>Lower the confidence threshold and run again</li>
                <li>Try a smaller slice size (256 px) for very distant/small birds</li>
                <li>Use a clearer aerial image with visible birds</li>
              </ul>
            </div>
          )}
        </div>
      )}


    </div>
  )
}
