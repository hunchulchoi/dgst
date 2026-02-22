<script>
  import Header from '$lib/components/header.svelte';
  import Footer from '$lib/components/footer.svelte';
  import Banner from '$lib/components/banner.svelte';
  import Memo from '$lib/components/memo.svelte';
  import { blur } from 'svelte/transition';
  import { page } from '$app/stores';
  import { afterNavigate } from '$app/navigation';

  // Svelte 5 Runes
  let { data, children } = $props();

  // 강제 확대 초기화 (모바일 환경에서 글을 읽다 이동/뒤로가기 시 100% 화면 배율로 원복)
  afterNavigate(() => {
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      // user-scalable=0을 줘서 강제로 배율을 원복하고 잠시 후에 풀어줌 (접근성 유지 목적)
      viewportMeta.content =
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0';
      setTimeout(() => {
        viewportMeta.content = 'width=device-width, initial-scale=1.0';
      }, 50);
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

<Header session={data.session} pathname={data.pathname} />
<Banner />
<Memo />

{#key data.pathname}
  <div transition:blur={{ amount: 40, duration: 400 }}>
    {@render children()}
  </div>
{/key}

<Footer />
