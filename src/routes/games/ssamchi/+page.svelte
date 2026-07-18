<script lang="ts">
  import { untrack } from 'svelte';
  import { swalFire } from '$lib/util/swal.js';
  import { MIN_BET } from './ssamchiEngine.js';

  type Mode = 'odd-even' | 'ssamchi';
  type Outcome = 'win' | 'lose' | 'draw';
  type Remainder = 0 | 1 | 2;
  type Step = 'pick' | 'bet' | 'call' | 'ready' | 'playing' | 'result';

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
  let step = $state<Step>(untrack(() => (data.host === 'user' ? 'pick' : 'bet')));
  let effect = $state<{ kind: 'pick' | 'bet' | 'win' | 'lose' | 'draw'; text: string } | null>(
    null
  );
  let effectTimer: ReturnType<typeof setTimeout> | null = null;

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
    step = host === 'user' ? 'pick' : 'bet';
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

  function showEffect(kind: 'pick' | 'bet' | 'win' | 'lose' | 'draw', text: string) {
    if (effectTimer) clearTimeout(effectTimer);
    effect = { kind, text };
    effectTimer = setTimeout(
      () => (effect = null),
      kind === 'win' || kind === 'lose' ? 1800 : 1100
    );
  }

  function randomMarbles() {
    selectedMarbles = Math.floor(Math.random() * 15) + 1;
    showEffect('pick', `랜덤 ${selectedMarbles}개!`);
  }

  function lockMarbles() {
    showEffect('pick', `${selectedMarbles}개 잡았다!`);
    step = 'bet';
  }

  function lockBet() {
    if (bet < MIN_BET || bet > balance) return;
    showEffect('bet', `${formatNumber(bet)}개 걸었다!`);
    step = host === 'user' ? 'ready' : 'call';
  }

  function nextRound() {
    result = null;
    reveal = false;
    step = host === 'user' ? 'pick' : 'bet';
  }

  async function play() {
    if (!loggedIn || playing || bet > balance || !['call', 'ready'].includes(step)) return;
    const retryStep = step;
    playing = true;
    step = 'playing';
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
      setTimeout(() => {
        reveal = true;
        step = 'result';
        const delta = result?.delta ?? 0;
        showEffect(
          result?.outcome ?? 'draw',
          result?.outcome === 'win'
            ? `+${formatNumber(delta)}개 이겼다!`
            : result?.outcome === 'lose'
              ? `${formatNumber(Math.abs(delta))}개 졌다!`
              : '무승부!'
        );
      }, 550);
      void refreshRank();
    } catch (error) {
      step = retryStep;
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
    <div class="score" class:gain={effect?.kind === 'win'} class:loss={effect?.kind === 'lose'}>
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
            disabled={!['pick', 'bet'].includes(step)}
            onclick={() => selectMode('odd-even')}
            ><span>Ⅰ</span><b>홀짝</b><small>기본 승부</small></button
          >
          <button
            role="tab"
            aria-selected={mode === 'ssamchi'}
            class:active={mode === 'ssamchi'}
            disabled={!['pick', 'bet'].includes(step)}
            onclick={() => selectMode('ssamchi')}
            ><span>Ⅲ</span><b>쌈치기</b><small>으찌·니·쌈</small></button
          >
        </div>

        <div
          class="fist-stage"
          class:shaking={playing}
          class:catching={effect?.kind === 'pick'}
          class:open={reveal}
        >
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

        {#if effect}
          <div class="effect-layer {effect.kind}" aria-live="assertive">
            <span
              >{effect.kind === 'pick'
                ? '✊'
                : effect.kind === 'bet'
                  ? '🟢'
                  : effect.kind === 'win'
                    ? '🎉'
                    : effect.kind === 'lose'
                      ? '💥'
                      : '🤝'}</span
            >
            <strong>{effect.text}</strong>
          </div>
        {/if}

        <section class="action-layer" aria-live="polite">
          <div class="action-head">
            <span class="step-badge"
              >{step === 'pick'
                ? '1'
                : step === 'bet'
                  ? host === 'user'
                    ? '2'
                    : '1'
                  : step === 'call' || step === 'ready'
                    ? host === 'user'
                      ? '3'
                      : '2'
                    : '✓'}</span
            >
            <div>
              <small>지금 할 일</small>
              <h2>
                {step === 'pick'
                  ? '구슬 잡기'
                  : step === 'bet'
                    ? '판돈 걸기'
                    : step === 'call'
                      ? mode === 'odd-even'
                        ? '홀·짝 외치기'
                        : '쌈치기 주문 외치기'
                      : step === 'ready'
                        ? '손 내밀기'
                        : step === 'playing'
                          ? '손을 펼치는 중'
                          : '결과 확인'}
              </h2>
            </div>
          </div>

          {#if step === 'pick'}
            <p>내가 선입니다. 접을 구슬 수를 고르거나 랜덤으로 잡으세요.</p>
            <div class="pick-toolbar">
              <strong>{selectedMarbles}개</strong><button class="random" onclick={randomMarbles}
                >🎲 랜덤 잡기</button
              >
            </div>
            <div class="marble-counts">
              {#each Array.from({ length: 15 }, (_, index) => index + 1) as count (count)}
                <button
                  class:active={selectedMarbles === count}
                  onclick={() => (selectedMarbles = count)}>{count}</button
                >
              {/each}
            </div>
            <button class="go full" onclick={lockMarbles}>{selectedMarbles}개 이대로 잡기</button>
          {:else if step === 'bet'}
            <p>이번 판에 걸 구슬을 고르세요. 아도는 보유 구슬을 전부 겁니다.</p>
            <div class="bets large">
              {#each betOptions as amount (amount)}<button
                  class:active={bet === amount}
                  onclick={() => (bet = amount)}>{formatNumber(amount)}개</button
                >{/each}
              <button
                class:active={bet === balance && balance > 0}
                class="all-in"
                onclick={() => (bet = balance)}
                disabled={balance < MIN_BET}>아도 {formatNumber(balance)}개</button
              >
            </div>
            <button
              class="go full"
              onclick={lockBet}
              disabled={!loggedIn || bet < MIN_BET || bet > balance}
              >{formatNumber(bet)}개 걸기</button
            >
          {:else if step === 'call'}
            <p>철수가 구슬을 접었습니다. 건 {formatNumber(bet)}개를 따낼 외침을 고르세요.</p>
            {#if mode === 'odd-even'}
              <div class="odd-even-options">
                <button
                  class:active={oddEvenChoice === 'odd'}
                  onclick={() => (oddEvenChoice = 'odd')}
                  ><strong>홀</strong><small>1 · 3 · 5 …</small></button
                >
                <button
                  class:active={oddEvenChoice === 'even'}
                  onclick={() => (oddEvenChoice = 'even')}
                  ><strong>짝</strong><small>2 · 4 · 6 …</small></button
                >
              </div>
            {:else}
              <div class="call-options">
                {#each CALLS as call (`${call.take}-${call.give}`)}
                  <button
                    class:active={take === call.take && give === call.give}
                    onclick={() => selectCall(call)}
                    ><b>{SSAMCHI_LABEL[call.take]} 먹고</b><span>{SSAMCHI_LABEL[call.give]} 떠</span
                    ></button
                  >
                {/each}
              </div>
              <div class="remainders">
                <span><b>으찌</b> 3배수+1</span><span><b>니</b> 3배수+2</span><span
                  ><b>쌈</b> 3의 배수</span
                >
              </div>
            {/if}
            <button class="go full" onclick={play}
              >{mode === 'odd-even'
                ? `${oddEvenChoice === 'odd' ? '홀' : '짝'}!`
                : `${callLabel({ take, give })}!`}</button
            >
          {:else if step === 'ready'}
            <p>
              <b>{selectedMarbles}개</b>를 잡고 <b>{formatNumber(bet)}개</b>를 걸었습니다. 이제 손을
              내밀어 승부하세요.
            </p>
            <div class="ready-summary">
              <span>✊ {selectedMarbles}개 잡음</span><span>🟢 {formatNumber(bet)}개 걸음</span>
            </div>
            <button class="go full" onclick={play}>“가~!” 손 내밀기</button>
          {:else if step === 'playing'}
            <div class="waiting-action">
              <span>✊</span><strong>짤그랑···</strong><small>잠시만 기다려 주세요</small>
            </div>
          {:else}
            <p>승부가 났습니다. 결과를 확인하고 다음 선으로 이어가세요.</p>
            <button class="go full" onclick={nextRound}
              >다음 판 · 선 {host === 'user' ? '나' : '철수'}</button
            >
          {/if}
        </section>

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
  .side-card h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 900;
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
  .table-card {
    position: relative;
  }
  .action-layer {
    min-height: 210px;
    padding: 1rem;
    border: 2px solid #d79931;
    border-radius: 1rem;
    background: linear-gradient(145deg, #fffaf0, #fff1cf);
    color: #3e2a19;
    box-shadow: 0 8px 24px #9c641426;
    animation: layerIn 0.28s ease-out both;
  }
  :global([data-bs-theme='dark']) .action-layer {
    border-color: #b9792f;
    background: linear-gradient(145deg, #33281c, #2b2116);
    color: #f6e8d0;
  }
  .action-head {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    margin-bottom: 0.75rem;
  }
  .action-head small {
    display: block;
    color: #9a6b2c;
    font-size: 0.68rem;
    font-weight: 850;
    letter-spacing: 0.08em;
  }
  .action-head h2 {
    margin: 0;
    font-size: 1.12rem;
    font-weight: 950;
  }
  .step-badge {
    display: grid;
    place-items: center;
    flex: 0 0 34px;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #a64b24;
    color: #fff;
    box-shadow: 0 3px 0 #6e2b14;
    font-weight: 950;
  }
  .action-layer > p {
    margin: 0 0 0.8rem;
    color: #755b3d;
    font-size: 0.84rem;
  }
  :global([data-bs-theme='dark']) .action-layer > p {
    color: #d8c2a3;
  }
  .pick-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
  }
  .pick-toolbar > strong {
    color: #a64b24;
    font-size: 1.35rem;
  }
  .random {
    padding: 0.45rem 0.8rem;
    border: 1px solid #c1822e;
    border-radius: 2rem;
    background: #fff;
    color: #7b4818;
    font-size: 0.8rem;
    font-weight: 850;
  }
  .bets.large {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-bottom: 0.8rem;
  }
  .bets.large button {
    border-radius: 0.7rem;
    padding: 0.7rem 0.4rem;
  }
  .ready-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
    margin-bottom: 0.8rem;
  }
  .ready-summary span {
    padding: 0.7rem;
    border-radius: 0.7rem;
    background: #ffffff9c;
    text-align: center;
    font-weight: 850;
  }
  .go.full {
    width: 100%;
    margin-top: 0.8rem;
  }
  .waiting-action {
    display: grid;
    place-items: center;
    gap: 0.25rem;
    min-height: 110px;
  }
  .waiting-action span {
    font-size: 2.5rem;
    animation: shake 0.16s linear infinite;
  }
  .waiting-action strong {
    color: #9b571e;
    font-size: 1.15rem;
  }
  .waiting-action small {
    color: #8a765e;
  }
  .effect-layer {
    position: fixed;
    left: 50%;
    top: 48%;
    z-index: 2000;
    display: grid;
    place-items: center;
    min-width: min(82vw, 310px);
    padding: 1.15rem 1.5rem;
    border: 3px solid #ffd873;
    border-radius: 1.2rem;
    background: #3a1809e8;
    color: #fff;
    box-shadow:
      0 18px 55px #0008,
      0 0 35px #f6b52875;
    pointer-events: none;
    transform: translate(-50%, -50%);
    animation: effectBurst 1.1s ease both;
  }
  .effect-layer span {
    font-size: 2.2rem;
  }
  .effect-layer strong {
    font-size: 1.3rem;
    font-weight: 950;
  }
  .effect-layer.win {
    border-color: #77e39c;
    background: #0e4c2eea;
    box-shadow:
      0 18px 55px #0008,
      0 0 40px #41d57885;
  }
  .effect-layer.lose {
    border-color: #f28e91;
    background: #631d20ea;
    box-shadow:
      0 18px 55px #0008,
      0 0 40px #e84d5285;
  }
  .score.gain {
    animation: scoreGain 0.7s ease 2;
  }
  .score.loss {
    animation: scoreLoss 0.45s ease 2;
  }
  .fist-stage.catching .fist {
    animation: catchMarbles 0.45s cubic-bezier(0.2, 0.8, 0.3, 1.3);
  }
  .result {
    animation: layerIn 0.3s ease-out both;
  }
  @keyframes layerIn {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes effectBurst {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.35) rotate(-6deg);
    }
    20%,
    70% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.06) rotate(0);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -60%) scale(0.92);
    }
  }
  @keyframes catchMarbles {
    0% {
      transform: scale(1);
    }
    45% {
      transform: scale(0.72) rotate(-7deg);
    }
    100% {
      transform: scale(1.08);
    }
  }
  @keyframes scoreGain {
    50% {
      transform: scale(1.08);
      box-shadow: 0 0 28px #53d98b;
    }
  }
  @keyframes scoreLoss {
    25%,
    75% {
      transform: translateX(-5px);
      box-shadow: 0 0 24px #f06b70;
    }
    50% {
      transform: translateX(5px);
    }
  }
  @media (max-width: 540px) {
    .bets.large {
      grid-template-columns: repeat(2, 1fr);
    }
    .ready-summary {
      grid-template-columns: 1fr;
    }
  }
</style>
