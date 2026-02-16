import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import { MapView } from '../components/MapView'
import { Dashboard } from '../components/Dashboard'
import { fetchYears, fetchSpecies, fetchRiskScores, fetchLandLossZones, buildDeltaxSummaryFromScores } from '../api'
import { FALLBACK_RISK_SCORES } from '../fallbackData'
import type { RiskScore } from '../types'
import type { LandLossFeature } from '../api'

function exportRiskDataCSV(data: RiskScore[]) {
  const headers = ['colony_id', 'latitude', 'longitude', 'risk_category', 'habitat_risk_score', 'species_richness', 'decline_rate', 'habitat_vulnerability', 'in_sinking_zone']
  const rows = data.map((r) => [
    r.colony_id,
    r.latitude,
    r.longitude,
    r.risk_category,
    (r.habitat_risk_score * 100).toFixed(1),
    r.species_richness,
    r.decline_rate.toFixed(0),
    r.habitat_vulnerability != null ? (r.habitat_vulnerability * 100).toFixed(0) : '',
    r.longitude >= -91.2 ? 'Y' : 'N',
  ])
  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `colony-data-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function ExplorePage() {
  const { user } = useAuth()
  const roleConfig = getRoleConfig(user?.role)
  const [searchParams] = useSearchParams()
  const [years, setYears] = useState<number[]>([])
  const [species, setSpecies] = useState<string[]>([])
  const [year, setYear] = useState<number | ''>('')
  const [speciesFilter, setSpeciesFilter] = useState<string>('')
  const [compareYearA, setCompareYearA] = useState<number | ''>('')
  const [compareYearB, setCompareYearB] = useState<number | ''>('')
  const [compareDataA, setCompareDataA] = useState<RiskScore[] | null>(null)
  const [compareDataB, setCompareDataB] = useState<RiskScore[] | null>(null)
  const [heatmap, setHeatmap] = useState(false)
  const [landLossLayer, setLandLossLayer] = useState(() => searchParams.get('landLoss') === '1' || searchParams.get('colony') != null)
  const [landLossZones, setLandLossZones] = useState<LandLossFeature[] | null>(null)
  const [riskData, setRiskData] = useState<RiskScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [apiConnected, setApiConnected] = useState<boolean | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [centerOn, setCenterOn] = useState<{ lat: number; lng: number } | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [basemap, setBasemap] = useState<'dark' | 'light' | 'satellite'>('dark')

  const connectToBackend = () => {
    setLoading(true)
    setError(null)
    Promise.all([fetchYears(), fetchSpecies()])
      .then(([y, s]) => {
        setYears(y)
        setSpecies(s)
        if (y.length) setYear(y[y.length - 1])
        setApiConnected(true)
        setError(null)
        return fetchRiskScores({ year: y.length ? y[y.length - 1] : undefined })
      })
      .then((data) => {
        if (data) setRiskData(data)
      })
      .catch(() => {
        setApiConnected(false)
        setError('Backend not reachable. Is the server running on port 8000?')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    connectToBackend()
  }, [])

  useEffect(() => {
    if (apiConnected !== true) return
    setLoading(true)
    fetchRiskScores({
      year: year === '' ? undefined : (year as number),
      species: speciesFilter || undefined,
    })
      .then((data) => {
        setRiskData(data)
        setError(null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [year, speciesFilter, apiConnected])

  useEffect(() => {
    if (landLossLayer) {
      fetchLandLossZones()
        .then((res) => setLandLossZones(res.features || []))
        .catch(() => setLandLossZones([]))
    } else {
      setLandLossZones(null)
    }
  }, [landLossLayer])

  useEffect(() => {
    if (compareYearA === '' || compareYearB === '') {
      setCompareDataA(null)
      setCompareDataB(null)
      return
    }
    Promise.all([
      fetchRiskScores({ year: compareYearA as number }),
      fetchRiskScores({ year: compareYearB as number }),
    ]).then(([a, b]) => {
      setCompareDataA(a)
      setCompareDataB(b)
    }).catch(() => {
      setCompareDataA([])
      setCompareDataB([])
    })
  }, [compareYearA, compareYearB])

  const filteredBySearch = searchQuery.trim()
    ? riskData.filter((r) => r.colony_id.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : riskData
  const top5 = buildDeltaxSummaryFromScores(riskData).top_5_priority
  const copyShareLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    })
  }, [])

  // Deep link: ?colony=ID focuses map on that colony
  const colonyParam = searchParams.get('colony')
  useEffect(() => {
    if (!colonyParam || riskData.length === 0) return
    const found = riskData.find((r) => r.colony_id === colonyParam || r.colony_id.toLowerCase().includes(colonyParam.toLowerCase()))
    if (found) {
      setSearchQuery(found.colony_id)
      setCenterOn({ lat: found.latitude, lng: found.longitude })
    }
  }, [colonyParam, riskData])

  return (
    <div className="explore-page">
      {apiConnected === false && (
        <div className="api-banner" role="alert">
          <strong>Backend not connected.</strong>
          <ol className="api-banner-steps">
            <li>Open a terminal in the project folder <code>nx2026</code>.</li>
            <li>Run: <code>./run-backend.sh</code> or <code>cd server && source .venv/bin/activate && uvicorn app.main:app --port 8000</code></li>
            <li>Wait until you see <code>Uvicorn running on http://127.0.0.1:8000</code>.</li>
            <li>
              <a href="http://localhost:8000/health" target="_blank" rel="noopener noreferrer">Check if backend is running</a>
              {' '}(should show {`{"status":"ok"}`}).
            </li>
            <li>Click <button type="button" className="api-banner-btn-inline" onClick={connectToBackend}>Connect to backend</button> to load real data.</li>
          </ol>
        </div>
      )}
      {apiConnected === true && (
        <div className="api-live" aria-label="Using API data">
          Live data (API)
        </div>
      )}
      <header className="header">
        <h1>Explore the map</h1>
        <p className="tagline">Louisiana Gulf Coast colonies · filters and analytics</p>
        <p className="header-solution">Colony data + habitat risk + land-loss zones so you know where to act first.</p>
      </header>
      <aside className="sidebar">
        <div className="filters">
          <label className="search-colony">
            <span>Search colony</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. Barataria"
            />
          </label>
          {searchQuery.trim() && filteredBySearch.length > 0 && (
            <ul className="search-results">
              {filteredBySearch.slice(0, 5).map((r) => (
                <li key={r.colony_id}>
                  <button type="button" className="search-result-btn" onClick={() => setCenterOn({ lat: r.latitude, lng: r.longitude })}>
                    {r.colony_id} — {r.risk_category}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label>
            <span>Year</span>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Species</span>
            <select
              value={speciesFilter}
              onChange={(e) => setSpeciesFilter(e.target.value)}
            >
              <option value="">All species</option>
              {species.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={heatmap}
              onChange={(e) => setHeatmap(e.target.checked)}
            />
            <span>Colony density heatmap</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={landLossLayer}
              onChange={(e) => setLandLossLayer(e.target.checked)}
            />
            <span>Land loss / elevation zones</span>
          </label>
          {landLossLayer && (
            <p className="landloss-hint">Green = growing (sediment). Red = sinking (land loss).</p>
          )}
          <div className="explore-actions">
            <button type="button" className="explore-btn" onClick={() => exportRiskDataCSV(riskData)} disabled={loading || riskData.length === 0}>
              Export CSV
            </button>
            <button type="button" className="explore-btn" onClick={copyShareLink}>
              {shareCopied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
          <div className="basemap-toggle">
            <span>Map style</span>
            <select value={basemap} onChange={(e) => setBasemap(e.target.value as 'dark' | 'light' | 'satellite')} aria-label="Basemap">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="satellite">Satellite</option>
            </select>
          </div>
        </div>
        {top5.length > 0 && (
          <div className="top5-panel">
            <h3>Top 5 priority colonies</h3>
            <ol>
              {top5.map((s) => (
                <li key={s.colony_id}>
                  <button type="button" className="top5-btn" onClick={() => setCenterOn({ lat: riskData.find((r) => r.colony_id === s.colony_id)?.latitude ?? 29.4, lng: riskData.find((r) => r.colony_id === s.colony_id)?.longitude ?? -91.2 })}>
                    {s.colony_id}
                  </button>
                  <span className={`risk-badge risk-${s.risk_category.toLowerCase()}`}>{s.risk_category}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {roleConfig.canCompareYears && (
          <div className="compare-years">
            <h3>Compare years</h3>
            <div className="compare-selects">
              <label>
                <span>Year A</span>
                <select value={compareYearA} onChange={(e) => setCompareYearA(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">—</option>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Year B</span>
                <select value={compareYearB} onChange={(e) => setCompareYearB(e.target.value === '' ? '' : Number(e.target.value))}>
                  <option value="">—</option>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
            </div>
            {compareDataA != null && compareDataB != null && (
              <p className="compare-summary">
                {compareYearA}: {compareDataA.length} colonies · {compareYearB}: {compareDataB.length} colonies
              </p>
            )}
          </div>
        )}
        <Dashboard riskData={riskData} loading={loading} error={error} />
      </aside>
      <main className="map-container">
        <MapView
          riskData={filteredBySearch}
          heatmap={heatmap}
          loading={loading}
          landLossZones={landLossLayer ? landLossZones : null}
          centerOn={centerOn}
          basemap={basemap}
        />
      </main>
    </div>
  )
}
