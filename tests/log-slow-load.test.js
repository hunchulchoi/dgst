import { describe, expect, it } from 'vitest';

import {
  getInitialLoadMeasurement,
  getNavigationTimingBreakdown,
  getSlowResourceSummaries,
  summarizeLongTasks,
  MAX_INITIAL_LOAD_DURATION_MS
} from '../src/lib/util/logSlowLoad.js';

describe('initial browser load measurement', () => {
  it('uses the navigation entry URL instead of the path at report time', () => {
    expect(
      getInitialLoadMeasurement(
        {
          startTime: 0,
          loadEventEnd: 2355,
          name: 'https://www.dgst.me/board/free/1/original?from=alarm'
        },
        '/board/free/1/current'
      )
    ).toEqual({
      durationMs: 2355,
      pathname: '/board/free/1/original'
    });
  });

  it('drops measurements longer than five minutes as suspended-tab samples', () => {
    expect(
      getInitialLoadMeasurement(
        {
          startTime: 0,
          loadEventEnd: 4_959_724,
          name: 'https://www.dgst.me/board/free/1/article'
        },
        '/board/free/1/article'
      )
    ).toBeNull();
  });

  it('keeps the five-minute boundary and falls back for an invalid entry URL', () => {
    expect(
      getInitialLoadMeasurement(
        {
          startTime: 0,
          loadEventEnd: MAX_INITIAL_LOAD_DURATION_MS,
          name: ''
        },
        '/fallback'
      )
    ).toEqual({
      durationMs: MAX_INITIAL_LOAD_DURATION_MS,
      pathname: '/fallback'
    });
  });
});

describe('initial browser performance details', () => {
  it('splits navigation time into network, server wait, download, and DOM phases', () => {
    expect(
      getNavigationTimingBreakdown({
        startTime: 0,
        domainLookupStart: 10,
        domainLookupEnd: 20,
        connectStart: 20,
        secureConnectionStart: 25,
        connectEnd: 45,
        requestStart: 50,
        responseStart: 110,
        responseEnd: 140,
        domInteractive: 400,
        domContentLoadedEventEnd: 500,
        loadEventEnd: 900,
        transferSize: 12000,
        encodedBodySize: 10000,
        decodedBodySize: 50000,
        nextHopProtocol: 'h2',
        type: 'navigate',
        redirectCount: 0
      })
    ).toEqual({
      dnsMs: 10,
      tcpMs: 25,
      tlsMs: 20,
      ttfbMs: 60,
      downloadMs: 30,
      domInteractiveMs: 260,
      domContentLoadedMs: 360,
      postDomLoadMs: 400,
      totalMs: 900,
      transferSize: 12000,
      encodedBodySize: 10000,
      decodedBodySize: 50000,
      protocol: 'h2',
      navigationType: 'navigate',
      redirectCount: 0
    });
  });

  it('keeps only the five slowest resources and removes query strings and external paths', () => {
    /** @type {Array<[string, string, number, number]>} */
    const resourceData = [
      ['https://www.dgst.me/_app/a.js?v=secret', 'script', 120, 1000],
      ['https://cdn.jsdelivr.net/npm/icons.css?token=secret', 'link', 450, 2000],
      ['https://www.dgst.me/images/one.webp', 'img', 90, 3000],
      ['https://www.dgst.me/images/two.webp', 'img', 300, 4000],
      ['https://www.dgst.me/images/three.webp', 'img', 200, 5000],
      ['https://www.dgst.me/images/four.webp', 'img', 180, 6000],
      ['https://www.dgst.me/images/five.webp', 'img', 160, 7000]
    ];
    const resources = resourceData.map(([name, initiatorType, duration, transferSize]) => ({
      name,
      initiatorType,
      duration,
      transferSize,
      encodedBodySize: transferSize - 100,
      decodedBodySize: transferSize + 100
    }));

    expect(getSlowResourceSummaries(resources, 'https://www.dgst.me')).toEqual([
      expect.objectContaining({ name: 'cdn.jsdelivr.net', durationMs: 450 }),
      expect.objectContaining({ name: '/images/two.webp', durationMs: 300 }),
      expect.objectContaining({ name: '/images/three.webp', durationMs: 200 }),
      expect.objectContaining({ name: '/images/four.webp', durationMs: 180 }),
      expect.objectContaining({ name: '/images/five.webp', durationMs: 160 })
    ]);
  });

  it('summarizes long tasks without sending task attribution data', () => {
    expect(
      summarizeLongTasks([
        { startTime: 120, duration: 80 },
        { startTime: 420, duration: 150 },
        { startTime: 250, duration: 60 },
        { startTime: 900, duration: 110 }
      ])
    ).toEqual({
      count: 4,
      totalDurationMs: 400,
      maxDurationMs: 150,
      top: [
        { startTimeMs: 420, durationMs: 150 },
        { startTimeMs: 900, durationMs: 110 },
        { startTimeMs: 120, durationMs: 80 }
      ]
    });
  });
});
