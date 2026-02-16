import { Link } from 'react-router-dom'
import { useAmbientAudio } from '../contexts/AmbientAudioContext'
import './HomePage.css'

export function HomePage() {
  const { playing, toggle } = useAmbientAudio()

  return (
    <div className="home-page">
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
  )
}
