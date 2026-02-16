import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, Tooltip, useMap } from 'react-leaflet'
import type { RiskScore } from '../types'
import type { LandLossFeature } from '../api'
import './MapView.css'

const LOUISIANA_CENTER: [number, number] = [29.4, -91.2]
const DEFAULT_ZOOM = 8

const BASEMAP_URLS = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
}

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

function RiskMarkers({ data, heatmap }: { data: RiskScore[]; heatmap: boolean }) {
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
              color: 'rgba(255,255,255,0.6)',
              weight: 1,
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
          radius={6}
          pathOptions={{
            fillColor: c.risk_color === 'green' ? '#16a34a' : c.risk_color === 'yellow' ? '#ca8a04' : '#dc2626',
            color: '#fff',
            weight: 1.5,
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
            Decline rate: {c.decline_rate.toFixed(0)} nests
            {c.habitat_vulnerability != null && (
              <>
                <br />
                Habitat vulnerability: {(c.habitat_vulnerability * 100).toFixed(0)}%
              </>
            )}
            <br />
            Species: {c.species_list.slice(0, 4).join(', ')}{c.species_list.length > 4 ? '…' : ''}
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
}: {
  riskData: RiskScore[]
  heatmap: boolean
  loading: boolean
  landLossZones?: LandLossFeature[] | null
  centerOn?: { lat: number; lng: number } | null
  basemap?: 'dark' | 'light' | 'satellite'
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
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={BASEMAP_URLS[basemap]}
        />
        <CenterOn center={centerOn} />
        {landLossZones && landLossZones.length > 0 && <LandLossOverlay zones={landLossZones} />}
        <RiskMarkers data={riskData} heatmap={heatmap} />
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
      </div>
    </div>
  )
}
