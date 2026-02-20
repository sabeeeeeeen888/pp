import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAmbientAudio } from '../contexts/AmbientAudioContext'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import '../components/Navbar.css'
import './HomePage.css'

export function HomePage() {
  const { playing, toggle } = useAmbientAudio()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const roleConfig = getRoleConfig(user?.role)
  const navItems = user ? roleConfig.nav : []

  return (
    <div className="home-page">
      <nav className="navbar navbar-home">
        <div className="navbar-inner">
          <NavLink to={user ? "/dashboard" : "/"} className="navbar-brand" end>
            Project Pelican
          </NavLink>
          {user && (
            <span className="navbar-role">
              {roleConfig.label} account
            </span>
          )}
          {user && navItems.length > 0 && (
            <ul className="navbar-links">
              {navItems.map((item) => (
                <li key={item.path}>
                  <NavLink to={item.path} className={({ isActive }) => (isActive ? 'active' : '')}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
              <li>
                <button type="button" className="navbar-signout" onClick={() => { signOut(); navigate('/login') }}>
                  Sign out
                </button>
              </li>
            </ul>
          )}
        </div>
      </nav>
      <div className="home-hero-section">
        <div className="home-video-wrap">
          <video
            className="home-video"
            src="/homepage.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden
          />
        </div>
        <div className="home-overlay" aria-hidden />
        <div className="home-hero-center">
          <h1 className="home-hero-title">
            <span>When birds speak,</span>
            <span>we listen.</span>
          </h1>
          <p className="home-hero-tagline">
            Data-Driven Restoration for the Louisiana Coast
          </p>
          <Link to="/login" className="home-hero-cta">
            JOIN THE RESTORATION NETWORK
          </Link>
        </div>
        <div className="home-hero-audio">
          <button
            type="button"
            className="home-audio-btn"
            onClick={toggle}
            aria-label={playing ? 'Pause ambient sound' : 'Listen to nature'}
          >
            {playing ? (
              <span className="home-audio-icon" aria-hidden>⏸</span>
            ) : (
              <span className="home-audio-label">Listen to nature</span>
            )}
          </button>
        </div>
      </div>
      <div className="home-data-section">
        <div className="home-data-content">
          <p className="home-data-label">Data from</p>
          <a 
            href="https://www.nasa.gov" 
            target="_blank" 
            rel="noopener noreferrer"
            className="home-nasa-logo-link"
            aria-label="NASA - National Aeronautics and Space Administration"
          >
            <img 
              src="/nasa-logo.png" 
              alt="NASA Logo" 
              className="home-nasa-logo"
            />
          </a>
        </div>
      </div>
    </div>
  )
}
