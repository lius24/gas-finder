// Garage — settings tab for the Vite re-platform.
//
// Sub-component logic (ThemePicker, HomeLocationPicker) is folded in here to
// keep this branch conflict-free while other ports land in parallel.
//
// Sign-in is the /sign-in route (a full page on web, not a modal).
// ZonePicker is a "coming soon" stub — parity with the RN web behaviour.

import { Calculator, Heart, Home, Locate, Palette } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@core/auth';
import { listFavorites, type FavoriteWithStation } from '@core/favorites';
import { getHomeLocation, setHomeLocation, type HomeLocation } from '@core/preferences';
import { THEME_IDS, THEMES, type ThemeId } from '@core/theme';
import { useSetTheme, useThemeId } from '@core/theme-provider';

import { AddressAutocomplete } from '../components/AddressAutocomplete';

import './Garage.css';

// ─── Theme descriptions (only web themes) ────────────────────────────────────
const THEME_DESCRIPTIONS: Record<ThemeId, string> = {
  ferrari: 'Near-black canvas, Outfit display type, Rosso Corsa as scarce accent.',
  airtable: 'White canvas, Archivo grotesk, signature-coral accent. Editorial.',
};

// ─── ThemePicker (folded in) ──────────────────────────────────────────────────
function ThemePicker() {
  const activeId = useThemeId();
  const setTheme = useSetTheme();

  return (
    <div className="gr-theme-list">
      {THEME_IDS.map((id) => {
        const t = THEMES[id];
        const active = id === activeId;
        return (
          <button
            key={id}
            type="button"
            className={`gr-theme-row${active ? ' gr-theme-row--active' : ''}`}
            onClick={() => setTheme(id)}
            aria-pressed={active}
          >
            <div className="gr-swatch-row" data-theme-swatches={id}>
              <span className="gr-swatch gr-swatch--bg" />
              <span className="gr-swatch gr-swatch--paper" />
              <span className="gr-swatch gr-swatch--rust" />
              <span className="gr-swatch gr-swatch--amber" />
              <span className="gr-swatch gr-swatch--ink" />
            </div>
            <div className="gr-theme-body">
              <div className="gr-theme-title-row">
                <span className="gr-theme-name">{t.name}</span>
                {active ? <span className="gr-active-badge">ACTIVE</span> : null}
              </div>
              <p className="gr-theme-desc">{THEME_DESCRIPTIONS[id]}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── HomeLocationPicker (folded in) ──────────────────────────────────────────
function HomeLocationPicker() {
  const [home, setHome] = useState<HomeLocation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    getHomeLocation().then((h) => {
      setHome(h);
      setLoaded(true);
    });
  }, []);

  const clear = async () => {
    await setHomeLocation(null);
    setHome(null);
    setEditing(false);
  };

  if (!loaded) {
    return (
      <div className="gr-hlp-card">
        <span className="gr-spinner" aria-label="Loading" />
      </div>
    );
  }

  if (home && !editing) {
    return (
      <div className="gr-hlp-card">
        <div className="gr-hlp-saved-row">
          <div className="gr-hlp-pin-badge">
            <Home size={16} />
          </div>
          <div className="gr-hlp-saved-text">
            <span className="gr-hlp-saved-label">HOME</span>
            <span className="gr-hlp-saved-value">{home.label}</span>
          </div>
          <button
            type="button"
            className="gr-hlp-text-btn"
            onClick={() => setEditing(true)}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gr-hlp-card">
      <div className="gr-hlp-edit-wrap">
        <p className="gr-hlp-hint">
          Set a home address so Pump can rank stations even when GPS is off.
        </p>
        <AddressAutocomplete
          placeholder="City, ZIP, or full address"
          initialValue={home?.label ?? ''}
          onSelect={(s) => {
            void setHomeLocation({ label: s.label, latitude: s.latitude, longitude: s.longitude });
            setHome({ label: s.label, latitude: s.latitude, longitude: s.longitude });
            setEditing(false);
          }}
        />
        <div className="gr-hlp-actions">
          {home ? (
            <button
              type="button"
              className="gr-hlp-ghost-btn"
              onClick={() => void clear()}
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              className="gr-hlp-ghost-btn"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Garage (main) ────────────────────────────────────────────────────────────
export function Garage() {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const [favorites, setFavorites] = useState<FavoriteWithStation[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      setFavorites([]);
      return;
    }
    let cancelled = false;
    setFavoritesLoading(true);
    listFavorites(session.user.id).then((rows) => {
      if (cancelled) return;
      setFavorites(rows);
      setFavoritesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const email = session?.user?.email ?? null;
  const avatarInitial = (email?.[0] ?? 'G').toUpperCase();

  // Google sign-in supplies a profile photo in user_metadata; use it when
  // present, fall back to the initial circle if missing or it fails to load.
  const meta = session?.user?.user_metadata as
    | { avatar_url?: string; picture?: string }
    | undefined;
  const photoUrl = meta?.avatar_url ?? meta?.picture ?? null;
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!photoUrl && !photoFailed;

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="gr-page">
      <div className="gr-content">
        <div className="gr-brand-rule" />
        <p className="gr-kicker">YOUR · GARAGE</p>
        <h1 className="gr-title">Settings</h1>

        {/* Profile hero */}
        <div className="gr-profile-card">
          <div className="gr-avatar">
            {showPhoto ? (
              <img
                className="gr-avatar-img"
                src={photoUrl}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <span className="gr-avatar-text">{avatarInitial}</span>
            )}
          </div>
          <div className="gr-profile-text">
            <span className="gr-profile-label">
              {loading ? 'LOADING' : session ? 'SIGNED IN' : 'NOT SIGNED IN'}
            </span>
            <span className="gr-profile-value">
              {loading ? '…' : session ? email : 'Guest driver'}
            </span>
          </div>
          {!loading ? (
            session ? (
              <button
                type="button"
                className="gr-outline-btn"
                onClick={() => void handleSignOut()}
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                className="gr-fill-btn"
                onClick={() => navigate('/sign-in')}
              >
                Sign in
              </button>
            )
          ) : null}
        </div>

        {!session && !loading ? (
          <p className="gr-profile-hint">
            Sign in to save favorites, set price alerts, and sync across devices.
          </p>
        ) : null}

        {/* Appearance */}
        <div className="gr-section">
          <div className="gr-section-head">
            <Palette size={15} className="gr-section-icon" />
            <span className="gr-section-header">APPEARANCE</span>
          </div>
          <p className="gr-section-sub">Pick a look. Each theme restyles the whole app.</p>
          <ThemePicker />
        </div>

        {/* Home location */}
        <div className="gr-section">
          <div className="gr-section-head">
            <Home size={15} className="gr-section-icon" />
            <span className="gr-section-header">HOME LOCATION</span>
          </div>
          <HomeLocationPicker />
        </div>

        {/* About */}
        <div className="gr-section">
          <div className="gr-section-head">
            <Calculator size={15} className="gr-section-icon" />
            <span className="gr-section-header">ABOUT</span>
          </div>
          <Link to="/about" className="gr-about-card">
            <div className="gr-about-body">
              <span className="gr-about-title">How the math works</span>
              <p className="gr-about-desc">
                The decision-math formula and why &ldquo;cheaper&rdquo; isn&apos;t always
                cheaper.
              </p>
            </div>
            <span className="gr-about-arrow">›</span>
          </Link>
        </div>

        {/* Price-tracking zone — signed-in only */}
        {session ? (
          <div className="gr-section">
            <div className="gr-section-head">
              <Locate size={15} className="gr-section-icon" />
              <span className="gr-section-header">PRICE TRACKING ZONE</span>
            </div>
            <div className="gr-zone-stub">
              <p className="gr-zone-stub-text">Coming soon — zone-based price alerts.</p>
            </div>
          </div>
        ) : null}

        {/* Favorites — signed-in only */}
        {session ? (
          <div className="gr-section">
            <div className="gr-section-head">
              <Heart size={15} className="gr-section-icon" />
              <span className="gr-section-header">FAVORITES</span>
            </div>
            {favoritesLoading ? (
              <p className="gr-muted">loading…</p>
            ) : favorites.length === 0 ? (
              <div className="gr-empty-card">
                <p className="gr-muted">
                  No favorites yet — tap the heart on a station to save it.
                </p>
              </div>
            ) : (
              <div className="gr-fav-list">
                {favorites.map((f) => {
                  const hasAlert =
                    f.alert_threshold_cents != null && f.alert_octane != null;
                  return (
                    <Link
                      key={f.station_id}
                      to={`/station/${f.station_id}`}
                      state={{ seed: f.station }}
                      className="gr-fav-row"
                    >
                      <div className="gr-fav-left">
                        <span className="gr-fav-brand">
                          {(f.station.brand ?? f.station.name).toUpperCase()}
                        </span>
                        <span className="gr-fav-address">{f.station.address.toLowerCase()}</span>
                        {hasAlert ? (
                          <span className="gr-fav-alert">
                            ♢ alert · {f.alert_octane} oct ≤ $
                            {(f.alert_threshold_cents! / 100).toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                      <span className="gr-fav-arrow">›</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
