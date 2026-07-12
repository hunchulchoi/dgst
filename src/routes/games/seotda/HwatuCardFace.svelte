<script lang="ts">
  interface Card {
    month: number;
    gwang: boolean;
  }

  let { card }: { card: Card } = $props();

  const imageName = $derived(
    `${String(card.month).padStart(2, '0')}${card.gwang ? '-gwang' : ''}.webp`
  );
</script>

<span class="hwatu-art" class:gwang={card.gwang}>
  <img
    src={`/images/seotda/hwatu/${imageName}`}
    alt={`${card.month}월${card.gwang ? ' 광' : ''} 화투패`}
    draggable="false"
  />
  <span class="card-label">{card.month}{card.gwang ? ' 광' : ''}</span>
</span>

<style>
  .hwatu-art {
    position: absolute;
    inset: 0;
    display: block;
    overflow: hidden;
    background: #f7f0df;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    user-select: none;
    -webkit-user-drag: none;
  }
  .card-label {
    position: absolute;
    right: 3px;
    bottom: 3px;
    padding: 1px 4px;
    border-radius: 2px;
    background: rgba(250, 247, 238, 0.92);
    color: #171717;
    font-size: clamp(8px, 0.72em, 13px);
    font-weight: 800;
    line-height: 1.2;
    white-space: nowrap;
  }
  .gwang .card-label {
    background: #bd312b;
    color: white;
  }
</style>
