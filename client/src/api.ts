const API = 'http://localhost:8000/api'
const API_BASE = 'http://localhost:8000'
const API_ALT = 'http://127.0.0.1:8000/api'
const API_BASE_ALT = 'http://127.0.0.1:8000'

let use127 = false
export function setBackendHost(use127_0_0_1: boolean) {
  use127 = use127_0_0_1
}
function getBase(): { api: string; base: string } {
  if (use127) return { api: API_ALT, base: API_BASE_ALT }
  return { api: API, base: API_BASE }
}

const AUTH_TOKEN_KEY = 'pelican_access_token'

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setAuthToken(token: string | null): void {
  if (token == null) localStorage.removeItem(AUTH_TOKEN_KEY)
  else localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export const AUTH_ROLES = ['Public', 'Research'] as const
export type AuthRole = (typeof AUTH_ROLES)[number]

export interface AuthUser {
  email: string
  display_name: string
  role: string
}

export async function authSignUp(email: string, password: string, displayName?: string): Promise<{ user: AuthUser; access_token: string }> {
  const { api } = getBase()
  const r = await fetch(`${api}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName ?? null }),
  })
  if (!r.ok) {
    const d = await r.json().catch(() => ({}))
    const detail = Array.isArray(d.detail) ? d.detail[0]?.msg ?? d.detail : d.detail
    throw new Error(typeof detail === 'string' ? detail : 'Sign up failed')
  }
  return r.json()
}

export async function authSignIn(email: string, password: string, role?: string): Promise<{ user: AuthUser; access_token: string }> {
  const { api } = getBase()
  let r: Response
  try {
    r = await fetch(`${api}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role: role ?? 'Public' }),
    })
  } catch (_e) {
    throw new Error('Cannot reach server. Is the backend running?')
  }
  if (r.status === 404) {
    throw new Error('Cannot reach sign-in. Is the backend running?')
  }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}))
    const detail = Array.isArray(d.detail) ? d.detail[0]?.msg ?? d.detail : d.detail
    const msg = typeof detail === 'string' ? detail : 'Invalid email or password'
    throw new Error(msg === 'Not Found' ? 'Cannot reach sign-in. Is the backend running?' : msg)
  }
  return r.json()
}

export async function authGetMe(): Promise<AuthUser | null> {
  const token = getAuthToken()
  if (!token) return null
  const { api } = getBase()
  let r = await fetch(`${api}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok && api.startsWith('http://localhost')) {
    const r2 = await fetch(`${API_ALT}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (r2.ok) {
      setBackendHost(true)
      return r2.json()
    }
    return null
  }
  if (!r.ok) return null
  return r.json()
}

async function fetchWithFallback(url: string, fallbackUrl: string): Promise<Response> {
  try {
    const r = await fetch(url)
    if (r.ok) return r
    if (url.startsWith('http://localhost')) {
      const r2 = await fetch(fallbackUrl)
      if (r2.ok) setBackendHost(true)
      return r2
    }
    return r
  } catch {
    if (url.startsWith('http://localhost')) {
      try {
        const r2 = await fetch(fallbackUrl)
        if (r2.ok) setBackendHost(true)
        return r2
      } catch {
        throw new Error('Failed to fetch')
      }
    }
    throw new Error('Failed to fetch')
  }
}

export async function fetchYears(): Promise<number[]> {
  const { api } = getBase()
  const r = await fetchWithFallback(`${api}/colonies/years`, `${API_ALT}/colonies/years`)
  if (!r.ok) throw new Error('Failed to fetch years')
  return r.json()
}

export async function fetchSpecies(): Promise<string[]> {
  const { api } = getBase()
  const r = await fetchWithFallback(`${api}/colonies/species`, `${API_ALT}/colonies/species`)
  if (!r.ok) throw new Error('Failed to fetch species')
  return r.json()
}

export async function fetchColonies(params?: { year?: number; species?: string }) {
  const { api } = getBase()
  const url = new URL(`${api}/colonies/`)
  if (params?.year != null) url.searchParams.set('year', String(params.year))
  if (params?.species) url.searchParams.set('species', params.species ?? '')
  const r = await fetch(url.toString())
  if (!r.ok) throw new Error('Failed to fetch colonies')
  return r.json()
}

export async function fetchRiskScores(params?: { year?: number; species?: string }) {
  const { api } = getBase()
  const url = new URL(`${api}/analytics/risk`)
  if (params?.year != null) url.searchParams.set('year', String(params.year))
  if (params?.species) url.searchParams.set('species', params.species ?? '')
  const r = await fetch(url.toString())
  if (!r.ok) throw new Error('Failed to fetch risk scores')
  return r.json()
}

