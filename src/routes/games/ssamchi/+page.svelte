<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Confetti } from 'svelte-confetti';
  import { ko } from 'date-fns/locale';
  import { swalFire } from '$lib/util/swal.js';
  import GameProfilePhoto from '$lib/components/GameProfilePhoto.svelte';
  import GameRankingRow from '$lib/components/GameRankingRow.svelte';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import { MIN_BET } from './ssamchiEngine.js';

  type Mode = 'odd-even' | 'ssamchi';
  type Outcome = 'win' | 'lose' | 'draw';
  type Remainder = 0 | 1 | 2;
  type Step = 'pick' | 'npc-pick' | 'bet' | 'call' | 'playing' | 'revealing' | 'result';

  interface RankRow {
    email: string;
    nickname: string;
    balance: number;
    updatedAt?: string | null;
    photo?: string | null;
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
  interface GameComment {
    id?: string;
    _id?: string;
    nickname: string;
    content: string;
    createdAt: string;
    photo?: string | null;
    depth?: number;
    children?: GameComment[];
  }

  const SSAMCHI_LABEL: Record<Remainder, string> = { 1: '으찌', 2: '니', 0: '쌈' };
  const REMAINDERS: Remainder[] = [1, 2, 0];

  let { data }: { data: PageData } = $props();
  let balance = $state(untrack(() => Number(data.balance ?? 0)));
  let rank = $state<RankRow[]>(untrack(() => data.rank ?? []));
  let todayStats = $state(untrack(() => data.todayStats ?? { hands: 0, users: 0 }));
  let mode = $state<Mode>('odd-even');
  let host = $state<'user' | 'npc'>(untrack(() => data.host ?? 'npc'));
  let selectedMarbles = $state(7);
  let oddEvenChoice = $state<'odd' | 'even'>('odd');
  let take = $state<Remainder | null>(null);
  let give = $state<Remainder | null>(null);
  let bet = $state(10);
  let playing = $state(false);
  let reveal = $state(false);
  let revealedMarbles = $state(0);
  let result = $state<RoundResult | null>(null);
  let step = $state<Step>(untrack(() => (data.host === 'user' ? 'pick' : 'npc-pick')));
  let effect = $state<{
    kind: 'pick' | 'call' | 'bet' | 'win' | 'lose' | 'draw';
    text: string;
  } | null>(null);
  let effectTimer: ReturnType<typeof setTimeout> | null = null;
  let roundTimer: ReturnType<typeof setTimeout> | null = null;
  let comments = $state<GameComment[]>([]);
  let commentContent = $state('');
  let commentsLoading = $state(false);
  let commentSubmitting = $state(false);
  let leaderEmail = $state<string | null>(untrack(() => data.rank?.[0]?.email ?? null));
  let leaderCelebration = $state<{ nickname: string } | null>(null);
  let leaderTimer: ReturnType<typeof setTimeout> | null = null;
  let rankPollTimer: ReturnType<typeof setInterval> | null = null;

  const loggedIn = $derived(Boolean(data.session?.user?.email));
  const betOptions = $derived(
    [10, 50, 100, 500, 1000].filter((value) => value <= Math.max(balance, MIN_BET))
  );

  function formatNumber(value: number) {
    return new Intl.NumberFormat('ko-KR').format(value);
  }
  function formatSocialTime(value: string | null | undefined) {
    if (!value) return '';
    return formatRelativeTime(value, { locale: ko, addSuffix: true });
  }
  function selectMode(next: Mode) {
    mode = next;
    result = null;
    reveal = false;
    revealedMarbles = 0;
    take = null;
    give = null;
    step = host === 'user' ? 'pick' : 'call';
  }
  function selectRemainder(value: Remainder) {
    if (give === value) {
      give = null;
      return;
    }
    if (take === value) {
      take = null;
      give = null;
      return;
    }
    if (take === null) {
      take = value;
      return;
    }
    if (give === null) {
      give = value;
      return;
    }
    take = value;
    give = null;
  }
  function callLabel(call: { take: Remainder; give: Remainder }) {
    return `${SSAMCHI_LABEL[call.take]} 먹고, ${SSAMCHI_LABEL[call.give]} 떠`;
  }
  function resultName(value: RoundResult['answer']) {
    if (value === 'odd') return '홀';
    if (value === 'even') return '짝';
    return SSAMCHI_LABEL[value];
  }

  function showEffect(kind: 'pick' | 'call' | 'bet' | 'win' | 'lose' | 'draw', text: string) {
    if (effectTimer) clearTimeout(effectTimer);
    effect = { kind, text };
    effectTimer = setTimeout(
      () => (effect = null),
      kind === 'win' || kind === 'lose' ? 1800 : 1100
    );
  }

  function randomMarbles() {
    selectedMarbles = Math.floor(Math.random() * 15) + 1;
    showEffect('pick', '랜덤으로 잡았다!');
    void play();
  }

  function selectedChoiceLabel() {
    return mode === 'odd-even'
      ? oddEvenChoice === 'odd'
        ? '홀'
        : '짝'
      : take !== null && give !== null
        ? callLabel({ take, give })
        : take !== null
          ? `${SSAMCHI_LABEL[take]} 먹고…`
          : '외침 선택';
  }

  function resultChoiceLabel(round: RoundResult) {
    return round.mode === 'odd-even'
      ? resultName(round.choice ?? 'odd')
      : callLabel({ take: round.take ?? 1, give: round.give ?? 0 });
  }

  function lockCall() {
    if (mode === 'ssamchi' && (take === null || give === null)) return;
    showEffect('call', `${selectedChoiceLabel()} 선택!`);
    step = 'bet';
  }

  function lockBet(amount: number) {
    if (!loggedIn || amount < MIN_BET || amount > balance) return;
    bet = amount;
    showEffect('bet', `${formatNumber(amount)}개 걸었다!`);
    void play();
  }

  function nextRound() {
    result = null;
    reveal = false;
    revealedMarbles = 0;
    take = null;
    give = null;
    if (host === 'user') {
      step = 'pick';
    } else {
      startNpcCatch();
    }
  }

  function startNpcCatch() {
    if (roundTimer) clearTimeout(roundTimer);
    step = 'npc-pick';
    roundTimer = setTimeout(() => {
      showEffect('pick', '철수가 구슬을 잡았다!');
      step = 'call';
    }, 900);
  }

  function wait(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  function revealGroupSize(round: RoundResult) {
    return round.mode === 'odd-even' ? 2 : 3;
  }

  function marbleGroups(count: number, groupSize: number) {
    const groups: number[] = [];
    for (let remaining = count; remaining > 0; remaining -= groupSize)
      groups.push(Math.min(groupSize, remaining));
    return groups;
  }

  function winText(round: RoundResult) {
    if (round.outcome === 'draw') return '무승부! 판돈은 그대로';
    return round.outcome === 'win'
      ? `내가 ${formatNumber(Math.abs(round.delta))}개 땄다!`
      : `철수가 ${formatNumber(Math.abs(round.delta))}개 땄다!`;
  }

  async function revealRound(
    round: RoundResult,
    settledBalance: number,
    settledHost: 'user' | 'npc'
  ) {
    result = round;
    if (round.userIsHost) {
      showEffect('call', `철수: ${resultChoiceLabel(round)}!`);
      await wait(1200);
    } else {
      await wait(550);
    }
    step = 'revealing';
    reveal = true;
    revealedMarbles = 0;
    const groupSize = revealGroupSize(round);
    await wait(700);
    while (revealedMarbles < round.marbles) {
      revealedMarbles = Math.min(round.marbles, revealedMarbles + groupSize);
      await wait(1040);
    }
    balance = settledBalance;
    host = settledHost;
    await wait(700);
    step = 'result';
    showEffect(round.outcome, winText(round));
    if (settledBalance < MIN_BET && round.outcome === 'lose') void writeOopsComment(round);
  }

  async function play() {
    if (
      !loggedIn ||
      playing ||
      (host !== 'user' && bet > balance) ||
      !['pick', 'bet'].includes(step)
    )
      return;
    const retryStep = step;
    playing = true;
    step = 'playing';
    reveal = false;
    result = null;
    try {
      const payload =
        host === 'user'
          ? { mode, marbles: selectedMarbles }
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
      const round = body.result as RoundResult;
      const settledBalance = Number(body.balance);
      const settledHost = body.host ?? host;
      if (round.userIsHost) showEffect('bet', `철수가 ${formatNumber(round.bet)}개 걸었다!`);
      await revealRound(round, settledBalance, settledHost);
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
      if (Number.isFinite(Number(body.balance))) balance = Number(body.balance);
      const nextRank = (body.rank ?? rank) as RankRow[];
      const nextLeader = nextRank[0] ?? null;
      if (leaderEmail && nextLeader && nextLeader.email !== leaderEmail) {
        leaderCelebration = { nickname: nextLeader.nickname };
        if (leaderTimer) clearTimeout(leaderTimer);
        leaderTimer = setTimeout(() => (leaderCelebration = null), 4500);
      }
      leaderEmail = nextLeader?.email ?? leaderEmail;
      rank = nextRank;
      todayStats = body.todayStats ?? todayStats;
    } catch {
      /* 다음 판에 갱신 */
    }
  }

  function flattenComments(rows: GameComment[], depth = 1): GameComment[] {
    return rows.flatMap((row) => [
      { ...row, depth },
      ...flattenComments(row.children ?? [], depth + 1)
    ]);
  }

  async function loadComments() {
    commentsLoading = true;
    try {
      const response = await fetch('/games/ssamchi/comment?game=ssamchi', { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json();
      comments = flattenComments(Array.isArray(body.comments) ? body.comments : []);
    } finally {
      commentsLoading = false;
    }
  }

  async function submitComment() {
    const content = commentContent.trim();
    if (!loggedIn || content.length < 2 || commentSubmitting) return;
    commentSubmitting = true;
    try {
      const form = new FormData();
      form.set('game', 'ssamchi');
      form.set('content', content);
      const response = await fetch('/games/ssamchi/comment', { method: 'POST', body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || '리플을 등록하지 못했습니다.');
      commentContent = '';
      await Promise.all([loadComments(), refreshRank()]);
      if (body.rewardGiven) {
        await swalFire({
          icon: 'success',
          title: '💬 리플 보상 +100개',
          toast: true,
          position: 'center',
          showConfirmButton: false,
          timer: 2200
        });
      }
    } catch (error) {
      await swalFire({
        icon: 'error',
        title: '리플 등록 실패',
        text: error instanceof Error ? error.message : '잠시 후 다시 해 주세요.',
        confirmButtonText: '확인'
      });
    } finally {
      commentSubmitting = false;
    }
  }

  async function writeOopsComment(round: RoundResult) {
    try {
      const form = new FormData();
      form.set('game', 'ssamchi');
      form.set('content', `😢 오링! 철수에게 ${formatNumber(Math.abs(round.delta))}개 털렸다…`);
      const response = await fetch('/games/ssamchi/comment', { method: 'POST', body: form });
      if (!response.ok) return;
      await Promise.all([loadComments(), refreshRank()]);
    } catch {
      /* 자동 리플 실패는 게임 진행을 막지 않는다. */
    }
  }

  onMount(() => {
    if (host === 'npc') startNpcCatch();
    void loadComments();
    rankPollTimer = setInterval(() => void refreshRank(), 10_000);
    return () => {
      if (roundTimer) clearTimeout(roundTimer);
      if (effectTimer) clearTimeout(effectTimer);
      if (leaderTimer) clearTimeout(leaderTimer);
      if (rankPollTimer) clearInterval(rankPollTimer);
    };
  });
</script>

<svelte:head>
  <title>홀짝·쌈치기</title>
  <meta name="description" content="접은 구슬을 홀짝 또는 으찌·니·쌈으로 맞히는 골목길 구슬놀이" />
</svelte:head>

<main class="container py-3 py-md-4 game-page">
  {#if leaderCelebration}
    <div class="leader-fireworks" aria-live="assertive">
      <Confetti
        x={[-5, 5]}
        y={[0, 0.1]}
        delay={[100, 900]}
        infinite
        duration={4500}
        amount={180}
        fallDistance="100vh"
      />
      <strong>🏆 {leaderCelebration.nickname}님, 짤짤이 새 1등!</strong>
    </div>
  {/if}
  <header class="hero rounded-4 p-3 p-md-4 mb-3">
    <div>
      <div class="eyebrow">짤그랑 골목길 구슬 한 판</div>
      <h1>🟢 홀짝과 쌈치기</h1>
      <p>상대가 손에 접은 구슬을 소리와 촉으로 맞혀 보세요.</p>
    </div>
    <div class="score" class:gain={effect?.kind === 'win'} class:loss={effect?.kind === 'lose'}>
      <span>공용 메달</span><strong>{formatNumber(balance)}개</strong><small
        >오늘 {formatNumber(todayStats.hands)}판 · {formatNumber(todayStats.users)}명</small
      >
    </div>
  </header>

  <div class="row g-3">
    <section class="col-lg-8 order-2 order-lg-1">
      <div class="table-card rounded-4 p-3 p-md-4">
        <div class="game-tabs" role="tablist" aria-label="게임 선택">
          <button
            role="tab"
            aria-selected={mode === 'odd-even'}
            class:active={mode === 'odd-even'}
            disabled={!['pick', 'call'].includes(step)}
            onclick={() => selectMode('odd-even')}
            ><span>Ⅰ</span><b>홀짝</b><small>기본 승부</small></button
          >
          <button
            role="tab"
            aria-selected={mode === 'ssamchi'}
            class:active={mode === 'ssamchi'}
            disabled={!['pick', 'call'].includes(step)}
            onclick={() => selectMode('ssamchi')}
            ><span>Ⅲ</span><b>쌈치기</b><small>으찌·니·쌈</small></button
          >
        </div>

        <div class="game-screen">
          <div
            class="fist-stage"
            class:shaking={step === 'npc-pick' || step === 'pick' || step === 'playing'}
            class:catching={effect?.kind === 'pick'}
            class:open={reveal}
          >
            <div class="host-name">
              선 <b
                >{result ? (result.userIsHost ? '나' : '철수') : host === 'user' ? '나' : '철수'}</b
              >
            </div>
            <div class="screen-balance">
              <small>공용 메달</small><strong>{formatNumber(balance)}개</strong>
            </div>
            {#if result}
              <div class="round-call">
                <small>{result.userIsHost ? '철수의 외침' : '내 외침'}</small>
                <strong>{resultChoiceLabel(result)}</strong>
              </div>
            {/if}
            <div
              class="fist"
              aria-label={reveal ? `구슬 ${revealedMarbles}개 공개` : '구슬을 접은 손'}
            >
              {#if reveal && result}
                <div class="marbles grouped">
                  {#each marbleGroups(revealedMarbles, revealGroupSize(result)) as group, groupIndex (`${groupIndex}-${group}`)}
                    <div class="marble-group">
                      {#each Array.from({ length: group }) as _, index (index)}<i
                          style="--i:{groupIndex * revealGroupSize(result) + index}"
                        ></i>{/each}
                    </div>
                  {/each}
                </div>
              {:else}<span>✊</span>{/if}
            </div>
            <div class="sound">
              {step === 'npc-pick' || step === 'pick' || step === 'playing'
                ? '짤그랑···'
                : reveal && result
                  ? revealedMarbles === result.marbles
                    ? `${result.marbles}개 ${resultName(result.answer)}!`
                    : `${revealedMarbles}개 공개 중…`
                  : '철수가 잡았습니다'}
            </div>
          </div>

          {#if effect}
            <div class="effect-layer {effect.kind}" aria-live="assertive">
              {#if effect.kind === 'pick'}
                <div class="catch-particles" aria-hidden="true">
                  {#each Array.from({ length: 7 }) as _, index (index)}<i
                      style="--i:{index}; --x:{8 + index * 14}%; --dx:{(3 - index) * 9}px"
                    ></i>{/each}
                </div>
              {/if}
              <span
                >{effect.kind === 'pick'
                  ? '✊'
                  : effect.kind === 'call'
                    ? '🗣️'
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

          {#if step !== 'result'}
            {#key step}
              <section class="action-layer" aria-live="polite">
                <div class="action-head">
                  <span class="step-badge"
                    >{['pick', 'npc-pick', 'call'].includes(step) ? '1' : '2'}</span
                  >
                  <div>
                    <small>지금 할 일</small>
                    <h2>
                      {step === 'pick'
                        ? '구슬 잡기'
                        : step === 'npc-pick'
                          ? '철수가 구슬을 잡는 중'
                          : step === 'call'
                            ? mode === 'odd-even'
                              ? '홀·짝 외치기'
                              : '먹고 · 떠 선택하기'
                            : step === 'bet'
                              ? '판돈 걸기'
                              : step === 'revealing'
                                ? '구슬을 세는 중'
                                : '승부 준비 중'}
                    </h2>
                  </div>
                </div>

                {#if step === 'pick'}
                  <p>내가 선입니다. 개수는 결과가 나올 때까지 아무도 모릅니다.</p>
                  <button class="go full catch-go" onclick={randomMarbles}>✊ 잡기</button>
                {:else if step === 'npc-pick'}
                  <div class="waiting-action compact">
                    <span>✊</span><strong>철수가 잡는 중···</strong>
                  </div>
                {:else if step === 'call'}
                  <p>
                    첫 번째는 내가 먹을 패, 두 번째는 무승부로 뜰 패입니다. 다시 누르면 취소됩니다.
                  </p>
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
                    <div class="remainder-call-options">
                      {#each REMAINDERS as value (value)}
                        <button
                          class:take={take === value}
                          class:give={give === value}
                          onclick={() => selectRemainder(value)}
                        >
                          <strong>{SSAMCHI_LABEL[value]}</strong>
                          <small>{take === value ? '먹고' : give === value ? '떠' : '선택'}</small>
                        </button>
                      {/each}
                    </div>
                    <div class="call-preview">🗣️ {selectedChoiceLabel()}</div>
                  {/if}
                  <button
                    class="go full"
                    onclick={lockCall}
                    disabled={mode === 'ssamchi' && (take === null || give === null)}
                    >{mode === 'odd-even'
                      ? `${selectedChoiceLabel()} 선택`
                      : '이대로 외치기'}</button
                  >
                {:else if step === 'bet'}
                  <p><b>{selectedChoiceLabel()}</b> · 얼마를 걸지 고르세요.</p>
                  <div class="bets large">
                    {#each betOptions as amount (amount)}<button
                        class:active={bet === amount}
                        onclick={() => lockBet(amount)}
                        disabled={!loggedIn || amount > balance}>{formatNumber(amount)}개</button
                      >{/each}
                    <button
                      class:active={bet === balance && balance > 0}
                      class="all-in"
                      onclick={() => lockBet(balance)}
                      disabled={!loggedIn || balance < MIN_BET}
                      >아도 {formatNumber(balance)}개</button
                    >
                  </div>
                {:else if step === 'revealing'}
                  <div class="waiting-action compact">
                    <span>🟢</span><strong
                      >{result?.mode === 'odd-even' ? '둘씩 센다!' : '셋씩 센다!'}</strong
                    ><small
                      >{revealedMarbles > 0
                        ? `${revealedMarbles}개 공개`
                        : '개수는 아직 비밀'}</small
                    >
                  </div>
                {:else}
                  <div class="waiting-action compact">
                    <span>✊</span><strong>{host === 'user' ? '철수가 외치는 중' : '가~!'}</strong>
                  </div>
                {/if}
              </section>
            {/key}
          {/if}

          {#if result && reveal && step === 'result'}
            <div
              class="result"
              class:win={result.outcome === 'win'}
              class:lose={result.outcome === 'lose'}
            >
              <div class="result-facts">
                <div>
                  <span>{result.userIsHost ? '철수의 외침' : '내 외침'}</span>
                  <strong>{resultChoiceLabel(result)}</strong>
                </div>
                <div>
                  <span>공개 결과</span>
                  <strong>{result.marbles}개 {resultName(result.answer)}!</strong>
                </div>
                <div>
                  <span>{result.userIsHost ? '철수 판돈' : '내 판돈'}</span>
                  <strong>{formatNumber(result.bet)}개</strong>
                </div>
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
              <button class="go full" onclick={nextRound}
                >다음 판 · 선 {host === 'user' ? '나' : '철수'}</button
              >
            </div>
          {/if}
        </div>

        {#if !loggedIn}<div class="notice">
            로그인하면 첫 구슬 1,000개를 받습니다.
          </div>{:else if data.oopsInfo && balance < MIN_BET}<div class="notice danger">
            오링! 5분 후 구슬 700개가 자동 충전됩니다.
          </div>{/if}
      </div>
    </section>

    <aside class="col-lg-4 order-1 order-lg-2">
      <section class="ranking-card rounded-4 p-3 p-md-4">
        <div class="ranking-head">
          <h2>🏆 오락실 메달 Top 10</h2>
          <div class="daily-stats">
            <span>오늘 참여 <b>{formatNumber(todayStats.users)}명</b></span>
            <span>오늘 <b>{formatNumber(todayStats.hands)}판</b></span>
            <span>공용 메달 <b>{formatNumber(balance)}개</b></span>
          </div>
        </div>
        {#if rank.length}<ol class="ranking ranking-horizontal">
            {#each rank as row, index (row.email)}
              <GameRankingRow
                {index}
                nickname={row.nickname}
                photo={row.photo}
                score={formatNumber(row.balance)}
                meta={row.updatedAt ? formatSocialTime(row.updatedAt) : ''}
                current={row.email === data.session?.user?.email}
              />
            {/each}
          </ol>{:else}<p class="empty">첫 순위의 주인공이 되어 보세요.</p>{/if}
      </section>
    </aside>
  </div>

  <section class="comments-card rounded-4 mt-3 p-3 p-md-4">
    <div class="comments-head">
      <h2>💬 리플 ({formatNumber(comments.length)})</h2>
      <button onclick={loadComments} disabled={commentsLoading} aria-label="리플 새로고침">↻</button
      >
    </div>
    {#if loggedIn}
      <div class="comment-form">
        <textarea
          rows="2"
          maxlength="1000"
          placeholder="리플 작성 시 구슬 100개 (하루 10개까지 보상)"
          bind:value={commentContent}
          disabled={commentSubmitting}
        ></textarea>
        <button
          onclick={submitComment}
          disabled={commentSubmitting || commentContent.trim().length < 2}
          >{commentSubmitting ? '등록 중…' : '등록'}</button
        >
      </div>
    {:else}
      <p class="comment-login">로그인하면 리플을 남길 수 있습니다.</p>
    {/if}
    {#if commentsLoading && comments.length === 0}
      <p class="comment-empty">리플을 불러오는 중…</p>
    {:else if comments.length === 0}
      <p class="comment-empty">첫 리플을 남겨 보세요.</p>
    {:else}
      <div class="comment-list">
        {#each comments as comment (comment.id ?? comment._id ?? `${comment.nickname}-${comment.createdAt}`)}
          <article style="--indent:{(Math.min(comment.depth ?? 1, 3) - 1) * 1}rem">
            <header>
              <span class="comment-author">
                <GameProfilePhoto src={comment.photo} name={comment.nickname} size={28} />
                <b>{comment.nickname}</b>
              </span>
              <time>{formatSocialTime(comment.createdAt)}</time>
            </header>
            <p>{comment.content}</p>
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section class="side-card rules-card rounded-4 p-3 p-md-4 mt-3">
    <h2>규칙</h2>
    {#if mode === 'odd-even'}<ol>
        <li>상대가 구슬 일부를 손에 접어요.</li>
        <li>내 구슬을 걸고 홀 또는 짝을 외쳐요.</li>
        <li>맞히면 건 만큼 따고, 틀리면 잃어요.</li>
      </ol>{:else}<ol>
        <li>구슬 수를 3으로 나눈 결과를 맞혀요.</li>
        <li>으찌=1, 니=2, 쌈=0이에요.</li>
        <li>첫 호칭은 내 승리, 둘째는 무승부, 나머지는 상대 승리예요.</li>
      </ol>{/if}<a href="https://brunch.co.kr/@a8c41ad0e16649d/29" target="_blank" rel="noreferrer"
      >홀짝과 쌈치기 이야기 ↗</a
    >
  </section>
</main>

<style>
  .game-page {
    max-width: 1100px;
  }
  .leader-fireworks {
    position: fixed;
    inset: 0;
    z-index: 2200;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow: hidden;
    padding-top: 15vh;
    pointer-events: none;
  }
  .leader-fireworks strong {
    z-index: 1;
    padding: 0.9rem 1.25rem;
    border: 2px solid #fff0a8;
    border-radius: 2rem;
    background: #7a280ee8;
    color: #fff2a9;
    box-shadow:
      0 12px 36px #0008,
      0 0 34px #ffca3a99;
    font-size: clamp(1rem, 4vw, 1.45rem);
    text-align: center;
    animation: leaderPop 0.45s cubic-bezier(0.2, 0.8, 0.3, 1.3) both;
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
  .side-card,
  .ranking-card {
    border: 1px solid var(--bs-border-color);
    background: var(--bs-body-bg);
    box-shadow: 0 8px 24px #3213060c;
  }
  .ranking-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .ranking-head h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 950;
  }
  .daily-stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
  }
  .daily-stats span {
    padding: 0.3rem 0.55rem;
    border-radius: 2rem;
    background: var(--bs-tertiary-bg);
    color: var(--bs-secondary-color);
    font-size: 0.72rem;
    font-weight: 850;
  }
  .daily-stats b {
    color: #a14a1f;
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
    position: absolute;
    inset: 0;
    min-height: 460px;
    border-radius: 1rem;
    background: radial-gradient(circle at center, #285f46, #15402e 65%, #0d2c20);
    color: #fff;
    overflow: hidden;
  }
  .game-screen {
    position: relative;
    height: 620px;
    min-height: 460px;
    margin-top: 0.75rem;
    border-radius: 1rem;
    overflow: hidden;
  }
  .host-name {
    position: absolute;
    left: 1rem;
    top: 0.8rem;
    color: #bde0cb;
    font-size: 0.78rem;
  }
  .screen-balance {
    position: absolute;
    top: 0.7rem;
    right: 0.85rem;
    z-index: 3;
    display: grid;
    padding: 0.35rem 0.65rem;
    border: 1px solid #d8f3e338;
    border-radius: 0.65rem;
    background: #071d1570;
    text-align: right;
  }
  .screen-balance small {
    color: #bde0cb;
    font-size: 0.62rem;
  }
  .screen-balance strong {
    color: #ffe59a;
    font-size: 0.9rem;
  }
  .fist {
    display: grid;
    place-items: center;
    width: 280px;
    height: 260px;
    transform: translateY(-70px);
  }
  .fist > span {
    font-size: 7rem;
    filter: drop-shadow(0 12px 12px #0005);
  }
  .shaking .fist {
    animation: shake 0.32s linear infinite;
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
  .marbles.grouped {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 0.45rem;
    width: 230px;
    min-height: 200px;
  }
  .marble-group {
    display: flex;
    justify-content: center;
    gap: 0.45rem;
    min-width: 110px;
    padding: 0.35rem 0.7rem;
    border-radius: 2rem;
    background: #ffffff16;
    box-shadow: inset 0 0 0 1px #ffffff19;
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
    animation: pop 0.7s calc(var(--i) * 0.07s) both;
  }
  .sound {
    position: absolute;
    left: 50%;
    top: 56%;
    color: #d4ede0;
    font-weight: 800;
    transform: translateX(-50%);
    white-space: nowrap;
  }
  .round-call {
    position: absolute;
    left: 50%;
    top: 3.3rem;
    z-index: 2;
    display: grid;
    width: min(calc(100% - 2rem), 360px);
    box-sizing: border-box;
    padding: 0.55rem 1rem;
    border: 1px solid #ffe39a80;
    border-radius: 2rem;
    background: #071d15a8;
    text-align: center;
    transform: translateX(-50%);
    animation: roundCallIn 0.3s ease-out both;
  }
  .round-call small {
    color: #bde0cb;
    font-size: 0.66rem;
  }
  .round-call strong {
    color: #ffe59a;
    font-size: 1rem;
    overflow-wrap: anywhere;
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
  .odd-even-options button.active {
    border-color: #df9c25;
    background: #fff0bd;
    color: #532b0d;
    box-shadow: 0 0 0 3px #edbd4e30;
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
    position: absolute;
    right: 1rem;
    bottom: 1rem;
    left: 1rem;
    z-index: 12;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    margin: 0;
    padding: 1rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 0.85rem;
    background: var(--bs-tertiary-bg);
    box-shadow: 0 16px 38px #0007;
  }
  .result-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    gap: 0.55rem;
  }
  .result-facts > div {
    display: grid;
    padding: 0.55rem 0.7rem;
    border-radius: 0.65rem;
    background: #ffffff80;
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
    margin-bottom: 0;
    padding: 0;
    list-style: none;
  }
  .ranking-horizontal {
    display: grid;
    grid-template-columns: 1fr;
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
    .result-facts {
      grid-template-columns: 1fr;
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
  .next-host {
    font-size: 0.72rem;
    font-weight: 800;
  }
  .table-card {
    position: relative;
  }
  .action-layer {
    position: absolute;
    right: 1rem;
    bottom: 1rem;
    left: 1rem;
    z-index: 10;
    min-height: 0;
    max-height: 48%;
    overflow-y: auto;
    padding: 1rem;
    border: 2px solid #d79931;
    border-radius: 1rem;
    background: linear-gradient(145deg, #fffaf0, #fff1cf);
    color: #3e2a19;
    box-shadow: 0 8px 24px #9c641426;
    animation: layerIn 0.28s ease-out both;
  }
  .remainder-call-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.55rem;
  }
  .remainder-call-options button {
    display: grid;
    gap: 0.1rem;
    padding: 0.75rem 0.35rem;
    border: 2px solid #d7aa63;
    border-radius: 0.8rem;
    background: #fffdf5;
    color: #513416;
  }
  .remainder-call-options strong {
    font-size: 1.25rem;
  }
  .remainder-call-options small {
    color: #8a704e;
    font-weight: 850;
  }
  .remainder-call-options button.take {
    border-color: #2f9c5d;
    background: #dff5e7;
    color: #145b31;
  }
  .remainder-call-options button.give {
    border-color: #d57343;
    background: #ffe6d8;
    color: #7b3219;
  }
  .call-preview {
    margin-top: 0.5rem;
    text-align: center;
    font-weight: 950;
  }
  .catch-go {
    min-height: 68px;
    font-size: 1.25rem;
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
    animation: shake 0.32s linear infinite;
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
    position: relative;
    z-index: 1;
    font-size: 2.2rem;
  }
  .effect-layer strong {
    position: relative;
    z-index: 1;
    font-size: 1.3rem;
    font-weight: 950;
  }
  .effect-layer.pick {
    overflow: hidden;
    border-color: #7ee49b;
    background: #17482eea;
    box-shadow:
      0 18px 55px #0008,
      0 0 40px #58d57d70;
  }
  .catch-particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .catch-particles i {
    position: absolute;
    left: var(--x);
    bottom: -18px;
    width: 18px;
    height: 18px;
    border: 2px solid #d8ffe2;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #eaffef 0 12%, #49d578 28%, #087132 75%);
    box-shadow: 0 0 12px #75f49b;
    animation: marbleCatchBurst 0.8s calc(var(--i) * 45ms) cubic-bezier(0.2, 0.8, 0.3, 1) both;
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
  @keyframes leaderPop {
    from {
      opacity: 0;
      transform: translateY(-20px) scale(0.7);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes roundCallIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }
  }
  @keyframes marbleCatchBurst {
    0% {
      opacity: 0;
      transform: translateY(0) scale(0.4);
    }
    45% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateY(-115px) translateX(var(--dx)) scale(1.15);
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
  .comments-card {
    border: 1px solid var(--bs-border-color);
    background: var(--bs-body-bg);
    box-shadow: 0 8px 24px #3213060c;
  }
  .comments-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.8rem;
  }
  .comments-head h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 950;
  }
  .comments-head button {
    width: 34px;
    height: 34px;
    border: 1px solid var(--bs-border-color);
    border-radius: 50%;
    background: var(--bs-tertiary-bg);
    color: inherit;
  }
  .comment-form {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.55rem;
    margin-bottom: 1rem;
  }
  .comment-form textarea {
    min-height: 64px;
    padding: 0.7rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 0.7rem;
    background: var(--bs-body-bg);
    color: inherit;
    resize: vertical;
  }
  .comment-form button {
    min-width: 74px;
    border: 0;
    border-radius: 0.7rem;
    background: #a84624;
    color: #fff;
    font-weight: 900;
  }
  .comment-list article {
    margin-left: var(--indent);
    padding: 0.75rem 0.25rem;
    border-top: 1px solid var(--bs-border-color);
  }
  .comment-list header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.78rem;
  }
  .comment-author {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .comment-list time,
  .comment-empty,
  .comment-login {
    color: var(--bs-secondary-color);
    font-size: 0.75rem;
  }
  .comment-list p {
    margin: 0.3rem 0 0;
    white-space: pre-wrap;
  }
  @media (min-width: 992px) {
    .comments-card {
      width: calc(100% * 2 / 3);
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
  @media (max-width: 767px) {
    .game-page {
      padding-top: 0.45rem !important;
    }
    .ranking-head {
      align-items: flex-start;
      flex-direction: column;
    }
    .daily-stats {
      justify-content: flex-start;
    }
    .hero {
      display: grid;
      grid-template-columns: 1fr auto;
      padding: 0.6rem 0.75rem !important;
      margin-bottom: 0.45rem !important;
    }
    .hero .eyebrow,
    .hero p,
    .score small {
      display: none;
    }
    .hero h1 {
      margin: 0;
      font-size: 1.05rem;
    }
    .score {
      display: flex;
      align-items: baseline;
      gap: 0.35rem;
      padding: 0;
      border: 0;
      background: transparent;
    }
    .score strong {
      font-size: 1rem;
    }
    .table-card {
      padding: 0.45rem !important;
    }
    .game-tabs {
      gap: 0.35rem;
    }
    .game-tabs button {
      grid-template-columns: 24px 1fr;
      padding: 0.45rem 0.6rem;
    }
    .game-tabs span {
      font-size: 1rem;
    }
    .game-tabs small {
      display: none;
    }
    .game-screen {
      height: calc(100dvh - 155px);
      min-height: 560px;
      margin-top: 0.4rem;
    }
    .action-layer,
    .result {
      right: 0.55rem;
      bottom: 0.55rem;
      left: 0.55rem;
      padding: 0.75rem;
    }
    .action-layer {
      max-height: 49%;
    }
    .action-head {
      margin-bottom: 0.45rem;
    }
    .action-layer > p {
      margin-bottom: 0.5rem;
      font-size: 0.76rem;
    }
    .go.full {
      min-height: 44px;
      margin-top: 0.5rem;
    }
    .result {
      display: flex;
      flex-direction: row;
      gap: 0.55rem;
    }
    .result-facts {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.3rem;
    }
    .result-facts > div {
      padding: 0.4rem;
    }
    .result-facts strong {
      font-size: 0.75rem;
    }
    .result .go {
      width: 100%;
    }
    .fist {
      transform: translateY(-65px);
    }
    .sound {
      top: 52%;
    }
    .side-card {
      margin-top: 0.5rem;
    }
  }
</style>
