import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapView } from '../components/MapView'
import {
  fetchNdviData,
  fetchSurfaceWater,
  searchSarGranules,
  fetchRiskScores,
} from '../api'
import type {
  NdviColonyScore,
  SarGranule,
  NdviResponse,
  SurfaceWaterResponse,
  SarSearchResponse,
} from '../types'
import type { RiskScore } from '../types'
import './FeaturePage.css'
import './SatelliteAnalysisPage.css'

// Default date: 3 months ago (ensures MODIS monthly composite has been published)
function defaultDate(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function defaultSarEnd(): string {
  return new Date().toISOString().slice(0, 10)
}
function defaultSarStart(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 3)
  return d.toISOString().slice(0, 10)
}

// Vegetation health color scale
function vegColor(h: number | null): string {
  if (h === null) return 'var(--text-muted)'
  if (h >= 0.7) return '#86efac'
  if (h >= 0.4) return '#fde047'
  return '#fca5a5'
}

function vegLabel(h: number | null): string {
  if (h === null) return '—'
  if (h >= 0.7) return 'Healthy'
  if (h >= 0.4) return 'Moderate'
  return 'Stressed'
}

// Sort key helper
type SortKey = 'colony_id' | 'ndvi_mean' | 'vegetation_health' | 'water_extent_pct'

