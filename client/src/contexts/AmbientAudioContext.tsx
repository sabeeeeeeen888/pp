import { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

type AmbientAudioContextValue = {
  playing: boolean
  toggle: () => void
}

const AmbientAudioContext = createContext<AmbientAudioContextValue | null>(null)

export function useAmbientAudio() {
  const ctx = useContext(AmbientAudioContext)
  if (!ctx) throw new Error('useAmbientAudio must be used within AmbientAudioProvider')
  return ctx
}

export function AmbientAudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const location = useLocation()

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [])

  useEffect(() => {
    if (location.pathname === '/') {
      audioRef.current?.play().then(() => setPlaying(true)).catch(() => {})
    }
  }, [location.pathname])

  return (
    <AmbientAudioContext.Provider value={{ playing, toggle }}>
      <audio ref={audioRef} src="/background-music.mp3" loop />
      {children}
    </AmbientAudioContext.Provider>
  )
}
