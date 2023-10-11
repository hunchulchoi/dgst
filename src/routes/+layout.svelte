<script>
  import Header from '$lib/components/header.svelte';
  import Footer from '$lib/components/footer.svelte';
  import { fade } from 'svelte/transition';

  export let data;
</script>

<Header />

{#key data.pathname}
  <div transition:fade={{ duration: 300, delay: 300 }}>
    <slot />
  </div>
{/key}

<Footer />
