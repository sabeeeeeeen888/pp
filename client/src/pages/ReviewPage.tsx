import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import './FeaturePage.css'
import './ReviewPage.css'

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface SubmissionForReview {
  id: string
  description: string
  location: string
  date: string
  imageName: string
  submittedAt: string
  status: ReviewStatus
  pointsAwarded?: number
  researcherFeedback?: string
}

const QUEUE_KEY = 'pelican_submissions_queue'

function saveQueue(items: SubmissionForReview[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  } catch {
    // ignore
  }
}

const DEMO_APPROVED: SubmissionForReview = {
  id: 'dummy-sample-approved',
  description: 'Shoreline erosion on the north side of the island; about 20–30 ft of marsh loss compared to last year. Several dead trees in the water. Photo taken from the public boat launch.',
  location: 'Barataria Bay, near Bay Jimmy',
  date: '2024-09-15',
  imageName: 'shoreline_erosion.jpg',
  submittedAt: '2024-09-15T14:22:00.000Z',
  status: 'approved',
  pointsAwarded: 25,
  researcherFeedback: 'Thank you for this report. We’ve added your observation to our erosion-rate model for this segment. The photo will help us validate the next aerial survey.',
}

const DEMO_PENDING: SubmissionForReview = {
  id: 'dummy-sample-pending',
  description: 'Possible colony activity near the marsh edge—saw several large birds and what looked like nesting material. Could not get close; photo from boat.',
  location: 'Terrebonne Parish, near Lake Mechant',
  date: '2024-10-02',
  imageName: 'colony_activity_oct.png',
  submittedAt: '2024-10-02T11:20:00.000Z',
  status: 'pending',
}

const DEMO_REJECTED: SubmissionForReview = {
  id: 'dummy-sample-rejected',
  description: 'Blurry photo of something in the water. Not sure what it is.',
  location: 'Unknown',
  date: '2024-09-28',
  imageName: 'blurry_photo.jpg',
  submittedAt: '2024-09-28T09:15:00.000Z',
  status: 'rejected',
  researcherFeedback: 'Image quality is too low to use. Please resubmit with a clearer photo and include location details if possible.',
}

function normalizeSubmission(item: unknown): SubmissionForReview | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id : String(o.id ?? '')
  if (!id) return null
  return {
    id,
    description: String(o.description ?? ''),
    location: String(o.location ?? ''),
    date: String(o.date ?? ''),
    imageName: String(o.imageName ?? ''),
    submittedAt: String(o.submittedAt ?? ''),
    status: (o.status === 'approved' || o.status === 'rejected' ? o.status : 'pending') as ReviewStatus,
    pointsAwarded: typeof o.pointsAwarded === 'number' ? o.pointsAwarded : undefined,
    researcherFeedback: typeof o.researcherFeedback === 'string' ? o.researcherFeedback : undefined,
  }
}

const LEGACY_APPROVED_ID = 'dummy-sample'

function loadQueue(): SubmissionForReview[] {
  let list: SubmissionForReview[] = []
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        list = arr.map(normalizeSubmission).filter((s): s is SubmissionForReview => s != null)
      }
    }
  } catch {
    // ignore
  }
  const hadLegacy = list.some((s) => s.id === LEGACY_APPROVED_ID)
  list = list.filter((s) => s.id !== LEGACY_APPROVED_ID)
  const haveIds = new Set(list.map((s) => s.id))
  const demos = [DEMO_PENDING, DEMO_REJECTED, DEMO_APPROVED].filter((d) => !haveIds.has(d.id))
  if (demos.length > 0) {
    list = [...demos, ...list]
    saveQueue(list)
  } else if (hadLegacy) {
    saveQueue(list)
  }
  if (list.length === 0) {
    list = [DEMO_PENDING, DEMO_REJECTED, DEMO_APPROVED]
    saveQueue(list)
  }
  return list
}

