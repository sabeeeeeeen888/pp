import { useLocation } from 'react-router-dom'
import { useAmbientAudio } from '../contexts/AmbientAudioContext'
import './MusicPlayer.css'

export function MusicPlayer() {
  const { playing, toggle } = useAmbientAudio()
  const location = useLocation()
  const isHome = location.pathname === '/'

  if (isHome) return null

  return (
    <button
      type="button"
      className="music-toggle"
      onClick={toggle}
      aria-label={playing ? 'Pause birds chirp' : 'Play birds chirp'}
      title={playing ? 'Pause' : 'Play'}
    >
      <span className="music-icon" aria-hidden>
        {playing ? '⏸' : '▶'}
      </span>
    </button>
  )
}
