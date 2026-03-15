import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import { fetchRiskScores } from '../api'
import { FALLBACK_RISK_SCORES } from '../fallbackData'
import { exportTablePDF } from '../utils/pdfExport'
import { getCoverageTierLabel, getCoverageBadge } from '../utils/coverageTier'
import type { RiskScore } from '../types'
import './PrioritiesPage.css'

function exportRiskDataCSV(data: RiskScore[]) {
  const headers = ['colony_id', 'latitude', 'longitude', 'risk_category', 'habitat_risk_score', 'species_richness', 'decline_rate', 'habitat_vulnerability']
  const rows = data.map((r) => [
    r.colony_id,
    r.latitude,
    r.longitude,
    r.risk_category,
    (r.habitat_risk_score * 100).toFixed(1),
    r.species_richness,
    r.decline_rate.toFixed(0),
    r.habitat_vulnerability != null ? (r.habitat_vulnerability * 100).toFixed(0) : '',
  ])
  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `priorities-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function exportPrioritiesPDF(data: RiskScore[], filterLabel: string, speciesLabel: string) {
  const filterSummary = `${filterLabel}${speciesLabel ? ` · Species: ${speciesLabel}` : ''}`
  exportTablePDF({
    title: 'Restoration Priorities',
    filterSummary,
    headers: ['Colony', 'Risk', 'Score', 'Habitat vuln.', 'Species richness', 'Decline rate', 'Species (sample)'],
    rows: data.map((r) => [
      r.colony_id,
      r.risk_category,
      `${(r.habitat_risk_score * 100).toFixed(1)}%`,
      r.habitat_vulnerability != null ? `${(r.habitat_vulnerability * 100).toFixed(0)}%` : '—',
      String(r.species_richness),
      r.decline_rate.toFixed(0),
      (r.species_list ?? []).slice(0, 3).join(', ') + ((r.species_list?.length ?? 0) > 3 ? '…' : ''),
    ]),
    filename: `priorities-${new Date().toISOString().slice(0, 10)}.pdf`,
  })
}

export function PrioritiesPage() {
  const { user } = useAuth()
  const roleConfig = getRoleConfig(user?.role)
  const [data, setData] = useState<RiskScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'high' | 'moderate' | 'low'>('high')
  const [speciesFilter, setSpeciesFilter] = useState<string>('')
  const [shareCopied, setShareCopied] = useState(false)
  const copyShareLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchRiskScores({})
      .then(setData)
      .catch(() => setData(FALLBACK_RISK_SCORES))
      .finally(() => setLoading(false))
  }, [])

  const speciesList = Array.from(new Set(data.flatMap((r) => r.species_list ?? []))).sort()

  const filtered = data
    .filter((r) => {
      if (filter === 'high' && r.risk_category !== 'High') return false
      if (filter === 'moderate' && r.risk_category !== 'Moderate') return false
      if (filter === 'low' && r.risk_category !== 'Low') return false
      if (speciesFilter && !(r.species_list ?? []).includes(speciesFilter)) return false
      return true
    })
    .sort((a, b) => b.habitat_risk_score - a.habitat_risk_score)

  if (!roleConfig.canPriorities) {
    return (
      <div className="priorities-page">
        <header className="priorities-header">
          <h1>Restoration priorities</h1>
        </header>
        <p className="muted" style={{ marginTop: '1rem' }}>
          This page is available to <strong>Research / Agency</strong> accounts. Sign in with that role to view and export the priority list.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <Link to="/explore" className="feature-link">← Back to Explore</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="priorities-page">
      <header className="priorities-header">
        <h1>Restoration priorities</h1>
        <p className="tagline">Colonies ranked by habitat risk for restoration planning</p>
      </header>
      <div className="priorities-toolbar">
        <label>
          <span>Show</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="high">High priority only</option>
            <option value="moderate">Moderate only</option>
            <option value="low">Low only</option>
            <option value="all">All colonies</option>
          </select>
        </label>
        <label>
          <span>Species</span>
          <select value={speciesFilter} onChange={(e) => setSpeciesFilter(e.target.value)}>
            <option value="">All species</option>
            {speciesList.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        {roleConfig.canExport && (
          <>
            <button type="button" className="priorities-export-btn" onClick={() => exportRiskDataCSV(filtered)} disabled={loading || filtered.length === 0}>
              Export CSV
            </button>
            <button type="button" className="priorities-export-btn" onClick={() => exportPrioritiesPDF(filtered, filter === 'high' ? 'High priority only' : filter === 'moderate' ? 'Moderate only' : filter === 'low' ? 'Low only' : 'All colonies', speciesFilter || 'All species')} disabled={loading || filtered.length === 0}>
              Export PDF
            </button>
          </>
        )}
        {roleConfig.canShareLink && (
          <button type="button" className="priorities-export-btn" onClick={copyShareLink}>
            {shareCopied ? 'Copied!' : 'Copy link'}
          </button>
        )}
      </div>
      {loading ? (
        <p className="priorities-loading">Loading…</p>
      ) : error ? (
        <p className="priorities-error">{error}</p>
      ) : (
        <div className="priorities-table-wrap">
          <table className="priorities-table">
            <thead>
              <tr>
                <th>Colony</th>
                <th>Coverage</th>
                <th>Risk</th>
                <th>Score</th>
                <th>Habitat vuln.</th>
                <th>Species richness</th>
                <th>Decline rate</th>
                <th>Species (sample)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.colony_id}>
                  <td><Link to={`/colony/${encodeURIComponent(r.colony_id)}`} className="feature-link">{r.colony_id}</Link></td>
                  <td>
                    <span
                      className="coverage-tier-badge"
                      title={getCoverageTierLabel(r.latitude, r.longitude, (r as {deltax_coverage_tier?: string}).deltax_coverage_tier)}
                    >
                      {getCoverageBadge(r.latitude, r.longitude, (r as {deltax_coverage_tier?: string}).deltax_coverage_tier)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`risk-badge risk-${r.risk_category.toLowerCase()}`}
                      title={[
                        r.habitat_vulnerability != null ? `Habitat vulnerability: ${(r.habitat_vulnerability * 100).toFixed(0)}%` : null,
                        (r as {subsidence_rate_mm_year?: number | null}).subsidence_rate_mm_year != null ? `Subsidence: ${((r as {subsidence_rate_mm_year?: number}).subsidence_rate_mm_year as number).toFixed(2)} mm/yr` : null,
                        r.elevation_decline_rate != null ? `Elevation decline: ${r.elevation_decline_rate.toFixed(2)}` : null,
                        r.sediment_deposition_rate != null ? `Sediment: ${r.sediment_deposition_rate.toFixed(2)}` : null,
                        r.water_surface_variability != null ? `Water variability: ${r.water_surface_variability.toFixed(2)}` : null,
                      ].filter(Boolean).join(' · ')}
                    >
                      {r.risk_category}
                    </span>
                  </td>
                  <td>{(r.habitat_risk_score * 100).toFixed(1)}%</td>
                  <td>{r.habitat_vulnerability != null ? `${(r.habitat_vulnerability * 100).toFixed(0)}%` : '—'}</td>
                  <td>{r.species_richness}</td>
                  <td>{r.decline_rate.toFixed(0)}</td>
                  <td>{r.species_list.slice(0, 3).join(', ')}{r.species_list.length > 3 ? '…' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="priorities-empty">No colonies match the filter.</p>}
        </div>
      )}
    </div>
  )
}
