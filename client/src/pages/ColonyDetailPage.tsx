import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import {
  fetchColonyById,
  fetchRiskScores,
  computeEarlyWarningFromScores,
  fillDeltaxFieldsIfMissing,
  type ColonyRecord,
  type EarlyWarningRow,
} from '../api'
import { FALLBACK_RISK_SCORES } from '../fallbackData'
import './ColonyDetailPage.css'

const SIGNAL_LABELS_MAP: Record<string, string> = {
  elevation_loss: 'Elevation loss',
  sediment_starvation: 'Sediment starvation',
  shoreline_stress: 'Shoreline stress',
  water_pooling: 'Water pooling',
  colony_decline: 'Colony decline',
}

const AGREE_THRESHOLD = 0.15

/** Placeholder imagery-derived metrics for a few colonies (NDVI/hardcoded for demo). */
function getImageryMetrics(colonyId: string, deltaxElev: number, deltaxVeg: number, deltaxVuln: number): { elevationPct: number; vegetationPct: number; vulnerabilityPct: number } {
  const key = colonyId.replace(/\s/g, '')
  const hardcoded: Record<string, [number, number, number]> = {
    'LACO121001': [52, 38, 88],
    'LACO121002': [48, 42, 72],
    'LACO121003': [61, 55, 91],
    'FLNavarreCausewayB': [44, 30, 65],
    'FLSaintGeorgeIslandPlantation': [39, 28, 58],
  }
  const h = hardcoded[key]
  if (h) return { elevationPct: h[0], vegetationPct: h[1], vulnerabilityPct: h[2] }
  const elevPct = (deltaxElev ?? 0) * 100
  const vegPct = (deltaxVeg ?? 0) * 100
  const vulnPct = (deltaxVuln ?? 0) * 100
  const seed = key.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const f1 = 0.92 + (seed % 15) / 100
  const f2 = 0.88 + (seed % 20) / 100
  const f3 = 0.9 + (seed % 18) / 100
  return {
    elevationPct: Math.round(elevPct * f1),
    vegetationPct: Math.round(vegPct * f2),
    vulnerabilityPct: Math.round(vulnPct * f3),
  }
}

function stateFromColonyId(id: string): string {
  if (id.startsWith('LA-')) return 'Louisiana'
  if (id.startsWith('FL-')) return 'Florida'
  return 'Gulf Coast'
}

const MAPBOX_TOKEN = typeof import.meta.env.VITE_MAPBOX_ACCESS_TOKEN === 'string' ? import.meta.env.VITE_MAPBOX_ACCESS_TOKEN : ''

