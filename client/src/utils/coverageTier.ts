/**
 * Delta-X coverage tier helpers.
 *
 * When the backend has loaded real NASA data (data/deltax/deltax_colony_subsidence.csv),
 * the API returns a `deltax_coverage_tier` string per colony — use that directly.
 *
 * When the backend field is absent (synthetic / fallback mode), we classify by the
 * exact bounding box from doi:10.3334/ORNLDAAC/2307:
 *   longitude: -91.59 to -90.18 · latitude: 29.06 to 29.81
 */

export const DELTAX_LAT_MIN = 29.06
export const DELTAX_LAT_MAX = 29.81
export const DELTAX_LON_MIN = -91.59
export const DELTAX_LON_MAX = -90.18

export const TIER_HIGH = 'Delta-X (high precision)'
export const TIER_NOAA = 'outside Delta-X coverage — using NOAA fallback'

export function isInDeltaxCoverage(lat: number | undefined, lon: number | undefined): boolean {
  if (lat == null || lon == null) return false
  return lat >= DELTAX_LAT_MIN && lat <= DELTAX_LAT_MAX && lon >= DELTAX_LON_MIN && lon <= DELTAX_LON_MAX
}

/**
 * Return coverage tier label.
 * Prefers the backend-provided `deltax_coverage_tier` when available.
 */
export function getCoverageTierLabel(
  lat: number | undefined,
  lon: number | undefined,
  backendTier?: string | null,
): string {
  if (backendTier) return backendTier
  return isInDeltaxCoverage(lat, lon) ? TIER_HIGH : TIER_NOAA
}

/** Short badge label for table columns: 'ΔX' or 'NOAA' */
export function getCoverageBadge(
  lat: number | undefined,
  lon: number | undefined,
  backendTier?: string | null,
): string {
  const tier = getCoverageTierLabel(lat, lon, backendTier)
  return tier === TIER_HIGH ? 'ΔX' : 'NOAA'
}
