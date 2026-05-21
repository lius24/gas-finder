// "Why the math actually matters" — explains the decision-math formula in
// plain language. Worked example uses the founder's original Sunoco vs
// Stewart's comparison from the design doc so the numbers are real and
// verifiable.
//
// Re-platform of app/about.tsx (RN → Vite + React). Same content and
// structure; RN primitives replaced with HTML, useTheme()/StyleSheet
// replaced with CSS vars.

import { Link } from 'react-router-dom';

import './About.css';

export function About() {
  return (
    <div className="ab-page">
      <div className="ab-content">
        <p className="ab-kicker">METHODOLOGY · TRUST</p>
        <h1 className="ab-title">
          Why the math <em className="ab-title-em">actually</em> matters.
        </h1>
        <p className="ab-lede">
          A station listed as "cheaper" isn't always cheaper after you account for the cost
          of driving farther. Pump computes the net savings — every time, on every card —
          so you don't have to do the math in your head.
        </p>

        {/* Three-stat grid */}
        <div className="ab-grid">
          <div className="ab-grid-cell">
            <span className="ab-grid-num">$0.16</span>
            <span className="ab-grid-title">Price difference / gallon</span>
            <span className="ab-grid-body">
              The sign-readable savings. Looks great in a list. Tells half the story.
            </span>
          </div>
          <div className="ab-grid-cell">
            <span className="ab-grid-num">3.6 mi</span>
            <span className="ab-grid-title">Extra round-trip distance</span>
            <span className="ab-grid-body">
              The cost of getting to the "cheaper" station and back. Haversine straight-line
              × 1.3 for road correction.
            </span>
          </div>
          <div className="ab-grid-cell">
            <span className="ab-grid-num ab-grid-num--accent">$1.27</span>
            <span className="ab-grid-title">Actual net savings</span>
            <span className="ab-grid-body">
              Gross savings minus drive cost. What the math tells you that the list
              doesn't.
            </span>
          </div>
        </div>

        {/* Formula card */}
        <div className="ab-formula-card">
          <p className="ab-formula-label">THE FORMULA</p>
          <pre className="ab-formula">
            {`net_savings =\n  (baseline_price − station_price) × tank_size\n  − (extra_round_trip_miles / mpg) × station_price`}
          </pre>
        </div>

        {/* Worked example */}
        <h2 className="ab-section-header">Worked example · Troy, NY</h2>
        <div className="ab-example">
          <p className="ab-example-step">
            <strong className="ab-example-label">Closest pump · </strong>
            Stewart's at 0.5 mi pumping 91 octane at $5.66.
          </p>
          <p className="ab-example-step">
            <strong className="ab-example-label">Candidate · </strong>
            Sunoco at 2.0 mi pumping 93 octane at $5.30.
          </p>
          <p className="ab-example-step">
            <strong className="ab-example-label">Gross savings · </strong>
            ($5.66 − $5.30) × 12 gal ={' '}
            <strong className="ab-example-num">$4.32</strong>.
          </p>
          <p className="ab-example-step">
            <strong className="ab-example-label">Drive cost · </strong>
            (3.6 mi extra round-trip / 25 mpg) × $5.30 ={' '}
            <strong className="ab-example-num">$0.76</strong>.
          </p>
          <p className="ab-example-step ab-example-step--last">
            <strong className="ab-example-label">Net savings · </strong>
            <strong className="ab-example-net-num">
              $3.56 (≈$1.27 after octane mismatch)
            </strong>
          </p>
        </div>

        <h2 className="ab-section-header">What about the range?</h2>
        <p className="ab-body">
          Pump renders savings as a range — "Save $0.80–$1.40" — because the math assumes
          a 12-gallon tank and 25 mpg. Your car probably isn't exactly those numbers. The
          ±25% range absorbs the assumption. A custom-input version is on the v1.1 roadmap.
        </p>

        <h2 className="ab-section-header">What about stale prices?</h2>
        <p className="ab-body">
          Every reading is timestamped by Google Places. Readings &gt; 24 hours old are
          marked "stale"; readings &gt; 7 days old are hidden entirely. The product's
          "authoritative not user-reported" promise depends on this being visible, not
          hidden.
        </p>

        <h2 className="ab-section-header">What about the data source?</h2>
        <p className="ab-body">
          Every price is pulled live from Google Places fuelOptions — the same data your
          car's nav system reads. No crowd-reported submissions, no app prompts, no "tap to
          confirm this is still accurate." Just the timestamp the pump itself sent.
        </p>

        <div className="ab-back-row">
          <Link to="/" className="ab-back-link">← Back to Pumps</Link>
        </div>
      </div>
    </div>
  );
}
