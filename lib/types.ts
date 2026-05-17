export type Octane = 86 | 87 | 89 | 91 | 93 | 94;

export const PRIMARY_OCTANES: Octane[] = [87, 89, 91, 93];
export const SECONDARY_OCTANES: Octane[] = [86, 94];
export const ALL_OCTANES: Octane[] = [86, 87, 89, 91, 93, 94];

export const OCTANE_LABELS: Record<Octane, string> = {
  86: 'High-Alt Reg.',
  87: 'Regular',
  89: 'Mid-grade',
  91: 'Premium',
  93: 'Premium+',
  94: 'Sunoco Ultra',
};

export type SourceKind = 'scrape' | 'crowd' | 'official';

export type Station = {
  id: string;
  brand: string | null;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  google_place_id: string | null;
};

export type StationWithPrice = Station & {
  octane: Octane;
  price_cents: number;
  source_kind: SourceKind;
  observed_at: string;
  distance_meters: number;
};

export type CrowdReport = {
  id: string;
  station_id: string;
  photo_url: string;
  parsed_prices: { octane: Octane; price_cents: number }[];
  user_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
};

export type Favorite = {
  user_id: string;
  station_id: string;
  alert_threshold_cents: number | null;
  alert_octane: Octane | null;
};
