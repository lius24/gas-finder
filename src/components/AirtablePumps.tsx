// Airtable "Editorial" Pumps view — sober white canvas, modest Archivo
// grotesk type, brand voltage from signature-colored full-bleed cards
// (coral / forest / cream / peach / mustard / mint). A real-CSS port of
// public/preview/airtable.html on the shared usePumpsData() hook.

import { MapPin, Navigation } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AddressAutocomplete } from './AddressAutocomplete';

import { formatSavingsRange } from '@core/decision-math';
import { formatDistance } from '@core/geo';
import { RADIUS_OPTIONS_METERS, type RadiusMeters } from '@core/preferences';
import { staleLabel } from '@core/staleness';
import type { StationWithPrice } from '@core/types';
import type { PumpsData } from '@core/use-pumps-data';

import './AirtablePumps.css';

// Signature-color rotation — one per station card, cycled by rank.
const FEATURE_COLORS = ['coral', 'forest', 'cream', 'peach', 'mustard', 'mint'] as const;


function radiusMiLabel(m: number): string {
  if (m === 1609) return '1';
  if (m === 4828) return '3';
  if (m === 8047) return '5';
  return '10';
}

type CardData = {
  key: string;
  color: (typeof FEATURE_COLORS)[number];
  kicker: string;
  brand: string;
  addr: string;
  price: { d: string; c: string } | null;
  octaneLabel: string;
  savings: string | null;
  showSavingsHint: boolean;
  station: StationWithPrice | null;
};

