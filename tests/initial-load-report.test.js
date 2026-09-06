import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class NavigationTiming {
  startTime = 0;
  loadEventEnd = 0;
  name = 'https://www.dgst.me/original';
  type = 'navigate';
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('PerformanceNavigationTiming', NavigationTiming);
  vi.stubGlobal('PerformanceObserver', undefined);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      location: { origin: 'https://www.dgst.me' }
    })
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockTiming() {
  const entry = new NavigationTiming();
  vi.stubGlobal('performance', {
    /** @param {string} type */
    getEntriesByType: (type) =>
      type === 'navigation'
        ? [entry]
        : type === 'paint'
          ? [{ name: 'first-contentful-paint', startTime: 1200 }]
          : []
  });
  return entry;
}

describe('initial load reporting lifecycle', () => {
  it('waits for loadEventEnd to be populated and distinguishes load completion from paint', async () => {
    const entry = mockTiming();
    const { reportSlowInitialLoad } = await import('../src/lib/util/logSlowLoad.js');
    reportSlowInitialLoad('/current');
    expect(fetch).not.toHaveBeenCalled();
    entry.loadEventEnd = 149255;
    entry.type = 'back_forward';
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      type: 'initial',
      durationMs: 149255,
      pathname: '/original',
      initialLoadContext: 'history',
      performanceDetails: { firstContentfulPaintMs: 1200, navigation: { totalMs: 149255 } }
    });
    expect(payload.message).toContain('loadEventEnd=149255ms');
    expect(payload.message).toContain('FCP=1200ms');
    expect(payload.message).toContain('LCP-at-load=unknownms');
  });

  it('records hidden time without PerformanceObserver support, even when visible at reporting', async () => {
    const entry = mockTiming();
    const { startInitialLoadLongTaskObserver, reportSlowInitialLoad } =
      await import('../src/lib/util/logSlowLoad.js');
    startInitialLoadLongTaskObserver();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    entry.loadEventEnd = 3000;
    reportSlowInitialLoad('/');
    await vi.runAllTimersAsync();
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload.initialLoadContext).toBe('background');
  });

  it('cancels pending collection when the layout is destroyed', async () => {
    const entry = mockTiming();
    const { reportSlowInitialLoad } = await import('../src/lib/util/logSlowLoad.js');
    entry.loadEventEnd = 3000;
    const cancel = reportSlowInitialLoad('/');
    cancel();
    await vi.runAllTimersAsync();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the threshold and tolerates logging network failures', async () => {
    const entry = mockTiming();
    const { reportSlowInitialLoad } = await import('../src/lib/util/logSlowLoad.js');
    entry.loadEventEnd = 1999;
    reportSlowInitialLoad('/');
    await vi.runAllTimersAsync();
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    entry.loadEventEnd = 2000;
    reportSlowInitialLoad('/');
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
