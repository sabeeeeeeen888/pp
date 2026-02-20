import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleConfig } from '../config/roles'
import './Navbar.css'

export function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const isHome = location.pathname === '/'
  const roleConfig = getRoleConfig(user?.role)
  const navItems = user ? roleConfig.nav : []

  return (
    <nav className={`navbar ${isHome ? 'navbar-home' : ''}`}>
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
  )
}
