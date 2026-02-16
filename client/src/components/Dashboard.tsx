import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import type { RiskScore } from '../types'
import './Dashboard.css'

const RISK_COLORS = { Low: '#16a34a', Moderate: '#ca8a04', High: '#dc2626' }

export function Dashboard({
  riskData,
  loading,
  error,
}: {
  riskData: RiskScore[]
  loading: boolean
  error: string | null
}) {
  const riskCounts = riskData.reduce(
    (acc, c) => {
      acc[c.risk_category] = (acc[c.risk_category] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )
  const pieData = Object.entries(riskCounts).map(([name, value]) => ({
    name,
    value,
    color: RISK_COLORS[name as keyof typeof RISK_COLORS] ?? '#888',
  }))

  const richnessData = riskData
    .slice()
    .sort((a, b) => b.species_richness - a.species_richness)
    .slice(0, 10)
    .map((c) => ({
      name: c.colony_id.replace('LA-CO-', ''),
      richness: c.species_richness,
      risk: c.risk_category,
    }))

  const declineData = riskData
    .slice()
    .sort((a, b) => b.decline_rate - a.decline_rate)
    .slice(0, 10)
    .map((c) => ({
      name: c.colony_id.replace('LA-CO-', ''),
      decline: Math.round(c.decline_rate),
    }))

  if (error) {
    return (
      <section className="dashboard">
        <div className="dashboard-error">{error}</div>
      </section>
    )
  }

  return (
    <section className={`dashboard ${loading ? 'loading-skeleton' : ''}`}>
      <h2>Analytics</h2>

      <div className="dashboard-section">
        <h3>Habitat risk distribution</h3>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : pieData.length === 0 ? (
          <p className="muted">No data for selected filters.</p>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={32}
                outerRadius={52}
                paddingAngle={2}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {pieData.map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="dashboard-section">
        <h3>Species richness (top colonies)</h3>
        <p className="muted">Biodiversity hotspots — unique species per colony.</p>
        {!loading && richnessData.length > 0 && (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={richnessData} layout="vertical" margin={{ left: 0, right: 8 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 9 }} />
              <Tooltip />
              <Bar dataKey="richness" fill="var(--text)" name="Species" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="dashboard-section">
        <h3>Colony decline (top 10)</h3>
        <p className="muted">Decline rate = Initial − Final nest count.</p>
        {!loading && declineData.length > 0 && (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={declineData} margin={{ right: 8 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="decline" fill="var(--risk-high)" name="Decline" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
