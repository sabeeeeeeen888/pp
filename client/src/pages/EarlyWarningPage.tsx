import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import { fetchEarlyWarning, computeEarlyWarningFromScores, fillDeltaxFieldsIfMissing } from '../api'
import { FALLBACK_RISK_SCORES } from '../fallbackData'
import type { EarlyWarningRow } from '../api'
import './FeaturePage.css'

const SIGNAL_LABELS: Record<string, string> = {
  elevation_loss: 'Elevation loss',
  sediment_starvation: 'Sediment starvation',
  shoreline_stress: 'Shoreline stress',
  water_pooling: 'Water pooling',
  colony_decline: 'Colony decline',
}

export function EarlyWarningPage() {
  const { user } = useAuth()
  const roleConfig = getRoleConfig(user?.role)
  const [rows, setRows] = useState<EarlyWarningRow[]>([])
  const [loading, setLoading] = useState(true)
  const [howItWorksOpen, setHowItWorksOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchEarlyWarning()
      .then(setRows)
      .catch(async () => {
        try {
          const { fetchRiskScores } = await import('../api')
          const scores = await fetchRiskScores({})
          const filled = fillDeltaxFieldsIfMissing(Array.isArray(scores) ? scores : [])
          setRows(computeEarlyWarningFromScores(filled as Array<Record<string, unknown>>))
        } catch {
          const filled = fillDeltaxFieldsIfMissing(FALLBACK_RISK_SCORES)
          setRows(computeEarlyWarningFromScores(filled as Array<Record<string, unknown>>))
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const flagged = rows.filter((r) => r.early_warning)
  const sorted = [...rows].sort(
    (a, b) => (a.early_warning ? 0 : 1) - (b.early_warning ? 0 : 1) || b.collapse_risk_score - a.collapse_risk_score
  )

  if (!roleConfig.canEarlyWarning) {
    return (
      <div className="feature-page">
        <header className="feature-header">
          <h1>Early warning collapse detection</h1>
        </header>
        <p className="muted" style={{ marginTop: '1rem' }}>
          This page is available to <strong>Research / Agency</strong> accounts. Sign in with that role to view the early-warning table and predictive modeling.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <Link to="/explore" className="feature-link">← Back to Explore</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="feature-page">
      <header className="feature-header">
        <h1>Early warning collapse detection (AI-based)</h1>
        <p className="tagline">
          Detect precursor signals and predict collapse risk 1–3 years ahead. A working predictive early-warning system.
        </p>
      </header>

      <section className="feature-section early-warning-dropdown-section">
        <button
          type="button"
          className="early-warning-dropdown-trigger"
          onClick={() => setHowItWorksOpen((o) => !o)}
          aria-expanded={howItWorksOpen}
        >
          <h2 className="early-warning-dropdown-title">How it works</h2>
          <span className="early-warning-dropdown-chevron" aria-hidden>{howItWorksOpen ? '▼' : '▶'}</span>
        </button>
        {howItWorksOpen && (
          <div className="early-warning-dropdown-content">
            <p>
              The system flags colonies using <strong>precursor signals</strong> derived from existing data. Each colony is scored for:
            </p>
            <ul>
              <li><strong>Elevation loss</strong> — elevation-decline rate above threshold (subsidence risk)</li>
              <li><strong>Sediment starvation</strong> — low sediment deposition rate</li>
              <li><strong>Shoreline stress</strong> — colony in sinking (land-loss) zone</li>
              <li><strong>Water pooling</strong> — high water-surface variability (inundation risk)</li>
              <li><strong>Colony decline</strong> — nest count drop over the time series</li>
            </ul>
            <p>
              A <strong>collapse risk score</strong> (0–1) combines signal count and habitat vulnerability. Colonies with High or Medium risk, or with 2+ signals, are flagged for early warning. Data comes from the risk model and land-loss zones; export and map links use the same pipeline as Explore and Delta-X.
            </p>
          </div>
        )}
      </section>

      <section className="feature-section">
        <h2>Flagged colonies</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: '0.75rem' }}>
              {flagged.length} of {rows.length} colonies flagged for early warning (collapse risk 1–3 years ahead).
            </p>
            <div className="feature-table-wrap">
              <table className="feature-table">
                <thead>
                  <tr>
                    <th>Colony</th>
                    <th>Risk</th>
                    <th>Collapse risk (1–3 yr)</th>
                    <th>Precursor signals</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, 40).map((r) => (
                    <tr key={r.colony_id} className={r.early_warning ? 'early-warning-row' : ''}>
                      <td>{r.colony_id}</td>
                      <td>
                        <span className={`risk-badge risk-${r.risk_category.toLowerCase()}`}>{r.risk_category}</span>
                      </td>
                      <td>
                        <span className={`collapse-risk collapse-${r.collapse_risk.toLowerCase()}`}>
                          {r.collapse_risk}
                        </span>
                        <span className="muted"> ({((r.collapse_risk_score ?? 0) * 100).toFixed(0)}%)</span>
                      </td>
                      <td>
                        <div className="signals-list">
                          {r.signals.length ? (
                            r.signals.map((s) => (
                              <span key={s} className="signal-badge">
                                {SIGNAL_LABELS[s] ?? s}
                              </span>
                            ))
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <Link
                          to={`/explore?landLoss=1&colony=${encodeURIComponent(r.colony_id)}`}
                          className="feature-link"
                        >
                          Map
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="feature-section">
        <h2>Use the data</h2>
        <p>
          <Link to="/explore?landLoss=1" className="feature-link">Explore the map</Link> with land-loss overlay to see where flagged colonies sit. <Link to="/deltax" className="feature-link">Delta-X</Link> and <Link to="/priorities" className="feature-link">Priorities</Link> provide the underlying risk and vulnerability metrics that feed this early-warning system.
        </p>
      </section>
    </div>
  )
}
