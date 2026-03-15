import { useState } from 'react'
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import type { RiskScore } from '../types'
import './ImageryComparison.css'

const LOUISIANA_CENTER: [number, number] = [29.4, -91.2]
const DEFAULT_ZOOM = 9

// Esri World Imagery — reliable satellite base; same imagery both panes (no time API in this viewer).
const ESRI_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

function MiniMap({
  center,
  dateLabel,
  tileUrl,
  colony,
}: {
  center: [number, number]
  dateLabel: string
  tileUrl: string
  colony: RiskScore | null
}) {
  return (
    <div className="imagery-pane">
      <div className="imagery-pane-label">{dateLabel}</div>
      <MapContainer
        center={center}
        zoom={DEFAULT_ZOOM}
        className="imagery-mini-map"
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url={tileUrl} />
        {colony && (
          <CircleMarker
            center={[colony.latitude, colony.longitude]}
            radius={8}
            pathOptions={{
              fillColor: '#f59e0b',
              color: '#fff',
              weight: 2,
              fillOpacity: 0.9,
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}

export function ImageryComparison({
  colony,
  onClose,
}: {
  colony: RiskScore | null
  onClose: () => void
}) {
  const [sliderPos, setSliderPos] = useState(50)
  const center: [number, number] = colony
    ? [colony.latitude, colony.longitude]
    : LOUISIANA_CENTER

  // Esri World Imagery — same source both sides; labels indicate intended 2010 vs 2024 comparison.
  const url2010 = ESRI_IMAGERY
  const url2024 = ESRI_IMAGERY

  return (
    <div className="imagery-comparison-overlay" role="dialog" aria-label="Before / after imagery">
      <div className="imagery-comparison-header">
        <h3>Imagery comparison: 2010 vs 2024</h3>
        <p className="imagery-comparison-hint">
          Cross-validate Delta-X subsidence with the main map. Both panes use Esri World Imagery (same period). Drag the slider to compare the view. For true 2010 vs 2024 dates, use the before/after slider on a colony detail page.
        </p>
        <button type="button" className="imagery-comparison-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="imagery-comparison-body">
        <div className="imagery-slider-wrap" style={{ '--slider-pct': `${sliderPos}%` } as React.CSSProperties}>
          <div className="imagery-left">
            <MiniMap key="2010" center={center} dateLabel="2010" tileUrl={url2010} colony={colony} />
          </div>
          <div className="imagery-divider">
            <input
              type="range"
              min={0}
              max={100}
              value={sliderPos}
              onChange={(e) => setSliderPos(Number(e.target.value))}
              className="imagery-range"
              aria-label="Swipe between 2010 and 2024"
            />
          </div>
          <div className="imagery-right">
            <MiniMap key="2024" center={center} dateLabel="2024" tileUrl={url2024} colony={colony} />
          </div>
        </div>
        {colony && (
          <p className="imagery-colony-name">
            Centered on <strong>{colony.colony_id}</strong> — {colony.risk_category} risk
          </p>
        )}
      </div>
    </div>
  )
}
