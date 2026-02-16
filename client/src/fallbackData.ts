/**
 * Demo data used when the backend API is not running.
 * Louisiana coastal bounds; synthetic colonies for 2010–2021.
 */
import type { RiskScore } from './types'

const DEMO_YEARS = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021]
const DEMO_SPECIES = [
  'Brown Pelican',
  'Laughing Gull',
  'Royal Tern',
  'Sandwich Tern',
  'Black Skimmer',
  'Great Egret',
  'Snowy Egret',
  'Tricolored Heron',
  'White Ibis',
  'Roseate Spoonbill',
]

// Deterministic points in Louisiana coastal zone for demo map
function demoRiskScores(): RiskScore[] {
  const sites: [number, number, string, number, number, number][] = [
    [29.25, -89.95, 'LA-Barataria-1', 4, 120, 0.35],
    [29.42, -90.12, 'LA-Breton-1', 6, 0, 0.22],
    [29.58, -89.88, 'LA-Chandeleur-1', 3, 340, 0.71],
    [29.12, -90.45, 'LA-Terrebonne-1', 5, 80, 0.48],
    [29.35, -91.02, 'LA-Atchafalaya-1', 4, 200, 0.55],
    [29.78, -89.52, 'LA-Marsh-1', 2, 410, 0.82],
    [28.95, -90.88, 'LA-Birdsfoot-1', 5, 30, 0.38],
    [29.52, -90.08, 'LA-Biloxi-1', 4, 90, 0.42],
    [29.18, -90.22, 'LA-Bayou-1', 3, 180, 0.61],
    [29.65, -89.72, 'LA-Queen-Bess-1', 6, 0, 0.18],
    [29.32, -91.18, 'LA-Vermilion-1', 4, 150, 0.52],
    [28.88, -90.62, 'LA-Salt-Bayou-1', 2, 280, 0.75],
  ]
  return sites.map(([lat, lon, colony_id], i) => {
    const [richness, decline, score] = [sites[i][3], sites[i][4], sites[i][5]]
    const risk_category = score < 0.35 ? 'Low' : score < 0.65 ? 'Moderate' : 'High'
    const risk_color = risk_category === 'Low' ? 'green' : risk_category === 'Moderate' ? 'yellow' : 'red'
    const shannon_diversity = Math.round((0.8 + (richness / 6) * 1.2 + (i % 3) * 0.15) * 100) / 100
    const t = (lon - (-89.8)) / (-91.8 - (-89.8))
    const elevation_decline_rate = 0.2 + (1 - Math.max(0, Math.min(1, t))) * 0.6 + (i % 10) / 100
    const sediment_deposition_rate = 0.3 + Math.max(0, Math.min(1, t)) * 0.5
    const water_surface_variability = 0.2 + (1 - Math.max(0, Math.min(1, t))) * 0.4
    const habitat_vulnerability = (elevation_decline_rate + (1 - sediment_deposition_rate) + water_surface_variability) / 3
    return {
      colony_id,
      site_index: i,
      latitude: lat,
      longitude: lon,
      species_richness: richness,
      species_list: DEMO_SPECIES.slice(0, richness),
      shannon_diversity,
      decline_rate: decline,
      population_variability: score * 0.3,
      total_nests_final: Math.max(0, 500 - decline),
      years: DEMO_YEARS,
      habitat_risk_score: score,
      risk_category: risk_category as 'Low' | 'Moderate' | 'High',
      risk_color,
      elevation_decline_rate: Math.round(elevation_decline_rate * 1000) / 1000,
      sediment_deposition_rate: Math.round(sediment_deposition_rate * 1000) / 1000,
      water_surface_variability: Math.round(water_surface_variability * 1000) / 1000,
      habitat_vulnerability: Math.round(habitat_vulnerability * 100) / 100,
    }
  })
}

export const FALLBACK_YEARS = DEMO_YEARS
export const FALLBACK_SPECIES = DEMO_SPECIES
export const FALLBACK_RISK_SCORES = demoRiskScores()
