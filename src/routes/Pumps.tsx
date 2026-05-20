// Pumps tab — theme dispatcher. Ferrari and Airtable are structurally
// different layouts (eng-review D1); each is its own real-CSS component
// consuming the shared usePumpsData() hook. Built in migration steps 2 & 4.

import './Placeholder.css';

export function Pumps() {
  return (
    <div className="placeholder">
      <p className="placeholder-eyebrow">Pumps</p>
      <h1 className="placeholder-title">Pumps view — under construction</h1>
      <p className="placeholder-body">
        The Ferrari and Airtable Pumps layouts are being rebuilt on the new
        web stack.
      </p>
    </div>
  );
}
