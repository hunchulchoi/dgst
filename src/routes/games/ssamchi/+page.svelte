<script lang="ts">
  import { untrack } from 'svelte';
  import { swalFire } from '$lib/util/swal.js';
  import { HIT_MULTIPLIER, MAX_COINS, MAX_TOTAL, MIN_BET } from './ssamchiEngine.js';

  interface RankRow {
    email: string;
    nickname: string;
    balance: number;
  }

  interface RoundResult {
    hiddenCoins: number;
    npcCoins: number[];
    guess: number;
    total: number;
    hit: boolean;
    bet: number;
    payout: number;
    delta: number;
  }

  interface PageData {
    session: { user?: { email?: string; nickname?: string; name?: string } } | null;
    balance: number;
    rank: RankRow[];
    todayStats: { hands: number; users: number };
    oopsInfo: { remainingMs: number; readyAt: string } | null;
  }

  let { data }: { data: PageData } = $props();
  let balance = $state(untrack(() => Number(data.balance ?? 0)));
  let rank = $state<RankRow[]>(untrack(() => data.rank ?? []));
  let todayStats = $state(untrack(() => data.todayStats ?? { hands: 0, users: 0 }));
  let hiddenCoins = $state(1);
  let guess = $state(5);
  let bet = $state(10);
  let playing = $state(false);
  let result = $state<RoundResult | null>(null);
  let reveal = $state(false);

  const loggedIn = $derived(Boolean(data.session?.user?.email));
  const guesses = $derived(
    Array.from({ length: MAX_COINS * 3 + 1 }, (_, index) => hiddenCoins + index)
  );
  const betOptions = $derived(
    [10, 50, 100, 500, 1000].filter((amount) => amount <= Math.max(balance, MIN_BET))
  );

  function number(value: number) {
    return new Intl.NumberFormat('ko-KR').format(value);
  }

  function chooseHand(coins: number) {
    hiddenCoins = coins;
    guess = Math.min(Math.max(guess, coins), coins + MAX_COINS * 3);
    result = null;
    reveal = false;
  }

  function coinsText(coins: number) {
    return coins === 0 ? '빈손' : '🪙'.repeat(coins);
  }

  async function play() {
    if (!loggedIn || playing) return;
    playing = true;
    result = null;
    reveal = false;
    try {
      const response = await fetch('/games/ssamchi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hiddenCoins, guess, bet })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || '게임 요청에 실패했습니다.');
      result = body.result as RoundResult;
      balance = Number(body.balance);
      setTimeout(() => (reveal = true), 350);
      void refreshRank();
    } catch (error) {
      await swalFire({
        icon: 'error',
        title: '한 판을 시작할 수 없어요',
        text: error instanceof Error ? error.message : '잠시 후 다시 해 주세요.',
        confirmButtonText: '확인'
      });
    } finally {
      playing = false;
    }
  }

  async function refreshRank() {
    try {
      const response = await fetch(`/games/ssamchi?_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json();
      rank = body.rank ?? rank;
      todayStats = body.todayStats ?? todayStats;
    } catch {
      // 게임 결과는 유지하고 랭킹만 다음에 갱신한다.
    }
  }
</script>

<svelte:head>
  <title>짤짤이(쌈치기)</title>
  <meta name="description" content="손안의 동전을 숨기고 모두의 합계를 맞히는 짤짤이 게임" />
</svelte:head>

<main class="container py-3 py-md-4 ssamchi-page">
  <header class="game-hero rounded-4 p-3 p-md-4 mb-3">
    <div>
      <div class="eyebrow">추억의 손바닥 게임</div>
      <h1>🪙 짤짤이 <small>(쌈치기)</small></h1>
      <p class="mb-0">나와 상대 3명이 0~3개를 숨깁니다. 전체 동전 수를 딱 맞혀 보세요.</p>
    </div>
    <div class="score-card">
      <span>내 점수</span>
      <strong>{number(balance)}</strong>
      <small>오늘 {number(todayStats.hands)}판 · {number(todayStats.users)}명</small>
    </div>
  </header>

  <div class="row g-3">
    <section class="col-lg-8">
      <div class="game-card rounded-4 p-3 p-md-4">
        <div class="step">
          <span class="step-number">1</span>
          <div>
            <h2>내 손에 몇 개를 숨길까?</h2>
            <p>상대에게는 선택이 보이지 않습니다.</p>
          </div>
        </div>
        <div class="hand-options" aria-label="숨길 동전 수">
          {#each Array.from({ length: MAX_COINS + 1 }, (_, i) => i) as coins (coins)}
            <button
              class:active={hiddenCoins === coins}
              onclick={() => chooseHand(coins)}
              disabled={playing}
              aria-pressed={hiddenCoins === coins}
            >
              <span>{coinsText(coins)}</span><b>{coins}개</b>
            </button>
          {/each}
        </div>

        <div class="step mt-4">
          <span class="step-number">2</span>
          <div>
            <h2>전체 합계는?</h2>
            <p>내 {hiddenCoins}개를 포함해 {hiddenCoins}~{hiddenCoins + 9}개가 가능합니다.</p>
          </div>
        </div>
        <div class="guess-grid" aria-label="전체 동전 수 예상">
          {#each guesses as value (value)}
            <button
              class:active={guess === value}
              onclick={() => (guess = value)}
              disabled={playing}
            >
              {value}
            </button>
          {/each}
        </div>

        <div class="bet-row mt-4">
          <div>
            <span class="label">판돈</span>
            <div class="bet-options">
              {#each betOptions as amount (amount)}
                <button
                  class:active={bet === amount}
                  onclick={() => (bet = amount)}
                  disabled={playing}
                >
                  {number(amount)}
                </button>
              {/each}
            </div>
          </div>
          <button
            class="play-button"
            onclick={play}
            disabled={!loggedIn || playing || balance < bet}
          >
            {playing ? '손을 펼치는 중…' : '쌈치기!'}
          </button>
        </div>

        {#if !loggedIn}
          <div class="notice mt-3">로그인하면 첫 1,000점으로 시작할 수 있습니다.</div>
        {:else if data.oopsInfo && balance < MIN_BET}
          <div class="notice danger mt-3">오링! 5분 후 500점이 자동 충전됩니다.</div>
        {/if}

        {#if result}
          <div class:revealed={reveal} class:hit={result.hit} class="result-board mt-4">
            <div class="hands">
              <div class="hand mine">
                <span>나</span><strong>{coinsText(result.hiddenCoins)}</strong><small
                  >{result.hiddenCoins}개</small
                >
              </div>
              {#each result.npcCoins as coins, index (index)}
                <div class="hand">
                  <span>{['철수', '영희', '민수'][index]}</span><strong
                    >{reveal ? coinsText(coins) : '✊'}</strong
                  ><small>{reveal ? `${coins}개` : '비밀'}</small>
                </div>
              {/each}
            </div>
            <div class="result-copy">
              {#if reveal}
                <span>내 예상 {result.guess}개 · 실제 {result.total}개</span>
                <strong>{result.hit ? '딱 맞졌다!' : '아깝다!'}</strong>
                <b class:positive={result.delta > 0}
                  >{result.delta > 0 ? '+' : ''}{number(result.delta)}점</b
                >
              {:else}
                <strong>하나, 둘, 셋!</strong>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </section>

    <aside class="col-lg-4">
      <div class="side-card rounded-4 p-3 mb-3">
        <h2>게임 규칙</h2>
        <ol>
          <li>각자 0~3개의 동전을 손에 숨겨요.</li>
          <li>모두의 동전 합계를 하나 골라요.</li>
          <li>정답이면 판돈의 {HIT_MULTIPLIER}배, 오답이면 판돈을 잃어요.</li>
        </ol>
        <div class="range-note">최소 0 · 최대 {MAX_TOTAL}개</div>
      </div>
      <div class="side-card rounded-4 p-3">
        <h2>짤짤이 Top 10</h2>
        {#if rank.length}
          <div class="ranking">
            {#each rank as row, index (row.email)}
              <div class:me={row.email === data.session?.user?.email}>
                <span>{index + 1}</span><b>{row.nickname}</b><strong>{number(row.balance)}</strong>
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty">첫 번째 순위의 주인공이 되어 보세요.</p>
        {/if}
      </div>
    </aside>
  </div>
</main>

<style>
  .ssamchi-page {
    max-width: 1120px;
    color: var(--bs-body-color);
  }
  .game-hero {
    display: flex;
    justify-content: space-between;
    gap: 1.5rem;
    align-items: center;
    color: #fff;
    background:
      radial-gradient(circle at 12% 20%, #db8b31 0, transparent 26%),
      linear-gradient(135deg, #602516, #a8461d 58%, #492013);
    box-shadow: 0 12px 30px #4b1d1130;
  }
  .eyebrow {
    color: #ffd890;
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    margin-bottom: 0.25rem;
  }
  h1 {
    margin: 0 0 0.35rem;
    font-size: clamp(1.65rem, 4vw, 2.45rem);
    font-weight: 900;
  }
  h1 small {
    font-size: 0.52em;
    opacity: 0.8;
  }
  .game-hero p {
    opacity: 0.82;
  }
  .score-card {
    flex: 0 0 170px;
    display: grid;
    padding: 1rem 1.2rem;
    border: 1px solid #ffffff36;
    border-radius: 1rem;
    background: #18080342;
    backdrop-filter: blur(8px);
    text-align: right;
  }
  .score-card span,
  .score-card small {
    color: #f6d9c9;
    font-size: 0.78rem;
  }
  .score-card strong {
    color: #ffd36c;
    font-size: 1.55rem;
  }
  .game-card,
  .side-card {
    background: var(--bs-body-bg);
    border: 1px solid var(--bs-border-color);
    box-shadow: 0 8px 24px #3315080c;
  }
  .step {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }
  .step-number {
    display: grid;
    place-items: center;
    flex: 0 0 28px;
    height: 28px;
    border-radius: 50%;
    color: #fff;
    background: #9e3f1f;
    font-weight: 900;
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 850;
  }
  .step p {
    margin: 0.18rem 0 0;
    color: var(--bs-secondary-color);
    font-size: 0.84rem;
  }
  button {
    font: inherit;
  }
  .hand-options {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.55rem;
    margin-top: 1rem;
  }
  .hand-options button {
    min-height: 82px;
    border: 1px solid var(--bs-border-color);
    border-radius: 0.85rem;
    color: inherit;
    background: var(--bs-tertiary-bg);
    transition: 0.16s ease;
  }
  .hand-options button span {
    display: block;
    min-height: 1.75rem;
    font-size: 1.25rem;
  }
  .hand-options button b {
    display: block;
    font-size: 0.78rem;
    color: var(--bs-secondary-color);
  }
  .hand-options button.active,
  .guess-grid button.active,
  .bet-options button.active {
    color: #fff;
    border-color: #9e3f1f;
    background: #9e3f1f;
    transform: translateY(-2px);
    box-shadow: 0 5px 12px #7b2c1850;
  }
  .hand-options button.active b {
    color: #ffe5d5;
  }
  .guess-grid {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 0.35rem;
    margin-top: 1rem;
  }
  .guess-grid button {
    aspect-ratio: 1;
    min-width: 0;
    border: 1px solid var(--bs-border-color);
    border-radius: 0.65rem;
    color: inherit;
    background: var(--bs-tertiary-bg);
    font-weight: 850;
  }
  .bet-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }
  .label {
    display: block;
    margin-bottom: 0.45rem;
    color: var(--bs-secondary-color);
    font-size: 0.78rem;
    font-weight: 700;
  }
  .bet-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .bet-options button {
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 2rem;
    color: inherit;
    background: transparent;
    font-size: 0.8rem;
    font-weight: 750;
  }
  .play-button {
    min-width: 150px;
    padding: 0.78rem 1.1rem;
    border: 0;
    border-radius: 0.85rem;
    color: #3b1707;
    background: linear-gradient(180deg, #ffd66b, #e89c2d);
    box-shadow: 0 6px 0 #a35b18;
    font-weight: 950;
  }
  .play-button:active:not(:disabled) {
    transform: translateY(4px);
    box-shadow: 0 2px 0 #a35b18;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .notice {
    padding: 0.75rem 1rem;
    border-radius: 0.7rem;
    background: #fff3cd;
    color: #664d03;
    font-size: 0.85rem;
  }
  .notice.danger {
    background: #f8d7da;
    color: #842029;
  }
  .result-board {
    overflow: hidden;
    border: 1px solid #cfb78f;
    border-radius: 1rem;
    background: linear-gradient(145deg, #f8e8c6, #eac58c);
    color: #3a2413;
    opacity: 0.8;
  }
  .hands {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    background: #cfb78f;
  }
  .hand {
    display: grid;
    place-items: center;
    min-height: 105px;
    padding: 0.6rem 0.25rem;
    background: #f9edcf;
  }
  .hand.mine {
    background: #ffe1a5;
  }
  .hand span,
  .hand small {
    font-size: 0.72rem;
    color: #76543b;
  }
  .hand strong {
    min-height: 2rem;
    font-size: 1.35rem;
    transform: scale(0.8);
    transition: 0.35s cubic-bezier(0.2, 0.8, 0.2, 1.2);
  }
  .revealed .hand strong {
    transform: scale(1);
  }
  .result-copy {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 1rem;
  }
  .result-copy span {
    font-size: 0.8rem;
  }
  .result-copy strong {
    margin-right: auto;
    font-size: 1.15rem;
  }
  .result-copy b {
    color: #b32922;
    font-size: 1.15rem;
  }
  .result-copy b.positive {
    color: #176b3b;
  }
  .result-board.hit {
    border-color: #e0a11d;
    box-shadow:
      0 0 0 3px #f2bd3d35,
      0 10px 22px #a56b1640;
  }
  .side-card ol {
    margin: 0.9rem 0;
    padding-left: 1.25rem;
    color: var(--bs-secondary-color);
    font-size: 0.87rem;
  }
  .side-card li + li {
    margin-top: 0.5rem;
  }
  .range-note {
    padding: 0.55rem;
    border-radius: 0.6rem;
    text-align: center;
    background: var(--bs-tertiary-bg);
    color: var(--bs-secondary-color);
    font-size: 0.75rem;
  }
  .ranking {
    margin-top: 0.75rem;
  }
  .ranking > div {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    align-items: center;
    padding: 0.55rem 0.35rem;
    border-bottom: 1px solid var(--bs-border-color);
    font-size: 0.82rem;
  }
  .ranking > div.me {
    margin: 0.15rem 0;
    border: 0;
    border-radius: 0.5rem;
    background: #ffc10725;
  }
  .ranking span {
    color: var(--bs-secondary-color);
    font-weight: 800;
  }
  .ranking strong {
    color: #a14a1f;
  }
  .empty {
    margin: 0.8rem 0 0;
    color: var(--bs-secondary-color);
    font-size: 0.85rem;
  }
  @media (max-width: 767px) {
    .game-hero {
      align-items: stretch;
      flex-direction: column;
    }
    .score-card {
      flex-basis: auto;
      text-align: left;
    }
    .guess-grid {
      grid-template-columns: repeat(5, 1fr);
    }
    .bet-row {
      align-items: stretch;
      flex-direction: column;
    }
    .play-button {
      width: 100%;
    }
    .hands {
      grid-template-columns: repeat(2, 1fr);
    }
    .result-copy {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.25rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
    }
  }
</style>
