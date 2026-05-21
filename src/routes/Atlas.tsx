import { useNavigate } from 'react-router-dom';

import { usePumpsData } from '@core/use-pumps-data';
import { useThemeId } from '@core/theme-provider';
import type { OctaneSelection } from '@core/types';

import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { MapView } from '../components/MapView';

import './Atlas.css';

// Intentionally mirrors the 87/89/91+ subset shown in the Pumps tab's octane selector.
const OCTANE_TABS: { key: OctaneSelection; label: string }[] = [
  { key: 87, label: '87' },
  { key: 89, label: '89' },
  { key: 'premium', label: '91+' },
];

export function Atlas() {
  const navigate = useNavigate();
  const themeId = useThemeId();
  const {
    sortedStations,
    cheapestId,
    coords,
    loading,
    octane,
    setOctane,
    applyLocationSelection,
  } = usePumpsData();

  const hasData = sortedStations.length > 0;

  return (
    <div className="atlas-page">
      <div className="atlas-toolbar">
        <AddressAutocomplete
          placeholder="search city, zip, or address"
          onSelect={(s) =>
            applyLocationSelection({
              label: s.label,
              latitude: s.latitude,
              longitude: s.longitude,
            })
          }
        />
        <div className="atlas-octane-bar" role="tablist" aria-label="Octane">
          {OCTANE_TABS.map((t) => (
            <button
              key={String(t.key)}
              type="button"
              role="tab"
              aria-selected={octane === t.key}
              className={
                octane === t.key ? 'atlas-octane atlas-octane--on' : 'atlas-octane'
              }
              onClick={() => setOctane(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="atlas-map-wrap">
        <MapView
          stations={sortedStations}
          cheapestId={cheapestId}
          center={coords}
          theme={themeId === 'ferrari' ? 'dark' : 'light'}
          onStationClick={(id) => {
            const seed = sortedStations.find((s) => s.id === id);
            navigate(`/station/${id}`, seed ? { state: { seed } } : undefined);
          }}
        />
        {!loading && !hasData ? (
          <div className="atlas-empty" role="status">
            <p className="atlas-empty-title">No premium stations near you yet</p>
            <p className="atlas-empty-body">
              Search a city above, or check the Pumps tab.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
