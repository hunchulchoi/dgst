<script>
  import { ThemeSync } from '$lib/components/ui/index.js';
  import Header from '$lib/components/header.svelte';
  import Footer from '$lib/components/footer.svelte';
  import Memo from '$lib/components/memo.svelte';
  import { blur } from 'svelte/transition';
  import { page } from '$app/stores';
  import { afterNavigate, beforeNavigate } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { reportSlowInitialLoad, reportSlowLoad } from '$lib/util/logSlowLoad.js';
  import { isFreeBoardLegacyPath } from '$lib/util/boardPaths.js';
  import { boardListReloadKey, boardListReloading } from '$lib/util/store.js';
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

  const blurTransition = { amount: 40, duration: 400 };

  /** @param {string} pathname */
  function layoutPageKey(pathname) {
    return pathname.split('?')[0];
  }

  const pageTransitionBlur = $derived(
    $boardListReloading || boardListToDetailBlur ? blurTransition : undefined
  );

  beforeNavigate(({ from, to }) => {
    navigationStartedAt = performance.now();
    navigationFromPath = from?.url?.pathname;
    navigationToPath = to?.url?.pathname;

    if (from && to) {
      boardListToDetailBlur =
        isBoardListPath(from.url.pathname) && isBoardDetailPath(to.url.pathname);
    }
  });

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

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      viewportMeta.content =
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0';
      setTimeout(() => {
        viewportMeta.content = 'width=device-width, initial-scale=1.0';
      }, 50);
    }
  });

  onMount(() => {
    if (!browser) return;

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
<Header session={data.session} pathname={data.pathname} />
<Memo />

{#key `${layoutPageKey(data.pathname)}-${$boardListReloadKey}`}
  <div
    class="page-transition"
    class:page-transition-reloading={$boardListReloading}
    in:blur={pageTransitionBlur}
    out:blur={pageTransitionBlur}
  >
    {@render children()}
  </div>
{/key}

<Footer />

<style>
  .page-transition-reloading {
    filter: blur(6px);
    opacity: 0.88;
    pointer-events: none;
    transition:
      filter 0.25s ease,
      opacity 0.25s ease;
  }
</style>