export interface EarlyWarningRow {
  colony_id: string
  latitude?: number
  longitude?: number
  risk_category: string
  habitat_risk_score?: number
  habitat_vulnerability?: number
  elevation_decline_rate?: number
  sediment_deposition_rate?: number
  water_surface_variability?: number
  decline_rate?: number
  signals: string[]
  collapse_risk: 'High' | 'Medium' | 'Low'
  collapse_risk_score: number
  early_warning: boolean
}

const LON_BOUNDARY = -91.2
const THRESHOLD_ELEVATION_DECLINE = 0.5
const THRESHOLD_SEDIMENT_LOW = 0.4
const THRESHOLD_WATER_VARIABILITY = 0.4
const THRESHOLD_DECLINE_NESTS = 30

function earlyWarningSignals(row: {
  elevation_decline_rate?: number
  sediment_deposition_rate?: number
  longitude?: number
  water_surface_variability?: number
  decline_rate?: number
  habitat_vulnerability?: number
}): { signals: string[]; collapse_risk_score: number } {
  const signals: string[] = []
  if (row.elevation_decline_rate != null && row.elevation_decline_rate >= THRESHOLD_ELEVATION_DECLINE) signals.push('elevation_loss')
  if (row.sediment_deposition_rate != null && row.sediment_deposition_rate <= THRESHOLD_SEDIMENT_LOW) signals.push('sediment_starvation')
  if (row.longitude != null && row.longitude >= LON_BOUNDARY) signals.push('shoreline_stress')
  if (row.water_surface_variability != null && row.water_surface_variability >= THRESHOLD_WATER_VARIABILITY) signals.push('water_pooling')
  if ((row.decline_rate ?? 0) >= THRESHOLD_DECLINE_NESTS) signals.push('colony_decline')
  const n = signals.length / 5
  const vuln = row.habitat_vulnerability ?? 0
  const collapse_risk_score = Math.min(1, Math.round((0.4 * n + 0.6 * vuln) * 1000) / 1000)
  return { signals, collapse_risk_score }
}

/** Compute early-warning rows from risk scores (client-side when API is unavailable). */
export function computeEarlyWarningFromScores(scores: Array<Record<string, unknown>>): EarlyWarningRow[] {
  return scores.map((row) => {
    const { signals, collapse_risk_score } = earlyWarningSignals(row as Parameters<typeof earlyWarningSignals>[0])
    const collapse_risk = collapse_risk_score >= 0.6 ? 'High' : collapse_risk_score >= 0.3 ? 'Medium' : 'Low'
    const early_warning = collapse_risk === 'High' || collapse_risk === 'Medium' || signals.length >= 2
    return {
      colony_id: String(row.colony_id),
      latitude: row.latitude as number | undefined,
      longitude: row.longitude as number | undefined,
      risk_category: String(row.risk_category ?? ''),
      habitat_risk_score: row.habitat_risk_score as number | undefined,
      habitat_vulnerability: row.habitat_vulnerability as number | undefined,
      elevation_decline_rate: row.elevation_decline_rate as number | undefined,
      sediment_deposition_rate: row.sediment_deposition_rate as number | undefined,
      water_surface_variability: row.water_surface_variability as number | undefined,
      decline_rate: row.decline_rate as number | undefined,
      signals,
      collapse_risk,
      collapse_risk_score,
      early_warning,
    }
  })
}

export async function fetchEarlyWarning(): Promise<EarlyWarningRow[]> {
  const { api } = getBase()
  const r = await fetchWithFallback(`${api}/analytics/early-warning`, `${API_ALT}/analytics/early-warning`)
  if (!r.ok) throw new Error('Early-warning failed')
  return r.json()
}

/** Delta-X proxy bounds (match backend risk_model.py) */
const LON_EAST_SINKING = -89.8
const LON_WEST_GROWING = -91.8

/**
 * Compute Delta-X proxy values from location so Habitat vuln. / Elev. decline / Sediment / Water var. are never blank.
 * Use when API returns scores without these fields (e.g. older backend or different response shape).
 */
