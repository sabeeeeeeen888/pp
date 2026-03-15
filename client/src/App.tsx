import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { AmbientAudioProvider } from './contexts/AmbientAudioContext'
import { AuthProvider } from './contexts/AuthContext'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { MusicPlayer } from './components/MusicPlayer'
import { HomePage } from './pages/HomePage'
import { ExplorePage } from './pages/ExplorePage'
import { PrioritiesPage } from './pages/PrioritiesPage'
import { GeospatialPage } from './pages/GeospatialPage'
import { CitizenSciencePage } from './pages/CitizenSciencePage'
import { DeltaXPage } from './pages/DeltaXPage'
import { EarlyWarningPage } from './pages/EarlyWarningPage'
import { ReviewPage } from './pages/ReviewPage'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ColonyDetailPage } from './pages/ColonyDetailPage'
import './App.css'

function AppContent() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className="app">
      {!isHome && <Navbar />}
      <main id="main" className="app-body">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/change-detection" element={<Navigate to="/explore#change-detection" replace />} />
          <Route path="/priorities" element={<PrioritiesPage />} />
          <Route path="/geospatial" element={<GeospatialPage />} />
          <Route path="/citizen-science" element={<CitizenSciencePage />} />
          <Route path="/deltax" element={<DeltaXPage />} />
          <Route path="/early-warning" element={<EarlyWarningPage />} />
          <Route path="/colony/:id" element={<ColonyDetailPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="*" element={<div className="app-body" style={{ padding: '2rem', textAlign: 'center' }}><h2>Page not found</h2><p><Link to="/">Go home</Link></p></div>} />
        </Routes>
      </main>
      <Footer />
      <MusicPlayer />
    </div>
  )
}

function App() {
  return (
    <AmbientAudioProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </AmbientAudioProvider>
  )
}

export default App
