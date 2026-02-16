import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { AUTH_ROLES } from '../api'
import { ROLES } from '../config/roles'
import type { RoleId } from '../config/roles'
import './FeaturePage.css'
import './LoginPage.css'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>(AUTH_ROLES[0])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email.trim(), '', role)
      navigate(redirect, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="feature-page login-page">
      <header className="feature-header">
        <h1>Sign in</h1>
        <p className="tagline">Enter any email and choose your role.</p>
      </header>

      <form className="auth-form citizen-form" onSubmit={handleSubmit}>
        {error && <p className="auth-error">{error}</p>}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="any@example.com"
          />
        </label>
        <label>
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="auth-role-select"
          >
            {AUTH_ROLES.map((r) => (
              <option key={r} value={r}>{ROLES[r as RoleId].label}</option>
            ))}
          </select>
        </label>
        {ROLES[role as RoleId] && (
          <p className="auth-role-desc">{ROLES[role as RoleId].description}</p>
        )}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Please wait…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
