import { describe, expect, it } from 'vitest';

import {
  getInitialLoadMeasurement,
  getFirstContentfulPaintMs,
  getLatestResourceSummaries,
  getInitialLoadAlertReasons,
  getNavigationTimingBreakdown,
  getServerTimingMs,
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
  it('labels only the metrics that exceed the foreground alert thresholds', () => {
    expect(
      getInitialLoadAlertReasons({
        durationMs: 3100,
        firstContentfulPaintMs: 1800,
        largestContentfulPaintMs: 2499,
        navigation: { ttfbMs: 800 }
      })
    ).toEqual(['loadEventEnd', 'fcp', 'ttfb']);
  });

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
      beforeFetchMs: 0,
      redirectMs: 0,
      cacheLookupMs: 0,
      dnsMs: 10,
      tcpMs: 25,
      tlsMs: 20,
      requestQueueMs: 5,
      ttfbMs: 60,
      downloadMs: 30,
      domInteractiveMs: 260,
      domContentLoadedMs: 360,
      postDomLoadMs: 400,
      totalMs: 900,
      unaccountedMs: 10,
      transferSize: 12000,
      encodedBodySize: 10000,
      decodedBodySize: 50000,
      protocol: 'h2',
      navigationType: 'navigate',
      redirectCount: 0
    });
  });

  it('explains time spent before the request and splits server time out of TTFB', () => {
    // 새로고침 직전 페이지 정리로 요청이 4.4초 늦게 나간 경우 (실제 5,105ms 보고와 같은 모양)
    const breakdown = getNavigationTimingBreakdown({
      startTime: 0,
      fetchStart: 4400,
      redirectStart: 0,
      redirectEnd: 0,
      domainLookupStart: 4402,
      domainLookupEnd: 4404,
      connectStart: 4404,
      secureConnectionStart: 4466,
      connectEnd: 4548,
      requestStart: 4550,
      responseStart: 4628,
      responseEnd: 4942,
      domInteractive: 4978,
      domContentLoadedEventEnd: 4978,
      loadEventEnd: 5105,
      transferSize: 10747,
      encodedBodySize: 10447,
      decodedBodySize: 79418,
      nextHopProtocol: 'h2',
      type: 'reload',
      redirectCount: 0,
      serverTiming: [
        { name: 'cfCacheStatus', duration: 0 },
        { name: 'app', duration: 70.4 }
      ]
    });

    expect(breakdown).toMatchObject({
      beforeFetchMs: 4400,
      cacheLookupMs: 2,
      requestQueueMs: 2,
      ttfbMs: 78,
      serverMs: 70,
      networkTtfbMs: 8,
      totalMs: 5105
    });
    expect(breakdown.unaccountedMs).toBe(0);
  });

  it('reads app and Cloudflare origin durations from Server-Timing', () => {
    expect(
      getServerTimingMs([
        { name: 'cfOrigin', duration: 81 },
        { name: 'app', duration: 48.6 }
      ])
    ).toEqual({ serverMs: 49, cdnOriginMs: 81 });
    expect(getServerTimingMs(undefined)).toEqual({});
    expect(getServerTimingMs([{ name: 'app', duration: Number.NaN }])).toEqual({});
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
      startTime: duration * 2,
      responseEnd: duration * 3,
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

  it('captures resources that complete latest independently of their duration', () => {
    expect(
      getLatestResourceSummaries(
        [
          {
            name: 'https://www.dgst.me/early.js',
            initiatorType: 'script',
            duration: 900,
            startTime: 10,
            responseEnd: 910,
            transferSize: 1000,
            encodedBodySize: 900,
            decodedBodySize: 1200
          },
          {
            name: 'https://www.dgst.me/late.css',
            initiatorType: 'link',
            duration: 20,
            startTime: 9_900,
            responseEnd: 9_920,
            transferSize: 100,
            encodedBodySize: 90,
            decodedBodySize: 120
          }
        ],
        'https://www.dgst.me'
      )
    ).toEqual([
      expect.objectContaining({ name: '/late.css', startTimeMs: 9900, responseEndMs: 9920 }),
      expect.objectContaining({ name: '/early.js', startTimeMs: 10, responseEndMs: 910 })
    ]);
  });

  it('reads FCP without retaining paint entry detail', () => {
    expect(
      getFirstContentfulPaintMs([
        { name: 'first-paint', startTime: 81 },
        { name: 'first-contentful-paint', startTime: 123.7 }
      ])
    ).toBe(124);
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
