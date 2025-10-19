<script>
  import Header from '$lib/components/header.svelte';
  import Footer from '$lib/components/footer.svelte';
  import Banner from '$lib/components/banner.svelte';
  import Memo from '$lib/components/memo.svelte';
  import { blur } from 'svelte/transition';

  // Svelte 5 Runes
  let { data } = $props();

</script>

<Header session={data.session} pathname={data.pathname} />
<Banner />
<Memo />

{#key data.pathname}
  <div transition:blur={{ amount: 40, duration: 400 }}>
    <slot />
  </div>
{/key}

<Footer />
