// Pumps tab — theme dispatcher. Ferrari and Airtable are structurally
// different layouts (eng-review D1); each is its own real-CSS component
// consuming the one shared usePumpsData() hook. The hook is called once
// here so switching theme never remounts it (station data survives).

import { useThemeId } from '@core/theme-provider';
import { usePumpsData } from '@core/use-pumps-data';

import { FerrariPumps } from '../components/FerrariPumps';

export function Pumps() {
  const data = usePumpsData();
  const themeId = useThemeId();

  if (themeId === 'airtable') {
    // AirtablePumps lands in migration step 4.
    return <FerrariPumps data={data} />;
  }
  return <FerrariPumps data={data} />;
}
