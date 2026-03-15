import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import 'leaflet/dist/leaflet.css'
import './FeaturePage.css'
import './CitizenSciencePage.css'

const LOUISIANA_CENTER: [number, number] = [29.4, -91.2]

function LocationMapPicker({
  center,
  pin,
  onSelect,
}: {
  center: [number, number]
  pin: [number, number] | null
  onSelect: (lat: number, lng: number) => void
}) {
  function MapClickHandler() {
    useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng
        onSelect(lat, lng)
      },
    })
    return null
  }

  return (
    <div className="citizen-location-map-wrap">
      <MapContainer
        center={center}
        zoom={8}
        className="citizen-location-map"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapClickHandler />
        {pin && (
          <CircleMarker
            center={pin}
            radius={10}
            pathOptions={{ fillColor: '#16a34a', color: '#fff', weight: 2, fillOpacity: 0.9 }}
          />
        )}
      </MapContainer>
    </div>
  )
}

type CitizenSubmission = {
  id: string
  description: string
  location: string
  date: string
  imageName: string
  submittedAt: string
  researcherFeedback?: string
}

const DUMMY_SUBMISSION: CitizenSubmission = {
  id: 'dummy-sample',
  description: 'Shoreline erosion on the north side of the island; about 20–30 ft of marsh loss compared to last year. Several dead trees in the water. Photo taken from the public boat launch.',
  location: 'Barataria Bay, near Bay Jimmy',
  date: '2024-09-15',
  imageName: 'shoreline_erosion.jpg',
  submittedAt: '2024-09-15T14:22:00.000Z',
  researcherFeedback: 'Thank you for this report. We’ve added your observation to our erosion-rate model for this segment. The photo will help us validate the next aerial survey. If you’re able to note approximate coordinates or landmarks in future submissions, that would be very helpful.',
}

const DEMO_OBSERVATIONS = [
  {
    id: 'demo1',
    imageLabel: 'Colony aerial',
    description: 'Barataria Bay, May 2023. Dense nesting area on natural island; ~80 active nests, Brown Pelican and Laughing Gull. Vegetation healthy, no visible erosion.',
    location: 'Barataria Bay',
    date: '2023-05-15',
  },
  {
    id: 'demo2',
    imageLabel: 'Shoreline habitat',
    description: 'Terrebonne Parish. Mixed colony on restored marsh edge. Approx. 30 nests. Flagged possible erosion on north side—recommend follow-up survey.',
    location: 'Terrebonne Parish',
    date: '2023-06-02',
  },
  {
    id: 'demo3',
    imageLabel: 'Before/after restoration',
    description: 'Same site, 2021 vs 2024. Vegetation recovery and new nesting activity after sediment placement. Good example for restoration benefit tracking.',
    location: 'Atchafalaya Delta',
    date: '2024-04-10',
  },
]

