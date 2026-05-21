import { Heart, Navigation, Camera } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '@core/auth';
import {
  addFavorite,
  getFavoriteAlert,
  isFavorite,
  removeFavorite,
  setFavoriteAlert,
} from '@core/favorites';
import { formatDistance } from '@core/geo';
import { supabase } from '@core/supabase';
import {
  ALL_OCTANES,
  OCTANE_LABELS,
  PRIMARY_OCTANES,
  type Octane,
  type SourceKind,
  type Station,
  type StationWithPrice,
} from '@core/types';

import './StationDetail.css';

type DetailPrice = {
  octane: Octane;
  price_cents: number;
  source_kind: SourceKind;
  observed_at: string;
};

type StationDetailResponse = {
  station: Station;
  prices: DetailPrice[];
};

function pumpOctanesFor(prices: { octane: Octane }[]): Octane[] {
  const stationOctanes = new Set(prices.map((p) => p.octane));
  return ALL_OCTANES.filter(
    (o) => PRIMARY_OCTANES.includes(o) || stationOctanes.has(o),
  );
}

function sourceLabel(kind: SourceKind): string {
  switch (kind) {
    case 'scrape':
      return 'auto';
    case 'crowd':
      return 'reported';
    case 'official':
      return 'verified';
    case 'google':
      return 'live';
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

export function StationDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();

  const seed = location.state?.seed as StationWithPrice | undefined;

  const [favorited, setFavorited] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [station, setStation] = useState<Station | null>(seed ?? null);
  const [prices, setPrices] = useState<DetailPrice[]>(() => {
    if (
      seed &&
      seed.octane != null &&
      seed.price_cents != null &&
      seed.source_kind != null &&
      seed.observed_at != null
    ) {
      return [
        {
          octane: seed.octane,
          price_cents: seed.price_cents,
          source_kind: seed.source_kind,
          observed_at: seed.observed_at,
        },
      ];
    }
    return [];
  });
  const [loading, setLoading] = useState(true);

  const [alertOctane, setAlertOctane] = useState<Octane>(seed?.octane ?? 87);
  const [alertInput, setAlertInput] = useState('');
  const [alertSaved, setAlertSaved] = useState<{ octane: Octane | null; cents: number | null }>({
    octane: null,
    cents: null,
  });
  const [alertSaving, setAlertSaving] = useState(false);

  const fetchStation = useCallback(async () => {
    const { data } = await supabase.functions.invoke<StationDetailResponse>('station', {
      body: { id },
    });
    if (data?.station) {
      setStation(data.station);
      setPrices(data.prices ?? []);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchStation();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStation]);


  useEffect(() => {
    if (!session?.user?.id || !id) {
      setFavorited(false);
      return;
    }
    let cancelled = false;
    isFavorite(session.user.id, id).then((value) => {
      if (!cancelled) setFavorited(value);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, id]);

  useEffect(() => {
    if (!session?.user?.id || !id || !favorited) {
      setAlertSaved({ octane: null, cents: null });
      setAlertInput('');
      return;
    }
    let cancelled = false;
    getFavoriteAlert(session.user.id, id).then((cfg) => {
      if (cancelled || !cfg) return;
      setAlertSaved({
        octane: cfg.alert_octane,
        cents: cfg.alert_threshold_cents,
      });
      if (cfg.alert_octane) setAlertOctane(cfg.alert_octane);
      if (cfg.alert_threshold_cents != null) {
        setAlertInput((cfg.alert_threshold_cents / 100).toFixed(2));
      } else {
        setAlertInput('');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, id, favorited]);

  const toggleFavorite = useCallback(async () => {
    if (!session?.user?.id) {
      navigate('/sign-in');
      return;
    }
    if (favoritePending) return;
    const next = !favorited;
    setFavorited(next);
    setFavoritePending(true);
    const { error } = next
      ? await addFavorite(session.user.id, id!)
      : await removeFavorite(session.user.id, id!);
    setFavoritePending(false);
    if (error) {
      setFavorited(!next);
    }
  }, [session?.user?.id, favorited, favoritePending, id, navigate]);

  const saveAlert = useCallback(async () => {
    if (!session?.user?.id || alertSaving) return;
    const trimmed = alertInput.trim();
    const dollars = parseFloat(trimmed);
    if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 15) {
      alert('Enter a dollar amount like 3.49.');
      return;
    }
    const cents = Math.round(dollars * 100);
    setAlertSaving(true);
    const { error } = await setFavoriteAlert(session.user.id, id!, {
      alert_octane: alertOctane,
      alert_threshold_cents: cents,
    });
    setAlertSaving(false);
    if (error) {
      alert(`Could not save alert: ${error.message}`);
      return;
    }
    setAlertSaved({ octane: alertOctane, cents });
  }, [session?.user?.id, alertInput, alertOctane, alertSaving, id]);

  const clearAlert = useCallback(async () => {
    if (!session?.user?.id || alertSaving) return;
    setAlertSaving(true);
    const { error } = await setFavoriteAlert(session.user.id, id!, {
      alert_octane: null,
      alert_threshold_cents: null,
    });
    setAlertSaving(false);
    if (error) {
      alert(`Could not clear alert: ${error.message}`);
      return;
    }
    setAlertSaved({ octane: null, cents: null });
    setAlertInput('');
  }, [session?.user?.id, alertSaving, id]);

  const priceByOctane = useMemo(() => {
    const map = new Map<Octane, DetailPrice>();
    for (const p of prices) map.set(p.octane, p);
    return map;
  }, [prices]);

  const visibleOctanes = useMemo(() => pumpOctanesFor(prices), [prices]);

  const openDirections = useCallback(() => {
    if (!station) return;
    const placePart = station.google_place_id
      ? `&destination_place_id=${encodeURIComponent(station.google_place_id)}`
      : '';
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}${placePart}`;
    window.open(url, '_blank');
  }, [station]);

  const alertActive = alertSaved.octane != null && alertSaved.cents != null;

  if (!station && loading) {
    return (
      <div className="sd-center">
        <div className="sd-spinner" aria-label="Loading" />
      </div>
    );
  }

  if (!station) {
    return (
      <div className="sd-center">
        <p className="sd-error">couldn&apos;t load this station.</p>
        <button
          type="button"
          className="sd-retry-btn"
          onClick={async () => {
            setLoading(true);
            await fetchStation();
            setLoading(false);
          }}>
          RETRY
        </button>
      </div>
    );
  }

  return (
    <div className="sd-page">
      <div className="sd-scroll">
        {/* Header — vintage receipt header with brand at scale */}
        <div className="sd-header-card">
          <div className="sd-header-top-row">
            <span className="sd-header-label">STATION</span>
            <button
              type="button"
              className="sd-heart-btn"
              aria-label={favorited ? 'Remove favorite' : 'Add favorite'}
              onClick={toggleFavorite}>
              <Heart
                size={22}
                className={favorited ? 'sd-heart-icon sd-heart-icon--active' : 'sd-heart-icon'}
                fill={favorited ? 'currentColor' : 'none'}
              />
            </button>
          </div>

          <p className="sd-brand">
            {(station.brand ?? station.name).toUpperCase()}
          </p>
          {station.brand && station.brand !== station.name ? (
            <p className="sd-subbrand">{station.name.toLowerCase()}</p>
          ) : null}

          <div className="sd-divider" />

          <p className="sd-address">{station.address.toLowerCase()}</p>
          {seed?.distance_meters != null ? (
            <p className="sd-distance">
              {formatDistance(seed.distance_meters)} from where you are
            </p>
          ) : null}
        </div>

        {/* Pump display — 4 octane rows like a real fuel pump */}
        <div className="sd-pump-panel">
          <div className="sd-pump-header">
            <span className="sd-pump-header-text">FUEL · PRICE PER GALLON</span>
          </div>
          {visibleOctanes.map((o) => {
            const p = priceByOctane.get(o);
            const highlight = seed?.octane === o;
            return (
              <div
                key={o}
                className={highlight ? 'sd-pump-row sd-pump-row--active' : 'sd-pump-row'}>
                <div className="sd-pump-row-left">
                  <span
                    className={
                      highlight
                        ? 'sd-pump-octane sd-pump-octane--active'
                        : 'sd-pump-octane'
                    }>
                    {o}
                  </span>
                  <span className="sd-pump-octane-label">
                    {OCTANE_LABELS[o].toUpperCase()}
                  </span>
                </div>
                <div className="sd-pump-row-right">
                  {p ? (
                    <>
                      <div className="sd-pump-digits">
                        <span className="sd-price-whole">
                          {Math.floor(p.price_cents / 100)}
                        </span>
                        <span className="sd-price-dot">.</span>
                        <span className="sd-price-fraction">
                          {(p.price_cents % 100).toString().padStart(2, '0')}
                        </span>
                      </div>
                      <span className="sd-price-meta">
                        {sourceLabel(p.source_kind)} · {relativeTime(p.observed_at)}
                      </span>
                    </>
                  ) : (
                    <span className="sd-price-missing">– – –</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="sd-primary-btn"
          onClick={openDirections}>
          <Navigation size={16} />
          GET DIRECTIONS
        </button>

        <button
          type="button"
          className="sd-secondary-btn"
          onClick={() =>
            navigate('/report', {
              state: {
                stationId: station.id,
                stationLabel: station.brand ?? station.name,
              },
            })
          }>
          <Camera size={16} />
          REPORT A PRICE
        </button>

        {favorited ? (
          <div className="sd-alert-card">
            <div className="sd-alert-header">
              <div className="sd-alert-header-line" />
              <span className="sd-alert-title">PRICE WATCH</span>
              <div className="sd-alert-header-line" />
            </div>
            <p className="sd-alert-hint">
              We&apos;ll buzz your phone when this pump drops to or below your threshold.
            </p>

            <span className="sd-alert-section">OCTANE</span>
            <div className="sd-alert-octane-row">
              {visibleOctanes.map((o) => {
                const active = alertOctane === o;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setAlertOctane(o)}
                    className={active ? 'sd-alert-chip sd-alert-chip--active' : 'sd-alert-chip'}>
                    {o}
                  </button>
                );
              })}
            </div>

            <span className="sd-alert-section">NOTIFY ME WHEN ≤</span>
            <div className="sd-alert-input-row">
              <span className="sd-alert-dollar">$</span>
              <input
                type="text"
                inputMode="decimal"
                className="sd-alert-input"
                value={alertInput}
                onChange={(e) => setAlertInput(e.target.value)}
                placeholder="3.49"
                disabled={alertSaving}
              />
              <button
                type="button"
                onClick={saveAlert}
                disabled={alertSaving || alertInput.trim().length === 0}
                className="sd-alert-save-btn">
                {alertActive ? 'UPDATE' : 'SET'}
              </button>
            </div>

            {alertActive ? (
              <div className="sd-alert-active-row">
                <span className="sd-alert-active-text">
                  watching {alertSaved.octane} oct ≤ ${(alertSaved.cents! / 100).toFixed(2)}
                </span>
                <button
                  type="button"
                  className="sd-alert-clear-btn"
                  onClick={clearAlert}
                  disabled={alertSaving}>
                  clear
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
