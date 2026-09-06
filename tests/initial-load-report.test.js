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
  it('does not report history restoration as a user-perceived initial-load alert', async () => {
    const entry = mockTiming();
    const { reportSlowInitialLoad } = await import('../src/lib/util/logSlowLoad.js');
    reportSlowInitialLoad('/current');
    expect(fetch).not.toHaveBeenCalled();
    entry.loadEventEnd = 149255;
    entry.type = 'back_forward';
    await vi.runAllTimersAsync();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not report background-tab time without PerformanceObserver support', async () => {
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
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports foreground loads with the breached metric names', async () => {
    const entry = mockTiming();
    const { reportSlowInitialLoad } = await import('../src/lib/util/logSlowLoad.js');
    entry.loadEventEnd = 3100;
    reportSlowInitialLoad('/');
    await vi.runAllTimersAsync();
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      initialLoadContext: 'foreground',
      performanceDetails: {
        alertReasons: ['loadEventEnd']
      }
    });
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

  it('keeps the foreground alert threshold and tolerates logging network failures', async () => {
    const entry = mockTiming();
    const { reportSlowInitialLoad } = await import('../src/lib/util/logSlowLoad.js');
    entry.loadEventEnd = 2999;
    reportSlowInitialLoad('/');
    await vi.runAllTimersAsync();
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    entry.loadEventEnd = 3000;
    reportSlowInitialLoad('/');
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
