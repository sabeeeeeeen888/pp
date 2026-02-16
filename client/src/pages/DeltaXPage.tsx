import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import { fetchRiskScores, fetchDeltaxSummary, buildDeltaxSummaryFromScores, fillDeltaxFieldsIfMissing } from '../api'
import { FALLBACK_RISK_SCORES } from '../fallbackData'
import type { RiskScore } from '../types'
import type { DeltaxSummary } from '../api'
import './FeaturePage.css'
import './DeltaXPage.css'

function exportDeltaxCSV(rows: RiskScore[]) {
  const headers = ['colony_id', 'latitude', 'longitude', 'risk_category', 'habitat_vulnerability', 'elevation_decline_rate', 'sediment_deposition_rate', 'water_surface_variability', 'in_sinking_zone']
  const LON_SINKING = -91.2
  const data = rows.map((r) => [
    r.colony_id,
    r.latitude,
    r.longitude,
    r.risk_category,
    r.habitat_vulnerability != null ? (r.habitat_vulnerability * 100).toFixed(0) : '',
    r.elevation_decline_rate ?? '',
    r.sediment_deposition_rate ?? '',
    r.water_surface_variability ?? '',
    r.longitude >= LON_SINKING ? 'Y' : 'N',
  ])
  const csv = [headers.join(','), ...data.map((row) => row.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `deltax-colonies-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function DeltaXPage() {
  const { user } = useAuth()
  const roleConfig = getRoleConfig(user?.role)
  const [data, setData] = useState<RiskScore[]>([])
  const [summary, setSummary] = useState<DeltaxSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchRiskScores({}), fetchDeltaxSummary()])
      .then(([scores, sum]) => {
        const raw = Array.isArray(scores) && scores.length > 0 ? scores : FALLBACK_RISK_SCORES
        const list = fillDeltaxFieldsIfMissing(raw)
        setData(list)
        setSummary(sum ?? buildDeltaxSummaryFromScores(list))
      })
      .catch(() => {
        const list = fillDeltaxFieldsIfMissing(FALLBACK_RISK_SCORES)
        setData(list)
        setSummary(buildDeltaxSummaryFromScores(list))
      })
      .finally(() => setLoading(false))
  }, [])

  const tableRows = [...data].sort((a, b) => (b.habitat_vulnerability ?? 0) - (a.habitat_vulnerability ?? 0) || b.habitat_risk_score - a.habitat_risk_score)
  const handleExport = useCallback(() => exportDeltaxCSV(tableRows), [tableRows])

  return (
    <div className="deltax-dashboard">
      <header className="deltax-dashboard-header">
        <h1 className="deltax-dashboard-title">Delta-X</h1>
        <p className="deltax-dashboard-tagline">
          Habitat risk includes elevation, sediment, and water predictors — predictive ecosystem intelligence.
        </p>
      </header>

      <div className="deltax-dashboard-grid">
        {/* Left panel: Status & context */}
        <aside className="deltax-panel deltax-panel-status">
          <div className="deltax-panel-head">
            <h2 className="deltax-panel-title">Status</h2>
          </div>
          <div className="deltax-status-list">
            <div className="deltax-status-item deltax-status-growing">
              <span className="deltax-status-label">Growing zone</span>
              <span className="deltax-status-value">{summary?.colonies_in_growing_zone ?? '—'}</span>
            </div>
            <div className="deltax-status-item deltax-status-sinking">
              <span className="deltax-status-label">Sinking zone</span>
              <span className="deltax-status-value">{summary?.colonies_in_sinking_zone ?? '—'}</span>
            </div>
          </div>
          <p className="deltax-panel-desc">
            <a href="https://deltax.jpl.nasa.gov" target="_blank" rel="noopener noreferrer">Delta-X</a> studies the Mississippi River Delta (Atchafalaya growing, Terrebonne sinking). Project Pelican overlays colonies on land-loss zones and uses Delta-X–style predictors in the risk score.
          </p>
          <p className="deltax-panel-cta">
            <Link to="/explore?landLoss=1" className="deltax-link">Open the map with land-loss zones →</Link>
            <span className="deltax-panel-cta-note">Colonies overlaid on growing (green) vs sinking (red) areas.</span>
          </p>
        </aside>

        {/* Right panel: Analytics & colony table */}
        <main className="deltax-panel deltax-panel-analytics">
          <div className="deltax-panel-head">
            <h2 className="deltax-panel-title">Analytics</h2>
            {roleConfig.canExport && (
              <button
                type="button"
                className="deltax-export-btn"
                onClick={handleExport}
                disabled={loading || data.length === 0}
              >
                Export CSV
              </button>
            )}
          </div>
          <p className="deltax-panel-desc">
            Shows every colony with its risk and Delta-X–style predictors (elevation decline, sediment, water variability). Use Export CSV to download the data, or click Map to open the map with land-loss zones and focus on that colony.
          </p>
          {loading ? (
            <p className="deltax-muted">Loading…</p>
          ) : data.length === 0 ? (
            <p className="deltax-muted">No colony data loaded. Start the backend (see Explore page) and refresh.</p>
          ) : (
            <div className="deltax-table-wrap">
              <table className="deltax-table">
                <thead>
                  <tr>
                    <th>Colony</th>
                    <th>Risk</th>
                    <th>Habitat vuln.</th>
                    <th>Elev. decline</th>
                    <th>Sediment</th>
                    <th>Water var.</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.slice(0, 25).map((r) => (
                    <tr key={r.colony_id}>
                      <td>{r.colony_id}</td>
                      <td><span className={`risk-badge risk-${r.risk_category.toLowerCase()}`}>{r.risk_category}</span></td>
                      <td>{r.habitat_vulnerability != null ? `${(r.habitat_vulnerability * 100).toFixed(0)}%` : '—'}</td>
                      <td>{r.elevation_decline_rate?.toFixed(2) ?? '—'}</td>
                      <td>{r.sediment_deposition_rate?.toFixed(2) ?? '—'}</td>
                      <td>{r.water_surface_variability?.toFixed(2) ?? '—'}</td>
                      <td>
                        <Link to={`/explore?landLoss=1&colony=${encodeURIComponent(r.colony_id)}`} className="deltax-link">Map</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
