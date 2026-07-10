<script lang="ts">
  import { browser } from '$app/environment';
  import { Confetti } from 'svelte-confetti';
  import { Offcanvas } from '$lib/components/ui/index.js';
  import { onMount } from 'svelte';

  interface Celebration {
    id: string;
    kind: string;
    game: string;
    label: string;
    nickname: string;
    detail: string;
    at: string;
    until: string;
  }

  const SEEN_PREFIX = 'boardfw:';

  let open = $state(false);
  let items = $state<Celebration[]>([]);

  function seenKey(id: string) {
    return `${SEEN_PREFIX}${id}`;
  }

  function hasSeen(id: string) {
    if (!browser) return true;
    try {
      return localStorage.getItem(seenKey(id)) === '1';
    } catch {
      return true;
    }
  }

  function markSeen(id: string) {
    if (!browser) return;
    try {
      localStorage.setItem(seenKey(id), '1');
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
        const res = await fetch(`/games/celebrations?_=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { celebrations?: Celebration[] };
        const list = (data.celebrations ?? []).filter((c) => c?.id && !hasSeen(c.id));
        if (list.length === 0) return;
        items = list;
        open = true;
        for (const c of list) markSeen(c.id);
      } catch (err) {
        console.error('[board fireworks]', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

<Offcanvas
  isOpen={open}
  header={items.length > 1 ? `축하 ${items.length}건!` : items[0]?.label || '축하!'}
  toggle={close}
  fade={true}
  class="text-center text-dark rounded-bottom-4"
  style="background: linear-gradient(90deg, rgba(255,213,79,0.95) 0%, rgba(255,152,0,0.9) 55%, rgba(244,81,30,0.92) 100%);"
  placement="top"
>
  <div class="cele-list">
    {#each items as c (c.id)}
      <div class="neon cele-item">
        {#if c.kind === 'breakout50'}
          🎉 <strong>{c.nickname}</strong> 님이 블록깨기 <strong>50단계</strong> 클리어! 🎆
        {:else}
          🏆 <strong>{c.nickname}</strong> 님이 <strong>{c.label}</strong>!
          <span class="detail">{c.detail}</span>
        {/if}
      </div>
    {/each}
  </div>
  {#if open}
    <div class="fw-layer" aria-hidden="true">
      <Confetti
        x={[-5, 5]}
        y={[0, 0.1]}
        delay={[200, 1800]}
        infinite
        duration={5000}
        amount={Math.min(120 + items.length * 40, 280)}
        fallDistance="100vh"
      />
    </div>
  {/if}
</Offcanvas>

<style>
  .cele-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .cele-item {
    line-height: 1.45;
  }
  .detail {
    display: block;
    font-size: 0.75em;
    opacity: 0.92;
    margin-top: 0.15rem;
  }
  .neon {
    font-family: 'ChosunGs', serif;
    font-size: 1.45em;
    color: #fff;
    text-shadow: 0 0 0.1em rgba(255, 255, 255, 0.7);
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
