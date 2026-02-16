import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import { fetchYears, fetchRiskScores, buildDeltaxSummaryFromScores, fetchEarlyWarning, computeEarlyWarningFromScores, fillDeltaxFieldsIfMissing } from '../api'
import { FALLBACK_RISK_SCORES } from '../fallbackData'
import { FALLBACK_YEARS } from '../fallbackData'
import type { RiskScore } from '../types'
import './FeaturePage.css'
import './DashboardPage.css'

const PAGE_SUMMARIES: Record<string, { short: string }> = {
  '/explore': { short: 'Interactive map of colonies, species, and risk. Filter by year and species, compare years, toggle land-loss zones.' },
  '/citizen-science': { short: 'Upload photos and descriptions, submit observations, and contribute to monitoring. See example submissions.' },
  '/deltax': { short: 'Delta-X–style habitat risk: elevation, sediment, water predictors. Colony table and link to map with land-loss overlay.' },
  '/review': { short: 'Approve or reject reports from wildlife resource managers. Add researcher feedback and set points to reward. Queue from Get involved submissions.' },
  '/priorities': { short: 'Priority list for restoration. Export CSV, adjust risk weights, share links. Research and agency decision support.' },
  '/geospatial': { short: 'Raw data and metrics: biodiversity formulas, elevation and sediment analytics, downloadable CSV/GeoJSON.' },
  '/early-warning': { short: 'Early-warning table and predictive modeling. Flag at-risk colonies and link to map and Delta-X.' },
}

const RISK_COLORS = { Low: '#16a34a', Moderate: '#ca8a04', High: '#dc2626' }

const PELICAN_POINTS_KEY = 'pelican_user_points'
const SUBMISSIONS_QUEUE_KEY = 'pelican_submissions_queue'

function loadPendingReviewCount(): number {
  try {
    const raw = localStorage.getItem(SUBMISSIONS_QUEUE_KEY)
    if (!raw) return 0
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return 0
    return arr.filter((i: { status?: string }) => i?.status === 'pending').length
  } catch {
    return 0
  }
}

