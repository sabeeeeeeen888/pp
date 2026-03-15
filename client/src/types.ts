export interface ColonyRecord {
  colony_id: string
  site_index: number
  year: number
  species: string
  nest_count: number
  latitude: number
  longitude: number
}

export interface RiskScore {
  colony_id: string
  site_index: number
  latitude: number
  longitude: number
  species_richness: number
  species_list: string[]
  shannon_diversity?: number
  decline_rate: number
  population_variability: number
  total_nests_final: number
  years: number[]
  habitat_risk_score: number
  risk_category: 'Low' | 'Moderate' | 'High'
  risk_color: string
  /** Delta-X: elevation decline rate (normalised 0-1; derived from real subsidence when CSV loaded) */
  elevation_decline_rate?: number
  /** Delta-X: sediment deposition rate (proxy) */
  sediment_deposition_rate?: number
  /** Delta-X: water surface variability (proxy) */
  water_surface_variability?: number
  /** Delta-X derived habitat vulnerability 0–1 */
  habitat_vulnerability?: number
  /** Real NASA subsidence rate mm/year (positive = sinking). Null = real data not loaded. */
  subsidence_rate_mm_year?: number | null
  /** RTK GPS elevation in metres above NAVD88 (doi:10.3334/ORNLDAAC/2071) */
  elevation_m_navd88?: number | null
  /** Feldspar sediment accretion rate mm/year (doi:10.3334/ORNLDAAC/2381) */
  sediment_accretion_mm_year?: number | null
  /** Aboveground biomass in g/m² (doi:10.3334/ORNLDAAC/2237) */
  biomass_g_m2?: number | null
  /** AirSWOT water surface height in metres (doi:10.3334/ORNLDAAC/2128) */
  water_surface_height_m?: number | null
  /** Vegetation health normalised 0-1 (derived from biomass) */
  vegetation_health?: number | null
  /** Pipe-separated list of datasets that contributed (e.g. "RTK-elev(doi:2071)|sediment(doi:2381)") */
  datasets_used?: string
  /** 'growing' | 'sinking' | 'stable' | 'unknown' */
  deltax_trend?: string
  /** Full coverage tier label from the backend */
  deltax_coverage_tier?: string
  decline_rate?: number
}