export function ReviewPage() {
  const { user } = useAuth()
  const roleConfig = getRoleConfig(user?.role)
  const [submissions, setSubmissions] = useState<SubmissionForReview[]>(() => loadQueue())
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('all')
  const [editing, setEditing] = useState<Record<string, { points: number; feedback: string }>>({})

  useEffect(() => {
    setSubmissions(loadQueue())
  }, [])

  const pending = submissions.filter((s) => s.status === 'pending')
  const approved = submissions.filter((s) => s.status === 'approved')
  const rejected = submissions.filter((s) => s.status === 'rejected')

  const filtered =
    filter === 'pending' ? pending : filter === 'approved' ? approved : filter === 'rejected' ? rejected : submissions

  const displayList = filtered.length > 0 ? filtered : submissions.length > 0 ? submissions : [DEMO_PENDING, DEMO_REJECTED, DEMO_APPROVED]

  const updateSubmission = (id: string, updates: Partial<SubmissionForReview>) => {
    const next = submissions.map((s) => (s.id === id ? { ...s, ...updates } : s))
    setSubmissions(next)
    saveQueue(next)
  }

  const getEdit = (id: string) => editing[id] ?? { points: 10, feedback: '' }

  const setEdit = (id: string, points: number, feedback: string) => {
    setEditing((prev) => ({ ...prev, [id]: { points, feedback } }))
  }

  const handleApprove = (sub: SubmissionForReview) => {
    const { points, feedback } = getEdit(sub.id)
    updateSubmission(sub.id, {
      status: 'approved',
      pointsAwarded: points,
      researcherFeedback: feedback || undefined,
    })
    setEditing((prev) => {
      const next = { ...prev }
      delete next[sub.id]
      return next
    })
  }

  const handleReject = (sub: SubmissionForReview) => {
    const { feedback } = getEdit(sub.id)
    updateSubmission(sub.id, {
      status: 'rejected',
      researcherFeedback: feedback || undefined,
    })
    setEditing((prev) => {
      const next = { ...prev }
      delete next[sub.id]
      return next
    })
  }

  if (!roleConfig.canApproveSubmissions) {
    return (
      <div className="feature-page">
        <header className="feature-header">
          <h1>Review submissions</h1>
        </header>
        <p className="muted" style={{ marginTop: '1rem' }}>
          This page is available to <strong>Research / Agency</strong> accounts. Sign in with that role to review and reward citizen reports.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <Link to="/dashboard" className="feature-link">Back to Dashboard</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="feature-page review-page">
      <header className="feature-header">
        <h1>Review submissions</h1>
        <p className="tagline">
          Review reports from wildlife resource managers, add feedback, and set how many points to reward.
        </p>
      </header>

      <section className="feature-section">
        <div className="review-filters">
          <button
            type="button"
            className={`review-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({submissions.length})
          </button>
          <button
            type="button"
            className={`review-filter-btn ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Yet to review ({pending.length})
          </button>
          <button
            type="button"
            className={`review-filter-btn ${filter === 'approved' ? 'active' : ''}`}
            onClick={() => setFilter('approved')}
          >
            Approved ({approved.length})
          </button>
          <button
            type="button"
            className={`review-filter-btn ${filter === 'rejected' ? 'active' : ''}`}
            onClick={() => setFilter('rejected')}
          >
            Rejected ({rejected.length})
          </button>
        </div>

        {displayList.length === 0 ? (
          <p className="muted">No submissions in this category.</p>
        ) : (
          <ul className="review-list">
            {displayList.map((sub) => (
              <li key={sub.id} className={`review-card review-card-${sub.status}`}>
                {(sub.imageName === 'colony_activity_oct.png' || sub.imageName === 'colony_activity_oct.jpg') && (
                  <div className="review-card-image-wrap">
                    <img src="/colony_activity_oct.png" alt="Submission" className="review-card-image" />
                  </div>
                )}
                <div className="review-card-meta">
                  <span>{sub.date || 'No date'}</span>
                  {sub.location && <span> · {sub.location}</span>}
                  <span> · {sub.imageName}</span>
                </div>
                <p className="review-card-desc">{sub.description}</p>

                {sub.status === 'pending' ? (
                  <div className="review-card-actions">
                    <label className="review-points-label">
                      Points to reward
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={getEdit(sub.id).points}
                        onChange={(e) =>
                          setEdit(sub.id, Math.max(0, parseInt(e.target.value, 10) || 0), getEdit(sub.id).feedback)
                        }
                        className="review-points-input"
                      />
                    </label>
                    <label className="review-feedback-label">
                      Researcher feedback (optional)
                      <textarea
                        rows={3}
                        placeholder="Add feedback for the submitter…"
                        value={getEdit(sub.id).feedback}
                        onChange={(e) => setEdit(sub.id, getEdit(sub.id).points, e.target.value)}
                        className="review-feedback-input"
                      />
                    </label>
                    <div className="review-buttons">
                      <button type="button" className="btn-primary" onClick={() => handleApprove(sub)}>
                        Approve
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => handleReject(sub)}>
                        Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="review-card-result">
                    {sub.status === 'approved' && (
                      <p className="review-awarded">
                        <strong>Points awarded:</strong> {sub.pointsAwarded ?? 0}
                      </p>
                    )}
                    {sub.researcherFeedback && (
                      <div className="review-feedback-block">
                        <strong>Your feedback:</strong>
                        <p>{sub.researcherFeedback}</p>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
