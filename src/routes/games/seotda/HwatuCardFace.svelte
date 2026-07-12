<script lang="ts">
  import card01Gwang from '$lib/assets/hwatu/01-gwang.webp';
  import card01 from '$lib/assets/hwatu/01.webp';
  import card02 from '$lib/assets/hwatu/02.webp';
  import card03Gwang from '$lib/assets/hwatu/03-gwang.webp';
  import card03 from '$lib/assets/hwatu/03.webp';
  import card04 from '$lib/assets/hwatu/04.webp';
  import card05 from '$lib/assets/hwatu/05.webp';
  import card06 from '$lib/assets/hwatu/06.webp';
  import card07 from '$lib/assets/hwatu/07.webp';
  import card08Gwang from '$lib/assets/hwatu/08-gwang.webp';
  import card08 from '$lib/assets/hwatu/08.webp';
  import card09 from '$lib/assets/hwatu/09.webp';
  import card10 from '$lib/assets/hwatu/10.webp';

  interface Card {
    month: number;
    gwang: boolean;
  }

  let { card }: { card: Card } = $props();

  const cardImages: Record<string, string> = {
    '01-gwang': card01Gwang,
    '01': card01,
    '02': card02,
    '03-gwang': card03Gwang,
    '03': card03,
    '04': card04,
    '05': card05,
    '06': card06,
    '07': card07,
    '08-gwang': card08Gwang,
    '08': card08,
    '09': card09,
    '10': card10
  };

  const imageKey = $derived(`${String(card.month).padStart(2, '0')}${card.gwang ? '-gwang' : ''}`);
  const imageSrc = $derived(cardImages[imageKey]);
</script>

<span class="hwatu-art" class:gwang={card.gwang}>
  <img src={imageSrc} alt={`${card.month}월${card.gwang ? ' 광' : ''} 화투패`} draggable="false" />
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
