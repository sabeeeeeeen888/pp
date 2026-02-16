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
  /** Delta-X: elevation decline rate (proxy) */
  elevation_decline_rate?: number
  /** Delta-X: sediment deposition rate (proxy) */
  sediment_deposition_rate?: number
  /** Delta-X: water surface variability (proxy) */
  water_surface_variability?: number
  /** Delta-X derived habitat vulnerability 0–1 */
  habitat_vulnerability?: number
}
