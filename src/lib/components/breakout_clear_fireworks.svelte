<script lang="ts">
  import { browser } from '$app/environment';
  import { Confetti } from 'svelte-confetti';
  import { Offcanvas } from '$lib/components/ui/index.js';
  import { onMount } from 'svelte';

  interface Celebration {
    active: boolean;
    clearedAt: string | null;
    until: string | null;
    nickname: string | null;
  }

  const SEEN_PREFIX = 'breakout50fw:';

  let open = $state(false);
  let nickname = $state('누군가');

  function seenKey(clearedAt: string) {
    return `${SEEN_PREFIX}${clearedAt}`;
  }

  function hasSeen(clearedAt: string) {
    if (!browser) return true;
    try {
      return localStorage.getItem(seenKey(clearedAt)) === '1';
    } catch {
      return true;
    }
  }

  function markSeen(clearedAt: string) {
    if (!browser) return;
    try {
      localStorage.setItem(seenKey(clearedAt), '1');
    } catch {
      /* ignore */
    }
  }

  function close() {
    open = false;
  }

  onMount(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/games/breakout?celebrate=1&_=${Date.now()}`, {
          cache: 'no-store'
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { celebration?: Celebration };
        const c = data.celebration;
        if (!c?.active || !c.clearedAt) return;
        if (hasSeen(c.clearedAt)) return;
        nickname = c.nickname || '누군가';
        open = true;
        markSeen(c.clearedAt);
      } catch (err) {
        console.error('[breakout fireworks]', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

<Offcanvas
  isOpen={open}
  header="블록깨기 전체 클리어!"
  toggle={close}
  fade={true}
  class="text-center text-dark rounded-bottom-4"
  style="background: linear-gradient(90deg, rgba(255,213,79,0.95) 0%, rgba(255,152,0,0.9) 55%, rgba(244,81,30,0.92) 100%);"
  placement="top"
>
  <div class="neon">
    🎉 <strong>{nickname}</strong> 님이 블록깨기 <strong>50단계</strong> 클리어! 🎆
  </div>
  {#if open}
    <div class="fw-layer" aria-hidden="true">
      <Confetti
        x={[-5, 5]}
        y={[0, 0.1]}
        delay={[200, 1800]}
        infinite
        duration={5000}
        amount={180}
        fallDistance="100vh"
      />
    </div>
  {/if}
</Offcanvas>

<style>
  .neon {
    font-family: 'ChosunGs', serif;
    font-size: 1.6em;
    color: #fff;
    text-shadow: 0 0 0.1em rgba(255, 255, 255, 0.7);
    line-height: 1.4;
  }
  .fw-layer {
    position: fixed;
    top: -50px;
    left: 0;
    height: 100vh;
    width: 100vw;
    display: flex;
    justify-content: center;
    overflow: hidden;
    pointer-events: none;
    z-index: 1080;
  }
  @font-face {
    font-family: 'ChosunGs';
    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@1.0/ChosunGs.woff')
      format('woff');
    font-weight: normal;
    font-style: normal;
  }
</style>
