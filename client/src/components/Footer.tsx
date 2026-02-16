import { useLocation } from 'react-router-dom'
import './Footer.css'

export function Footer() {
  const location = useLocation()
  if (location.pathname === '/') return null

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="footer-inner">
        <div className="footer-bottom">
          <img src="/homepage.png" alt="" className="footer-image" aria-hidden="true" />
          <p className="footer-tag">making birds home safer. designed by sabin.</p>
        </div>
      </div>
    </footer>
  )
}
