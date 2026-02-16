import { Link } from 'react-router-dom'
import './HeroSection.css'

const FEATURES = [
  { to: '/explore?landLoss=1', label: 'Map + land loss', desc: 'Colonies on sinking vs growing delta' },
  { to: '/deltax', label: 'Delta-X', desc: 'NASA-style habitat risk & top priorities' },
  { to: '/early-warning', label: 'Early warning', desc: 'AI-based collapse detection 1–3 years ahead' },
  { to: '/priorities', label: 'Priorities', desc: 'Restoration priority list' },
  { to: '/geospatial', label: 'Data & metrics', desc: 'Richness and biodiversity' },
  { to: '/citizen-science', label: 'Get involved', desc: 'Citizen science' },
]

export function HeroSection() {
  return (
    <section className="hero" aria-label="Introduction">
      <div className="hero-inner">
        <p className="hero-tagline">From 400,000 aerial images to one priority list.</p>
        <h2 className="hero-mission">
          Decision-support for Louisiana coastal restoration: colony surveys, AI-ready image classification, and <strong>NASA Delta-X–style</strong> land-loss and habitat risk so managers know where to act first.
        </h2>
        <nav className="hero-cards" aria-label="Quick links">
          {FEATURES.map(({ to, label, desc }) => (
            <Link key={to} to={to} className="hero-card">
              <span className="hero-card-label">{label}</span>
              <span className="hero-card-desc">{desc}</span>
            </Link>
          ))}
        </nav>
      </div>
    </section>
  )
}
