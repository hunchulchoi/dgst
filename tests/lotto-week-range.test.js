import { describe, it, expect } from 'vitest';
import { currentSeoulWeekSunSatRangeUtc } from '../src/lib/server/lottoOfficial.js';

describe('currentSeoulWeekSunSatRangeUtc', () => {
  it('화요일 앵커 → 이번 주 일(5/17)~토(5/23) KST', () => {
    const anchor = Date.parse('2026-05-19T15:00:00+09:00');
    const { weekStartUtc, weekEndUtc, labelStartYmd, labelEndYmd } =
      currentSeoulWeekSunSatRangeUtc(anchor);

    expect(labelStartYmd).toBe('2026-05-17');
    expect(labelEndYmd).toBe('2026-05-23');
    expect(weekStartUtc).toBe(Date.parse('2026-05-17T00:00:00+09:00'));
    expect(weekEndUtc).toBe(Date.parse('2026-05-23T23:59:59.999+09:00'));
  });

  it('일요일 새벽 앵커 → 같은 주의 일요일 00:00부터', () => {
    const anchor = Date.parse('2026-05-17T00:30:00+09:00');
    const { labelStartYmd, weekStartUtc } = currentSeoulWeekSunSatRangeUtc(anchor);

    expect(labelStartYmd).toBe('2026-05-17');
    expect(weekStartUtc).toBe(Date.parse('2026-05-17T00:00:00+09:00'));
  });

  it('다음 주 일요일 앵커 → 주간 범위가 한 주 밀림', () => {
    const anchor = Date.parse('2026-05-24T10:00:00+09:00');
    const { labelStartYmd, labelEndYmd } = currentSeoulWeekSunSatRangeUtc(anchor);

    expect(labelStartYmd).toBe('2026-05-24');
    expect(labelEndYmd).toBe('2026-05-30');
  });

  it('앵커가 주간 구간 안이면 weekStartUtc ≤ anchor ≤ weekEndUtc', () => {
    const anchor = Date.parse('2026-05-22T20:00:00+09:00');
    const { weekStartUtc, weekEndUtc } = currentSeoulWeekSunSatRangeUtc(anchor);

    expect(anchor).toBeGreaterThanOrEqual(weekStartUtc);
    expect(anchor).toBeLessThanOrEqual(weekEndUtc);
  });
});
