import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import { MapView } from '../components/MapView'
import { Dashboard } from '../components/Dashboard'
import { ImageryComparison } from '../components/ImageryComparison'
import { fetchYears, fetchSpecies, fetchRiskScores, fetchLandLossZones, buildDeltaxSummaryFromScores, fetchChangeDetection, fetchNaturalLanguageQuery } from '../api'
import type { ChangeDetectionResult } from '../api'
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
  const [imageryOverlay, setImageryOverlay] = useState(false)
  const [imageryOverlayOpacity, setImageryOverlayOpacity] = useState(0.88)
  const [selectedColony, setSelectedColony] = useState<RiskScore | null>(null)
  const [showImageryComparison, setShowImageryComparison] = useState(false)
  const [changeDetectionColonyIds, setChangeDetectionColonyIds] = useState<string[]>([])
  const [changeYearA, setChangeYearA] = useState(2010)
  const [changeYearB, setChangeYearB] = useState(2024)
  const [changeResults, setChangeResults] = useState<ChangeDetectionResult[] | null>(null)
  const [changeLoading, setChangeLoading] = useState(false)
  const [changeError, setChangeError] = useState<string | null>(null)
  const [aiQuery, setAiQuery] = useState('')
  const [aiAnswer, setAiAnswer] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiHighlightIds, setAiHighlightIds] = useState<string[]>([])

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

  // Deep link: scroll to Change detection when hash is #change-detection
  useEffect(() => {
    if (window.location.hash === '#change-detection') {
      document.getElementById('change-detection')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const runChangeDetection = useCallback(() => {
    const ids = changeDetectionColonyIds.length >= 1 ? changeDetectionColonyIds : top5.slice(0, 3).map((s) => s.colony_id)
    if (ids.length === 0) {
      setChangeError('Select at least one colony or load data first.')
      return
    }
    setChangeError(null)
    setChangeResults(null)
    setChangeLoading(true)
    fetchChangeDetection({ colony_ids: ids, year_a: changeYearA, year_b: changeYearB })
      .then((res) => {
        setChangeResults(res.results)
        setChangeError(null)
      })
      .catch((e) => {
        const msg = e?.message ?? 'Change detection failed'
        const isNetwork = /load failed|failed to fetch|network error|connection refused|err_connection_refused/i.test(msg) || msg.includes('fetch') || msg.includes('Network')
        setChangeError(isNetwork ? 'Backend not reachable. Start the server on port 8000 (e.g. ./run-backend.sh) and try again.' : msg)
        const is404 = /endpoint not found|404/i.test(msg)
        if (is404 && ids.length > 0 && riskData.length > 0) {
          setChangeResults(ids.slice(0, 5).map((cid) => {
            const row = riskData.find((r) => r.colony_id === cid)
            return {
              colony_id: cid,
              latitude: row?.latitude ?? null,
              longitude: row?.longitude ?? null,
              vegetation_change_pct: null,
              visible_change_pct: null,
              shoreline_retreat_proxy_pct: null,
              imagery_available: false,
              year_a: changeYearA,
              year_b: changeYearB,
              delta_x_risk: row?.risk_category ?? '—',
              in_sinking_zone: (row?.longitude ?? 0) >= -91.2,
              imagery_confirms: null,
              error: undefined,
            }
          }))
        } else if (!is404) {
          setChangeResults(null)
        }
      })
      .finally(() => setChangeLoading(false))
  }, [changeDetectionColonyIds, changeYearA, changeYearB, top5, riskData])

  const runAiQuery = useCallback(() => {
    const q = aiQuery.trim()
    if (!q) return
    setAiLoading(true)
    setAiAnswer(null)
    setAiHighlightIds([])
    const colonyData = riskData.map((r) => ({
      colony_id: r.colony_id,
      risk_category: r.risk_category,
      latitude: r.latitude,
      longitude: r.longitude,
      species_list: r.species_list,
      species_richness: r.species_richness,
      habitat_vulnerability: r.habitat_vulnerability,
    }))
    fetchNaturalLanguageQuery({ query: q, colony_data: colonyData })
      .then((res) => {
        setAiAnswer(res.answer)
        setAiHighlightIds(res.colony_ids || [])
      })
      .catch(() => {
        setAiAnswer('Query failed. Is the backend running and ANTHROPIC_API_KEY set?')
        setAiHighlightIds([])
      })
      .finally(() => setAiLoading(false))
  }, [aiQuery, riskData])

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
      <div className="explore-ai-query">
        <label className="explore-ai-query-label">
          <span className="visually-hidden">Ask a question about the data</span>
          <input
            type="text"
            className="explore-ai-query-input"
            placeholder="Ask a question about the data... e.g. Which high-risk colonies have Brown Pelican?"
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runAiQuery()}
          />
          <button type="button" className="explore-ai-query-btn" onClick={runAiQuery} disabled={aiLoading || !aiQuery.trim()}>
            {aiLoading ? 'Asking…' : 'Ask'}
          </button>
        </label>
        {aiAnswer != null && (
          <div className="explore-ai-answer">
            <p>{aiAnswer}</p>
            {aiHighlightIds.length > 0 && (
              <p className="explore-ai-highlight-note">Highlighted {aiHighlightIds.length} colony(ies) on the map.</p>
            )}
          </div>
        )}
      </div>
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
                  <button type="button" className="search-result-btn" onClick={() => { setCenterOn({ lat: r.latitude, lng: r.longitude }); setSelectedColony(r); }}>
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
          <label className="toggle">
            <input
              type="checkbox"
              checked={imageryOverlay}
              onChange={(e) => setImageryOverlay(e.target.checked)}
            />
            <span>Aerial / satellite imagery overlay</span>
          </label>
          {imageryOverlay && (
            <>
              <p className="landloss-hint">
                USGS imagery under colonies and land-loss zones. Cross-validates Delta-X subsidence with visible land change.
              </p>
              <label className="imagery-opacity-label">
                <span>Imagery opacity</span>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={Math.round(imageryOverlayOpacity * 100)}
                  onChange={(e) => setImageryOverlayOpacity(Number(e.target.value) / 100)}
                />
              </label>
            </>
          )}
          <div className="explore-before-after">
            <button
              type="button"
              className="explore-btn"
              onClick={() => {
                let colony: RiskScore | null = null
                if (searchQuery.trim()) {
                  colony = riskData.find((r) => r.colony_id.toLowerCase().includes(searchQuery.trim().toLowerCase())) ?? null
                }
                if (!colony && centerOn) {
                  colony = riskData.find((r) => Math.abs(r.latitude - centerOn.lat) < 0.01 && Math.abs(r.longitude - centerOn.lng) < 0.01) ?? null
                }
                setSelectedColony(colony)
                setShowImageryComparison(true)
              }}
            >
              2010 vs 2024 imagery
            </button>
          </div>
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
        <div id="change-detection" className="change-detection-panel">
          <h3>Automated change detection</h3>
          <p className="change-detection-blurb">
            Compare aerial imagery from two years; compute vegetation/reflectance change and show it alongside Delta-X risk. Does the imagery confirm the model?
          </p>
          {top5.length > 0 && (
            <div className="change-detection-colonies">
              <span>Colonies (pick 2–3):</span>
              {top5.slice(0, 5).map((s) => (
                <label key={s.colony_id} className="change-detection-check">
                  <input
                    type="checkbox"
                    checked={changeDetectionColonyIds.includes(s.colony_id)}
                    onChange={(e) => {
                      if (e.target.checked) setChangeDetectionColonyIds((prev) => [...prev, s.colony_id].slice(-5))
                      else setChangeDetectionColonyIds((prev) => prev.filter((id) => id !== s.colony_id))
                    }}
                  />
                  <span>{s.colony_id}</span>
                </label>
              ))}
            </div>
          )}
          <div className="change-detection-years">
            <label>
              <span>Year A</span>
              <input type="number" min={2000} max={2021} value={changeYearA} onChange={(e) => setChangeYearA(Number(e.target.value))} />
            </label>
            <label>
              <span>Year B</span>
              <input type="number" min={2001} max={2024} value={changeYearB} onChange={(e) => setChangeYearB(Number(e.target.value))} />
            </label>
          </div>
          <button type="button" className="explore-btn change-detection-run" onClick={runChangeDetection} disabled={changeLoading}>
            {changeLoading ? 'Running…' : 'Run change detection'}
          </button>
          {changeError && (
            <div className="change-detection-error-wrap">
              <p className="change-detection-error">{changeError}</p>
              <p className="change-detection-error-hint">
                From the project root (the folder that contains <code>server/</code>), run: <code>rm -rf server/.venv && ./run-backend.sh</code>. If you're not in the project root, first run <code>cd /path/to/nx2026</code> (or wherever the project lives). Then open <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer">http://localhost:8000/docs</a> to confirm <strong>POST /api/change-detection</strong> exists.
              </p>
              <button type="button" className="explore-btn" onClick={() => { setChangeError(null); runChangeDetection(); }}>
                Try again
              </button>
            </div>
          )}
          {changeResults != null && changeResults.length > 0 && (
            <div className="change-detection-results">
              {changeResults.some((r) => !r.imagery_available && !r.error) && (
                <p className="change-detection-est-hint">Values marked “Est.” use placeholders when satellite imagery is unavailable; Delta-X risk is from the model.</p>
              )}
              <table className="change-detection-table">
                <thead>
                  <tr>
                    <th>Colony</th>
                    <th>Vegetation Δ%</th>
                    <th>Visible Δ%</th>
                    <th>Delta-X risk</th>
                    <th>Imagery</th>
                  </tr>
                </thead>
                <tbody>
                  {changeResults.map((r) => (
                    <tr key={r.colony_id}>
                      <td>{r.colony_id}</td>
                      <td>{r.vegetation_change_pct != null ? `${r.vegetation_change_pct > 0 ? '+' : ''}${r.vegetation_change_pct}%${!r.imagery_available && !r.error ? ' Est.' : ''}` : '—'}</td>
                      <td>{r.visible_change_pct != null ? `${r.visible_change_pct}%${!r.imagery_available && !r.error ? ' Est.' : ''}` : '—'}</td>
                      <td><span className={`risk-badge risk-${(r.delta_x_risk || '').toLowerCase()}`}>{r.delta_x_risk}</span></td>
                      <td>
                        {r.error ? <span className="change-detection-err">Error</span> : r.imagery_confirms === true ? <span className="change-detection-confirms">Confirms</span> : r.imagery_confirms === false ? <span className="change-detection-diverges">Diverges</span> : r.imagery_available ? '—' : <span className="change-detection-noimg">Est.</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
          highlightColonyIds={aiHighlightIds}
          centerOn={centerOn}
          basemap={basemap}
          imageryOverlay={imageryOverlay}
          imageryOverlayOpacity={imageryOverlayOpacity}
        />
        {showImageryComparison && (
          <ImageryComparison
            colony={selectedColony}
            onClose={() => setShowImageryComparison(false)}
          />
        )}
      </main>
    </div>
  )
}
