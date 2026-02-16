/**
 * Role definitions for Project Pelican.
 * 1. Wildlife resource managers — Education, awareness, transparency (no raw data or downloads)
 * 2. Research — Full access for agencies, researchers, modeling, exports, AI tools
 */

export const ROLE_IDS = ['Public', 'Research'] as const
export type RoleId = (typeof ROLE_IDS)[number]

export interface NavItem {
  path: string
  label: string
}

export interface RoleConfig {
  id: RoleId
  label: string
  description: string
  nav: NavItem[]
  canExport: boolean
  canShareLink: boolean
  canAIClassify: boolean
  canPriorities: boolean
  canDeltax: boolean
  canEarlyWarning: boolean
  canGeospatial: boolean
  canCitizenScienceSubmit: boolean
  canCompareYears: boolean
  canApproveSubmissions: boolean
  canUploadPhotos: boolean
  canFlagErosion: boolean
}

export const ROLES: Record<RoleId, RoleConfig> = {
  Public: {
    id: 'Public',
    label: 'Wildlife resource managers',
    description: '',
    nav: [
      { path: '/dashboard', label: 'Dashboard' },
      { path: '/explore', label: 'Explore' },
      { path: '/citizen-science', label: 'Get involved' },
      { path: '/deltax', label: 'Delta-X' },
    ],
    canExport: false,
    canShareLink: true,
    canAIClassify: false,
    canPriorities: false,
    canDeltax: true,
    canEarlyWarning: false,
    canGeospatial: false,
    canCitizenScienceSubmit: false,
    canCompareYears: false,
    canApproveSubmissions: false,
    canUploadPhotos: false,
    canFlagErosion: false,
  },
  Research: {
    id: 'Research',
    label: 'Research / Agency',
    description: 'Data-driven planning. Raw datasets, downloadable CSV/GeoJSON, risk weight adjustments, AI classification, predictive modeling, elevation & sediment analytics. Approve submissions, validate AI, export reports.',
    nav: [
      { path: '/dashboard', label: 'Dashboard' },
      { path: '/review', label: 'Review' },
      { path: '/priorities', label: 'Priorities' },
      { path: '/geospatial', label: 'Data & metrics' },
      { path: '/early-warning', label: 'Early warning' },
    ],
    canExport: true,
    canShareLink: true,
    canAIClassify: true,
    canPriorities: true,
    canDeltax: true,
    canEarlyWarning: true,
    canGeospatial: true,
    canCitizenScienceSubmit: true,
    canCompareYears: true,
    canApproveSubmissions: true,
    canUploadPhotos: true,
    canFlagErosion: true,
  },
}

const DEFAULT_ROLE_CONFIG: RoleConfig = ROLES.Public

/** Normalize API role (case/whitespace) to a valid RoleId, or Public. */
function normalizeRole(role: string | undefined): RoleId {
  if (!role || typeof role !== 'string') return 'Public'
  const s = role.trim()
  const byLower = ROLE_IDS.find((id) => id.toLowerCase() === s.toLowerCase())
  return byLower ?? 'Public'
}

export function getRoleConfig(role: string | undefined): RoleConfig {
  return ROLES[normalizeRole(role)]
}

type FeatureKey = keyof Pick<RoleConfig,
  'canExport' | 'canShareLink' | 'canAIClassify' | 'canPriorities' | 'canDeltax' |
  'canEarlyWarning' | 'canGeospatial' | 'canCitizenScienceSubmit' | 'canCompareYears' |
  'canApproveSubmissions' | 'canUploadPhotos' | 'canFlagErosion'>

export function canAccess(role: string | undefined, feature: FeatureKey): boolean {
  return getRoleConfig(role)[feature]
}
