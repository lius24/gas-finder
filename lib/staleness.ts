// Staleness rules for authoritative-feed prices.
//
// The product's "authoritative, not user-reported" promise depends on visibly
// surfacing when a feed price hasn't been refreshed recently. v1 thresholds
// (per design doc 2026-05-18, /plan-eng-review ER6):
//   < 24h  → fresh, render normally
//   24h–7d → muted color + `Xd old` chip, still useful
//   > 7d   → treat as null (hide the price entirely)

export const STALE_AFTER_HOURS = 24;
export const HIDE_AFTER_HOURS = 24 * 7;

export function hoursSince(observedAt: string | null): number | null {
  if (!observedAt) return null;
  const then = new Date(observedAt).getTime();
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / 3_600_000;
}

export function isHidden(observedAt: string | null): boolean {
  const h = hoursSince(observedAt);
  if (h === null) return false;
  return h > HIDE_AFTER_HOURS;
}

export function isStale(observedAt: string | null): boolean {
  const h = hoursSince(observedAt);
  if (h === null) return false;
  return h >= STALE_AFTER_HOURS && h <= HIDE_AFTER_HOURS;
}

export function staleLabel(observedAt: string | null): string | null {
  const h = hoursSince(observedAt);
  if (h === null || h < STALE_AFTER_HOURS) return null;
  if (h > HIDE_AFTER_HOURS) return null;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d old`;
  const weeks = Math.round(days / 7);
  return `${weeks}w old`;
}
