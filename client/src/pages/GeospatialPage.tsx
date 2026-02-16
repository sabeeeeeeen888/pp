import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import { fetchRiskScores } from '../api'
import { FALLBACK_RISK_SCORES } from '../fallbackData'
import type { RiskScore } from '../types'
import './FeaturePage.css'

export function GeospatialPage() {
  const { user } = useAuth()
  const roleConfig = getRoleConfig(user?.role)
  const [data, setData] = useState<RiskScore[]>([])
  const [loading, setLoading] = useState(true)
  const [georefOpen, setGeorefOpen] = useState(false)
  const [speciesOpen, setSpeciesOpen] = useState(false)

  useEffect(() => {
    fetchRiskScores({})
      .then(setData)
      .catch(() => setData(FALLBACK_RISK_SCORES))
      .finally(() => setLoading(false))
  }, [])

  if (!roleConfig.canGeospatial) {
    return (
      <div className="feature-page">
        <header className="feature-header">
          <h1>Geospatial & species</h1>
        </header>
        <p className="muted" style={{ marginTop: '1rem' }}>
          This page is available to <strong>Research / Agency</strong> accounts. Sign in with that role to view raw data, metrics, and biodiversity formulas.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <Link to="/explore" className="feature-link">← Back to Explore</Link>
        </p>
      </div>
    )
  }

  const byRichness = [...data].sort((a, b) => b.species_richness - a.species_richness).slice(0, 15)
  const totalColonies = data.length
  const avgRichness = totalColonies ? (data.reduce((s, r) => s + r.species_richness, 0) / totalColonies).toFixed(1) : '—'
  const highAbundance = data.filter((r) => r.total_nests_final > 500).length

  return (
    <div className="feature-page">
      <header className="feature-header">
        <h1>Geospatial & species</h1>
        <p className="tagline">Georeferencing workflows and species abundance & richness insights</p>
      </header>

      <section className="feature-section early-warning-dropdown-section">
        <button
          type="button"
          className="early-warning-dropdown-trigger"
          onClick={() => setGeorefOpen((o) => !o)}
          aria-expanded={georefOpen}
        >
          <h2 className="early-warning-dropdown-title">Georeferencing</h2>
          <span className="early-warning-dropdown-chevron" aria-hidden>{georefOpen ? '▼' : '▶'}</span>
        </button>
        {georefOpen && (
          <div className="early-warning-dropdown-content">
            <p>
              Colony survey data is linked to consistent geographic references so it can be used in GIS and mapping tools.
              The <strong>Explore</strong> map places each colony within its state coastal zone; coordinates can be exported
              for use in ArcGIS, QGIS, or other geospatial workflows. Improving georeferencing efficiency means fewer
              manual steps when integrating new aerial or field data.
            </p>
            <div className="feature-card">
              <strong>Workflow</strong>
              <ul>
                <li>Load Colibri colony totals (Year, State, Region, Colony, Species, Nests)</li>
                <li>Assign stable coordinates per colony for mapping (or use real lat/lon when available)</li>
                <li>Export colony list with coordinates for GIS and analysis</li>
              </ul>
            </div>
          </div>
        )}
      </section>

      <section className="feature-section early-warning-dropdown-section">
        <button
          type="button"
          className="early-warning-dropdown-trigger"
          onClick={() => setSpeciesOpen((o) => !o)}
          aria-expanded={speciesOpen}
        >
          <h2 className="early-warning-dropdown-title">Species Richness & Biodiversity Metrics</h2>
          <span className="early-warning-dropdown-chevron" aria-hidden>{speciesOpen ? '▼' : '▶'}</span>
        </button>
        {speciesOpen && (
          <div className="early-warning-dropdown-content">
            <p>
          Birds are ecological indicator species: their abundance reflects ecosystem health (Caro & O’Doherty, 1999).
          Project Pelican uses these metrics to move from a visualization tool to an <strong>ecological analytics engine</strong>.
        </p>

        <div className="metrics-formulas">
          <h3>Computed metrics</h3>
          <div className="formula-block">
            <strong>Species richness</strong>
            <p className="formula">R = number of unique species per colony</p>
          </div>
          <div className="formula-block">
            <strong>Shannon diversity index</strong> <span className="muted">(optional extension)</span>
            <p className="formula">H = −∑ p<sub>i</sub> ln(p<sub>i</sub>)</p>
            <p className="formula-desc">where p<sub>i</sub> = proportion of species i (by nest count).</p>
          </div>
          <div className="why-powerful">
            <h3>Why this is powerful</h3>
            <ul>
              <li><strong>High richness</strong> → Stable habitat</li>
              <li><strong>Rapid richness decline</strong> → Habitat stress</li>
              <li><strong>Monospecies dominance</strong> → Ecological imbalance</li>
            </ul>
          </div>
        </div>

        <h3>Species abundance & richness (data)</h3>
        <p>
          <strong>Species richness</strong> = number of unique species per colony (biodiversity hotspots).
          <strong> Abundance</strong> = nest counts and trends. Below: top colonies by richness and Shannon H when available.
        </p>
          </div>
        )}
      </section>

      <section className="feature-section">
        <h2>Top colonies by richness</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="feature-stats">
              <div className="stat"><span className="stat-value">{totalColonies}</span><span className="stat-label">Colonies</span></div>
              <div className="stat"><span className="stat-value">{avgRichness}</span><span className="stat-label">Avg richness</span></div>
              <div className="stat"><span className="stat-value">{highAbundance}</span><span className="stat-label">Sites with 500+ nests</span></div>
            </div>
            <div className="feature-table-wrap">
              <table className="feature-table">
                <thead>
                  <tr>
                    <th>Colony</th>
                    <th>Richness (R)</th>
                    <th>Shannon (H)</th>
                    <th>Final nests</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {byRichness.map((r) => (
                    <tr key={r.colony_id}>
                      <td>{r.colony_id}</td>
                      <td>{r.species_richness}</td>
                      <td>{r.shannon_diversity != null ? r.shannon_diversity.toFixed(2) : '—'}</td>
                      <td>{r.total_nests_final}</td>
                      <td><span className={`risk-badge risk-${r.risk_category.toLowerCase()}`}>{r.risk_category}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
