<script lang="ts">
  import { onMount } from 'svelte';
  import { waitForTurnstile } from '$lib/util/turnstileClient.js';

  type Props = {
    siteKey: string;
    action: string;
    resetKey?: number;
    onToken?: (token: string) => void;
  };

  let { siteKey, action, resetKey = 0, onToken }: Props = $props();
  let container = $state<HTMLElement>();
  let widgetId: string | undefined;
  let turnstile: Awaited<ReturnType<typeof waitForTurnstile>> | undefined;
  let lastResetKey = $state(0);
  let loadFailed = $state(false);

  onMount(() => {
    let destroyed = false;

    async function renderWidget() {
      if (!siteKey) return;
      try {
        turnstile = await waitForTurnstile();
        if (destroyed || !container) return;
        widgetId = turnstile.render(container, {
          sitekey: siteKey,
          action,
          theme: 'auto',
          callback: (token: string) => onToken?.(token),
          'expired-callback': () => onToken?.(''),
          'error-callback': () => onToken?.(''),
          'timeout-callback': () => onToken?.('')
        });
      } catch {
        loadFailed = true;
        onToken?.('');
      }
    }

    void renderWidget();

    return () => {
      destroyed = true;
      if (turnstile && widgetId !== undefined) turnstile.remove(widgetId);
    };
  });

  $effect(() => {
    if (resetKey === lastResetKey) return;
    lastResetKey = resetKey;
    onToken?.('');
    if (turnstile && widgetId !== undefined) turnstile.reset(widgetId);
  });
</script>

{#if !siteKey || loadFailed}
  <p class="small text-danger mb-3" role="alert">봇 방지 확인을 불러오지 못했습니다.</p>
{:else}
  <div class="turnstile-widget mb-3" bind:this={container} aria-label="봇 방지 확인"></div>
{/if}