export function CitizenSciencePage() {
  const { user } = useAuth()
  const roleConfig = getRoleConfig(user?.role)
  const [submitted, setSubmitted] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const [pinCoords, setPinCoords] = useState<[number, number] | null>(null)
  const [date, setDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const location = pinCoords ? `${pinCoords[0].toFixed(5)}, ${pinCoords[1].toFixed(5)}` : ''

  const [previousSubmissions, setPreviousSubmissions] = useState<CitizenSubmission[]>([])

  const STORAGE_KEY = 'pelican_previous_reports'
  const QUEUE_KEY = 'pelican_submissions_queue'
  const PELICAN_POINTS_KEY = 'pelican_user_points'
  const PELICAN_CLAIMED_KEY = 'pelican_claimed_feedback_ids'
  const POINTS_PER_REPORT = 5
  const BONUS_POINTS_FEEDBACK = 10

  const [claimedIds, setClaimedIds] = useState<string[]>([])
  const [queueFeedback, setQueueFeedback] = useState<Record<string, { researcherFeedback?: string; pointsAwarded?: number }>>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(
            (s: CitizenSubmission) => !(s.description?.trim() === 'd' && s.imageName?.includes('ChatGPT Image'))
          )
          if (cleaned.length !== parsed.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
          }
          setPreviousSubmissions(cleaned)
        }
      }
    } catch {
      // ignore
    }
    try {
      const claimedRaw = localStorage.getItem(PELICAN_CLAIMED_KEY)
      if (claimedRaw) {
        const arr = JSON.parse(claimedRaw)
        if (Array.isArray(arr)) setClaimedIds(arr)
      }
    } catch {
      // ignore
    }
  }, [])

  const claimPoints = (submissionId: string) => {
    const nextClaimed = [...claimedIds, submissionId]
    setClaimedIds(nextClaimed)
    try {
      localStorage.setItem(PELICAN_CLAIMED_KEY, JSON.stringify(nextClaimed))
      const pointsToAdd = queueFeedback[submissionId]?.pointsAwarded ?? BONUS_POINTS_FEEDBACK
      const pointsRaw = localStorage.getItem(PELICAN_POINTS_KEY)
      const current = pointsRaw ? Math.max(0, parseInt(pointsRaw, 10) || 0) : 0
      localStorage.setItem(PELICAN_POINTS_KEY, String(current + pointsToAdd))
    } catch {
      // ignore
    }
  }

  const removeSubmission = (id: string) => {
    const next = previousSubmissions.filter((s) => s.id !== id)
    setPreviousSubmissions(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  const saveSubmission = (payload: { description: string; location: string; date: string; imageName: string; latitude?: number; longitude?: number }) => {
    const id = `report-${Date.now()}`
    const entry = {
      id,
      ...payload,
      submittedAt: new Date().toISOString(),
    }
    const next = [entry, ...previousSubmissions]
    setPreviousSubmissions(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      const pointsRaw = localStorage.getItem(PELICAN_POINTS_KEY)
      const current = pointsRaw ? Math.max(0, parseInt(pointsRaw, 10) || 0) : 0
      localStorage.setItem(PELICAN_POINTS_KEY, String(current + POINTS_PER_REPORT))
      const queueRaw = localStorage.getItem(QUEUE_KEY)
      const queue: Array<{ id: string; description: string; location: string; date: string; imageName: string; submittedAt: string; status: string }> = queueRaw ? JSON.parse(queueRaw) : []
      const queueEntry = { ...entry, status: 'pending' as const }
      const nextQueue = [queueEntry, ...queue.filter((q: { id: string }) => q.id !== id)]
      localStorage.setItem(QUEUE_KEY, JSON.stringify(nextQueue))
    } catch {
      // ignore
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    const imageName = imageFile?.name ?? 'Photo attached'
    saveSubmission({
      description,
      location,
      date,
      imageName,
      latitude: pinCoords?.[0],
      longitude: pinCoords?.[1],
    })
    setTimeout(() => {
      setSubmitted(true)
      setSubmitting(false)
      setImageFile(null)
      setDescription('')
      setPinCoords(null)
      setDate('')
    }, 600)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setImageFile(f || null)
  }

  const isPublic = user?.role === 'Public'

  return (
    <div className="feature-page citizen-science-page">
      {isPublic ? (
        /* ========== Wildlife resource managers: Get Involved (education + how to contribute) ========== */
        <>
          <section className="citizen-hero">
            <h1 className="citizen-hero-title">The Coast Is Changing. You Can Help Monitor It.</h1>
            <p className="citizen-hero-text">
              Bird colonies respond quickly to changes in elevation, sediment supply, and shoreline erosion. Community observations strengthen habitat risk models and improve restoration decisions.
            </p>
          </section>

          <section className="feature-section citizen-upload-section">
            <h2>Report to the research team</h2>
            <p className="muted">Upload a photo and description. Your report will be shared with the research team to strengthen habitat risk models and restoration decisions.</p>
            {submitted ? (
              <div className="feature-card success">
                Thank you. Your report has been submitted and will be reviewed by the research team.
                <p style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                  <Link to="/explore" className="feature-link">See the map →</Link>
                </p>
              </div>
            ) : (
              <form className="citizen-form citizen-upload-form" onSubmit={handleSubmit}>
                <label>
                  <span>Photo (required)</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImageChange}
                    required
                  />
                  {imageFile && <span className="citizen-file-name">{imageFile.name}</span>}
                </label>
                <label>
                  <span>Description (required)</span>
                  <textarea
                    rows={4}
                    placeholder="Describe what you saw: location, erosion, vegetation, or colony activity (from a safe distance)…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Location — click the map to drop a pin</span>
                  <LocationMapPicker
                    center={LOUISIANA_CENTER}
                    pin={pinCoords}
                    onSelect={(lat, lng) => setPinCoords([lat, lng])}
                  />
                  {pinCoords && (
                    <p className="citizen-location-coords">
                      Selected: {pinCoords[0].toFixed(5)}, {pinCoords[1].toFixed(5)}
                    </p>
                  )}
                </label>
                <label>
                  <span>Date observed</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit report'}
                </button>
              </form>
            )}

            <div className="citizen-previous-submissions">
              <h3>Previous submissions</h3>
              <ul className="citizen-previous-list">
                  {[DUMMY_SUBMISSION, ...previousSubmissions.filter((s) => s.id !== DUMMY_SUBMISSION.id)].map((sub) => (
                    <li key={sub.id} className="citizen-previous-item">
                      {(sub.imageName === 'colony_activity_oct.png' || sub.imageName === 'colony_activity_oct.jpg') && (
                        <div className="citizen-previous-image-wrap">
                          <img src="/colony_activity_oct.png" alt="Submission" className="citizen-previous-image" />
                        </div>
                      )}
                      <div className="citizen-previous-item-head">
                        <span className="citizen-previous-meta">
                          {sub.date || 'No date'} {sub.location ? ` · ${sub.location}` : ''} · {sub.imageName}
                        </span>
                        {sub.id !== DUMMY_SUBMISSION.id && (
                          <button type="button" className="citizen-previous-delete" onClick={() => removeSubmission(sub.id)} aria-label="Remove submission">Remove</button>
                        )}
                      </div>
                      <p className="citizen-previous-desc">{sub.description}</p>
                      {(queueFeedback[sub.id]?.researcherFeedback ?? sub.researcherFeedback) && (
                        <div className="citizen-researcher-feedback">
                          <strong>Researcher feedback</strong>
                          <p>{queueFeedback[sub.id]?.researcherFeedback ?? sub.researcherFeedback}</p>
                          {claimedIds.includes(sub.id) ? (
                            <span className="citizen-claim-claimed">Points claimed</span>
                          ) : (
                            <button type="button" className="citizen-claim-btn" onClick={() => claimPoints(sub.id)}>
                              Claim your points
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
            </div>
          </section>
        </>
      ) : (
        /* ========== Research: Upload + demos ========== */
        <>
          <header className="feature-header">
            <h1>Citizen science</h1>
            <p className="tagline">Contribute observations and see how restoration benefits add up</p>
          </header>

          {roleConfig.canCitizenScienceSubmit && (
            <section className="feature-section citizen-upload-section">
              <h2>Upload your observation</h2>
              <p className="muted">Add a photo and description. Your submission helps validate colony data and document restoration impact.</p>
              {submitted ? (
                <div className="feature-card success">
                  Thank you. Your observation has been recorded. Research staff may use it to validate or extend colony data.
                  <p style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                    <Link to="/explore" className="feature-link">See the map →</Link>
                  </p>
                </div>
              ) : (
                <form className="citizen-form citizen-upload-form" onSubmit={handleSubmit}>
                  <label>
                    <span>Photo (required)</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageChange}
                      required
                    />
                    {imageFile && <span className="citizen-file-name">{imageFile.name}</span>}
                  </label>
                  <label>
                    <span>Description (required)</span>
                    <textarea
                      rows={4}
                      placeholder="Describe what you saw: location, species, nest count, habitat condition, erosion or restoration notes…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>Location — click the map to drop a pin</span>
                    <LocationMapPicker
                      center={LOUISIANA_CENTER}
                      pin={pinCoords}
                      onSelect={(lat, lng) => setPinCoords([lat, lng])}
                    />
                    {pinCoords && (
                      <p className="citizen-location-coords">
                        Selected: {pinCoords[0].toFixed(5)}, {pinCoords[1].toFixed(5)}
                      </p>
                    )}
                  </label>
                  <label>
                    <span>Date observed</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                  {roleConfig.canFlagErosion && (
                    <label className="toggle">
                      <input type="checkbox" name="flag_erosion" />
                      <span>Flag possible shoreline erosion or vegetation loss at this location</span>
                    </label>
                  )}
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit observation'}
                  </button>
                </form>
              )}
            </section>
          )}

          <section className="feature-section citizen-demos-section">
            <h2>Example submissions (demos)</h2>
            <p className="muted">See what a good observation looks like. Include a clear photo and a description with location, date, species, and any habitat or erosion notes.</p>
            <div className="citizen-demo-grid">
              {DEMO_OBSERVATIONS.map((demo) => (
                <div key={demo.id} className="citizen-demo-card">
                  <div className="citizen-demo-image">
                    <span className="citizen-demo-image-label">{demo.imageLabel}</span>
                  </div>
                  <div className="citizen-demo-body">
                    <p className="citizen-demo-desc">{demo.description}</p>
                    <p className="citizen-demo-meta">{demo.location} · {demo.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {roleConfig.canApproveSubmissions && (
            <section className="feature-section">
              <h2>Approve citizen submissions</h2>
              <p className="muted">Research / Agency: review and approve citizen science reports, validate AI model outputs, and annotate imagery. (Interface coming soon.)</p>
            </section>
          )}

          <section className="feature-section">
            <h2>Restoration &amp; resilience benefits</h2>
            <p>
              Restoration and resilience projects improve habitat for colonial waterbirds and other wildlife, stabilize
              shorelines, and support fisheries and communities. By contributing observations, you help document
              where these benefits are occurring and where more investment is needed.
            </p>
            <div className="feature-card">
              <strong>Benefits we track</strong>
              <ul>
                <li>Colony persistence and recovery after storms</li>
                <li>Species richness and abundance trends</li>
                <li>Priority areas for future restoration (see Priorities page)</li>
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
