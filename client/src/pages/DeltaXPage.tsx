import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import { fetchRiskScores, fetchDeltaxSummary, buildDeltaxSummaryFromScores, fillDeltaxFieldsIfMissing } from '../api'
import { FALLBACK_RISK_SCORES } from '../fallbackData'
import { getCoverageTierLabel, getCoverageBadge } from '../utils/coverageTier'
import type { RiskScore } from '../types'
import type { DeltaxSummary } from '../api'
import './FeaturePage.css'
import './DeltaXPage.css'

function exportDeltaxCSV(rows: RiskScore[]) {
  const headers = [
    'colony_id', 'latitude', 'longitude', 'risk_category', 'habitat_vulnerability',
    'elevation_m_navd88', 'sediment_accretion_mm_year', 'biomass_g_m2', 'water_surface_height_m',
    'elevation_decline_rate', 'sediment_deposition_rate', 'vegetation_health', 'water_surface_variability',
    'deltax_trend', 'datasets_used', 'deltax_coverage_tier',
  ]
  const data = rows.map((r) => [
    r.colony_id, r.latitude, r.longitude, r.risk_category,
    r.habitat_vulnerability != null ? (r.habitat_vulnerability * 100).toFixed(0) : '',
    r.elevation_m_navd88 ?? '',
    r.sediment_accretion_mm_year ?? '',
    r.biomass_g_m2 ?? '',
    r.water_surface_height_m ?? '',
    r.elevation_decline_rate ?? '',
    r.sediment_deposition_rate ?? '',
    r.vegetation_health ?? '',
    r.water_surface_variability ?? '',
    r.deltax_trend ?? '',
    r.datasets_used ?? '',
    r.deltax_coverage_tier ?? '',
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
            <a href="https://deltax.jpl.nasa.gov" target="_blank" rel="noopener noreferrer">Delta-X</a> studies the Mississippi River Delta (Atchafalaya growing, Terrebonne sinking). Project Pelican overlays colonies on land-loss zones and uses Delta-X predictors in the risk score.
          </p>
          {summary?.real_deltax_data_loaded && (
            <p className="deltax-panel-desc deltax-real-data-note">
              ✓ <strong>Real NASA data loaded</strong> — subsidence rates from{' '}
              <a href="https://daac.ornl.gov/cgi-bin/dsviewer.pl?ds_id=2307" target="_blank" rel="noopener noreferrer">
                doi:10.3334/ORNLDAAC/2307
              </a>. Growing/sinking classification and elevation decline values are real measurements.
            </p>
          )}
          {summary && !summary.real_deltax_data_loaded && (
            <p className="deltax-panel-desc deltax-coverage-note">
              <strong>Coverage tiers:</strong> Colonies inside the Delta-X bounding box are labeled{' '}
              <span className="coverage-tier-inline">Delta-X (high precision)</span>. Colonies outside use{' '}
              <span className="coverage-tier-inline noaa">NOAA fallback (moderate precision)</span>.{' '}
              To load real NASA data, run <code>python scripts/sample_deltax_subsidence.py</code>.
            </p>
          )}
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
                    <th>Coverage</th>
                    <th>Risk</th>
                    <th>Vuln.</th>
                    <th title="RTK GPS elevation above NAVD88 — doi:10.3334/ORNLDAAC/2071">Elev. (m)</th>
                    <th title="Feldspar sediment accretion rate — doi:10.3334/ORNLDAAC/2381">Sed. mm/yr</th>
                    <th title="Aboveground biomass — doi:10.3334/ORNLDAAC/2237">Biomass g/m²</th>
                    <th title="AirSWOT water surface height — doi:10.3334/ORNLDAAC/2128">Water (m)</th>
                    <th>Trend</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.slice(0, 25).map((r) => (
                    <tr key={r.colony_id}>
                      <td><Link to={`/colony/${encodeURIComponent(r.colony_id)}`} className="deltax-link">{r.colony_id}</Link></td>
                      <td>
                        <span
                          className="coverage-tier-badge"
                          title={getCoverageTierLabel(r.latitude, r.longitude, r.deltax_coverage_tier)}
                        >
                          {getCoverageBadge(r.latitude, r.longitude, r.deltax_coverage_tier)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`risk-badge risk-${r.risk_category.toLowerCase()}`}
                          title={[
                            r.habitat_vulnerability != null ? `Habitat vulnerability: ${(r.habitat_vulnerability * 100).toFixed(0)}%` : null,
                            r.elevation_m_navd88 != null ? `RTK elevation: ${r.elevation_m_navd88.toFixed(3)} m NAVD88` : null,
                            r.sediment_accretion_mm_year != null ? `Sediment accretion: ${r.sediment_accretion_mm_year.toFixed(1)} mm/yr` : null,
                            r.biomass_g_m2 != null ? `Biomass: ${r.biomass_g_m2.toFixed(0)} g/m²` : null,
                            r.water_surface_height_m != null ? `Water height: ${r.water_surface_height_m.toFixed(2)} m` : null,
                          ].filter(Boolean).join(' · ')}
                        >
                          {r.risk_category}
                        </span>
                      </td>
                      <td>{r.habitat_vulnerability != null ? `${(r.habitat_vulnerability * 100).toFixed(0)}%` : '—'}</td>
                      {/* RTK elevation — low = sinking risk */}
                      <td className={r.elevation_m_navd88 != null ? (r.elevation_m_navd88 < 0 ? 'deltax-sinking-val' : r.elevation_m_navd88 > 0.3 ? 'deltax-growing-val' : '') : ''}>
                        {r.elevation_m_navd88 != null ? r.elevation_m_navd88.toFixed(3) : '—'}
                      </td>
                      {/* Sediment accretion — low = starvation risk */}
                      <td className={r.sediment_accretion_mm_year != null ? (r.sediment_accretion_mm_year < 2 ? 'deltax-sinking-val' : r.sediment_accretion_mm_year >= 5 ? 'deltax-growing-val' : '') : ''}>
                        {r.sediment_accretion_mm_year != null ? r.sediment_accretion_mm_year.toFixed(1) : '—'}
                      </td>
                      {/* Biomass — low = vegetation loss risk */}
                      <td className={r.biomass_g_m2 != null ? (r.biomass_g_m2 < 300 ? 'deltax-sinking-val' : r.biomass_g_m2 > 1000 ? 'deltax-growing-val' : '') : ''}>
                        {r.biomass_g_m2 != null ? r.biomass_g_m2.toFixed(0) : '—'}
                      </td>
                      {/* Water height — high = inundation risk */}
                      <td className={r.water_surface_height_m != null ? (r.water_surface_height_m > 1.5 ? 'deltax-sinking-val' : r.water_surface_height_m < 0.5 ? 'deltax-growing-val' : '') : ''}>
                        {r.water_surface_height_m != null ? r.water_surface_height_m.toFixed(2) : '—'}
                      </td>
                      <td>
                        {r.deltax_trend === 'growing' && <span className="deltax-trend-badge growing">▲ Growing</span>}
                        {r.deltax_trend === 'sinking' && <span className="deltax-trend-badge sinking">▼ Sinking</span>}
                        {r.deltax_trend === 'stable' && <span className="deltax-trend-badge stable">● Stable</span>}
                        {(!r.deltax_trend || r.deltax_trend === 'unknown') && <span className="deltax-trend-badge unknown">—</span>}
                      </td>
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
