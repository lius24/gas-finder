import { useState } from 'react';
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

  // Google sign-in puts the user's profile photo in user_metadata. Use it
  // when present; fall back to the initial-letter circle otherwise (and if
  // the image URL fails to load — e.g. Google rate-limits the avatar host).
  const meta = session?.user?.user_metadata as
    | { avatar_url?: string; picture?: string }
    | undefined;
  const photoUrl = meta?.avatar_url ?? meta?.picture ?? null;
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!photoUrl && !photoFailed;

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
            {showPhoto ? (
              <img
                className="navbar-avatar-img"
                src={photoUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              initial
            )}
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
