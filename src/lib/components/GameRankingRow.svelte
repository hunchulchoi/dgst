<script lang="ts">
  import GameProfilePhoto from '$lib/components/GameProfilePhoto.svelte';
  import { imageThumbnailUrl } from '$lib/util/imageThumbnail.js';

  let {
    index,
    nickname,
    photo,
    score,
    meta = '',
    current = false
  }: {
    index: number;
    nickname: string;
    photo?: string | null;
    score: string;
    meta?: string;
    current?: boolean;
  } = $props();

  const placeLabel = $derived(index === 0 ? '1위' : `${index + 1}위`);
</script>

<li class="game-ranking-row" class:current aria-label={`${placeLabel} ${nickname} ${score}`}>
  <span class="game-ranking-place" aria-label={placeLabel}>
    {index === 0 ? '👑' : `${index + 1}.`}
  </span>
  <span class="game-ranking-player">
    <GameProfilePhoto src={imageThumbnailUrl(photo, 40)} name={nickname} />
    <span class="game-ranking-copy">
      <strong class="game-ranking-name">{nickname}</strong>
      {#if meta}<small>{meta}</small>{/if}
    </span>
  </span>
  <strong class="game-ranking-score">{score}</strong>
</li>

<style>
  .game-ranking-row {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr) auto;
    gap: 0.55rem;
    align-items: center;
    width: 100%;
    padding: 0.65rem 0.25rem;
    border-bottom: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    text-align: left;
  }

  .game-ranking-row:last-child {
    border-bottom: 0;
  }

  .game-ranking-row.current {
    border-radius: 0.5rem;
    background: color-mix(in srgb, #ffc107 14%, transparent);
  }

  .game-ranking-place {
    min-width: 0;
    font-weight: 800;
    line-height: 1;
    text-align: left;
  }

  .game-ranking-player {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    gap: 0.5rem;
    min-width: 0;
    overflow: hidden;
  }

  .game-ranking-copy {
    display: grid;
    min-width: 0;
    text-align: left;
  }

  .game-ranking-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .game-ranking-copy small {
    overflow: hidden;
    color: color-mix(in srgb, currentColor 62%, transparent);
    font-size: 0.75rem;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .game-ranking-score {
    justify-self: end;
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
</style>
