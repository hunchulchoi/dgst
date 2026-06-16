<script>
  import { ThemeSync } from '$lib/components/ui/index.js';
  import Header from '$lib/components/header.svelte';
  import Footer from '$lib/components/footer.svelte';
  import Memo from '$lib/components/memo.svelte';
  import { blur } from 'svelte/transition';
  import { page } from '$app/stores';
  import { updated } from '$app/state';
  import { afterNavigate, beforeNavigate } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { reportSlowInitialLoad, reportSlowLoad } from '$lib/util/logSlowLoad.js';
  import { reportClientError } from '$lib/util/reportClientPageError.js';
  import { isFreeBoardLegacyPath } from '$lib/util/boardPaths.js';
  import { alarmCount, boardListReloadKey, boardListReloading } from '$lib/util/store.js';
  import '../app.css';

  let { data, children } = $props();

  /** @type {number} */
  let navigationStartedAt = 0;

  /** @type {string | undefined} */
  let navigationFromPath;

  /** @type {string | undefined} */
  let navigationToPath;

  /** 게시판 목록 → 글 상세 이동 시 blur (beforeNavigate에서 미리 켬 — 첫 클릭부터 적용) */
  let boardListToDetailBlur = $state(false);

  /** @param {string} pathname */
  function isBoardListPath(pathname) {
    return /^\/board\/[^/]+(\/\d+)?$/.test(pathname);
  }

  /** @param {string} pathname */
  function isBoardDetailPath(pathname) {
    return /^\/board\/[^/]+\/\d+\/[^/]+$/.test(pathname);
  }

  /**
   * @param {string} fromPathname
   * @param {string} toPathname
   */
  function isBoardListNavigation(fromPathname, toPathname) {
    return isBoardListPath(fromPathname) && isBoardListPath(toPathname);
  }

  /**
   * @param {string} fromPathname
   * @param {string} toPathname
   */
  function isBoardDetailToListNavigation(fromPathname, toPathname) {
    return isBoardDetailPath(fromPathname) && isBoardListPath(toPathname);
  }

  const blurTransition = { amount: 40, duration: 400 };

  /** @param {string} pathname */
  function layoutPageKey(pathname) {
    return pathname.split('?')[0];
  }

  /** @param {unknown} value */
  function getErrorMessage(value) {
    if (value instanceof Error) return value.message;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  /** @param {unknown} value */
  function isStaleBuildError(value) {
    const message = getErrorMessage(value);
    return (
      message.includes('_app/immutable/') ||
      /Failed to fetch dynamically imported module/i.test(message) ||
      /Importing a module script failed/i.test(message) ||
      /error loading dynamically imported module/i.test(message) ||
      /Loading chunk \d+ failed/i.test(message)
    );
  }

  function reloadForFreshBuild() {
    const key = `dgst:fresh-build-reload:${location.pathname}`;
    if (sessionStorage.getItem(key) === '1') return;

    sessionStorage.setItem(key, '1');
    setTimeout(() => {
      location.reload();
    }, 50);
  }

  const pageTransitionBlur = $derived(
    $boardListReloading || boardListToDetailBlur ? blurTransition : undefined
  );

  beforeNavigate(({ from, to, willUnload, cancel }) => {
    if (browser && updated.current && !willUnload && to?.url) {
      cancel();
      location.href = to.url.href;
      return;
    }

    navigationStartedAt = performance.now();
    navigationFromPath = from?.url?.pathname;
    navigationToPath = to?.url?.pathname;

    if (from && to) {
      boardListToDetailBlur =
        (isBoardListPath(from.url.pathname) && isBoardDetailPath(to.url.pathname)) ||
        isBoardListNavigation(from.url.pathname, to.url.pathname) ||
        isBoardDetailToListNavigation(from.url.pathname, to.url.pathname);
    }
  });

  function scheduleMobileLayoutWidthNormalization() {
    if (!browser) return;
    window.scrollTo(0, 0);
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function normalizeMobileLayoutWidth() {
    scheduleMobileLayoutWidthNormalization();
    setTimeout(scheduleMobileLayoutWidthNormalization, 120);
    setTimeout(scheduleMobileLayoutWidthNormalization, 360);
  }

  async function refreshUnreadAlarmCount() {
    if (!browser || !data.session?.user?.nickname) {
      alarmCount.set(0);
      return;
    }

    try {
      const response = await fetch('/api/alarm/unread-count', {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return;
      const body = await response.json();
      alarmCount.set(body.count ?? 0);
    } catch (error) {
      reportClientError(error, {
        type: 'alarm-unread-count-refresh-error',
        pathname: window.location.pathname,
        href: window.location.href,
        routeId: $page.route.id ?? undefined,
        phase: 'after-navigate'
      });
    }
  }

  afterNavigate(({ to }) => {
    if (navigationStartedAt > 0) {
      reportSlowLoad({
        type: 'navigation',
        durationMs: performance.now() - navigationStartedAt,
        pathname: to?.url?.pathname,
        from: navigationFromPath,
        to: navigationToPath ?? to?.url?.pathname
      });
      navigationStartedAt = 0;
    }

    // 레거시 URL 주소창만 `/` 로 교체 — 네트워크·load 재실행 없음
    if (to && isFreeBoardLegacyPath(to.url.pathname)) {
      history.replaceState(history.state, '', `/${to.url.search}`);
    }

    boardListToDetailBlur = false;

    normalizeMobileLayoutWidth();
    void refreshUnreadAlarmCount();
  });

  onMount(() => {
    if (!browser) return;

    /** @param {ErrorEvent} event */
    const handleWindowError = (event) => {
      reportClientError(event.error ?? event.message, {
        type: 'window-error',
        message: event.message || 'Unhandled window error',
        pathname: window.location.pathname,
        href: window.location.href,
        search: window.location.search,
        routeId: $page.route.id ?? undefined,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        phase: 'window-error'
      });

      if (isStaleBuildError(event.error ?? event.message)) {
        reloadForFreshBuild();
      }
    };

    /** @param {PromiseRejectionEvent} event */
    const handleUnhandledRejection = (event) => {
      reportClientError(event.reason, {
        type: 'unhandled-rejection',
        message: 'Unhandled promise rejection',
        pathname: window.location.pathname,
        href: window.location.href,
        search: window.location.search,
        routeId: $page.route.id ?? undefined,
        phase: 'unhandledrejection'
      });

      if (isStaleBuildError(event.reason)) {
        reloadForFreshBuild();
      }
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('dgst:normalize-mobile-layout-width', normalizeMobileLayoutWidth);

    if (isFreeBoardLegacyPath(window.location.pathname)) {
      history.replaceState(history.state, '', `/${window.location.search}`);
    }

    const measureInitialLoad = () => {
      reportSlowInitialLoad(window.location.pathname);
    };

    if (document.readyState === 'complete') {
      measureInitialLoad();
    } else {
      window.addEventListener('load', measureInitialLoad, { once: true });
    }

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('dgst:normalize-mobile-layout-width', normalizeMobileLayoutWidth);
      window.removeEventListener('load', measureInitialLoad);
    };
  });
</script>

<svelte:head>
  <title>{$page.data.ogTitle || 'dgst.me'}</title>
  <meta
    name="description"
    content={$page.data.ogDescription || '으르신들의 안식처 데게 실버타운입니다.'}
  />

  <meta property="og:type" content={$page.data.ogType || 'website'} />
  <meta
    property="og:url"
    content={$page.data.ogUrl || `https://www.dgst.me${$page.url.pathname}`}
  />
  <meta property="og:title" content={$page.data.ogTitle || 'dgst.me'} />
  <meta
    property="og:description"
    content={$page.data.ogDescription || '으르신들의 안식처 데게 실버타운입니다.'}
  />
  <meta
    property="og:image"
    content={$page.data.ogImage || 'https://www.dgst.me/logo/twitter_header_photo_2.png'}
  />
  <meta property="og:site_name" content="dgst.me" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta
    name="twitter:url"
    content={$page.data.ogUrl || `https://www.dgst.me${$page.url.pathname}`}
  />
  <meta name="twitter:title" content={$page.data.ogTitle || 'dgst.me'} />
  <meta
    name="twitter:description"
    content={$page.data.ogDescription || '으르신들의 안식처 데게 실버타운입니다.'}
  />
  <meta
    name="twitter:image"
    content={$page.data.ogImage || 'https://www.dgst.me/logo/twitter_header_photo_2.png'}
  />
</svelte:head>

<ThemeSync />
<div class="app-shell" class:blue-dgst-host={data.isBlueDgstHost}>
  <Header
    session={data.session}
    pathname={data.pathname}
    unreadAlarmCount={data.unreadAlarmCount}
  />
  <Memo />

  {#key `${layoutPageKey(data.pathname)}-${$boardListReloadKey}`}
    <div
      class="page-transition"
      class:page-transition-navigating={boardListToDetailBlur}
      class:page-transition-reloading={$boardListReloading}
      in:blur={pageTransitionBlur}
      out:blur={pageTransitionBlur}
    >
      {@render children()}
    </div>
  {/key}

  <Footer />
</div>

<style>
  .app-shell {
    display: flex;
    width: 100%;
    max-width: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    flex-direction: column;
    overflow-x: hidden;
  }

  .blue-dgst-host {
    --dgst-chrome-bg: #ffd6e7;
  }

  .page-transition {
    flex: 1 0 auto;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
    isolation: isolate;
    transition:
      filter 0.16s ease,
      opacity 0.16s ease;
  }

  .page-transition-navigating {
    filter: blur(3px);
    opacity: 0.86;
    pointer-events: none;
  }

  .page-transition-reloading {
    opacity: 0.88;
    pointer-events: none;
  }
</style>