function PublicCoastalDashboard() {
  const [years, setYears] = useState<number[]>([])
  const [scoresByYear, setScoresByYear] = useState<Record<number, RiskScore[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userPoints, setUserPoints] = useState<number>(0)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PELICAN_POINTS_KEY)
      if (raw) {
        const n = parseInt(raw, 10)
        if (!Number.isNaN(n) && n >= 0) setUserPoints(n)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchYears()
      .then((y) => {
        if (cancelled) return
        const list = (y?.length ? y : FALLBACK_YEARS).filter((yr) => yr >= 2010 && yr <= 2021)
        setYears(list.length ? list : FALLBACK_YEARS)
        const yearList = list.length ? list : FALLBACK_YEARS
        return Promise.all(
          yearList.map((yr) =>
            fetchRiskScores({ year: yr })
              .then((data) => ({ year: yr, data: Array.isArray(data) ? data : [] }))
              .catch(() => ({ year: yr, data: [] as RiskScore[] }))
          )
        )
      })
      .then((results) => {
        if (cancelled || !results) return
        const byYear: Record<number, RiskScore[]> = {}
        results.forEach(({ year, data }) => { byYear[year] = data })
        setScoresByYear(byYear)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load data')
          setYears(FALLBACK_YEARS)
          setScoresByYear({ [FALLBACK_YEARS[FALLBACK_YEARS.length - 1]]: FALLBACK_RISK_SCORES })
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const currentYear = useMemo(() => {
    const list = years.length ? years : FALLBACK_YEARS
    return list[list.length - 1] ?? 2021
  }, [years])

  const currentScores = useMemo(() => {
    return scoresByYear[currentYear] ?? []
  }, [scoresByYear, currentYear])

  const summary = useMemo(() => buildDeltaxSummaryFromScores(currentScores), [currentScores])

  const snapshot = useMemo(() => {
    const total = currentScores.length
    const avgRisk = total ? currentScores.reduce((s, c) => s + (c.habitat_risk_score ?? 0), 0) / total : 0
    const pctSinking = total ? ((summary.colonies_in_sinking_zone / total) * 100) : 0
    const vegStability = total
      ? 1 - (currentScores.reduce((s, c) => s + (c.water_surface_variability ?? 0) + (1 - (c.sediment_deposition_rate ?? 0.5)), 0) / (2 * total))
      : 0
    return {
      totalActiveColonies: total,
      avgHabitatRiskScore: Math.round(avgRisk * 100) / 100,
      vegetationStabilityIndex: Math.max(0, Math.min(1, vegStability)),
      pctInSinkingZones: Math.round(pctSinking * 10) / 10,
      shorelineErosionTrend: summary.colonies_in_sinking_zone > summary.colonies_in_growing_zone ? 'Increasing' : 'Stable',
    }
  }, [currentScores, summary])

  const trendData = useMemo(() => {
    const list = years.length ? years : FALLBACK_YEARS
    return list
      .map((yr) => {
        const s = scoresByYear[yr] ?? []
        const count = s.length
        const avgRichness = count ? s.reduce((a, c) => a + (c.species_richness ?? 0), 0) / count : 0
        return { year: String(yr), colonyCount: count, speciesRichness: Math.round(avgRichness * 10) / 10 }
      })
      .filter((d) => d.colonyCount > 0)
  }, [years, scoresByYear])

  const riskDistribution = useMemo(() => {
    const counts = currentScores.reduce(
      (acc, c) => {
        acc[c.risk_category] = (acc[c.risk_category] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
    return ['Low', 'Moderate', 'High'].map((name) => ({
      name,
      value: counts[name] ?? 0,
      color: RISK_COLORS[name as keyof typeof RISK_COLORS] ?? '#888',
    }))
  }, [currentScores])

  if (error) {
    return (
      <div className="dashboard-public-dark">
        <div className="dashboard-dark-card dashboard-error-msg">{error}</div>
      </div>
    )
  }

  return (
    <div className="dashboard-public-dark">
      <header className="dashboard-hero">
        <h1 className="dashboard-hero-title">Welcome back to Project Pelican</h1>
        <p className="dashboard-hero-intro">
          Bird colonies are ecological indicators of coastal stability. Track colony health, habitat risk, and contribute your observations.
        </p>
        <div className="dashboard-hero-actions">
          <Link to="/explore" className="dashboard-cta dashboard-cta-primary">Explore map</Link>
          <Link to="/citizen-science" className="dashboard-cta dashboard-cta-secondary">Report an observation</Link>
        </div>
      </header>

      <section className="dashboard-section-block">
        <h2 className="dashboard-section-heading">At a glance</h2>
        <div className="dashboard-kpi-row">
          <div className="dashboard-dark-card dashboard-kpi dashboard-points-card">
            <span className="dashboard-kpi-value">{userPoints}</span>
            <span className="dashboard-kpi-label">Your points</span>
            <Link to="/citizen-science" className="dashboard-points-link">Earn more by reporting</Link>
          </div>
          <div className="dashboard-dark-card dashboard-kpi">
            <span className="dashboard-kpi-value">{loading ? '—' : snapshot.totalActiveColonies}</span>
            <span className="dashboard-kpi-label">Active colonies</span>
            <span className="dashboard-kpi-meta">{currentYear}</span>
          </div>
          <div className="dashboard-dark-card dashboard-kpi">
            <span className="dashboard-kpi-value">{loading ? '—' : snapshot.avgHabitatRiskScore.toFixed(2)}</span>
            <span className="dashboard-kpi-label">Avg habitat risk</span>
          </div>
          <div className="dashboard-dark-card dashboard-kpi">
            <span className="dashboard-kpi-value">{loading ? '—' : (snapshot.vegetationStabilityIndex * 100).toFixed(0)}%</span>
            <span className="dashboard-kpi-label">Vegetation stability</span>
          </div>
          <div className="dashboard-dark-card dashboard-kpi dashboard-kpi-highlight">
            <span className="dashboard-kpi-value">{loading ? '—' : snapshot.pctInSinkingZones}%</span>
            <span className="dashboard-kpi-label">In sinking zones</span>
          </div>
        </div>
      </section>

      <section className="dashboard-section-block">
        <h2 className="dashboard-section-heading">Trends</h2>
        <div className="dashboard-charts-row">
          <div className="dashboard-dark-card dashboard-card-chart">
            <h3 className="dashboard-dark-card-title">Colony count over time</h3>
            <p className="dashboard-dark-card-desc">Active colonies by survey year.</p>
            {loading ? (
              <p className="dashboard-dark-muted">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }} labelFormatter={(l) => `Year ${l}`} />
                  <Bar dataKey="colonyCount" name="Colonies" fill="var(--brand)" radius={[0, 0, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="dashboard-dark-card dashboard-card-chart">
            <h3 className="dashboard-dark-card-title">Species richness trend</h3>
            <p className="dashboard-dark-card-desc">Avg species richness per colony by year.</p>
            {loading ? (
              <p className="dashboard-dark-muted">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }} labelFormatter={(l) => `Year ${l}`} />
                  <Line type="monotone" dataKey="speciesRichness" name="Avg richness" stroke="var(--brand)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="dashboard-section-block">
        <h2 className="dashboard-section-heading">Risk overview</h2>
        <div className="dashboard-dark-card dashboard-card-chart dashboard-card-full">
          <h3 className="dashboard-dark-card-title">Colonies by habitat risk category</h3>
          <p className="dashboard-dark-card-desc">Low, moderate, and high risk counts for {currentYear}.</p>
          {loading ? (
            <p className="dashboard-dark-muted">Loading…</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={riskDistribution} layout="vertical" margin={{ top: 8, right: 24, left: 72, bottom: 8 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }} />
                <Bar dataKey="value" name="Colonies" radius={[0, 0, 0, 0]}>
                  {riskDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  )
}

interface NavItem { path: string; label: string }

function deriveBasin(colonyId: string): string {
  const m = colonyId.match(/^[A-Z]{2}-([A-Za-z-]+)-\d+/)
  return m ? m[1].replace(/-/g, ' ') : colonyId
}

function ResearchDashboard({ user, navItems }: { user: { display_name?: string; email?: string }; navItems: NavItem[] }) {
  const [pendingCount, setPendingCount] = useState(0)
  const [flaggedForVerification, setFlaggedForVerification] = useState(0)
  const [earlyWarningRows, setEarlyWarningRows] = useState<Array<{ early_warning: boolean }>>([])
  const [riskScores, setRiskScores] = useState<RiskScore[]>([])
  const [riskTrendByYear, setRiskTrendByYear] = useState<Array<{ year: string; flagged: number; meanRisk: number }>>([])
  const [loading, setLoading] = useState(true)
  const [dataFetchedAt, setDataFetchedAt] = useState<Date | null>(null)

  useEffect(() => {
    setPendingCount(loadPendingReviewCount())
    try {
      const raw = localStorage.getItem(SUBMISSIONS_QUEUE_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) {
          const flagged = arr.filter((i: { status?: string; researcherFeedback?: string }) => i?.status === 'rejected' || (i?.status === 'pending' && (i?.researcherFeedback?.length ?? 0) > 0)).length
          setFlaggedForVerification(Math.min(flagged, 9))
        }
      }
    } catch {
      setFlaggedForVerification(0)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchEarlyWarning()
        .catch(async () => {
          try {
            const scores = await fetchRiskScores({})
            const filled = fillDeltaxFieldsIfMissing(Array.isArray(scores) ? scores : [])
            return computeEarlyWarningFromScores(filled as Array<Record<string, unknown>>)
          } catch {
            return []
          }
        }),
      fetchRiskScores({}).then((d) => (Array.isArray(d) ? d : FALLBACK_RISK_SCORES)).catch(() => FALLBACK_RISK_SCORES),
      fetchYears().then((y) => (Array.isArray(y) ? y.filter((yr) => yr >= 2015 && yr <= 2025).slice(-6) : FALLBACK_YEARS.slice(-6))).catch(() => FALLBACK_YEARS.slice(-6)),
    ])
      .then(([ew, scores, yearList]) => {
        if (cancelled) return
        setEarlyWarningRows(Array.isArray(ew) ? ew : [])
        setRiskScores(Array.isArray(scores) ? scores : [])
        setDataFetchedAt(new Date())
        const years = Array.isArray(yearList) && yearList.length ? yearList : [2019, 2020, 2021]
        return Promise.all(
          years.map((yr) =>
            fetchRiskScores({ year: yr })
              .then((data) => ({ year: yr, data: Array.isArray(data) ? data : [] }))
              .catch(() => ({ year: yr, data: [] as RiskScore[] }))
          )
        )
      })
      .then((byYear) => {
        if (cancelled || !byYear) return
        const trend = byYear.map(({ year, data }) => {
          const highRisk = data.filter((r) => r.risk_category === 'High').length
          const meanRisk = data.length ? data.reduce((s, r) => s + (r.habitat_risk_score ?? 0), 0) / data.length : 0
          return { year: String(year), flagged: highRisk, meanRisk: Math.round(meanRisk * 100) / 100 }
        })
        setRiskTrendByYear(trend)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const ewTotal = earlyWarningRows.length
  const ewFlagged = earlyWarningRows.filter((r) => r.early_warning).length
  const ewPct = ewTotal ? Math.round((ewFlagged / ewTotal) * 100) : 0

  const top5 = useMemo(() => {
    return [...riskScores]
      .sort((a, b) => (b.habitat_risk_score ?? 0) - (a.habitat_risk_score ?? 0))
      .slice(0, 5)
      .map((r, i) => ({ colony_id: r.colony_id, basin: deriveBasin(r.colony_id), score: r.habitat_risk_score ?? 0, rank: i + 1 }))
  }, [riskScores])

  const geo = useMemo(() => {
    const n = riskScores.length
    if (!n) return { total: 0, meanRichness: 0, highestColony: '', highestVal: 0, lowestBasin: '', lowestVal: 99 }
    const meanR = riskScores.reduce((s, r) => s + (r.species_richness ?? 0), 0) / n
    const byRichness = [...riskScores].sort((a, b) => (b.species_richness ?? 0) - (a.species_richness ?? 0))
    const highest = byRichness[0]
    const lowest = byRichness[byRichness.length - 1]
    return {
      total: n,
      meanRichness: Math.round(meanR * 10) / 10,
      highestColony: highest?.colony_id ?? '—',
      highestVal: highest?.species_richness ?? 0,
      lowestBasin: lowest ? deriveBasin(lowest.colony_id) : '—',
      lowestVal: lowest?.species_richness ?? 0,
    }
  }, [riskScores])

  const riskDist = useMemo(() => {
    const counts = { Low: 0, Moderate: 0, High: 0 }
    riskScores.forEach((r) => {
      if (r.risk_category === 'Low') counts.Low++
      else if (r.risk_category === 'Moderate') counts.Moderate++
      else counts.High++
    })
    return ['Low', 'Moderate', 'High'].map((name) => ({
      name,
      value: counts[name as keyof typeof counts],
      color: RISK_COLORS[name as keyof typeof RISK_COLORS] ?? '#888',
    }))
  }, [riskScores])

  return (
    <div className="dashboard-research dashboard-research-intelly">
      <header className="rd-hero">
        <h1 className="rd-hero-greeting">Welcome, {user.display_name || user.email}</h1>
      </header>
      <div className="rd-two-col">
        <div className="rd-main">

      {/* Card 1: Early warning (yellow) */}
          <div className="rd-widget rd-widget-yellow">
            <h3 className="rd-widget-title">Early warning</h3>
            <div className="rd-widget-body">
              <div className="rd-widget-stats">
                <span className="rd-widget-big">{loading ? '—' : ewFlagged}</span>
                <span className="rd-widget-unit">of {loading ? '—' : ewTotal} flagged</span>
                <span className="rd-widget-pct">{loading ? '—' : `${ewPct}%`}</span>
              </div>
              <div className="rd-widget-chart">
                {riskTrendByYear.length > 0 && (
                  <ResponsiveContainer width="100%" height={72}>
                    <LineChart data={riskTrendByYear} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <XAxis dataKey="year" tick={{ fontSize: 9, fill: 'rgba(0,0,0,0.5)' }} />
                      <YAxis hide domain={[0, 'auto']} />
                      <Line type="monotone" dataKey="flagged" stroke="rgba(0,0,0,0.4)" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <Link to="/early-warning" className="rd-widget-link">View flagged colonies</Link>
          </div>

      {/* Card 2: Restoration priority (pink) */}
          <div className="rd-widget rd-widget-pink">
            <h3 className="rd-widget-title">Restoration priority</h3>
            <div className="rd-widget-body">
              {!loading && top5.length > 0 && (
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={top5.map((r) => ({ ...r, value: r.score }))} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }}>
                    <XAxis type="number" domain={[0, 1]} hide />
                    <YAxis type="category" dataKey="colony_id" width={72} tick={{ fontSize: 9 }} />
                    <Bar dataKey="value" fill="rgba(0,0,0,0.25)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <Link to="/priorities" className="rd-widget-link">Full rankings</Link>
          </div>

      {/* Card 3: By risk (green) */}
          <div className="rd-widget rd-widget-green">
            <h3 className="rd-widget-title">By risk category</h3>
            <div className="rd-widget-body rd-widget-risks">
              {riskDist.map((r) => (
                <div key={r.name} className="rd-risk-row">
                  <span className="rd-risk-count">{loading ? '—' : r.value}</span>
                  <span className="rd-risk-name">{r.name}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Card 4: Species & data (blue) */}
          <div className="rd-widget rd-widget-blue">
            <h3 className="rd-widget-title">Species & data</h3>
            <div className="rd-widget-body rd-widget-geo">
              <div className="rd-geo-row"><span className="rd-geo-num">{loading ? '—' : geo.total}</span> colonies</div>
              <div className="rd-geo-row"><span className="rd-geo-num">{loading ? '—' : geo.meanRichness}</span> mean richness</div>
              <div className="rd-geo-row"><span className="rd-geo-num">{loading ? '—' : geo.highestVal}</span> max richness</div>
            </div>
            <Link to="/geospatial" className="rd-widget-link">Georeferencing & metrics</Link>
          </div>

      {/* Card 5: Submissions (lavender) */}
          <div className="rd-widget rd-widget-lavender">
            <h3 className="rd-widget-title">Submissions</h3>
            <div className="rd-widget-body">
              <span className="rd-sub-num">{pendingCount}</span>
              <span className="rd-sub-label">pending review</span>
              {flaggedForVerification > 0 && <span className="rd-sub-flag">{flaggedForVerification} flagged</span>}
            </div>
            <Link to="/review" className="rd-widget-btn">Review</Link>
          </div>
          {/* Card 6: Model status (gray) */}
          <div className="rd-widget rd-widget-gray">
            <h3 className="rd-widget-title">Model & data</h3>
            <div className="rd-widget-body rd-widget-model">
              <div className="rd-model-bar-bg">
                <div className="rd-model-bar-fill" style={{ width: riskScores.length ? '100%' : '0%' }} />
              </div>
              <span className="rd-model-txt">Coverage {riskScores.length ? '100%' : '—'}</span>
              {dataFetchedAt && <span className="rd-model-txt">Updated {dataFetchedAt.toLocaleDateString()}</span>}
            </div>
          </div>
        </div>
        <aside className="rd-sidebar">
          <h3 className="rd-sidebar-title">Today</h3>
          <div className="rd-sidebar-timeline">
            {!loading && top5.length > 0 && top5.slice(0, 3).map((r) => (
              <div key={r.colony_id} className="rd-timeline-item">
                <span className="rd-timeline-dot" />
                <span className="rd-timeline-label">{r.colony_id}</span>
                <span className="rd-timeline-meta">Risk {(r.score * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <Link to="/priorities" className="rd-sidebar-more">View all</Link>
        </aside>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const roleConfig = getRoleConfig(user?.role)

  useEffect(() => {
    if (!loading && !user) navigate('/', { replace: true })
  }, [loading, user, navigate])

  if (loading) {
    return (
      <div className="feature-page account-dashboard">
        <p className="muted">Loading…</p>
      </div>
    )
  }
  if (!user) {
    return (
      <div className="feature-page account-dashboard">
        <p className="muted">Redirecting…</p>
      </div>
    )
  }

  const isPublic = user.role === 'Public'
  const navItems = roleConfig.nav.filter((item) => item.path !== '/dashboard')

  return (
    <div className="feature-page account-dashboard">
      {isPublic ? (
        <PublicCoastalDashboard />
      ) : (
        <ResearchDashboard user={user} navItems={navItems} />
      )}
    </div>
  )
}
