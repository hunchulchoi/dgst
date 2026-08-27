import { describe, expect, it } from 'vitest';

import { _sanitizeClientPerformanceDetails } from '../src/routes/api/log/+server.js';

describe('client performance detail sanitization', () => {
  it('keeps bounded navigation, resource, and long-task fields', () => {
    expect(
      _sanitizeClientPerformanceDetails({
        navigation: {
          dnsMs: 10.4,
          ttfbMs: 62.2,
          totalMs: 7469,
          protocol: 'h2',
          ignored: 'drop-me'
        },
        resources: Array.from({ length: 8 }, (_, index) => ({
          name: `/asset-${index}.js?secret=value`,
          initiatorType: 'script',
          durationMs: 100 + index,
          transferSize: 1000,
          ignored: 'drop-me'
        })),
        longTasks: {
          count: 4,
          totalDurationMs: 400,
          maxDurationMs: 150,
          top: [{ startTimeMs: 420, durationMs: 150, ignored: 'drop-me' }],
          ignored: 'drop-me'
        },
        ignored: 'drop-me'
      })
    ).toEqual({
      navigation: {
        dnsMs: 10.4,
        ttfbMs: 62.2,
        totalMs: 7469,
        protocol: 'h2'
      },
      resources: Array.from({ length: 5 }, (_, index) => ({
        name: `/asset-${index}.js`,
        initiatorType: 'script',
        durationMs: 100 + index,
        transferSize: 1000
      })),
      longTasks: {
        count: 4,
        totalDurationMs: 400,
        maxDurationMs: 150,
        top: [{ startTimeMs: 420, durationMs: 150 }]
      }
    });
  });

  it('rejects non-object payloads', () => {
    expect(_sanitizeClientPerformanceDetails(null)).toBeUndefined();
    expect(_sanitizeClientPerformanceDetails('invalid')).toBeUndefined();
  });
});
