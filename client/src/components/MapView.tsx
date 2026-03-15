import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, Tooltip, useMap } from 'react-leaflet'
import type { RiskScore } from '../types'
import type { LandLossFeature } from '../api'
import { getCoverageTierLabel } from '../utils/coverageTier'
// RiskScore may carry deltax_coverage_tier from backend when real data is loaded
import './MapView.css'

const LOUISIANA_CENTER: [number, number] = [29.4, -91.2]
const DEFAULT_ZOOM = 8

const MAPBOX_TOKEN = typeof import.meta.env.VITE_MAPBOX_ACCESS_TOKEN === 'string' ? import.meta.env.VITE_MAPBOX_ACCESS_TOKEN : ''
const BASEMAP_URLS: Record<string, string> = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  satellite: MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`
    : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
}

// Aerial/satellite imagery sources for overlay (under colony dots and land-loss zones)
const IMAGERY_OVERLAY_URLS = {
  esri: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  usgs: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
}
const IMAGERY_ATTRIBUTION = 'Esri, USGS, NASA | Colony & land-loss: Project Pelican'

function CenterOn({ center }: { center: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (!center) return
    map.flyTo([center.lat, center.lng], 12, { duration: 0.5 })
  }, [center, map])
  return null
}

function geoJsonRingToLatLng(ring: number[][]): [number, number][] {
  return ring.map(([lng, lat]) => [lat, lng])
}

function LandLossOverlay({ zones }: { zones: LandLossFeature[] }) {
  return (
    <>
      {zones.map((f, i) => {
        const ring = f.geometry.coordinates[0] || []
        const positions = geoJsonRingToLatLng(ring)
        const isGrowing = f.properties.trend === 'growing'
        return (
          <Polygon
            key={f.properties.zone + i}
            positions={positions}
            pathOptions={{
              color: isGrowing ? '#16a34a' : '#dc2626',
              fillColor: isGrowing ? '#16a34a' : '#dc2626',
              fillOpacity: 0.15,
              weight: 2,
            }}
          >
            <Tooltip permanent={false}>{f.properties.label}</Tooltip>
          </Polygon>
        )
      })}
    </>
  )
}

function RiskMarkers({ data, heatmap, highlightIds = [] }: { data: RiskScore[]; heatmap: boolean; highlightIds?: string[] }) {
  const isHighlight = (id: string) => highlightIds.includes(id)
  if (heatmap) {
    return (
      <>
        {data.map((c) => (
          <CircleMarker
            key={c.colony_id}
            center={[c.latitude, c.longitude]}
            radius={Math.min(20, 4 + Math.sqrt(c.total_nests_final) / 8)}
            pathOptions={{
              fillColor: c.risk_color === 'green' ? '#16a34a' : c.risk_color === 'yellow' ? '#ca8a04' : '#dc2626',
              color: isHighlight(c.colony_id) ? '#fff' : 'rgba(255,255,255,0.6)',
              weight: isHighlight(c.colony_id) ? 4 : 1,
              fillOpacity: 0.6,
            }}
          >
            <Popup>
              <strong>{c.colony_id}</strong>
              <br />
              Risk: {c.risk_category}
              <br />
              Richness: {c.species_richness} species
              <br />
              Decline rate: {c.decline_rate.toFixed(0)}
              {c.habitat_vulnerability != null && (
                <>
                  <br />
                  Habitat vulnerability (ΔX): {(c.habitat_vulnerability * 100).toFixed(0)}%
                </>
              )}
              <br />
              <span className="map-popup-tier">{getCoverageTierLabel(c.latitude, c.longitude, c.deltax_coverage_tier)}</span>
            <br />
            <Link to={`/colony/${encodeURIComponent(c.colony_id)}`} className="map-popup-link">View details →</Link>
            </Popup>
          </CircleMarker>
        ))}
      </>
    )
  }
  return (
    <>
      {data.map((c) => (
        <CircleMarker
          key={c.colony_id}
          center={[c.latitude, c.longitude]}
          radius={isHighlight(c.colony_id) ? 10 : 6}
          pathOptions={{
            fillColor: c.risk_color === 'green' ? '#16a34a' : c.risk_color === 'yellow' ? '#ca8a04' : '#dc2626',
            color: isHighlight(c.colony_id) ? '#fff' : '#fff',
            weight: isHighlight(c.colony_id) ? 4 : 1.5,
            fillOpacity: 0.9,
          }}
        >
          <Popup>
            <strong>{c.colony_id}</strong>
            <br />
            Risk: {c.risk_category} (score: {(c.habitat_risk_score * 100).toFixed(1)}%)
            <br />
            Species richness: {c.species_richness}
            <br />
            Decline rate: {(c.decline_rate ?? 0).toFixed(0)} nests
            {c.habitat_vulnerability != null && (
              <>
                <br />
                Habitat vulnerability: {(c.habitat_vulnerability * 100).toFixed(0)}%
              </>
            )}
            {c.subsidence_rate_mm_year != null && (
              <>
                <br />
                Subsidence: {c.subsidence_rate_mm_year.toFixed(2)} mm/yr ({c.deltax_trend ?? '—'})
              </>
            )}
            <br />
            Species: {c.species_list.slice(0, 4).join(', ')}{c.species_list.length > 4 ? '…' : ''}
            <br />
            <span className="map-popup-tier">{getCoverageTierLabel(c.latitude, c.longitude, c.deltax_coverage_tier)}</span>
            <br />
            <Link to={`/colony/${encodeURIComponent(c.colony_id)}`} className="map-popup-link">View details →</Link>
          </Popup>
        </CircleMarker>
      ))}
    </>
  )
}

export function MapView({
  riskData,
  heatmap,
  loading,
  landLossZones = null,
  centerOn = null,
  basemap = 'dark',
  imageryOverlay = false,
  imageryOverlayOpacity = 0.85,
  highlightColonyIds = [],
}: {
  riskData: RiskScore[]
  heatmap: boolean
  loading: boolean
  landLossZones?: LandLossFeature[] | null
  centerOn?: { lat: number; lng: number } | null
  basemap?: 'dark' | 'light' | 'satellite'
  imageryOverlay?: boolean
  imageryOverlayOpacity?: number
  highlightColonyIds?: string[]
}) {
  return (
    <div className="map-view">
      {loading && (
        <div className="map-loading">
          <span>Loading colony data…</span>
        </div>
      )}
      <MapContainer
        center={LOUISIANA_CENTER}
        zoom={DEFAULT_ZOOM}
        className="map"
        zoomControl={true}
      >
        <TileLayer
          attribution={basemap === 'satellite' ? '© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.maxar.com/">Maxar</a>' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}
          url={BASEMAP_URLS[basemap] || BASEMAP_URLS.dark}
        />
        {imageryOverlay && (
          <TileLayer
            url={IMAGERY_OVERLAY_URLS.usgs}
            attribution={IMAGERY_ATTRIBUTION}
            opacity={imageryOverlayOpacity}
            zIndex={1}
          />
        )}
        <CenterOn center={centerOn} />
        {landLossZones && landLossZones.length > 0 && <LandLossOverlay zones={landLossZones} />}
        <RiskMarkers data={riskData} heatmap={heatmap} highlightIds={highlightColonyIds} />
      </MapContainer>
      <div className="map-legend">
        <span className="legend-dot low" /> Low risk
        <span className="legend-dot mid" /> Moderate
        <span className="legend-dot high" /> High priority
        {landLossZones && landLossZones.length > 0 && (
          <>
            <span className="legend-dot" style={{ background: '#16a34a' }} /> Growing
            <span className="legend-dot" style={{ background: '#dc2626' }} /> Sinking
          </>
        )}
        {imageryOverlay && (
          <span className="legend-imagery" title="USGS aerial imagery under colonies & land-loss">Imagery on</span>
        )}
        {basemap === 'satellite' && (
          <span className="legend-imagery" title="Satellite base layer">Satellite imagery: Maxar/Mapbox</span>
        )}
      </div>
    </div>
  )
}