export function fillDeltaxFieldsIfMissing<T extends { latitude?: number; longitude?: number; site_index?: number }>(scores: T[]): T[] {
  return scores.map((s) => {
    const lat = s.latitude ?? 29.3
    const lon = s.longitude ?? -90.5
    const siteIndex = s.site_index ?? 0
    const needElev = (s as { elevation_decline_rate?: number }).elevation_decline_rate == null
    const needSed = (s as { sediment_deposition_rate?: number }).sediment_deposition_rate == null
    const needWater = (s as { water_surface_variability?: number }).water_surface_variability == null
    const needVuln = (s as { habitat_vulnerability?: number }).habitat_vulnerability == null
    if (!needElev && !needSed && !needWater && !needVuln) return s
    const t = Math.max(0, Math.min(1, (lon - LON_EAST_SINKING) / (LON_WEST_GROWING - LON_EAST_SINKING)))
    const h = (siteIndex * 31) % 256
    const elevation_decline_rate = Math.round((0.15 + (1 - t) * 0.75 + (h % 20) / 100) * 1000) / 1000
    const sediment_deposition_rate = Math.round((0.2 + t * 0.6 + ((h >> 2) % 15) / 100) * 1000) / 1000
    const water_surface_variability = Math.round((0.1 + (1 - t) * 0.4 + ((h >> 4) % 20) / 100) * 1000) / 1000
    const rawVuln = (elevation_decline_rate + (1 - sediment_deposition_rate) + water_surface_variability) / 3
    const habitat_vulnerability = Math.round(Math.max(0, Math.min(1, rawVuln)) * 100) / 100
    return {
      ...s,
      ...(needElev && { elevation_decline_rate }),
      ...(needSed && { sediment_deposition_rate }),
      ...(needWater && { water_surface_variability }),
      ...(needVuln && { habitat_vulnerability }),
    }
  })
}

export interface LandLossFeature {
  type: 'Feature'
  properties: { zone: string; trend: string; label: string }
  geometry: { type: 'Polygon'; coordinates: number[][][] }
}

export interface DeltaxSummary {
  colonies_in_sinking_zone: number
  colonies_in_growing_zone: number
  total_colonies: number
  top_5_priority: Array<{
    colony_id: string
    risk_category: string
    habitat_risk_score: number
    habitat_vulnerability: number | null
    in_sinking_zone: boolean
  }>
}

const LON_SINKING = -91.2 // same as backend: Terrebonne (sinking) >= -91.2

/** Build summary from risk scores when API is down (demo mode). */
export function buildDeltaxSummaryFromScores(scores: Array<{ longitude?: number; habitat_vulnerability?: number | null; habitat_risk_score: number; colony_id: string; risk_category: string }>): DeltaxSummary {
  const inSinking = scores.filter((s) => s.longitude != null && s.longitude >= LON_SINKING).length
  const inGrowing = scores.filter((s) => s.longitude != null && s.longitude < LON_SINKING).length
  const withDx = scores.filter((s) => s.habitat_vulnerability != null)
  const top5 = [...withDx]
    .sort((a, b) => (b.habitat_risk_score - a.habitat_risk_score) || ((b.habitat_vulnerability ?? 0) - (a.habitat_vulnerability ?? 0)))
    .slice(0, 5)
  return {
    colonies_in_sinking_zone: inSinking,
    colonies_in_growing_zone: inGrowing,
    total_colonies: scores.length,
    top_5_priority: top5.map((s) => ({
      colony_id: s.colony_id,
      risk_category: s.risk_category,
      habitat_risk_score: s.habitat_risk_score,
      habitat_vulnerability: s.habitat_vulnerability ?? null,
      in_sinking_zone: s.longitude != null && s.longitude >= LON_SINKING,
    })),
  }
}

export async function fetchDeltaxSummary(): Promise<DeltaxSummary | null> {
  const { api } = getBase()
  try {
    const r = await fetchWithFallback(`${api}/analytics/deltax-summary`, `${API_ALT}/analytics/deltax-summary`)
    if (!r.ok) return null
    return r.json()
  } catch {
    return null
  }
}

export async function fetchLandLossZones(): Promise<{ type: string; features: LandLossFeature[] }> {
  const { api } = getBase()
  const r = await fetchWithFallback(`${api}/analytics/land-loss-zones`, `${API_ALT}/analytics/land-loss-zones`)
  if (!r.ok) return { type: 'FeatureCollection', features: [] }
  return r.json()
}

export async function classifyAerialImage(file: File): Promise<{ class: string; label: string; confidence: number }> {
  const { api, base } = getBase()
  const form = new FormData()
  form.append('file', file)

  const post = (url: string) => fetch(url, { method: 'POST', body: form })

  let r = await post(`${base}/classify`)
  if (r.status === 404) {
    r = await post(`${base}/api/ai/classify`)
  }
  if (!r.ok && base === API_BASE) {
    const r2 = await post(`${API_BASE_ALT}/classify`)
    if (r2.ok) {
      setBackendHost(true)
      return r2.json()
    }
  }
  if (!r.ok) {
    let msg = 'Classification failed'
    try {
      const body = await r.json()
      if (body?.detail) msg = typeof body.detail === 'string' ? body.detail : body.detail[0]?.msg || msg
    } catch {
      if (r.status === 400) msg = 'Invalid or empty file'
      else if (r.status >= 500) msg = 'Server error. Check backend logs.'
    }
    throw new Error(msg)
  }
  return r.json()
}
