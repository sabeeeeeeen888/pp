import { useState, useRef } from 'react'
import { classifyAerialImage } from '../api'
import './AIClassify.css'

const LABELS = ['High-density colony', 'Low-density colony', 'No colony'] as const

/** Demo result when backend is down or returns 404 — same file always gets same label. */
function demoClassify(file: File): { label: string; confidence: number } {
  const n = file.size + (file.name.length * 7)
  const i = n % LABELS.length
  const label = LABELS[i]
  const confidence = 0.72 + (n % 25) / 100
  return { label, confidence }
}

export function AIClassify({ apiConnected }: { apiConnected: boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ label: string; confidence: number; demo?: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFile(f || null)
    setResult(null)
    setErr(null)
  }

  const handleClassify = async () => {
    if (!file) return
    setLoading(true)
    setErr(null)
    setResult(null)
    try {
      const res = await classifyAerialImage(file)
      setResult({ label: res.label, confidence: res.confidence, demo: false })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Classification failed'
      const isOffline = msg === 'Failed to fetch' || msg.toLowerCase().includes('fetch')
      if (isOffline && !apiConnected) {
        const demo = demoClassify(file)
        setResult({ ...demo, demo: true })
        setErr(null)
      } else {
        setErr(apiConnected
          ? `Classification error: ${msg}. Try restarting the backend (uvicorn app.main:app --port 8000).`
          : msg === 'Failed to fetch'
            ? 'Backend not reachable. Start the API, then click "Connect to backend" at the top.'
            : msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="ai-classify">
      <h3>AI: Classify aerial image</h3>
      <p className="ai-classify-desc">
        Upload an aerial image to classify as <strong>High-density</strong>, <strong>Low-density</strong>, or <strong>No colony</strong>. Scales to 400k+ archive.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="ai-classify-input"
      />
      <div className="ai-classify-actions">
        <button
          type="button"
          className="api-banner-btn"
          disabled={!file || loading}
          onClick={handleClassify}
        >
          {loading ? 'Classifying…' : 'Classify image'}
        </button>
      </div>
      {!apiConnected && <p className="ai-classify-muted">Start the backend and click &quot;Connect to backend&quot; (top of page) so map data and AI classification both use the server.</p>}
      {err && <p className="ai-classify-error">{err}</p>}
      {result && (
        <div className="ai-classify-result">
          {result.demo ? (
            <span className="ai-classify-demo">Demo result (backend not connected)</span>
          ) : (
            <span className="ai-classify-ai">AI result</span>
          )}
          <span className="ai-classify-label">{result.label}</span>
          <span className="ai-classify-conf">{(result.confidence * 100).toFixed(0)}% confidence</span>
        </div>
      )}
    </section>
  )
}
