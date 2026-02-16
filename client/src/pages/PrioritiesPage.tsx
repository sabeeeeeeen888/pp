import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import { fetchRiskScores } from '../api'
import { FALLBACK_RISK_SCORES } from '../fallbackData'
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

export function PrioritiesPage() {
  const { user } = useAuth()
  const roleConfig = getRoleConfig(user?.role)
  const [data, setData] = useState<RiskScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'high' | 'moderate' | 'low'>('high')
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

  const filtered = data.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'high') return r.risk_category === 'High'
    if (filter === 'moderate') return r.risk_category === 'Moderate'
    return r.risk_category === 'Low'
  }).sort((a, b) => b.habitat_risk_score - a.habitat_risk_score)

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
        {roleConfig.canExport && (
          <button type="button" className="priorities-export-btn" onClick={() => exportRiskDataCSV(filtered)} disabled={loading || filtered.length === 0}>
            Export CSV
          </button>
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
                  <td>{r.colony_id}</td>
                  <td>
                    <span className={`risk-badge risk-${r.risk_category.toLowerCase()}`}>
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
