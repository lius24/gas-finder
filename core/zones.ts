import { supabase } from './supabase';

export type UserPriceZone = {
  user_id: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  label: string | null;
  updated_at: string;
};

export const ZONE_RADIUS_OPTIONS_METERS = [5000, 10000, 25000, 50000] as const;
export type ZoneRadiusMeters = (typeof ZONE_RADIUS_OPTIONS_METERS)[number];
export const DEFAULT_ZONE_RADIUS_METERS: ZoneRadiusMeters = 25000;

export async function getZone(userId: string): Promise<UserPriceZone | null> {
  const { data, error } = await supabase
    .from('user_price_zones')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as UserPriceZone) ?? null;
}

export async function saveZone(input: {
  user_id: string;
  latitude: number;
  longitude: number;
  radius_m: ZoneRadiusMeters;
  label?: string | null;
}): Promise<UserPriceZone> {
  const { data, error } = await supabase
    .from('user_price_zones')
    .upsert(
      {
        user_id: input.user_id,
        latitude: input.latitude,
        longitude: input.longitude,
        radius_m: input.radius_m,
        label: input.label ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as UserPriceZone;
}

export async function stationsInCircle(
  latitude: number,
  longitude: number,
  radius_m: number,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('stations_in_circle', {
    p_lat: latitude,
    p_lon: longitude,
    p_radius_m: radius_m,
  });
  if (error) throw error;
  return (data ?? []).map((r: { id: string }) => r.id);
}
