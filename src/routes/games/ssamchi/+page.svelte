<script lang="ts">
  import { untrack } from 'svelte';
  import { swalFire } from '$lib/util/swal.js';
  import { MIN_BET } from './ssamchiEngine.js';

  type Mode = 'odd-even' | 'ssamchi';
  type Outcome = 'win' | 'lose' | 'draw';
  type Remainder = 0 | 1 | 2;

  interface RankRow {
    email: string;
    nickname: string;
    balance: number;
  }
  interface RoundResult {
    mode: Mode;
    marbles: number;
    outcome: Outcome;
    bet: number;
    payout: number;
    delta: number;
    choice?: 'odd' | 'even';
    answer: 'odd' | 'even' | Remainder;
    take?: Remainder;
    give?: Remainder;
    userIsHost: boolean;
  }
  interface PageData {
    session: { user?: { email?: string; nickname?: string; name?: string } } | null;
    balance: number;
    rank: RankRow[];
    todayStats: { hands: number; users: number };
    oopsInfo: { remainingMs: number; readyAt: string } | null;
    host: 'user' | 'npc';
  }

  const SSAMCHI_LABEL: Record<Remainder, string> = { 1: '으찌', 2: '니', 0: '쌈' };
  const CALLS: Array<{ take: Remainder; give: Remainder }> = [
    { take: 1, give: 2 },
    { take: 1, give: 0 },
    { take: 2, give: 1 },
    { take: 2, give: 0 },
    { take: 0, give: 1 },
    { take: 0, give: 2 }
  ];

  let { data }: { data: PageData } = $props();
  let balance = $state(untrack(() => Number(data.balance ?? 0)));
  let rank = $state<RankRow[]>(untrack(() => data.rank ?? []));
  let todayStats = $state(untrack(() => data.todayStats ?? { hands: 0, users: 0 }));
  let mode = $state<Mode>('odd-even');
  let host = $state<'user' | 'npc'>(untrack(() => data.host ?? 'npc'));
  let selectedMarbles = $state(7);
  let oddEvenChoice = $state<'odd' | 'even'>('odd');
  let take = $state<Remainder>(1);
  let give = $state<Remainder>(0);
  let bet = $state(10);
  let playing = $state(false);
  let reveal = $state(false);
  let result = $state<RoundResult | null>(null);

  const loggedIn = $derived(Boolean(data.session?.user?.email));
  const betOptions = $derived(
    [10, 50, 100, 500, 1000].filter((value) => value <= Math.max(balance, MIN_BET))
  );

  function formatNumber(value: number) {
    return new Intl.NumberFormat('ko-KR').format(value);
  }
  function selectMode(next: Mode) {
    mode = next;
    result = null;
    reveal = false;
  }
  function selectCall(call: { take: Remainder; give: Remainder }) {
    take = call.take;
    give = call.give;
  }
  function callLabel(call: { take: Remainder; give: Remainder }) {
    return `${SSAMCHI_LABEL[call.take]} 먹고, ${SSAMCHI_LABEL[call.give]} 떠`;
  }
  function resultName(value: RoundResult['answer']) {
    if (value === 'odd') return '홀';
    if (value === 'even') return '짝';
    return SSAMCHI_LABEL[value];
  }

  async function play() {
    if (!loggedIn || playing || bet > balance) return;
    playing = true;
    reveal = false;
    result = null;
    try {
      const payload =
        host === 'user'
          ? { mode, marbles: selectedMarbles, bet }
          : mode === 'odd-even'
            ? { mode, choice: oddEvenChoice, bet }
            : { mode, take, give, bet };
      const response = await fetch('/games/ssamchi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || '게임 요청에 실패했습니다.');
      result = body.result as RoundResult;
      balance = Number(body.balance);
      host = body.host ?? host;
      setTimeout(() => (reveal = true), 550);
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
      /* 다음 판에 갱신 */
    }
  }
</script>

<svelte:head>
  <title>홀짝·쌈치기</title>
  <meta name="description" content="접은 구슬을 홀짝 또는 으찌·니·쌈으로 맞히는 골목길 구슬놀이" />
</svelte:head>

<main class="container py-3 py-md-4 game-page">
  <header class="hero rounded-4 p-3 p-md-4 mb-3">
    <div>
      <div class="eyebrow">짤그랑 골목길 구슬 한 판</div>
      <h1>🟢 홀짝과 쌈치기</h1>
      <p>상대가 손에 접은 구슬을 소리와 촉으로 맞혀 보세요.</p>
    </div>
    <div class="score">
      <span>내 구슬</span><strong>{formatNumber(balance)}개</strong><small
        >오늘 {formatNumber(todayStats.hands)}판 · {formatNumber(todayStats.users)}명</small
      >
    </div>
  </header>

  <div class="row g-3">
    <section class="col-lg-8">
      <div class="table-card rounded-4 p-3 p-md-4">
        <div class="game-tabs" role="tablist" aria-label="게임 선택">
          <button
            role="tab"
            aria-selected={mode === 'odd-even'}
            class:active={mode === 'odd-even'}
            onclick={() => selectMode('odd-even')}
            ><span>Ⅰ</span><b>홀짝</b><small>기본 승부</small></button
          >
          <button
            role="tab"
            aria-selected={mode === 'ssamchi'}
            class:active={mode === 'ssamchi'}
            onclick={() => selectMode('ssamchi')}
            ><span>Ⅲ</span><b>쌈치기</b><small>으찌·니·쌈</small></button
          >
        </div>

        <div class="fist-stage" class:shaking={playing} class:open={reveal}>
          <div class="host-name">
            선 <b
              >{result ? (result.userIsHost ? '나' : '철수') : host === 'user' ? '나' : '철수'}</b
            >
          </div>
          <div
            class="fist"
            aria-label={reveal ? `구슬 ${result?.marbles ?? 0}개` : '구슬을 접은 손'}
          >
            {#if reveal && result}
              <div class="marbles">
                {#each Array.from({ length: result.marbles }) as _, index (index)}<i
                    style="--i:{index}"
                  ></i>{/each}
              </div>
            {:else}<span>✊</span>{/if}
          </div>
          <div class="sound">
            {playing ? '짤그랑···' : reveal ? `${result?.marbles}개!` : '“가~!”'}
          </div>
        </div>

        {#if result && !reveal}
          <section class="choice-panel waiting">
            <h2>손을 펼치는 중…</h2>
            <p>구슬 소리에 귀를 기울여 보세요.</p>
          </section>
        {:else if host === 'user'}
          <section class="choice-panel" aria-labelledby="host-title">
            <h2 id="host-title">내가 선! 구슬을 몇 개 접을까?</h2>
            <p>철수의 외침은 손을 펼 때 공개됩니다.</p>
            <div class="marble-counts">
              {#each Array.from({ length: 15 }, (_, index) => index + 1) as count (count)}
                <button
                  class:active={selectedMarbles === count}
                  onclick={() => (selectedMarbles = count)}>{count}</button
                >
              {/each}
            </div>
          </section>
        {:else if mode === 'odd-even'}
          <section class="choice-panel" aria-labelledby="odd-even-title">
            <h2 id="odd-even-title">홀이냐, 짝이냐?</h2>
            <p>구슬 개수가 홀수인지 짝수인지 선택하세요.</p>
            <div class="odd-even-options">
              <button class:active={oddEvenChoice === 'odd'} onclick={() => (oddEvenChoice = 'odd')}
                ><strong>홀</strong><small>1 · 3 · 5 · 7 …</small></button
              >
              <button
                class:active={oddEvenChoice === 'even'}
                onclick={() => (oddEvenChoice = 'even')}
                ><strong>짝</strong><small>2 · 4 · 6 · 8 …</small></button
              >
            </div>
          </section>
        {:else}
          <section class="choice-panel" aria-labelledby="ssamchi-title">
            <h2 id="ssamchi-title">무슨 주문을 외칠까?</h2>
            <p>첫 결과는 내가 먹고, 둘째 결과는 상대가 먹어요. 나머지는 무승부.</p>
            <div class="call-options">
              {#each CALLS as call (`${call.take}-${call.give}`)}
                <button
                  class:active={take === call.take && give === call.give}
                  onclick={() => selectCall(call)}
                >
                  <b>{SSAMCHI_LABEL[call.take]} 먹고</b><span>{SSAMCHI_LABEL[call.give]} 떠</span>
                </button>
              {/each}
            </div>
            <div class="remainders">
              <span><b>으찌</b> 3배수+1</span><span><b>니</b> 3배수+2</span><span
                ><b>쌈</b> 3의 배수</span
              >
            </div>
          </section>
        {/if}

        <div class="bet-row">
          <div>
            <span class="bet-label">판돈</span>
            <div class="bets">
              {#each betOptions as amount (amount)}<button
                  class:active={bet === amount}
                  onclick={() => (bet = amount)}>{formatNumber(amount)}</button
                >{/each}<button
                class:active={bet === balance && balance > 0}
                class="all-in"
                onclick={() => (bet = balance)}
                disabled={balance < MIN_BET}>아도</button
              >
            </div>
          </div>
          <button
            class="go"
            onclick={play}
            disabled={!loggedIn || playing || balance < bet || bet < MIN_BET}
            >{playing
              ? '접는 중…'
              : host === 'user'
                ? `${selectedMarbles}개 접기!`
                : mode === 'odd-even'
                  ? `${oddEvenChoice === 'odd' ? '홀' : '짝'}!`
                  : `${callLabel({ take, give })}!`}</button
          >
        </div>

        {#if !loggedIn}<div class="notice">
            로그인하면 첫 구슬 1,000개를 받습니다.
          </div>{:else if data.oopsInfo && balance < MIN_BET}<div class="notice danger">
            오링! 5분 후 구슬 500개가 자동 충전됩니다.
          </div>{/if}

        {#if result && reveal}
          <div
            class="result"
            class:win={result.outcome === 'win'}
            class:lose={result.outcome === 'lose'}
          >
            <div>
              <span>{result.userIsHost ? '철수의 외침' : '결과'}</span><strong
                >{result.userIsHost
                  ? result.mode === 'odd-even'
                    ? resultName(result.choice ?? 'odd')
                    : callLabel({ take: result.take ?? 1, give: result.give ?? 0 })
                  : `${result.marbles}개 · ${resultName(result.answer)}`}</strong
              >
            </div>
            <h3>
              {result.outcome === 'win'
                ? '내가 먹었다!'
                : result.outcome === 'lose'
                  ? '철수가 먹었다!'
                  : '무승부, 한 판 더!'}
            </h3>
            <b>{result.delta > 0 ? '+' : ''}{formatNumber(result.delta)}개</b>
            <small class="next-host">다음 선: {host === 'user' ? '나' : '철수'}</small>
          </div>
        {/if}
      </div>
    </section>

    <aside class="col-lg-4">
      <div class="side-card rounded-4 p-3 mb-3">
        <h2>규칙</h2>
        {#if mode === 'odd-even'}<ol>
            <li>상대가 구슬 일부를 손에 접어요.</li>
            <li>내 구슬을 걸고 홀 또는 짝을 외쳐요.</li>
            <li>맞히면 건 만큼 따고, 틀리면 잃어요.</li>
          </ol>{:else}<ol>
            <li>구슬 수를 3으로 나눈 결과를 맞혀요.</li>
            <li>으찌=1, 니=2, 쌈=0이에요.</li>
            <li>첫 호칭은 내 승리, 둘째는 상대 승리, 나머지는 무승부예요.</li>
          </ol>{/if}<a
          href="https://brunch.co.kr/@a8c41ad0e16649d/29"
          target="_blank"
          rel="noreferrer">홀짝과 쌈치기 이야기 ↗</a
        >
      </div>
      <div class="side-card rounded-4 p-3">
        <h2>구슬 부자 Top 10</h2>
        {#if rank.length}<div class="ranking">
            {#each rank as row, index (row.email)}<div
                class:me={row.email === data.session?.user?.email}
              >
                <span>{index + 1}</span><b>{row.nickname}</b><strong
                  >{formatNumber(row.balance)}</strong
                >
              </div>{/each}
          </div>{:else}<p class="empty">첫 순위의 주인공이 되어 보세요.</p>{/if}
      </div>
    </aside>
  </div>
</main>

<style>
  .game-page {
    max-width: 1100px;
  }
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    color: #fff;
    background:
      radial-gradient(circle at 12% 20%, #cf7835 0, transparent 27%),
      linear-gradient(135deg, #532218, #943f23 60%, #351712);
    box-shadow: 0 12px 30px #3b160f2e;
  }
  .eyebrow {
    color: #ffd58b;
    font-size: 0.75rem;
    font-weight: 850;
    letter-spacing: 0.12em;
  }
  .hero h1 {
    margin: 0.2rem 0;
    font-size: clamp(1.7rem, 4vw, 2.45rem);
    font-weight: 950;
  }
  .hero p {
    margin: 0;
    opacity: 0.8;
  }
  .score {
    display: grid;
    flex: 0 0 180px;
    padding: 1rem 1.15rem;
    border: 1px solid #ffffff35;
    border-radius: 1rem;
    background: #18070440;
    text-align: right;
  }
  .score span,
  .score small {
    color: #efcfbf;
    font-size: 0.76rem;
  }
  .score strong {
    color: #ffd66f;
    font-size: 1.45rem;
  }
  .table-card,
  .side-card {
    border: 1px solid var(--bs-border-color);
    background: var(--bs-body-bg);
    box-shadow: 0 8px 24px #3213060c;
  }
  .game-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .game-tabs button {
    display: grid;
    grid-template-columns: 36px 1fr;
    grid-template-rows: auto auto;
    padding: 0.8rem 1rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 0.85rem;
    color: inherit;
    background: var(--bs-tertiary-bg);
    text-align: left;
  }
  .game-tabs span {
    grid-row: 1/3;
    align-self: center;
    font-size: 1.4rem;
    font-weight: 900;
  }
  .game-tabs b {
    font-size: 1rem;
  }
  .game-tabs small {
    color: var(--bs-secondary-color);
  }
  .game-tabs button.active {
    border-color: #a84624;
    background: #a84624;
    color: #fff;
    box-shadow: 0 5px 14px #7a2c1c4a;
  }
  .game-tabs button.active small {
    color: #ffe1d4;
  }
  .fist-stage {
    display: grid;
    place-items: center;
    min-height: 230px;
    margin: 1rem 0;
    border-radius: 1rem;
    background: radial-gradient(circle at center, #285f46, #15402e 65%, #0d2c20);
    color: #fff;
    position: relative;
    overflow: hidden;
  }
  .host-name {
    position: absolute;
    left: 1rem;
    top: 0.8rem;
    color: #bde0cb;
    font-size: 0.78rem;
  }
  .fist {
    display: grid;
    place-items: center;
    width: 145px;
    height: 145px;
  }
  .fist > span {
    font-size: 7rem;
    filter: drop-shadow(0 12px 12px #0005);
  }
  .shaking .fist {
    animation: shake 0.16s linear infinite;
  }
  .marbles {
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    justify-content: center;
    gap: 5px;
    width: 140px;
    min-height: 120px;
  }
  .marbles i {
    display: block;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, #fff 0 5%, #70d8ee 7%, #2c83a1 48%, #0d3648 75%);
    box-shadow:
      inset -3px -4px 5px #06202d80,
      0 3px 4px #0005;
    animation: pop 0.35s calc(var(--i) * 0.035s) both;
  }
  .sound {
    position: absolute;
    bottom: 0.8rem;
    color: #d4ede0;
    font-weight: 800;
  }
  .choice-panel h2,
  .side-card h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 900;
  }
  .choice-panel > p {
    margin: 0.2rem 0 0.8rem;
    color: var(--bs-secondary-color);
    font-size: 0.82rem;
  }
  .odd-even-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.65rem;
  }
  .odd-even-options button {
    padding: 1.15rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 1rem;
    color: inherit;
    background: var(--bs-tertiary-bg);
  }
  .odd-even-options strong {
    display: block;
    font-size: 2rem;
  }
  .odd-even-options small {
    color: var(--bs-secondary-color);
  }
  .odd-even-options button.active,
  .call-options button.active {
    border-color: #df9c25;
    background: #fff0bd;
    color: #532b0d;
    box-shadow: 0 0 0 3px #edbd4e30;
  }
  .call-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .call-options button {
    display: grid;
    padding: 0.75rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 0.8rem;
    color: inherit;
    background: var(--bs-tertiary-bg);
  }
  .call-options b {
    font-size: 0.92rem;
  }
  .call-options span {
    font-size: 0.76rem;
    color: var(--bs-secondary-color);
  }
  .call-options button.active span {
    color: #875622;
  }
  .remainders {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.65rem;
  }
  .remainders span {
    padding: 0.3rem 0.5rem;
    border-radius: 2rem;
    background: var(--bs-tertiary-bg);
    color: var(--bs-secondary-color);
    font-size: 0.7rem;
  }
  .bet-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1.3rem;
    padding-top: 1rem;
    border-top: 1px solid var(--bs-border-color);
  }
  .bet-row .bet-label {
    display: block;
    margin-bottom: 0.35rem;
    color: var(--bs-secondary-color);
    font-size: 0.75rem;
    font-weight: 800;
  }
  .bets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .bets button {
    padding: 0.42rem 0.65rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 2rem;
    color: inherit;
    background: transparent;
    font-size: 0.78rem;
    font-weight: 800;
  }
  .bets button.active {
    border-color: #98401f;
    background: #98401f;
    color: #fff;
  }
  .bets .all-in {
    border-color: #b52e35;
    color: #b52e35;
  }
  .go {
    min-width: 180px;
    min-height: 48px;
    padding: 0.65rem 1rem;
    border: 0;
    border-radius: 0.8rem;
    background: linear-gradient(#ffd46d, #e9a12d);
    color: #401c08;
    box-shadow: 0 5px 0 #9c5c19;
    font-weight: 950;
  }
  .go:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: 0 2px 0 #9c5c19;
  }
  button:disabled {
    opacity: 0.5;
  }
  .notice {
    margin-top: 1rem;
    padding: 0.7rem 1rem;
    border-radius: 0.7rem;
    background: #fff3cd;
    color: #664d03;
    font-size: 0.82rem;
  }
  .notice.danger {
    background: #f8d7da;
    color: #842029;
  }
  .result {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 1rem;
    padding: 1rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 0.85rem;
    background: var(--bs-tertiary-bg);
  }
  .result > div {
    display: grid;
  }
  .result span {
    color: var(--bs-secondary-color);
    font-size: 0.7rem;
  }
  .result h3 {
    margin: 0 auto 0 0;
    font-size: 1rem;
    font-weight: 950;
  }
  .result > b {
    font-size: 1.15rem;
  }
  .result.win {
    border-color: #4eaa72;
    background: #dff5e7;
    color: #175b32;
  }
  .result.lose {
    border-color: #cf7777;
    background: #f9e2e2;
    color: #7a2424;
  }
  .side-card ol {
    margin: 0.8rem 0;
    padding-left: 1.2rem;
    color: var(--bs-secondary-color);
    font-size: 0.84rem;
  }
  .side-card li + li {
    margin-top: 0.45rem;
  }
  .side-card > a {
    font-size: 0.78rem;
  }
  .ranking {
    margin-top: 0.7rem;
  }
  .ranking > div {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    padding: 0.55rem 0.35rem;
    border-bottom: 1px solid var(--bs-border-color);
    font-size: 0.82rem;
  }
  .ranking > div.me {
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
    font-size: 0.84rem;
  }
  @keyframes shake {
    25% {
      transform: rotate(-5deg) translateX(-5px);
    }
    75% {
      transform: rotate(5deg) translateX(5px);
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.2) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @media (max-width: 767px) {
    .hero {
      align-items: stretch;
      flex-direction: column;
    }
    .score {
      flex-basis: auto;
      text-align: left;
    }
    .call-options {
      grid-template-columns: repeat(2, 1fr);
    }
    .remainders {
      align-items: stretch;
      flex-direction: column;
    }
    .bet-row {
      align-items: stretch;
      flex-direction: column;
    }
    .go {
      width: 100%;
    }
    .result {
      align-items: flex-start;
      flex-direction: column;
    }
    .result h3 {
      margin: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .shaking .fist,
    .marbles i {
      animation: none;
    }
  }
  .waiting {
    text-align: center;
  }
  .marble-counts {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 0.4rem;
  }
  .marble-counts button {
    aspect-ratio: 1;
    border: 1px solid var(--bs-border-color);
    border-radius: 50%;
    color: inherit;
    background: var(--bs-tertiary-bg);
    font-weight: 850;
  }
  .marble-counts button.active {
    border-color: #df9c25;
    background: #fff0bd;
    color: #532b0d;
    box-shadow: 0 0 0 3px #edbd4e30;
  }
  .next-host {
    font-size: 0.72rem;
    font-weight: 800;
  }
  @media (max-width: 540px) {
    .marble-counts {
      grid-template-columns: repeat(5, 1fr);
    }
  }
</style>
