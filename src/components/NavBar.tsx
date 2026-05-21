import { NavLink } from 'react-router-dom';

import { useAuth } from '@core/auth';

import './NavBar.css';

const ROUTES = [
  { to: '/', label: 'Pumps', end: true },
  { to: '/atlas', label: 'Atlas', end: false },
  { to: '/report', label: 'Report', end: false },
  { to: '/garage', label: 'Garage', end: false },
];

export function NavBar() {
  const { session } = useAuth();
  const email = session?.user?.email ?? null;
  const initial = (email?.[0] ?? '?').toUpperCase();

  return (
    <header className="navbar">
      <NavLink to="/" className="navbar-brand" end>
        <span className="navbar-mark" aria-hidden />
        <span className="navbar-brand-text">Pump</span>
      </NavLink>

      <nav className="navbar-menu" aria-label="Primary">
        {ROUTES.map((r) => (
          <NavLink
            key={r.to}
            to={r.to}
            end={r.end}
            className={({ isActive }) =>
              isActive ? 'navbar-link navbar-link--active' : 'navbar-link'
            }
          >
            {r.label}
          </NavLink>
        ))}
      </nav>

      <div className="navbar-auth">
        {session ? (
          <NavLink
            to="/garage"
            className="navbar-avatar"
            aria-label={`Signed in as ${email ?? 'your account'}`}
          >
            {initial}
          </NavLink>
        ) : (
          <NavLink to="/sign-in" className="navbar-signin">
            Sign in
          </NavLink>
        )}
      </div>
    </header>
  );
}
