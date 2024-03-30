<script>
  import Header from '$lib/components/header.svelte';
  import Footer from '$lib/components/footer.svelte';
  import Banner from '$lib/components/banner.svelte';
  import { blur } from 'svelte/transition';

  export let data;

</script>

<Header />
<Banner />

{#key data.pathname}
  <div transition:blur={{ amount: 40, duration: 400 }}>
    <slot />
  </div>
{/key}

<Footer />