export function SatelliteAnalysisPage() {
  const navigate = useNavigate()

  // ── Imagery date state
  const [date, setDate] = useState(defaultDate())
  const [sarStart, setSarStart] = useState(defaultSarStart())
  const [sarEnd, setSarEnd] = useState(defaultSarEnd())

  // ── Map layer toggles
  const [showNdvi, setShowNdvi] = useState(false)
  const [showWater, setShowWater] = useState(false)
  const [ndviOpacity, setNdviOpacity] = useState(0.65)

  // ── Data state
  const [riskData, setRiskData] = useState<RiskScore[]>([])
  const [ndviResult, setNdviResult] = useState<NdviResponse | null>(null)
  const [waterResult, setWaterResult] = useState<SurfaceWaterResponse | null>(null)
  const [sarResult, setSarResult] = useState<SarSearchResponse | null>(null)

  // ── Loading / error state
  const [loadingNdvi, setLoadingNdvi] = useState(false)
  const [loadingWater, setLoadingWater] = useState(false)
  const [loadingSar, setLoadingSar] = useState(false)
  const [loadingApply, setLoadingApply] = useState(false)
  const [errorNdvi, setErrorNdvi] = useState<string | null>(null)
  const [errorWater, setErrorWater] = useState<string | null>(null)
  const [errorSar, setErrorSar] = useState<string | null>(null)
  const [applyToast, setApplyToast] = useState<string | null>(null)

  // ── Colony table sort
  const [sortKey, setSortKey] = useState<SortKey>('vegetation_health')
  const [sortAsc, setSortAsc] = useState(true)

  // ── Load base risk data for map markers on mount
  useEffect(() => {
    fetchRiskScores({}).then(setRiskData).catch(() => setRiskData([]))
  }, [])

  // ── Run NDVI analysis
  const runNdvi = useCallback(async () => {
    setLoadingNdvi(true)
    setErrorNdvi(null)
    try {
      const res = await fetchNdviData(date)
      setNdviResult(res)
      setShowNdvi(true)
    } catch (e: unknown) {
      setErrorNdvi(e instanceof Error ? e.message : 'NDVI fetch failed')
    } finally {
      setLoadingNdvi(false)
    }
  }, [date])

  // ── Run surface-water analysis
  const runWater = useCallback(async () => {
    setLoadingWater(true)
    setErrorWater(null)
    try {
      const res = await fetchSurfaceWater(date)
      setWaterResult(res)
      setShowWater(true)
    } catch (e: unknown) {
      setErrorWater(e instanceof Error ? e.message : 'Surface water fetch failed')
    } finally {
      setLoadingWater(false)
    }
  }, [date])

  // ── SAR granule search
  const runSarSearch = useCallback(async () => {
    setLoadingSar(true)
    setErrorSar(null)
    try {
      const res = await searchSarGranules(sarStart, sarEnd, 10)
      setSarResult(res)
    } catch (e: unknown) {
      setErrorSar(e instanceof Error ? e.message : 'SAR search failed')
    } finally {
      setLoadingSar(false)
    }
  }, [sarStart, sarEnd])

  // ── Apply NDVI scores to priority ranking
  const applyToPriorities = async () => {
    setLoadingApply(true)
    setApplyToast(null)
    try {
      // Pre-fetch enhanced risk scores so the /priorities page can pick them up from cache
      const { fetchNdviEnhancedRiskScores } = await import('../api')
      await fetchNdviEnhancedRiskScores(date)
      setApplyToast(`NDVI scores for ${date} applied. Navigating to Priorities…`)
      setTimeout(() => navigate(`/priorities?ndvi_date=${date}`), 1200)
    } catch (e: unknown) {
      setApplyToast(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setLoadingApply(false)
    }
  }

  // ── Merge NDVI data into table rows
  const colonyRows: NdviColonyScore[] = ndviResult?.colony_ndvi ?? []
  const sortedRows = [...colonyRows].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity
    const bv = b[sortKey] ?? -Infinity
    const cmp = typeof av === 'string'
      ? (av as string).localeCompare(bv as string)
      : (av as number) - (bv as number)
    return sortAsc ? cmp : -cmp
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(s => !s)
    else { setSortKey(key); setSortAsc(true) }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="sat-sort-icon inactive">↕</span>
    return <span className="sat-sort-icon">{sortAsc ? '↑' : '↓'}</span>
  }

  // ── SAR granule date formatter
  function fmtDate(iso: string): string {
    if (!iso) return '—'
    return iso.slice(0, 10)
  }

  const imageryAvailable = ndviResult
    ? `${ndviResult.imagery_available_count} / ${ndviResult.total_colonies} colonies`
    : null

  return (
    <div className="feature-page sat-page">
      {/* ── Header ── */}
      <div className="feature-header sat-header">
        <div className="sat-header-text">
          <h1>Satellite Analysis</h1>
          <p className="tagline">
            NASA GIBS MODIS NDVI · surface water extent · SAR granule discovery · Gulf Coast
          </p>
        </div>
        <div className="sat-header-links">
          <a
            href="https://earthdata.nasa.gov/"
            target="_blank" rel="noopener noreferrer"
            className="sat-link-btn"
          >
            NASA Earthdata
          </a>
          <a
            href="https://wiki.earthdata.nasa.gov/display/GIBS"
            target="_blank" rel="noopener noreferrer"
            className="sat-link-btn"
          >
            GIBS docs
          </a>
        </div>
      </div>

      {/* ── Date selector + status strip ── */}
      <div className="feature-section sat-controls-bar">
        <div className="sat-date-row">
          <label className="sat-label">
            Imagery month
            <input
              type="month"
              className="sat-month-input"
              value={date}
              min="2000-03"
              max={defaultDate()}
              onChange={e => setDate(e.target.value)}
            />
          </label>
          <div className="sat-action-btns">
            <button
              className="btn-primary sat-run-btn"
              onClick={runNdvi}
              disabled={loadingNdvi}
            >
              {loadingNdvi ? 'Fetching NDVI…' : 'Analyse NDVI'}
            </button>
            <button
              className="btn-secondary sat-run-btn"
              onClick={runWater}
              disabled={loadingWater}
            >
              {loadingWater ? 'Fetching water…' : 'Surface water'}
            </button>
          </div>
        </div>

        {ndviResult && (
          <div className="sat-status-strip">
            <span className="sat-status-pill sat-pill-green">
              NDVI analysed — {imageryAvailable}
            </span>
            <span className="sat-status-dim">
              {ndviResult.source}
            </span>
          </div>
        )}
        {errorNdvi && <div className="sat-error">{errorNdvi}</div>}
        {errorWater && <div className="sat-error">{errorWater}</div>}
      </div>

      {/* ── Map panel ── */}
      <div className="feature-section sat-map-section">
        <div className="sat-map-header">
          <h2>Gulf Coast map</h2>
          <div className="sat-layer-toggles">
            <label className="sat-toggle">
              <input
                type="checkbox"
                checked={showNdvi}
                onChange={e => setShowNdvi(e.target.checked)}
              />
              NDVI overlay
            </label>
            <label className="sat-toggle">
              <input
                type="checkbox"
                checked={showWater}
                onChange={e => setShowWater(e.target.checked)}
              />
              EVI / water overlay
            </label>
            <label className="sat-toggle sat-opacity-row">
              Opacity
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={ndviOpacity}
                onChange={e => setNdviOpacity(Number(e.target.value))}
                className="sat-opacity-slider"
              />
              <span className="sat-opacity-val">{Math.round(ndviOpacity * 100)}%</span>
            </label>
          </div>
        </div>
        <div className="sat-map-wrap">
          <MapView
            riskData={riskData}
            heatmap={false}
            loading={riskData.length === 0}
            basemap="dark"
            ndviWmsDate={showNdvi ? date : undefined}
            waterWmsDate={showWater && !showNdvi ? date : undefined}
            ndviOpacity={ndviOpacity}
          />
        </div>
        <p className="sat-map-note">
          Colony risk markers remain visible. NDVI layer: green = dense vegetation;
          yellow/orange = degraded marsh; blue = surface water.
          NASA GIBS MODIS Terra — 231 m resolution.
        </p>
      </div>

      {/* ── Colony NDVI table ── */}
      {colonyRows.length > 0 && (
        <div className="feature-section">
          <div className="sat-section-header">
            <h2>Colony vegetation health — {date}</h2>
            {ndviResult && (
              <button
                className="btn-primary sat-apply-btn"
                onClick={applyToPriorities}
                disabled={loadingApply}
                title="Feed these NDVI scores into the habitat risk priority model"
              >
                {loadingApply ? 'Applying…' : 'Apply to priority ranking'}
              </button>
            )}
          </div>

          {applyToast && (
            <div className={`sat-toast ${applyToast.includes('failed') || applyToast.includes('error') ? 'sat-toast-err' : 'sat-toast-ok'}`}>
              {applyToast}
            </div>
          )}

          <p className="muted sat-table-note">
            NDVI derived from MODIS true-color reflectance — visible vegetation index
            (G−R)/(G+R+1). Click column headers to sort.
          </p>

          <div className="feature-table-wrap">
            <table className="feature-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('colony_id')} className="sat-th-sort">
                    Colony {sortIcon('colony_id')}
                  </th>
                  <th onClick={() => toggleSort('ndvi_mean')} className="sat-th-sort">
                    NDVI proxy {sortIcon('ndvi_mean')}
                  </th>
                  <th onClick={() => toggleSort('vegetation_health')} className="sat-th-sort">
                    Veg. health {sortIcon('vegetation_health')}
                  </th>
                  <th onClick={() => toggleSort('water_extent_pct')} className="sat-th-sort">
                    Water extent {sortIcon('water_extent_pct')}
                  </th>
                  <th>Imagery</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(row => (
                  <tr key={row.colony_id}>
                    <td>
                      <a
                        href={`/colony/${encodeURIComponent(row.colony_id)}`}
                        className="feature-link"
                      >
                        {row.colony_id}
                      </a>
                    </td>
                    <td className="muted" style={{ fontFamily: 'monospace' }}>
                      {row.ndvi_mean !== null ? row.ndvi_mean.toFixed(3) : '—'}
                    </td>
                    <td>
                      {row.vegetation_health !== null ? (
                        <span
                          className="sat-veg-badge"
                          style={{ color: vegColor(row.vegetation_health) }}
                        >
                          {(row.vegetation_health * 100).toFixed(0)}%
                          {' '}{vegLabel(row.vegetation_health)}
                        </span>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="muted">
                      {row.water_extent_pct !== null
                        ? `${row.water_extent_pct.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td>
                      {row.imagery_available
                        ? <span className="sat-pill-green sat-pill-sm">Yes</span>
                        : <span className="sat-pill-grey sat-pill-sm">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {ndviResult?.note && (
            <p className="muted sat-method-note">{ndviResult.note}</p>
          )}
        </div>
      )}

      {/* ── SAR granule search ── */}
      <div className="feature-section">
        <h2>SAR granule search — NASA CMR</h2>
        <p className="muted">
          Search the NASA Common Metadata Repository for synthetic aperture radar
          granules (UAVSAR, NISAR Sim) over the Gulf Coast study area.
          Metadata and browse images are free. File downloads require a free{' '}
          <a
            href="https://urs.earthdata.nasa.gov/"
            target="_blank" rel="noopener noreferrer"
            className="feature-link"
          >
            NASA Earthdata Login
          </a>.
        </p>

        <div className="sat-sar-controls">
          <label className="sat-label">
            From
            <input
              type="date"
              className="sat-date-input"
              value={sarStart}
              onChange={e => setSarStart(e.target.value)}
            />
          </label>
          <label className="sat-label">
            To
            <input
              type="date"
              className="sat-date-input"
              value={sarEnd}
              onChange={e => setSarEnd(e.target.value)}
            />
          </label>
          <button
            className="btn-primary sat-run-btn"
            onClick={runSarSearch}
            disabled={loadingSar}
          >
            {loadingSar ? 'Searching CMR…' : 'Search SAR granules'}
          </button>
        </div>

        {errorSar && <div className="sat-error">{errorSar}</div>}

        {sarResult !== null && (
          sarResult.total === 0 ? (
            <div className="sat-no-sar">
              <p>No SAR granules found for this date range over the Gulf Coast bbox.</p>
              <p className="muted">
                UAVSAR campaign flights are episodic — try a wider date range
                (e.g. 2015–2024) or check the{' '}
                <a
                  href="https://search.earthdata.nasa.gov/search?q=UAVSAR"
                  target="_blank" rel="noopener noreferrer"
                  className="feature-link"
                >
                  Earthdata Search portal
                </a>.
              </p>
            </div>
          ) : (
            <>
              <p className="muted sat-sar-count">
                {sarResult.total} granule{sarResult.total !== 1 ? 's' : ''} found
                — search bbox: lon {sarResult.search_bbox.min_lon} to {sarResult.search_bbox.max_lon},
                lat {sarResult.search_bbox.min_lat} to {sarResult.search_bbox.max_lat}
              </p>
              <div className="feature-table-wrap">
                <table className="feature-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Dataset</th>
                      <th>Acquired</th>
                      <th>Browse</th>
                      <th>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sarResult.granules.map((g: SarGranule, i: number) => (
                      <tr key={i}>
                        <td style={{ maxWidth: '220px', wordBreak: 'break-word' }}>
                          {g.title || '—'}
                        </td>
                        <td className="muted" style={{ fontSize: '0.8rem' }}>
                          {g.dataset}
                        </td>
                        <td className="muted">
                          {fmtDate(g.time_start)}
                          {g.time_end && g.time_end !== g.time_start
                            ? <> – {fmtDate(g.time_end)}</>
                            : null}
                        </td>
                        <td>
                          {g.browse_url ? (
                            <a
                              href={g.browse_url}
                              target="_blank" rel="noopener noreferrer"
                              className="feature-link"
                            >
                              Preview
                            </a>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td>
                          {g.download_url ? (
                            <a
                              href={g.download_url}
                              target="_blank" rel="noopener noreferrer"
                              className="feature-link"
                            >
                              CMR
                            </a>
                          ) : <span className="muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>

      {/* ── Data source notes ── */}
      <div className="feature-section sat-sources">
        <h2>Data sources</h2>
        <div className="sat-source-grid">
          <div className="sat-source-card">
            <div className="sat-source-label">NDVI / EVI overlay</div>
            <div className="sat-source-name">NASA GIBS · MODIS Terra</div>
            <div className="sat-source-detail">
              Monthly composites · 231 m · EPSG:3857 WMTS · no auth required
            </div>
          </div>
          <div className="sat-source-card">
            <div className="sat-source-label">Surface water</div>
            <div className="sat-source-name">NASA GIBS · MODIS true-color</div>
            <div className="sat-source-detail">
              Water pixels detected by blue-dominance and low luminance in RGB tiles
            </div>
          </div>
          <div className="sat-source-card">
            <div className="sat-source-label">SAR search</div>
            <div className="sat-source-name">NASA CMR API · UAVSAR / NISAR Sim</div>
            <div className="sat-source-detail">
              Granule metadata search · no auth · downloads require Earthdata Login
            </div>
          </div>
          <div className="sat-source-card">
            <div className="sat-source-label">Priority integration</div>
            <div className="sat-source-name">Project Pelican risk model</div>
            <div className="sat-source-detail">
              NDVI-derived vegetation_health injected into the Δ-X vulnerability
              component — replaces the biomass proxy when satellite data is available
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