export function AirtablePumps({ data }: { data: PumpsData }) {
  const {
    sortedStations,
    stations,
    cheapestId,
    closestId,
    hiddenUnpriced,
    loading,
    error,
    octane,
    setOctane,
    radius,
    setRadius,
    sort,
    setSort,
    usingCurrentLocation,
    currentLocationLabel,
    searchLabel,
    applyCurrentLocation,
    applyLocationSelection,
  } = data;

  const hasData = sortedStations.length > 0;
  const showEmpty =
    !loading &&
    (stations.length === 0 || stations.every((s) => s.price_cents === null));

  const cards: CardData[] = sortedStations.map((item, index) => {
    const isCheapest = item.id === cheapestId;
    const isClosest = item.id === closestId;
    const rank = (index + 1).toString().padStart(2, '0');
    const stale = staleLabel(item.observed_at);
    const savingsText = item.savings ? formatSavingsRange(item.savings) : null;
    const positive = item.savings ? item.savings.centralDollars > 0 : false;
    return {
      key: item.id,
      color: FEATURE_COLORS[index % FEATURE_COLORS.length],
      kicker: isCheapest
        ? '★ Cheapest premium · 5 mi radius'
        : isClosest
          ? `${rank} · ⌖ closest · baseline`
          : `${rank} · ${item.brand ?? item.name}`,
      brand: item.brand ?? item.name,
      addr: `${item.address} · ${formatDistance(item.distance_meters)}${
        stale ? ` · ${stale}` : ''
      }`,
      price:
        item.price_cents !== null
          ? {
              d: String(Math.floor(item.price_cents / 100)),
              c: (item.price_cents % 100).toString().padStart(2, '0'),
            }
          : null,
      octaneLabel: `${item.octane ?? '—'} octane · Google Places`,
      savings: savingsText
        ? `${positive ? 'Save' : 'Costs'} ${savingsText
            .replace('Save ', '')
            .replace('Costs ', '')}`
        : null,
      showSavingsHint: isCheapest,
      station: item,
    };
  });

  const sheetRows = sortedStations.slice(0, 6);

  return (
    <div className="ap-page">
      {/* Editorial hero — title block + station sheet */}
      <section className="ap-hero">
        <div className="ap-hero-text">
          <p className="ap-kicker">Premium fuel · live near you</p>
          <h1 className="ap-hero-title">
            Find the premium pump <em>worth driving for.</em>
          </h1>
          <p className="ap-lede">
            Authoritative pump-feed prices. Net-savings math. No crowd guesses, no
            interstitials. Premium pumps near you, ranked by what your tank actually
            costs after the drive.
          </p>
        </div>

        <aside className="ap-sheet" aria-label="Station data sheet">
          <div className="ap-sheet-bar">
            <span className="ap-sheet-dot" style={{ background: '#ff5f57' }} />
            <span className="ap-sheet-dot" style={{ background: '#ffbd2e' }} />
            <span className="ap-sheet-dot" style={{ background: '#28ca42' }} />
            <span className="ap-sheet-file">
              {octane === 'premium' ? 'premium' : `octane-${octane}`}-pumps ·{' '}
              {radiusMiLabel(radius)} mi
            </span>
          </div>
          <div className="ap-sheet-row ap-sheet-row--header">
            <span className="ap-sheet-ix">#</span>
            <span className="ap-sheet-name">Station</span>
            <span className="ap-sheet-mi">Mi</span>
            <span className="ap-sheet-price">Price</span>
          </div>
          {sheetRows.length === 0 ? (
            <div className="ap-sheet-row ap-sheet-row--empty">
              {loading ? 'Loading…' : 'No premium pumps in range yet.'}
            </div>
          ) : (
            sheetRows.map((s, i) => {
              const isCheap = s.id === cheapestId;
              return (
                <div
                  key={s.id}
                  className={
                    isCheap ? 'ap-sheet-row ap-sheet-row--cheap' : 'ap-sheet-row'
                  }
                >
                  <span className="ap-sheet-ix">{i + 1}</span>
                  <span className="ap-sheet-name">
                    {s.brand ?? s.name}
                    {s.id === closestId ? ' · closest' : ''}
                  </span>
                  <span className="ap-sheet-mi">
                    {(s.distance_meters / 1609).toFixed(1)}
                  </span>
                  <span className="ap-sheet-price">
                    {s.price_cents != null
                      ? `$${(s.price_cents / 100).toFixed(2)}`
                      : '—'}
                  </span>
                </div>
              );
            })
          )}
        </aside>
      </section>

      <section className="ap-section">
        {/* Location + search */}
        <button type="button" className="ap-loc-card" onClick={applyCurrentLocation}>
          {usingCurrentLocation ? (
            <Navigation size={16} className="ap-loc-icon" />
          ) : (
            <MapPin size={16} className="ap-loc-icon" />
          )}
          <span className="ap-loc-text">
            <span className="ap-loc-label">
              {usingCurrentLocation ? 'You are here' : 'Viewing'}
            </span>
            <span className="ap-loc-value">
              {usingCurrentLocation
                ? currentLocationLabel ?? 'somewhere on a road'
                : searchLabel ?? '—'}
            </span>
          </span>
          {!usingCurrentLocation ? <span className="ap-gps-pill">Use GPS</span> : null}
        </button>

        <div className="ap-search">
          <AddressAutocomplete
            placeholder="Search a city, zip, or address"
            onSelect={(s) =>
              applyLocationSelection({
                label: s.label,
                latitude: s.latitude,
                longitude: s.longitude,
              })
            }
          />
        </div>

        <div className="ap-section-head">
          <h2 className="ap-section-title">Pumps. Color-coded by ranking.</h2>
          <p className="ap-section-sub">
            Each card is a single observation timestamped by Google Places, with net
            savings computed against the closest priced baseline.
          </p>
        </div>

        {/* Octane segmented control */}
        <div className="ap-seg" role="tablist" aria-label="Octane">
          {([87, 89] as const).map((num) => (
            <button
              key={num}
              type="button"
              role="tab"
              aria-selected={octane === num}
              className="ap-seg-cell"
              onClick={() => setOctane(num)}
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={octane === 'premium'}
            className="ap-seg-cell"
            onClick={() => setOctane('premium')}
          >
            91+ Any premium
          </button>
        </div>

        {/* Sort + radius — inline text links */}
        <div className="ap-link-row">
          <span className="ap-link-label">Sort</span>
          {(['cheapest', 'closest'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={sort === k ? 'ap-link ap-link--active' : 'ap-link'}
              onClick={() => setSort(k)}
            >
              {k === 'cheapest' ? 'Cheapest' : 'Closest'}
            </button>
          ))}
          <span className="ap-link-label ap-link-label--spacer">Radius</span>
          {RADIUS_OPTIONS_METERS.map((m: RadiusMeters) => (
            <button
              key={m}
              type="button"
              className={radius === m ? 'ap-link ap-link--active' : 'ap-link'}
              onClick={() => setRadius(m)}
            >
              {radiusMiLabel(m)} mi
            </button>
          ))}
        </div>

        {loading ? <div className="ap-spinner ap-spinner--block" aria-label="Loading" /> : null}

        {!loading && error ? (
          <div className="ap-error">
            <p className="ap-error-text">{error}</p>
            <button type="button" className="ap-error-btn" onClick={applyCurrentLocation}>
              Retry location
            </button>
          </div>
        ) : null}

        {!loading && showEmpty ? (
          <div className="ap-empty">
            <p className="ap-empty-title">No premium stations near you yet</p>
            <p className="ap-empty-body">
              {stations.length === 0
                ? `We don't have pump data for this spot yet. Search a city or ZIP above, or widen the radius.`
                : `Stations are here, but no live prices for ${
                    octane === 'premium' ? 'any premium octane' : `${octane} octane`
                  } yet.`}
            </p>
          </div>
        ) : null}

        {!loading && hasData ? (
          <div className="ap-stations">
            {cards.map((cd) => (
              <FeatureCard key={cd.key} cd={cd} />
            ))}
          </div>
        ) : null}

        {hasData && hiddenUnpriced > 0 ? (
          <p className="ap-hidden-note">
            + {hiddenUnpriced} nearby station{hiddenUnpriced === 1 ? '' : 's'} without
            premium data yet
          </p>
        ) : null}
      </section>

      <footer className="ap-footer">
        <div className="ap-footer-cols">
          <div className="ap-footer-brand-col">
            <div className="ap-footer-brand">
              <span className="ap-footer-square" aria-hidden />
              <span className="ap-footer-brand-text">Pump</span>
            </div>
            <p className="ap-footer-tag">
              Authoritative premium-octane pump prices with net-savings math. Built for
              drivers who care which premium they&apos;re buying.
            </p>
          </div>
          <div className="ap-footer-col">
            <h4>Product</h4>
            <Link to="/">Pumps</Link>
            <Link to="/atlas">Atlas</Link>
            <Link to="/report">Report</Link>
            <Link to="/garage">Garage</Link>
          </div>
          <div className="ap-footer-col">
            <h4>About</h4>
            <Link to="/about">Methodology</Link>
            <Link to="/about">Data sources</Link>
            <Link to="/about">Coverage</Link>
          </div>
          <div className="ap-footer-col">
            <h4>For drivers</h4>
            <Link to="/sign-in">Sign in</Link>
            <Link to="/garage">Your garage</Link>
          </div>
        </div>
        <div className="ap-footer-bar">
          <span>© 2026 Pump · Editorial</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ cd }: { cd: CardData }) {
  const body = (
    <>
      <div className="ap-feature-body">
        <div className="ap-feature-left">
          <p className="ap-feature-kicker">{cd.kicker}</p>
          <h3 className="ap-feature-brand">{cd.brand}</h3>
          <p className="ap-feature-addr">{cd.addr}</p>
        </div>
        <div className="ap-feature-right">
          {cd.price ? (
            <div className="ap-feature-price">
              ${cd.price.d}.<span className="ap-feature-frac">{cd.price.c}</span>
            </div>
          ) : (
            <div className="ap-feature-price ap-feature-price--empty">—.—</div>
          )}
          <p className="ap-feature-oct">{cd.octaneLabel}</p>
          {cd.price ? <span className="ap-feature-cta">Directions →</span> : null}
        </div>
      </div>
      {cd.savings ? (
        <div className="ap-feature-savings">
          <span className="ap-feature-tag">{cd.savings}</span>
          {cd.showSavingsHint ? (
            <span className="ap-feature-hint">
              net of drive cost vs the closest priced pump
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const className = `ap-feature ap-feature--${cd.color}`;

  if (cd.station) {
    return (
      <Link
        to={`/station/${cd.station.id}`}
        state={{ seed: cd.station }}
        className={className}
      >
        {body}
      </Link>
    );
  }
  return <article className={className}>{body}</article>;
}
