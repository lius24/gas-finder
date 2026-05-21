// Atlas (map) stays a stub on web — react-native-maps has no web port and
// the interactive map is deferred to v1.1 / MapLibre (design doc, NOT in
// Scope). This placeholder mirrors the RN atlas-map.web.tsx copy.

import './Placeholder.css';

export function Atlas() {
  return (
    <div className="placeholder">
      <p className="placeholder-eyebrow">Atlas</p>
      <h1 className="placeholder-title">Map view is coming soon</h1>
      <p className="placeholder-body">
        An interactive map of nearby premium pumps lands in a future update.
        For now, the Pumps tab lists every station with live prices and the
        net-savings math.
      </p>
    </div>
  );
}
