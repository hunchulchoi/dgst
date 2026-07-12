<script lang="ts">
  interface Card {
    month: number;
    gwang: boolean;
  }

  let { card }: { card: Card } = $props();
</script>

<span class="hwatu-art" class:gwang={card.gwang}>
  <svg viewBox="0 0 100 140" role="img" aria-label={`${card.month}월 화투 그림`}>
    <rect width="100" height="140" fill="#f7f0df" />
    {#if card.month === 1}
      <circle cx="76" cy="25" r="16" fill="#d43b31" />
      <path
        d="M18 118 Q42 78 39 18 M38 57 L12 40 M39 69 L72 49 M32 83 L8 76"
        stroke="#242722"
        stroke-width="7"
        fill="none"
      />
      <path
        d="M12 40 l19 3 -13 8 18 2 M72 49 l-20 4 14 7 -20 4 M8 76 l22 2 -15 9 22 1"
        stroke="#247044"
        stroke-width="6"
        fill="none"
      />
    {:else if card.month === 2}
      <path
        d="M13 119 Q44 79 55 20 M37 80 L18 54 M44 62 L78 41"
        stroke="#3b2d25"
        stroke-width="6"
        fill="none"
      />
      {#each [[18, 54], [31, 65], [54, 45], [77, 41], [55, 20], [43, 81]] as flower}
        <circle cx={flower[0]} cy={flower[1]} r="8" fill="#df4d64" /><circle
          cx={flower[0]}
          cy={flower[1]}
          r="3"
          fill="#f7d45c"
        />
      {/each}
      <path d="M62 84 q15-13 27 1 q-14 4-19 15 q-3-10-8-16" fill="#6a8d35" />
    {:else if card.month === 3}
      <path
        d="M12 114 Q33 77 51 22 M42 58 L83 35 M33 77 L13 51"
        stroke="#4a3127"
        stroke-width="6"
        fill="none"
      />
      {#each [[14, 50], [29, 70], [50, 23], [63, 43], [82, 35], [48, 61]] as flower}
        <circle cx={flower[0]} cy={flower[1]} r="10" fill="#ef8eaa" /><circle
          cx={flower[0]}
          cy={flower[1]}
          r="3"
          fill="#f4c947"
        />
      {/each}
      <path
        d="M7 15 H93 V29 H7 Z M18 29 V51 M82 29 V51"
        fill="#c83b35"
        stroke="#242424"
        stroke-width="3"
      />
    {:else if card.month === 4}
      <path
        d="M15 18 Q46 38 78 20 M28 28 v72 M47 31 v58 M67 27 v72"
        stroke="#3d6d35"
        stroke-width="5"
        fill="none"
      />
      {#each [[28, 43], [28, 58], [28, 73], [47, 48], [47, 64], [67, 42], [67, 58], [67, 75]] as bloom}
        <ellipse cx={bloom[0]} cy={bloom[1]} rx="8" ry="11" fill="#8a63a8" />
      {/each}
      <path d="M50 105 q19-15 37 0 q-18 1-27 13 q-2-9-10-13" fill="#252525" />
    {:else if card.month === 5}
      <path
        d="M10 109 Q31 82 31 31 M40 111 Q51 78 61 28 M63 111 Q72 83 87 49"
        stroke="#397544"
        stroke-width="6"
        fill="none"
      />
      <path
        d="M31 34 l-15 23 17-8 13 13-4-27z M61 31 l-13 24 17-9 14 10-5-27z M86 50 l-18 18 18-4 9 13z"
        fill="#6852a3"
      />
      <path d="M5 115 Q28 106 50 115 T96 115" stroke="#4f91a8" stroke-width="5" fill="none" />
    {:else if card.month === 6}
      <path
        d="M49 112 V64 M49 86 L22 72 M49 78 L76 61"
        stroke="#3c783e"
        stroke-width="6"
        fill="none"
      />
      {#each [[50, 43], [34, 52], [65, 54], [43, 62], [59, 65]] as petal}
        <circle cx={petal[0]} cy={petal[1]} r="15" fill="#d74352" />
      {/each}
      <circle cx="50" cy="54" r="9" fill="#eac64d" />
      <path d="M73 91 q9-13 17 0 q-8 10-17 0 M73 91 q-9-13-17 0 q8 10 17 0" fill="#222" />
    {:else if card.month === 7}
      <path
        d="M10 106 Q37 72 45 20 M31 84 Q60 62 82 33 M42 70 Q65 81 91 71"
        stroke="#3a6f39"
        stroke-width="6"
        fill="none"
      />
      {#each [[19, 93], [31, 78], [42, 61], [55, 69], [68, 51], [82, 35], [83, 72]] as leaf}
        <ellipse
          cx={leaf[0]}
          cy={leaf[1]}
          rx="10"
          ry="5"
          fill="#d84a4a"
          transform={`rotate(-25 ${leaf[0]} ${leaf[1]})`}
        />
      {/each}
      <path d="M23 111 q20-25 46-6 l12 10-17 5-9-7-16 8z" fill="#4a3a31" />
    {:else if card.month === 8}
      <circle cx="68" cy="33" r="22" fill="#e8c94f" stroke="#222" stroke-width="3" />
      <path
        d="M10 114 Q29 75 32 35 M28 115 Q54 78 57 40 M49 115 Q74 82 87 53 M71 115 Q83 91 95 79"
        stroke="#48433b"
        stroke-width="4"
        fill="none"
      />
      {#each [[26, 50], [39, 65], [55, 52], [67, 72], [82, 63], [88, 86]] as plume}
        <path
          d={`M${plume[0]} ${plume[1]} q-11 -7 -15 3 q10 8 15 3 q11 7 15-3 q-10-8-15-3`}
          fill="#d9c8a5"
        />
      {/each}
    {:else if card.month === 9}
      <path
        d="M18 112 Q38 80 45 31 M48 112 Q61 78 76 39"
        stroke="#3f7440"
        stroke-width="6"
        fill="none"
      />
      {#each [[31, 61], [45, 40], [52, 67], [70, 49], [78, 72]] as flower}
        <circle cx={flower[0]} cy={flower[1]} r="12" fill="#e1b83f" /><circle
          cx={flower[0]}
          cy={flower[1]}
          r="5"
          fill="#8c6323"
        />
      {/each}
      <path d="M57 94 h31 l-5 23 H62z" fill="#d6d0bc" stroke="#333" stroke-width="3" /><circle
        cx="73"
        cy="101"
        r="4"
        fill="#c53b35"
      />
    {:else}
      <path
        d="M16 114 Q44 75 57 24 M39 78 L17 49 M48 58 L82 38"
        stroke="#49352a"
        stroke-width="6"
        fill="none"
      />
      {#each [[17, 48], [28, 63], [39, 77], [52, 53], [59, 25], [70, 45], [82, 38]] as leaf}
        <path
          d={`M${leaf[0]} ${leaf[1]} l-9-8 4 11-8 2 10 4-2 10 8-8 7 5-2-10 9-5-11-1 1-11z`}
          fill="#d74432"
        />
      {/each}
      <path d="M56 105 q10-19 25-13 l8 9-9 2-3 17-5-16-9 16-1-16z" fill="#70472f" />
    {/if}
  </svg>
  <span class="card-label">{card.month}월{card.gwang ? ' 광' : ''}</span>
</span>

<style>
  .hwatu-art {
    position: absolute;
    inset: 0;
    display: block;
    overflow: hidden;
    background: #f7f0df;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .card-label {
    position: absolute;
    left: 3px;
    right: 3px;
    bottom: 3px;
    padding: 1px 2px;
    border-radius: 2px;
    background: rgba(250, 247, 238, 0.9);
    color: #171717;
    font-size: clamp(8px, 0.72em, 13px);
    font-weight: 800;
    line-height: 1.2;
    text-align: center;
    white-space: nowrap;
  }
  .gwang .card-label {
    background: #bd312b;
    color: white;
  }
</style>
