<script lang="ts">
  interface Props {
    src?: string | null;
    name?: string;
    size?: number;
  }

  let { src = null, name = '', size = 28 }: Props = $props();
  let failed = $state(false);
  const normalizedSrc = $derived(typeof src === 'string' && src.trim() ? src.trim() : null);

  $effect(() => {
    if (normalizedSrc) failed = false;
  });
</script>

{#if normalizedSrc && !failed}
  <img
    class="game-profile-photo"
    src={normalizedSrc}
    alt={name ? `${name} 프로필` : '프로필'}
    width={size}
    height={size}
    loading="lazy"
    decoding="async"
    onerror={() => (failed = true)}
  />
{/if}

<style>
  .game-profile-photo {
    flex: 0 0 auto;
    border-radius: 50%;
    object-fit: cover;
    background: rgba(128, 128, 128, 0.12);
  }
</style>