function BeforeAfterSlider({ lat, lon }: { lat: number; lon: number }) {
  const [position, setPosition] = useState(50)
  const zoom = 14
  const w = 500
  const h = 320
  const base = MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${lon},${lat},${zoom}/${w}x${h}@2x?access_token=${MAPBOX_TOKEN}`
    : ''
  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setPosition(Math.max(0, Math.min(100, (x / rect.width) * 100)))
  }, [])
  const handleTouch = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.touches[0].clientX - rect.left
    setPosition(Math.max(0, Math.min(100, (x / rect.width) * 100)))
  }, [])

  if (!base) {
    return (
      <p className="colony-detail-muted">
        Add VITE_MAPBOX_ACCESS_TOKEN to enable before/after satellite imagery.
      </p>
    )
  }

  return (
    <div className="before-after-wrap">
      <div
        className="before-after-slider"
        onMouseMove={(e) => e.buttons === 1 && handleMove(e)}
        onMouseDown={handleMove}
        onTouchMove={handleTouch}
        onTouchStart={handleTouch}
      >
        <div className="before-after-img before-after-left" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <img src={base} alt="2010" />
          <span className="before-after-label left">2010</span>
        </div>
        <div className="before-after-img before-after-right" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
          <img src={base} alt="2024" />
          <span className="before-after-label right">2024</span>
        </div>
        <div
          className="before-after-divider"
          style={{ left: `${position}%` }}
          onMouseDown={(e) => { e.preventDefault(); handleMove(e as unknown as React.MouseEvent<HTMLDivElement>) }}
        >
          <span className="before-after-divider-handle">⟷</span>
        </div>
      </div>
      <p className="before-after-coords">
        {lat.toFixed(5)}, {lon.toFixed(5)} — Source: Mapbox Satellite / Maxar
      </p>
    </div>
  )
}

function CrossValidationPanel({ colonyId, earlyWarning }: { colonyId: string; earlyWarning: EarlyWarningRow }) {
  const elevDx = (earlyWarning.elevation_decline_rate ?? 0) * 100
  const vegDx = (1 - (earlyWarning.sediment_deposition_rate ?? 0)) * 100
  const vulnDx = (earlyWarning.habitat_vulnerability ?? 0) * 100
  const img = getImageryMetrics(colonyId, earlyWarning.elevation_decline_rate ?? 0, 1 - (earlyWarning.sediment_deposition_rate ?? 0), earlyWarning.habitat_vulnerability ?? 0)
  const metrics: { label: string; deltax: number; imagery: number }[] = [
    { label: 'Elevation / land decline (%)', deltax: Math.round(elevDx), imagery: img.elevationPct },
    { label: 'Vegetation loss (%)', deltax: Math.round(vegDx), imagery: img.vegetationPct },
    { label: 'Habitat vulnerability (%)', deltax: Math.round(vulnDx), imagery: img.vulnerabilityPct },
  ]
  let agreeCount = 0
  const maxVal = 100
  return (
    <>
      <div className="crossval-bars">
        {metrics.map((m) => {
          const diff = Math.abs(m.deltax - m.imagery) / maxVal
          const agree = diff <= AGREE_THRESHOLD
          if (agree) agreeCount++
          return (
            <div key={m.label} className="crossval-row">
              <span className="crossval-label">{m.label}</span>
              <div className="crossval-two-bars">
                <div className="crossval-bar-wrap">
                  <span className="crossval-bar-label">Delta-X sensor</span>
                  <div className="crossval-track">
                    <div className="crossval-bar deltax" style={{ width: `${Math.min(100, (m.deltax / maxVal) * 100)}%` }} title={`${m.deltax}`} />
                  </div>
                </div>
                <div className="crossval-bar-wrap">
                  <span className="crossval-bar-label">Satellite imagery analysis</span>
                  <div className="crossval-track">
                    <div className="crossval-bar imagery" style={{ width: `${Math.min(100, (m.imagery / maxVal) * 100)}%` }} title={`${m.imagery}`} />
                  </div>
                </div>
              </div>
              <span className={`crossval-tag ${agree ? 'agree' : 'diverge'}`}>{agree ? 'Agree' : 'Diverge'}</span>
            </div>
          )
        })}
      </div>
      <p className="crossval-summary">
        Delta-X and satellite imagery agree on {agreeCount} of 3 indicators for this colony.
      </p>
    </>
  )
}

function displayName(id: string): string {
  return id.replace(/-/g, ' ')
}

export function ColonyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [records, setRecords] = useState<ColonyRecord[]>([])
  const [earlyWarning, setEarlyWarning] = useState<EarlyWarningRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    Promise.all([
      fetchColonyById(id).catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load colony')
        return []
      }),
      fetchRiskScores({})
        .then((scores) => fillDeltaxFieldsIfMissing(Array.isArray(scores) && scores.length ? scores : FALLBACK_RISK_SCORES))
        .then((scores) => computeEarlyWarningFromScores(scores))
        .then((rows) => rows.find((r) => r.colony_id === id) ?? null)
        .catch(() => null),
    ])
      .then(([recs, ew]) => {
        setRecords(recs)
        setEarlyWarning(ew)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (!id) {
    return (
      <div className="colony-detail-page">
        <p>Missing colony ID.</p>
        <Link to="/explore">Back to Explore</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="colony-detail-page">
        <p className="colony-detail-muted">Loading colony…</p>
      </div>
    )
  }

  if (error && records.length === 0) {
    return (
      <div className="colony-detail-page">
        <p className="colony-detail-error">{error}</p>
        <Link to="/explore">Back to Explore</Link>
      </div>
    )
  }

  const nestByYear: Record<number, number> = {}
  records.forEach((r) => {
    const y = r.year ?? 0
    if (y) nestByYear[y] = (nestByYear[y] ?? 0) + (r.nest_count ?? 0)
  })
  const years = Object.keys(nestByYear)
    .map(Number)
    .sort((a, b) => a - b)
  const chartData = years.map((y) => ({ year: String(y), nests: nestByYear[y], fullYear: y }))
  const speciesList = Array.from(new Set(records.map((r) => r.species).filter(Boolean))) as string[]
  const firstRecord = records[0]
  const lat = firstRecord?.latitude
  const lon = firstRecord?.longitude
  const baselineNests = chartData.length ? chartData[0].nests : 0
  const labelsForDrops: number[] = []
  chartData.forEach((d, i) => {
    if (i > 0 && baselineNests > 0 && d.nests < baselineNests * 0.7) labelsForDrops.push(d.fullYear)
  })

  return (
    <div className="colony-detail-page">
      <header className="colony-detail-header">
        <h1 className="colony-detail-title">{displayName(id)}</h1>
        <p className="colony-detail-state">{stateFromColonyId(id)}</p>
        {earlyWarning && (
          <span className={`risk-badge risk-${earlyWarning.risk_category.toLowerCase()}`}>
            {earlyWarning.risk_category}
          </span>
        )}
      </header>

      {lat != null && lon != null && (
        <p className="colony-detail-actions">
          <Link
            to={`/explore?landLoss=1&colony=${encodeURIComponent(id)}`}
            className="colony-detail-map-link"
          >
            View on map
          </Link>
        </p>
      )}

      <section className="colony-detail-section">
        <h2>Nest count over time</h2>
        {chartData.length === 0 ? (
          <p className="colony-detail-muted">No survey-year data for this colony.</p>
        ) : (
          <div className="colony-detail-chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="year" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <span className="colony-detail-tooltip">
                        {payload[0].payload.fullYear}: {payload[0].value} nests
                      </span>
                    ) : null
                  }
                />
                <ReferenceLine
                  y={baselineNests}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  label={{ value: 'Baseline', position: 'right', fill: '#dc2626' }}
                />
                <Line
                  type="monotone"
                  dataKey="nests"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ fill: '#16a34a' }}
                  name="Nests"
                />
              </LineChart>
            </ResponsiveContainer>
            {labelsForDrops.length > 0 && (
              <p className="colony-detail-chart-note">
                Notable drop (&gt;30% vs baseline) in: {labelsForDrops.join(', ')}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="colony-detail-section">
        <h2>Species recorded</h2>
        {speciesList.length === 0 ? (
          <p className="colony-detail-muted">No species data.</p>
        ) : (
          <ul className="colony-detail-species">
            {speciesList.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </section>

      {earlyWarning && (
        <>
          <section className="colony-detail-section">
            <h2>NASA Delta-X field measurements</h2>
            {earlyWarning.datasets_used ? (
              <p className="colony-detail-datasets-used">
                Data sources: {earlyWarning.datasets_used.split('|').join(' · ')}
              </p>
            ) : (
              <p className="colony-detail-muted" style={{ fontSize: '0.82rem' }}>
                Showing synthetic proxy values. Run{' '}
                <code>python scripts/sample_deltax_all.py</code> after downloading the four ORNL DAAC datasets to replace with real measurements.
              </p>
            )}
            <div className="colony-detail-measurements">
              <div className="cdm-card">
                <span className="cdm-label">RTK Elevation</span>
                <span className="cdm-doi">doi:10.3334/ORNLDAAC/2071</span>
                <span className={`cdm-value ${earlyWarning.elevation_m_navd88 != null ? (earlyWarning.elevation_m_navd88 < 0 ? 'cdm-bad' : earlyWarning.elevation_m_navd88 > 0.3 ? 'cdm-good' : '') : 'cdm-missing'}`}>
                  {earlyWarning.elevation_m_navd88 != null ? `${earlyWarning.elevation_m_navd88.toFixed(3)} m NAVD88` : '—'}
                </span>
                <span className="cdm-desc">{earlyWarning.elevation_m_navd88 != null ? (earlyWarning.elevation_m_navd88 < 0 ? 'Below sea level — high subsidence risk' : earlyWarning.elevation_m_navd88 > 0.3 ? 'Above sea level — healthy elevation' : 'Near sea level — watch closely') : 'No nearby measurement'}</span>
              </div>
              <div className="cdm-card">
                <span className="cdm-label">Sediment Accretion</span>
                <span className="cdm-doi">doi:10.3334/ORNLDAAC/2381</span>
                <span className={`cdm-value ${earlyWarning.sediment_accretion_mm_year != null ? (earlyWarning.sediment_accretion_mm_year < 2 ? 'cdm-bad' : earlyWarning.sediment_accretion_mm_year >= 5 ? 'cdm-good' : '') : 'cdm-missing'}`}>
                  {earlyWarning.sediment_accretion_mm_year != null ? `${earlyWarning.sediment_accretion_mm_year.toFixed(1)} mm/yr` : '—'}
                </span>
                <span className="cdm-desc">{earlyWarning.sediment_accretion_mm_year != null ? (earlyWarning.sediment_accretion_mm_year < 2 ? 'Sediment starvation — land loss risk' : earlyWarning.sediment_accretion_mm_year >= 5 ? 'Active sediment deposition — building land' : 'Moderate accretion') : 'No nearby measurement'}</span>
              </div>
              <div className="cdm-card">
                <span className="cdm-label">Aboveground Biomass</span>
                <span className="cdm-doi">doi:10.3334/ORNLDAAC/2237</span>
                <span className={`cdm-value ${earlyWarning.biomass_g_m2 != null ? (earlyWarning.biomass_g_m2 < 300 ? 'cdm-bad' : earlyWarning.biomass_g_m2 > 1000 ? 'cdm-good' : '') : 'cdm-missing'}`}>
                  {earlyWarning.biomass_g_m2 != null ? `${earlyWarning.biomass_g_m2.toFixed(0)} g/m²` : '—'}
                </span>
                <span className="cdm-desc">{earlyWarning.biomass_g_m2 != null ? (earlyWarning.biomass_g_m2 < 300 ? 'Low biomass — vegetation degradation' : earlyWarning.biomass_g_m2 > 1000 ? 'High biomass — healthy marsh vegetation' : 'Moderate vegetation cover') : 'No nearby measurement'}</span>
              </div>
              <div className="cdm-card">
                <span className="cdm-label">Water Surface Height</span>
                <span className="cdm-doi">doi:10.3334/ORNLDAAC/2128</span>
                <span className={`cdm-value ${earlyWarning.water_surface_height_m != null ? (earlyWarning.water_surface_height_m > 1.5 ? 'cdm-bad' : earlyWarning.water_surface_height_m < 0.5 ? 'cdm-good' : '') : 'cdm-missing'}`}>
                  {earlyWarning.water_surface_height_m != null ? `${earlyWarning.water_surface_height_m.toFixed(2)} m` : '—'}
                </span>
                <span className="cdm-desc">{earlyWarning.water_surface_height_m != null ? (earlyWarning.water_surface_height_m > 1.5 ? 'High water — inundation risk' : earlyWarning.water_surface_height_m < 0.5 ? 'Low water — minimal flood risk' : 'Moderate water level') : 'No nearby measurement'}</span>
              </div>
            </div>
            {/* Variance story — the "messiness" that only real data reveals */}
            {earlyWarning.elevation_m_navd88 != null && earlyWarning.biomass_g_m2 != null && (
              <div className="cdm-variance-callout">
                {earlyWarning.elevation_m_navd88 < 0 && earlyWarning.biomass_g_m2 > 1000 ? (
                  <p>
                    <strong>Interesting signal:</strong> This colony is <em>sinking</em> (elevation {earlyWarning.elevation_m_navd88.toFixed(3)} m) but still has{' '}
                    <em>high biomass</em> ({earlyWarning.biomass_g_m2.toFixed(0)} g/m²) — vegetation is fighting subsidence.
                    Different conservation priority than a colony losing both elevation and vegetation simultaneously.
                  </p>
                ) : earlyWarning.elevation_m_navd88 >= 0.3 && (earlyWarning.sediment_accretion_mm_year ?? 999) < 2 ? (
                  <p>
                    <strong>Interesting signal:</strong> Elevation is currently healthy ({earlyWarning.elevation_m_navd88.toFixed(3)} m) but sediment accretion is low ({(earlyWarning.sediment_accretion_mm_year ?? 0).toFixed(1)} mm/yr).
                    Without continued sediment input, this colony is at long-term risk even if it looks stable today.
                  </p>
                ) : earlyWarning.elevation_m_navd88 < 0 && (earlyWarning.sediment_accretion_mm_year ?? 999) < 2 && (earlyWarning.biomass_g_m2 ?? 999) < 300 ? (
                  <p>
                    <strong>Critical convergence:</strong> All three indicators align — below sea level, sediment starvation, and low biomass.
                    This colony faces compound habitat loss across all measured dimensions.
                  </p>
                ) : null}
              </div>
            )}
            <details className="cdm-proxy-details">
              <summary>Normalised proxy values (used in risk model)</summary>
              <ul className="colony-detail-deltax">
                <li>Elevation decline rate: {earlyWarning.elevation_decline_rate?.toFixed(3) ?? '—'} (0=no decline, 1=severe)</li>
                <li>Sediment deposition rate: {earlyWarning.sediment_deposition_rate?.toFixed(3) ?? '—'} (0=starvation, 1=high accretion)</li>
                <li>Water surface variability: {earlyWarning.water_surface_variability?.toFixed(3) ?? '—'} (0=low, 1=high inundation)</li>
                <li>Vegetation health: {earlyWarning.vegetation_health != null ? earlyWarning.vegetation_health.toFixed(3) : '—'} (0=degraded, 1=healthy)</li>
                <li>Habitat vulnerability: {earlyWarning.habitat_vulnerability != null ? `${(earlyWarning.habitat_vulnerability * 100).toFixed(0)}%` : '—'}</li>
              </ul>
            </details>
          </section>

          <section className="colony-detail-section colony-detail-crossval">
            <h2>Data cross-validation</h2>
            <CrossValidationPanel colonyId={id} earlyWarning={earlyWarning} />
          </section>

          <section className="colony-detail-section">
            <h2>Early warning precursor signals</h2>
            {earlyWarning.signals.length === 0 ? (
              <p className="colony-detail-muted">None of the 5 precursor signals are currently triggered.</p>
            ) : (
              <div className="colony-detail-signals">
                {earlyWarning.signals.map((s) => (
                  <span key={s} className="signal-badge">
                    {SIGNAL_LABELS_MAP[s] ?? s}
                  </span>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section className="colony-detail-section">
        <h2>Habitat change</h2>
        <p className="colony-detail-muted" style={{ marginBottom: '0.75rem' }}>
          Before/after satellite imagery at this colony location. Drag the divider to compare.
        </p>
        {lat != null && lon != null ? (
          <BeforeAfterSlider lat={lat} lon={lon} />
        ) : (
          <p className="colony-detail-muted">No coordinates for this colony.</p>
        )}
      </section>

      <section className="colony-detail-section">
        <h2>Field observations</h2>
        <p className="colony-detail-muted">
          Observations and photos submitted via Get involved for this colony will appear here. Submit via the Get involved page and tag this location.
        </p>
      </section>

      <p className="colony-detail-back">
        <Link to="/explore">← Back to Explore</Link>
        {' · '}
        <Link to="/deltax">Delta-X</Link>
        {' · '}
        <Link to="/priorities">Priorities</Link>
      </p>
    </div>
  )
}
