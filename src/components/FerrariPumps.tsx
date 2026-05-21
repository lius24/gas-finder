// Ferrari "Edizione Corsa" Pumps view — cinematic near-black canvas,
// modest-weight white display type, Rosso Corsa as scarce voltage,
// editorial telemetry strip, dark cards with a red accent on the cheapest.
//
// The layout is real CSS now: the station grid is a CSS Grid auto-fill,
// the cinematic fluid type is clamp(), the 8px ladder is CSS custom
// properties — no useWindowDimensions column math, no JS clamp.

import { MapPin, Navigation, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { formatSavingsRange } from '@core/decision-math';
import { formatDistance } from '@core/geo';
import { RADIUS_OPTIONS_METERS, type RadiusMeters } from '@core/preferences';
import { staleLabel } from '@core/staleness';
import type { PumpsData } from '@core/use-pumps-data';
import type { StationWithPrice } from '@core/types';

import './FerrariPumps.css';

// Sample stations shown before live data lands (GPS denied, nothing in
// range) so the cinema cards are visible. Placeholders only.
type SampleStation = {
  rank: string;
  badge: 'cheapest' | 'closest' | null;
  brand: string;
  addr: string;
  mi: string;
  age: string;
  stale: boolean;
  dollars: string;
  cents: string;
  octane: string;
  savings: { verb: 'SAVE' | 'COSTS'; amount: string } | null;
};

const SAMPLE_STATIONS: SampleStation[] = [
  { rank: '01', badge: 'cheapest', brand: 'Sunoco', addr: '125 Hoosick St, Troy, NY', mi: '2.0 MI', age: '4H AGO', stale: false, dollars: '5', cents: '30', octane: '93', savings: { verb: 'SAVE', amount: '$1.27 – $1.93 / fill-up' } },
  { rank: '02', badge: null, brand: "Stewart's Shops", addr: '110 Hoosick St, Troy, NY', mi: '1.4 MI', age: '11H AGO', stale: false, dollars: '5', cents: '56', octane: '91', savings: { verb: 'SAVE', amount: '$0.80 – $1.20 / fill-up' } },
  { rank: '03', badge: 'closest', brand: "Stewart's Shops", addr: '8 Vandenburgh Ave, Troy, NY', mi: '0.5 MI', age: '3D AGO', stale: false, dollars: '5', cents: '66', octane: '91', savings: null },
  { rank: '04', badge: null, brand: 'Speedway', addr: '175 Hoosick St, Troy, NY', mi: '2.1 MI', age: '3D OLD · STALE', stale: true, dollars: '5', cents: '40', octane: '93', savings: { verb: 'SAVE', amount: '$0.94 – $1.42 / fill-up' } },
  { rank: '05', badge: null, brand: 'Gulf', addr: '95 Hill St, Troy, NY', mi: '1.8 MI', age: '18H AGO', stale: false, dollars: '5', cents: '40', octane: '93', savings: { verb: 'COSTS', amount: '$0.21 – $0.31 extra' } },
  { rank: '06', badge: null, brand: 'Cumberland Farms', addr: '625 Pawling Ave, Troy, NY', mi: '3.4 MI', age: '1D AGO', stale: false, dollars: '5', cents: '50', octane: '93', savings: { verb: 'SAVE', amount: '$0.49 – $0.74 / fill-up' } },
];

function radiusMiLabel(m: number): string {
  if (m === 1609) return '1';
  if (m === 4828) return '3';
  if (m === 8047) return '5';
  return '10';
}

type CardData = {
  key: string;
  rank: string;
  badge: 'cheapest' | 'closest' | null;
  brand: string;
  addr: string;
  metaMi: string;
  metaAge: string | null;
  stale: boolean;
  price: { d: string; c: string } | null;
  octane: string;
  savings: { verb: 'SAVE' | 'COSTS'; amount: string } | null;
  station: StationWithPrice | null;
};

export function FerrariPumps({ data }: { data: PumpsData }) {
  const {
    sortedStations,
    stations,
    annotatedStations,
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
    searchInput,
    setSearchInput,
    searchLabel,
    searching,
    applyCurrentLocation,
    submitSearch,
  } = data;

  // Telemetry — three cinema gauges
  const tStations = stations.length;
  const tPriced = annotatedStations.filter((s) => s.price_cents !== null).length;
  const cheapestStation =
    cheapestId != null ? stations.find((s) => s.id === cheapestId) ?? null : null;
  const cheapestPriceLabel =
    cheapestStation?.price_cents != null
      ? `$${(cheapestStation.price_cents / 100).toFixed(2)}`
      : '—';
  const topSavings = sortedStations.find((s) => s.savings)?.savings ?? null;
  const topSavingsLabel = topSavings
    ? (topSavings.centralDollars > 0 ? '+' : '−') +
      '$' +
      Math.abs(topSavings.centralDollars).toFixed(2)
    : '—';

  const hasData = sortedStations.length > 0;

  const cards: CardData[] = hasData
    ? sortedStations.map((item, index) => {
        const savingsText = item.savings ? formatSavingsRange(item.savings) : null;
        const positive = item.savings ? item.savings.centralDollars > 0 : false;
        const stale = staleLabel(item.observed_at);
        return {
          key: item.id,
          rank: (index + 1).toString().padStart(2, '0'),
          badge:
            item.id === cheapestId ? 'cheapest' : item.id === closestId ? 'closest' : null,
          brand: item.brand ?? item.name,
          addr: item.address,
          metaMi: formatDistance(item.distance_meters),
          metaAge: stale,
          stale: !!stale,
          price:
            item.price_cents !== null
              ? {
                  d: String(Math.floor(item.price_cents / 100)),
                  c: (item.price_cents % 100).toString().padStart(2, '0'),
                }
              : null,
          octane: item.octane != null ? String(item.octane) : '—',
          savings: savingsText
            ? {
                verb: positive ? 'SAVE' : 'COSTS',
                amount: savingsText.replace('Save ', '').replace('Costs ', ''),
              }
            : null,
          station: item,
        };
      })
    : SAMPLE_STATIONS.map((s) => ({
        key: s.rank,
        rank: s.rank,
        badge: s.badge,
        brand: s.brand,
        addr: s.addr,
        metaMi: s.mi,
        metaAge: s.age,
        stale: s.stale,
        price: { d: s.dollars, c: s.cents },
        octane: s.octane,
        savings: s.savings,
        station: null,
      }));

  return (
    <div className="fp-page">
      {/* Cinema hero */}
      <section className="fp-cinema">
        <div className="fp-eyebrow">
          <span className="fp-eyebrow-rule" />
          Edizione Corsa · Premium fuel intelligence
        </div>
        <h1 className="fp-title">
          Find a price
          <br />
          worth <em>driving</em> for.
        </h1>
        <p className="fp-lede">
          Authoritative, pump-feed octane prices with net-savings math built in. Premium
          pumps near you, ranked by what your tank actually costs.
        </p>

        <div className="fp-telemetry">
          <div className="fp-tel-cell">
            <div className="fp-tel-num">
              {tPriced}
              <span className="fp-tel-unit">/{tStations}</span>
            </div>
            <div className="fp-tel-label">Stations with premium</div>
          </div>
          <div className="fp-tel-cell">
            <div className="fp-tel-num fp-tel-num--rosso">{cheapestPriceLabel}</div>
            <div className="fp-tel-label">Cheapest · {radiusMiLabel(radius)} mi</div>
          </div>
          <div className="fp-tel-cell">
            <div className="fp-tel-num">{topSavingsLabel}</div>
            <div className="fp-tel-label">Top net savings</div>
          </div>
        </div>
      </section>

      {/* Editorial section */}
      <section className="fp-editorial">
        <button
          type="button"
          className="fp-loc-pill"
          onClick={applyCurrentLocation}
        >
          {usingCurrentLocation ? (
            <Navigation size={14} className="fp-loc-icon" />
          ) : (
            <MapPin size={14} className="fp-loc-icon" />
          )}
          <span className="fp-loc-text">
            <span className="fp-loc-label">
              {usingCurrentLocation ? 'You are here' : 'Viewing'}
            </span>
            <span className="fp-loc-value">
              {usingCurrentLocation
                ? currentLocationLabel ?? 'somewhere on a road'
                : searchLabel ?? '—'}
            </span>
          </span>
          {!usingCurrentLocation ? <span className="fp-gps-pill">Use GPS</span> : null}
        </button>

        <form
          className="fp-search"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <Search size={14} className="fp-search-icon" />
          <input
            className="fp-search-input"
            type="search"
            placeholder="search city, zip, or address"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            disabled={searching}
            autoCapitalize="none"
          />
          {searching ? <span className="fp-spinner" aria-label="Searching" /> : null}
        </form>

        <div className="fp-section-head">
          <h2 className="fp-section-title">Premium pumps near you</h2>
          <div className="fp-section-meta">
            Showing <strong>{tPriced}</strong> · within{' '}
            <strong>{radiusMiLabel(radius)} mi</strong>
          </div>
        </div>

        {/* Octane bar */}
        <div className="fp-octane-bar" role="tablist" aria-label="Octane">
          {([87, 89] as const).map((num) => {
            const active = octane === num;
            return (
              <button
                key={num}
                type="button"
                role="tab"
                aria-selected={active}
                className="fp-oct"
                onClick={() => setOctane(num)}
              >
                <span className="fp-oct-num">{num}</span>
                <span className="fp-oct-sub">{num === 87 ? 'Reg' : 'Mid'}</span>
              </button>
            );
          })}
          <button
            type="button"
            role="tab"
            aria-selected={octane === 'premium'}
            className="fp-oct fp-oct--prem"
            onClick={() => setOctane('premium')}
          >
            <span className="fp-oct-num">91+</span>
            <span className="fp-oct-sub">Any premium</span>
          </button>
        </div>

        {/* Controls */}
        <div className="fp-controls">
          <div className="fp-controls-group">
            <span className="fp-controls-label">Sort</span>
            {(['cheapest', 'closest'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className="fp-pill"
                aria-pressed={sort === k}
                onClick={() => setSort(k)}
              >
                {k === 'cheapest' ? 'Cheapest' : 'Closest'}
              </button>
            ))}
          </div>
          <div className="fp-controls-group fp-controls-group--right">
            <span className="fp-controls-label">Radius</span>
            {RADIUS_OPTIONS_METERS.map((m: RadiusMeters) => (
              <button
                key={m}
                type="button"
                className="fp-pill"
                aria-pressed={radius === m}
                onClick={() => setRadius(m)}
              >
                {radiusMiLabel(m)} mi
              </button>
            ))}
          </div>
        </div>

        {loading ? <div className="fp-spinner fp-spinner--block" aria-label="Loading" /> : null}

        {!loading && error ? (
          <div className="fp-error">
            <p className="fp-error-text">{error}</p>
            <button type="button" className="fp-error-btn" onClick={applyCurrentLocation}>
              Retry location
            </button>
          </div>
        ) : null}

        {/* Station grid */}
        {!loading ? (
          <div className="fp-stations">
            {cards.map((cd) => (
              <StationCard key={cd.key} cd={cd} />
            ))}
          </div>
        ) : null}

        {!loading && !error && !hasData ? (
          <p className="fp-empty">
            {stations.length === 0
              ? `No live stations within ${radiusMiLabel(radius)} mi yet — widen the radius or share your location.`
              : `Stations are here, but no prices for ${
                  octane === 'premium' ? 'any premium octane' : `${octane} octane`
                } yet.`}
          </p>
        ) : null}

        {hasData && hiddenUnpriced > 0 ? (
          <p className="fp-hidden-note">
            + {hiddenUnpriced} nearby station{hiddenUnpriced === 1 ? '' : 's'} without
            premium data yet
          </p>
        ) : null}
      </section>

      {hasData ? (
        <section className="fp-livery">
          <h3 className="fp-livery-title">One brand voltage.</h3>
          <p className="fp-livery-sub">
            Rosso Corsa marks the moments that matter — the cheapest premium, the brand
            mark, the call to drive.
          </p>
        </section>
      ) : null}

      <footer className="fp-footer">
        <div className="fp-footer-row">
          <span className="fp-footer-brand">
            <span className="fp-footer-mark" aria-hidden />
            Pump · Corsa
          </span>
          <nav className="fp-footer-links">
            <Link to="/about">About</Link>
            <Link to="/about">Methodology</Link>
            <Link to="/about">Pricing data</Link>
          </nav>
        </div>
        <div className="fp-footer-divider" />
        <p className="fp-footer-copy">
          © 2026 · Edizione Corsa · Built for drivers who care which premium
        </p>
      </footer>
    </div>
  );
}

function StationCard({ cd }: { cd: CardData }) {
  const body = (
    <>
      <div className="fp-card-top">
        <span className="fp-card-rank">
          <strong className={cd.badge === 'cheapest' ? 'fp-rank--cheapest' : undefined}>
            {cd.rank}
          </strong>
          {cd.badge === 'cheapest'
            ? ' · Cheapest'
            : cd.badge === 'closest'
              ? ' · Baseline'
              : ''}
        </span>
        {cd.badge === 'cheapest' ? (
          <span className="fp-card-chip">★ Best price</span>
        ) : cd.badge === 'closest' ? (
          <span className="fp-card-chip fp-card-chip--closest">⌖ Closest</span>
        ) : null}
      </div>

      <h3 className="fp-card-brand">{cd.brand}</h3>
      <p className="fp-card-addr">{cd.addr}</p>

      <div className="fp-card-meta">
        <span>{cd.metaMi}</span>
        <span className="fp-card-dot" />
        <span>Live · Places</span>
        {cd.metaAge ? (
          <>
            <span className="fp-card-dot" />
            <span className={cd.stale ? 'fp-card-stale' : undefined}>{cd.metaAge}</span>
          </>
        ) : null}
      </div>

      <div className="fp-card-price-row">
        {cd.price ? (
          <div className="fp-card-price">
            ${cd.price.d}.<span className="fp-card-frac">{cd.price.c}</span>
          </div>
        ) : (
          <div className="fp-card-price fp-card-price--empty">—.—</div>
        )}
        <div className="fp-card-oct">
          <div className="fp-card-oct-num">{cd.octane}</div>
          <div className="fp-card-oct-label">Octane</div>
        </div>
      </div>

      {cd.savings ? (
        <div className="fp-card-savings">
          <span
            className={
              cd.savings.verb === 'COSTS'
                ? 'fp-savings-verb fp-savings-verb--cost'
                : 'fp-savings-verb'
            }
          >
            {cd.savings.verb}
          </span>
          <span className="fp-savings-amt">{cd.savings.amount}</span>
          <span className="fp-savings-go">Directions →</span>
        </div>
      ) : null}
    </>
  );

  const className = cd.badge === 'cheapest' ? 'fp-card fp-card--cheapest' : 'fp-card';

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
