import { supabase } from './supabase';
import type { Octane, Station } from './types';

export type FavoriteWithStation = {
  station_id: string;
  alert_threshold_cents: number | null;
  alert_octane: Octane | null;
  station: Station;
};

export type FavoriteAlertConfig = {
  alert_threshold_cents: number | null;
  alert_octane: Octane | null;
};

export async function isFavorite(userId: string, stationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('favorites')
    .select('station_id')
    .eq('user_id', userId)
    .eq('station_id', stationId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function getFavoriteAlert(
  userId: string,
  stationId: string,
): Promise<FavoriteAlertConfig | null> {
  const { data, error } = await supabase
    .from('favorites')
    .select('alert_threshold_cents, alert_octane')
    .eq('user_id', userId)
    .eq('station_id', stationId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    alert_threshold_cents: data.alert_threshold_cents ?? null,
    alert_octane: (data.alert_octane ?? null) as Octane | null,
  };
}

export async function addFavorite(userId: string, stationId: string) {
  return supabase
    .from('favorites')
    .upsert(
      { user_id: userId, station_id: stationId },
      { onConflict: 'user_id,station_id' },
    );
}

export async function removeFavorite(userId: string, stationId: string) {
  return supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('station_id', stationId);
}

export async function setFavoriteAlert(
  userId: string,
  stationId: string,
  config: FavoriteAlertConfig,
) {
  return supabase
    .from('favorites')
    .update({
      alert_threshold_cents: config.alert_threshold_cents,
      alert_octane: config.alert_octane,
    })
    .eq('user_id', userId)
    .eq('station_id', stationId);
}

export async function listFavoriteIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select('station_id')
    .eq('user_id', userId);
  if (error || !data) return [];
  return data.map((row) => row.station_id);
}

export async function listFavorites(userId: string): Promise<FavoriteWithStation[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select(
      'station_id, alert_threshold_cents, alert_octane, station:stations(id, brand, name, address, latitude, longitude, google_place_id)',
    )
    .eq('user_id', userId);
  if (error || !data) return [];
  return data.flatMap((row) => {
    const station = Array.isArray(row.station) ? row.station[0] : row.station;
    if (!station) return [];
    return [
      {
        station_id: row.station_id,
        alert_threshold_cents: row.alert_threshold_cents,
        alert_octane: (row.alert_octane ?? null) as Octane | null,
        station: station as Station,
      },
    ];
  });
}
