<script>
  import Header from '$lib/components/header.svelte';
  import Footer from '$lib/components/footer.svelte';
  import { blur } from 'svelte/transition';

  export let data;
</script>

<Header />

{#key data.pathname}
  <div transition:blur={{ amount: 7, duration: 300 }}>
    <slot />
  </div>
{/key}

<Footer />
