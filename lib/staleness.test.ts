import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HIDE_AFTER_HOURS,
  STALE_AFTER_HOURS,
  hoursSince,
  isHidden,
  isStale,
  staleLabel,
} from './staleness';

const NOW = new Date('2026-05-19T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe('staleness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('hoursSince', () => {
    it('returns null for null', () => {
      expect(hoursSince(null)).toBeNull();
    });
    it('returns null for unparseable', () => {
      expect(hoursSince('not-a-date')).toBeNull();
    });
    it('computes positive hours for past timestamps', () => {
      expect(hoursSince(hoursAgo(3))).toBeCloseTo(3, 5);
    });
  });

  describe('isStale', () => {
    it('false when fresh (1h old)', () => {
      expect(isStale(hoursAgo(1))).toBe(false);
    });
    it('false at exactly the stale threshold edge minus a tick', () => {
      expect(isStale(hoursAgo(STALE_AFTER_HOURS - 0.01))).toBe(false);
    });
    it('true at exactly the stale threshold', () => {
      expect(isStale(hoursAgo(STALE_AFTER_HOURS))).toBe(true);
    });
    it('true at 3 days old', () => {
      expect(isStale(hoursAgo(72))).toBe(true);
    });
    it('false past the hide threshold (>7d)', () => {
      expect(isStale(hoursAgo(HIDE_AFTER_HOURS + 1))).toBe(false);
    });
  });

  describe('isHidden', () => {
    it('false for fresh', () => {
      expect(isHidden(hoursAgo(1))).toBe(false);
    });
    it('false at the boundary (exactly 7d)', () => {
      expect(isHidden(hoursAgo(HIDE_AFTER_HOURS))).toBe(false);
    });
    it('true past the boundary', () => {
      expect(isHidden(hoursAgo(HIDE_AFTER_HOURS + 1))).toBe(true);
    });
    it('false for null', () => {
      expect(isHidden(null)).toBe(false);
    });
  });

  describe('staleLabel', () => {
    it('null for fresh', () => {
      expect(staleLabel(hoursAgo(1))).toBeNull();
    });
    it('"1d old" at 24h', () => {
      expect(staleLabel(hoursAgo(24))).toBe('1d old');
    });
    it('"3d old" at 72h', () => {
      expect(staleLabel(hoursAgo(72))).toBe('3d old');
    });
    it('"1w old" at 7 days', () => {
      expect(staleLabel(hoursAgo(24 * 7))).toBe('1w old');
    });
    it('null past hide threshold (>7d)', () => {
      expect(staleLabel(hoursAgo(24 * 8))).toBeNull();
    });
    it('null for null', () => {
      expect(staleLabel(null)).toBeNull();
    });
  });
});
