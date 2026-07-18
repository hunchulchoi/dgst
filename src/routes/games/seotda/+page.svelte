<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { ko } from 'date-fns/locale';
  import type { PageData } from './$types';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import { ANTE, dynamicAnte, minRaisePay } from './seotdaEngine.js';
  import { contributionCapacity } from './seotdaRound.js';
  import SharedGameComments from '$lib/components/SharedGameComments.svelte';
  import HwatuCardFace from './HwatuCardFace.svelte';
  import { HWATU_CARD_URLS } from './hwatuCardAssets';

  interface SeotdaPageProps {
    data: PageData;
  }

  interface SeotdaCard {
    month: number;
    gwang: boolean;
    hidden?: boolean;
  }

  interface SeotdaSeat {
    id: string;
    name: string;
    isNpc: boolean;
    chips: number;
    folded: boolean;
    contrib: number;
    totalContrib?: number;
    lastAction: string | null;
    lastActionAmount?: number;
    needsAction?: boolean;
    cards: SeotdaCard[];
    handName: string | null;
    revealDdaeng?: boolean;
  }

  interface SeotdaRound {
    phase: string;
    pot: number;
    currentBet: number;
    antePaid: number;
    openingActorId?: string;
    log: string[];
    winnerId: string | null;
    winnerIds?: string[];
    showdown: boolean;
    userFolded?: boolean;
    revealNpcHands?: boolean;
    ddaengWinnerId?: string | null;
    ddaengHandName?: string | null;
    ddaengValuePerLoser?: number;
    ddaengTotalPaid?: number;
    userChipsBefore?: number | null;
    userChipsAfter?: number | null;
    userChipDelta?: number | null;
    seats: SeotdaSeat[];
  }

  interface NpcAction {
    seatId: string;
    name: string;
    action: string;
    amount: number;
    taunt?: string | null;
  }

  let { data }: SeotdaPageProps = $props();

  let balance = $state(Number(data.balance ?? 0));
  let rankList = $state<Array<{ nickname: string; balance: number; updatedAt?: string | null }>>(
    data.rank ?? []
  );
  let todayStats = $state<{ hands: number; users: number }>(
    data.todayStats ?? { hands: 0, users: 0 }
  );
  let round = $state<SeotdaRound | null>((data.round as SeotdaRound | null) ?? null);
  let busy = $state(false);
  let dealing = $state(false);
  let message = $state('');
  let oopsInfo = $state<{
    waiting?: boolean;
    createdAt?: string;
    remainingMs?: number;
  } | null>(data.oopsInfo ?? null);

  /** 쇼다운 연출: 아직 안 깐 NPC id 집합 */
  let hiddenNpcIds = $state<Set<string>>(new Set());
  /** 첫 장 딜 플립 */
  let openCardFlipped = $state(true);
  /** 두 번째 장(히든) 까봤는지 — 쇼다운 중이면 이미 연 */
  let holeRevealed = $state(
    !!(
      data.round &&
      ((data.round as SeotdaRound).showdown || (data.round as SeotdaRound).phase === 'showdown')
    )
  );
  /** 패 까기 레이어 */
  let peelOpen = $state(false);
  /** 0~1 아래로 당긴 비율 */
  let peelPull = $state(0);
  let peelDragging = $state(false);
  let peelStartY = 0;
  /** 연출 끝난 뒤에만 승패/다음판 표시 */
  let revealDone = $state(true);
  let ddaengLayerOpen = $state(
    Number((data.round as SeotdaRound | null)?.ddaengValuePerLoser ?? 0) > 0
  );
  /** 지금 까는 좌석 (하이라이트) */
  let revealingId = $state<string | null>(null);
  /** 족보 안내 접기 */
  let guideOpen = $state(false);
  /** 레이즈에 넣을 칩 */
  let raiseBet = $state(20);
  let thinkingNpcId = $state<string | null>(null);
  let npcActionPreview = $state<Record<string, NpcAction>>({});
  let shareOpen = $state(false);
  let shareSending = $state(false);
  let shareBoard = $state('free');
  let shareTitle = $state('');
  let shareNote = $state('');
  let commentRefreshToken = $state(0);
  let resultLayerDismissed = $state(false);
  let bustRoundPending = $state(false);
  let oopsRemainingMs = $state(Number(data.oopsInfo?.remainingMs ?? 0));

  const PEEL_THRESHOLD = 0.55;
  const PEEL_MAX_PX = 220;

  const HAND_GUIDE = [
    { name: '38광땡', detail: '3광 + 8광', rank: '최강' },
    { name: '13광땡 / 18광땡', detail: '1·3광 또는 1·8광', rank: '광땡' },
    { name: '장땡 ~ 삥땡', detail: '같은 월 2장 (10>9>…>1)', rank: '땡' },
    { name: '알리', detail: '1 + 2', rank: '특수' },
    { name: '독사', detail: '1 + 4', rank: '특수' },
    { name: '구삥', detail: '1 + 9', rank: '특수' },
    { name: '장삥', detail: '1 + 10', rank: '특수' },
    { name: '장사', detail: '4 + 10', rank: '특수' },
    { name: '세륙', detail: '4 + 6', rank: '특수' },
    { name: '갑오 ~ 망통', detail: '월 합 % 10 (9>…>0), 동점=무승부', rank: '끗' }
  ] as const;

  /** @type {ReturnType<typeof setTimeout>[]} */
  let timers: ReturnType<typeof setTimeout>[] = [];
  let topupRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let oopsCountdownTimer: ReturnType<typeof setInterval> | null = null;
  let topupRefreshRunning = false;

  const formatNumber = (value: number | null | undefined): string => {
    if (value == null || Number.isNaN(value)) return '0';
    return Number(value).toLocaleString('ko-KR');
  };

  const formatRankAt = (value: string | null | undefined): string => {
    if (!value) return '';
    return formatRelativeTime(value, { locale: ko, addSuffix: true });
  };

  const userSeat = $derived(round?.seats.find((s) => s.id === 'user') ?? null);
  const npcs = $derived(round?.seats.filter((s) => s.isNpc) ?? []);
  const canAct = $derived(
    !!round &&
      round.phase === 'betting' &&
      !userSeat?.folded &&
      !!userSeat?.needsAction &&
      !busy &&
      revealDone
  );
  const isShowdown = $derived(!!round && (round.showdown || round.phase === 'showdown'));
  const winnerIds = $derived(
    round?.winnerIds?.length ? round.winnerIds : round?.winnerId ? [round.winnerId] : []
  );
  const isDraw = $derived(isShowdown && winnerIds.length > 1);
  const userWon = $derived(winnerIds.includes('user') && !isDraw);
  const userChipDelta = $derived(Number(round?.userChipDelta ?? 0));
  const userChipsBefore = $derived(Number(round?.userChipsBefore ?? 0));
  const userChipsAfter = $derived(Number(round?.userChipsAfter ?? userSeat?.chips ?? 0));
  const isBustResult = $derived(isShowdown && userChipsAfter < ANTE);
  const ddaengWinner = $derived(
    round?.seats.find((seat) => seat.id === round?.ddaengWinnerId) ?? null
  );
  const toCall = $derived(userSeat ? Math.max(0, (round?.currentBet ?? 0) - userSeat.contrib) : 0);
  const roundAnte = $derived(round?.antePaid ?? dynamicAnte(balance));
  const minRaise = $derived(minRaisePay(toCall, roundAnte));
  const maxRaise = $derived(round && userSeat ? contributionCapacity(round, userSeat) : 0);
  const isLoggedIn = $derived(!!data.session?.user?.email);

  $effect(() => {
    if (!canAct) return;
    const min = minRaise;
    const max = maxRaise;
    if (raiseBet < min) raiseBet = max > 0 ? Math.min(min, max) : min;
    else if (max > 0 && raiseBet > max) raiseBet = max;
  });

  /** 판 종료·새 판 시작 때 0이 아닌 최소 합법 레이즈로 초기화한다. */
  function resetRaiseBet(nextRound: SeotdaRound | null, nextBalance = balance) {
    const ante = Math.max(ANTE, Number(nextRound?.antePaid ?? dynamicAnte(nextBalance)) || ANTE);
    if (!nextRound) {
      raiseBet = minRaisePay(0, ante);
      return;
    }
    const nextUser = nextRound.seats.find((seat) => seat.id === 'user');
    if (!nextUser) {
      raiseBet = minRaisePay(0, ante);
      return;
    }
    const nextToCall = Math.max(0, Number(nextRound.currentBet) - Number(nextUser.contrib));
    const nextMinimum = minRaisePay(nextToCall, ante);
    const nextMaximum = contributionCapacity(nextRound, nextUser);
    raiseBet = nextMaximum > 0 ? Math.min(nextMinimum, nextMaximum) : nextMinimum;
  }

  function clearTimers() {
    for (const t of timers) clearTimeout(t);
    timers = [];
  }

  function clearTopupRefreshTimer() {
    if (topupRefreshTimer) clearTimeout(topupRefreshTimer);
    topupRefreshTimer = null;
  }

  function clearOopsCountdown() {
    if (oopsCountdownTimer) clearInterval(oopsCountdownTimer);
    oopsCountdownTimer = null;
  }

  function startOopsCountdown(remainingMs: number) {
    clearOopsCountdown();
    const deadline = Date.now() + Math.max(0, remainingMs);
    const update = () => {
      oopsRemainingMs = Math.max(0, deadline - Date.now());
      if (oopsRemainingMs <= 0) {
        clearOopsCountdown();
        void refreshGameState();
      }
    };
    update();
    if (oopsRemainingMs > 0) oopsCountdownTimer = setInterval(update, 250);
  }

  function formatOopsCountdown(remainingMs: number): string {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function scheduleTopupRefresh(delayMs: number) {
    clearTopupRefreshTimer();
    topupRefreshTimer = setTimeout(() => void refreshGameState(), Math.max(250, delayMs));
  }

  onMount(() => {
    if (oopsInfo?.waiting) startOopsCountdown(Number(oopsInfo.remainingMs ?? 0));
    if (balance < ANTE) void refreshGameState();
  });

  onDestroy(() => {
    clearTimers();
    clearTopupRefreshTimer();
    clearOopsCountdown();
  });

  function cardText(card: SeotdaCard): string {
    if (card.hidden || card.month === 0) return '?';
    return `${card.month}${card.gwang ? '광' : ''}`;
  }

  function actionEffectText(seat: SeotdaSeat): string {
    const amount = Number(seat.lastActionAmount ?? 0);
    if (seat.lastAction === '레이즈') return `레이즈 +${formatNumber(amount)}`;
    if (seat.lastAction === '콜') return `콜 ${formatNumber(amount)}`;
    if (seat.lastAction === '올인') return `올인 +${formatNumber(amount)}`;
    return seat.lastAction ?? '';
  }

  function npcActionText(action: NpcAction): string {
    if (action.action === '레이즈') return `레이즈 +${formatNumber(action.amount)}`;
    if (action.action === '콜') return `콜 ${formatNumber(action.amount)}`;
    if (action.action === '올인') return `올인 +${formatNumber(action.amount)}`;
    return action.action;
  }

  function npcActionDelay(action: string): number {
    if (action === '콜' || action === '레이즈') return 650 + Math.random() * 700;
    if (action === '올인') return 800 + Math.random() * 700;
    return 220 + Math.random() * 260;
  }

  function wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  async function playNpcActions(actions: NpcAction[]) {
    npcActionPreview = {};
    for (const action of actions) {
      thinkingNpcId = action.seatId;
      await wait(npcActionDelay(action.action));
      thinkingNpcId = null;
      npcActionPreview = { ...npcActionPreview, [action.seatId]: action };
      await wait(action.action === '콜' || action.action === '레이즈' ? 380 : 180);
    }
  }

  function npcCardVisible(npc: SeotdaSeat, card: SeotdaCard): boolean {
    if (npc.folded) return false;
    if (!isShowdown) return false;
    if ((round?.revealNpcHands === false || userSeat?.folded) && !npc.revealDdaeng) return false;
    if (hiddenNpcIds.has(npc.id)) return false;
    return !card.hidden && card.month > 0;
  }

  function showDdaengLayer(r: SeotdaRound) {
    if (Number(r.ddaengValuePerLoser ?? 0) > 0) ddaengLayerOpen = true;
  }

  function closeDdaengLayer() {
    ddaengLayerOpen = false;
  }

  /**
   * 쇼다운 진입 시 NPC 패를 한 명씩 까기 (유저 다이면 스킵)
   * @param {SeotdaRound} r
   */
  function startShowdownReveal(r: SeotdaRound) {
    clearTimers();
    const userDead = !!r.seats.find((s) => s.id === 'user')?.folded || r.revealNpcHands === false;
    if (userDead) {
      hiddenNpcIds = new Set(r.seats.filter((s) => s.isNpc && !s.revealDdaeng).map((s) => s.id));
      revealDone = true;
      revealingId = null;
      showDdaengLayer(r);
      return;
    }
    const aliveNpcs = r.seats.filter((s) => s.isNpc && !s.folded);
    hiddenNpcIds = new Set(aliveNpcs.map((s) => s.id));
    revealDone = aliveNpcs.length === 0;
    revealingId = null;
    if (revealDone) showDdaengLayer(r);

    let delay = 400;
    aliveNpcs.forEach((npc, idx) => {
      const t = setTimeout(() => {
        revealingId = npc.id;
        const next = new Set(hiddenNpcIds);
        next.delete(npc.id);
        hiddenNpcIds = next;
        if (idx === aliveNpcs.length - 1) {
          const done = setTimeout(() => {
            revealingId = null;
            revealDone = true;
            showDdaengLayer(r);
          }, 700);
          timers.push(done);
        }
      }, delay);
      timers.push(t);
      delay += 900;
    });
  }

  /** 새 판: 첫 장만 공개, 둘째는 뒷면 */
  function startDealFlip() {
    clearTimers();
    openCardFlipped = false;
    holeRevealed = false;
    peelOpen = false;
    peelPull = 0;
    revealDone = true;
    ddaengLayerOpen = false;
    hiddenNpcIds = new Set();
    revealingId = null;
    const t = setTimeout(() => {
      openCardFlipped = true;
    }, 280);
    timers.push(t);
  }

  function openPeelLayer() {
    if (holeRevealed || isShowdown) return;
    peelOpen = true;
    peelPull = 0;
  }

  function closePeelLayer() {
    peelOpen = false;
    peelPull = 0;
    peelDragging = false;
  }

  function finishPeel() {
    holeRevealed = true;
    peelPull = 1;
    peelDragging = false;
    const t = setTimeout(() => {
      peelOpen = false;
      peelPull = 0;
    }, 280);
    timers.push(t);
  }

  /**
   * @param {number} clientY
   */
  function onPeelStart(clientY: number) {
    if (holeRevealed) return;
    peelDragging = true;
    peelStartY = clientY - peelPull * PEEL_MAX_PX;
  }

  /**
   * @param {number} clientY
   */
  function onPeelMove(clientY: number) {
    if (!peelDragging || holeRevealed) return;
    const dy = Math.max(0, clientY - peelStartY);
    peelPull = Math.min(1, dy / PEEL_MAX_PX);
  }

  function onPeelEnd() {
    if (!peelDragging) return;
    peelDragging = false;
    if (peelPull >= PEEL_THRESHOLD) finishPeel();
    else peelPull = 0;
  }

  /**
   * @param {SeotdaRound | null} next
   * @param {boolean} fromShowdownAct
   */
  function applyRound(next: SeotdaRound | null, fromShowdownAct = false) {
    const wasShowdown = round && (round.showdown || round.phase === 'showdown');
    const nowShowdown = next && (next.showdown || next.phase === 'showdown');
    const isNewDeal =
      next && next.phase === 'betting' && (!round || wasShowdown || round.phase !== 'betting');

    round = next;
    if (nowShowdown && !wasShowdown) resultLayerDismissed = false;

    if (nowShowdown && fromShowdownAct) {
      holeRevealed = true;
      peelOpen = false;
      startShowdownReveal(next);
    } else if (isNewDeal) {
      bustRoundPending = false;
      startDealFlip();
    } else if (!nowShowdown) {
      hiddenNpcIds = new Set();
      revealDone = true;
      revealingId = null;
      ddaengLayerOpen = false;
    }
  }

  async function refreshGameState() {
    if (topupRefreshRunning) return;
    topupRefreshRunning = true;
    try {
      const res = await fetch(`/games/seotda?_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`섯다 상태 조회 실패 (${res.status})`);
      const next = await res.json();
      balance = Number(next.balance ?? balance);
      rankList = next.rank ?? rankList;
      todayStats = next.todayStats ?? todayStats;
      oopsInfo = next.oopsInfo ?? null;

      if (oopsInfo?.waiting) {
        const remainingMs = Number(oopsInfo.remainingMs ?? 5_000);
        startOopsCountdown(remainingMs);
        scheduleTopupRefresh(remainingMs + 250);
      } else {
        clearTopupRefreshTimer();
        clearOopsCountdown();
        oopsRemainingMs = 0;
      }
    } catch (err) {
      console.error('[seotda refresh]', err);
      if (balance < ANTE) scheduleTopupRefresh(5_000);
    } finally {
      topupRefreshRunning = false;
    }
  }

  async function writeAutomaticComment(content: string) {
    try {
      const form = new FormData();
      form.set('content', content);
      form.set('game', 'seotda');
      form.set('automatic', '1');
      const response = await fetch('/games/slot/comment', { method: 'POST', body: form });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result?.message ?? `HTTP ${response.status}`);
      }
      commentRefreshToken += 1;
    } catch (error) {
      console.error('[seotda automatic comment]', error);
    }
  }

  function closeResultLayer() {
    resultLayerDismissed = true;
    if (isBustResult) {
      bustRoundPending = true;
      round = null;
      resetRaiseBet(null, balance);
    }
  }

  async function writeRoundAutomaticComments(nextRound: SeotdaRound, nextBalance: number) {
    if (!isLoggedIn) return;
    const user = nextRound.seats.find((seat) => seat.id === 'user');
    if (Number(nextRound.ddaengValuePerLoser ?? 0) > 0 && nextRound.ddaengWinnerId === 'user') {
      const winner =
        nextRound.seats.find((seat) => seat.id === nextRound.ddaengWinnerId)?.name ?? '승자';
      await writeAutomaticComment(
        `🃏 섯다 땡! ${nextRound.ddaengHandName ?? '땡'} · ${winner} 승 · 땡값 ${formatNumber(nextRound.ddaengValuePerLoser ?? 0)}점`
      );
    }
    if (nextBalance < ANTE) {
      await writeAutomaticComment(
        `😢 섯다 오링! ${user?.handName ? `${user.handName} · ` : ''}${formatNumber(Math.abs(Number(nextRound.userChipDelta ?? 0)))}점 잃음`
      );
    }
  }

  async function post(body: Record<string, unknown>) {
    busy = true;
    message = '';
    try {
      const res = await fetch('/games/seotda', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        message = j?.message ?? '요청 실패';
        return;
      }
      const npcActions = Array.isArray(j.npcActions) ? (j.npcActions as NpcAction[]) : [];
      await playNpcActions(npcActions);
      balance = Number(j.balance ?? balance);
      const next = (j.round as SeotdaRound | null) ?? null;
      const hitShowdown = !!(next && (next.showdown || next.phase === 'showdown'));
      applyRound(next, body.action === 'act' && hitShowdown);
      if (hitShowdown) resetRaiseBet(null, balance);
      else if (body.action === 'ack' || body.action === 'start') resetRaiseBet(next, balance);
      npcActionPreview = {};
      if (hitShowdown && next) {
        await writeRoundAutomaticComments(next, balance);
      }
      if (body.action === 'ack' || body.action === 'start' || hitShowdown) {
        // 랭킹·오늘 통계 갱신
        await refreshGameState();
      }
    } catch (err) {
      console.error('[seotda post]', err);
      message = '네트워크 오류';
    } finally {
      thinkingNpcId = null;
      busy = false;
    }
  }

  async function startRound() {
    dealing = true;
    try {
      await post({ action: 'start' });
    } finally {
      dealing = false;
    }
  }

  function act(move: 'die' | 'call' | 'raise') {
    if (move === 'raise') {
      return post({ action: 'act', move, amount: Number(raiseBet) });
    }
    return post({ action: 'act', move });
  }

  function setRaisePreset(kind: 'min' | 'plus' | 'plus100' | 'half' | 'all') {
    const min = minRaise;
    const max = maxRaise;
    if (kind === 'min') raiseBet = Math.min(min, max);
    else if (kind === 'plus') raiseBet = Math.min(max, raiseBet + roundAnte * 2);
    else if (kind === 'plus100') raiseBet = Math.min(max, raiseBet + roundAnte * 10);
    else if (kind === 'half') raiseBet = Math.min(max, Math.max(min, Math.floor(max / 2)));
    else raiseBet = max;
  }

  async function nextRound() {
    dealing = true;
    try {
      await post({ action: 'ack' });
    } finally {
      dealing = false;
    }
  }

  function openShare() {
    if (!round || !isShowdown || !revealDone) return;
    if (!isLoggedIn) {
      message = '게시판 공유는 로그인 후 가능합니다.';
      return;
    }
    const result = isDraw ? '무승부' : userWon ? '승리' : '패배';
    shareTitle = `[섯다] ${userSeat?.handName ?? result} ${result}`;
    shareBoard = 'free';
    shareNote = '';
    message = '';
    shareOpen = true;
  }

  function closeShare() {
    if (!shareSending) shareOpen = false;
  }

  async function submitShare() {
    if (shareSending) return;
    shareSending = true;
    message = '';
    try {
      const response = await fetch('/games/seotda/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          boardId: shareBoard,
          title: shareTitle.trim(),
          note: shareNote.trim()
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.articleId) {
        throw new Error(result?.message || '게시판 공유 실패');
      }
      shareOpen = false;
      await goto(resolve(`/board/${result.boardId}/${result.articleId}`));
    } catch (err) {
      message = err instanceof Error ? err.message : '게시판 공유 실패';
    } finally {
      shareSending = false;
    }
  }
</script>

<svelte:head>
  {#each HWATU_CARD_URLS as href (href)}
    <link rel="preload" as="image" {href} />
  {/each}
</svelte:head>

<div class="container py-3 py-md-4 seotda-page">
  <section class="mb-3">
    <div class="card shadow-sm rounded-4 border-0">
      <div class="card-body py-3">
        <div class="d-flex justify-content-between small">
          <span>오늘 참여자 <strong>{formatNumber(todayStats.users)}</strong></span>
          <span>오늘 판수 <strong>{formatNumber(todayStats.hands)}</strong></span>
        </div>
      </div>
    </div>
  </section>

  <div class="row g-3">
    <div class="col-lg-8 order-2 order-lg-1">
      <div class="card shadow rounded-4 border-0">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h4 class="mb-0">섯다</h4>
            <div class="text-end">
              <div>보유 점수: <strong>{formatNumber(balance)}</strong></div>
              {#if oopsInfo?.waiting}
                <small class="text-danger">오링! 5분 후 700점 보충</small>
              {/if}
            </div>
          </div>

          <p class="small text-muted mb-2">
            NPC 3명과 라이트 섯다. 다이 / 콜 / 레이즈. 특수족보(암행어사 등) 없음.
          </p>

          <div class="mb-3">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              aria-expanded={guideOpen}
              onclick={() => (guideOpen = !guideOpen)}
            >
              족보 보기 {guideOpen ? '▲' : '▼'}
            </button>
            {#if guideOpen}
              <div class="guide-panel mt-2 rounded-3 border p-3">
                <div class="small text-muted mb-2">위가 더 셈 · 라이트 규칙</div>
                <ol class="guide-list mb-0 ps-3">
                  {#each HAND_GUIDE as row, i (row.name)}
                    <li class="mb-1">
                      <span class="fw-semibold">{i + 1}. {row.name}</span>
                      <span class="text-muted"> — {row.detail}</span>
                      <span class="badge text-bg-light border ms-1">{row.rank}</span>
                    </li>
                  {/each}
                </ol>
              </div>
            {/if}
          </div>

          {#if message}
            <div class="alert alert-warning py-2">{message}</div>
          {/if}

          {#if dealing}
            <div
              class="deal-curtain"
              role="status"
              aria-live="polite"
              aria-label="새 판 패 배분 중"
            >
              <div class="deal-stage">
                <div class="deal-deck" aria-hidden="true">
                  {#each Array(8) as _, i}
                    <i style={`--deal-index:${i}`}></i>
                  {/each}
                </div>
                <div class="deal-copy">
                  <strong>새 판 준비</strong>
                  <span>화투패를 섞는 중</span>
                  <span>패를 자르는 중</span>
                  <span>한 장씩 돌리는 중</span>
                </div>
              </div>
            </div>
          {/if}

          {#if !round}
            <div class="text-center py-5">
              <p class="mb-3">아귀 · 고니 · 정마담 이 기다림.</p>
              <button
                class="btn btn-primary btn-lg rounded-pill px-4"
                disabled={busy || !!oopsInfo?.waiting || oopsRemainingMs > 0}
                onclick={bustRoundPending ? nextRound : startRound}
              >
                {#if oopsInfo?.waiting || oopsRemainingMs > 0}
                  판 시작 {formatOopsCountdown(oopsRemainingMs)}
                {:else}
                  판 시작 (판돈 {formatNumber(roundAnte)})
                {/if}
              </button>
            </div>
          {:else}
            <div class="seotda-table rounded-4 p-3 mb-3">
              <div class="npc-row mb-4">
                {#each npcs as npc (npc.id)}
                  <div
                    class="seat text-center"
                    class:folded={npc.folded}
                    class:winner={revealDone && winnerIds.includes(npc.id)}
                    class:revealing={revealingId === npc.id}
                  >
                    <div class="fw-semibold">
                      {npc.name}
                      {#if round.openingActorId === npc.id}<span class="badge text-bg-warning ms-1"
                          >선</span
                        >{/if}
                    </div>
                    <div class="small opacity-75">{formatNumber(npc.chips)}점</div>
                    <div class="cards my-2">
                      {#each npc.cards as card, i (`${npc.id}-${i}`)}
                        {@const open = npcCardVisible(npc, card)}
                        <span
                          class="hwatu-flip"
                          class:flipped={open}
                          class:gwang={open && card.gwang}
                        >
                          <span class="hwatu-face back">?</span>
                          <span class="hwatu-face front">
                            {#if open}<HwatuCardFace {card} />{:else}?{/if}
                          </span>
                        </span>
                      {/each}
                    </div>
                    {#if npc.handName && !hiddenNpcIds.has(npc.id) && isShowdown && !npc.folded && ((round.revealNpcHands !== false && !userSeat?.folded) || npc.revealDdaeng)}
                      <div class="badge text-bg-dark hand-pop">{npc.handName}</div>
                    {/if}
                    {#if thinkingNpcId === npc.id}
                      <div class="action-effect thinking">생각 중…</div>
                    {:else if npcActionPreview[npc.id]}
                      {@const preview = npcActionPreview[npc.id]}
                      <div
                        class="action-effect"
                        class:raise={preview.action === '레이즈'}
                        class:fold={preview.action === '다이'}
                      >
                        {npcActionText(preview)}
                      </div>
                      {#if preview.taunt}
                        <div class="spark-taunt" role="status">“{preview.taunt}”</div>
                      {/if}
                    {:else if npc.lastAction}
                      <div
                        class="action-effect"
                        class:raise={npc.lastAction === '레이즈'}
                        class:fold={npc.lastAction === '다이'}
                      >
                        {actionEffectText(npc)}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="pot text-center mb-4">
                <div class="display-6 fw-bold">{formatNumber(round.pot)}</div>
                <div class="small opacity-75">팟 · 현재 벳 {formatNumber(round.currentBet)}</div>
                {#if isShowdown && !revealDone}
                  <div class="reveal-hint mt-2">패 까는 중…</div>
                {/if}
              </div>

              {#if userSeat}
                <div
                  class="seat user-seat text-center"
                  class:folded={userSeat.folded}
                  class:winner={revealDone && winnerIds.includes('user')}
                >
                  <div class="fw-semibold">
                    나
                    {#if round.openingActorId === 'user'}<span class="badge text-bg-warning ms-1"
                        >선</span
                      >{/if}
                  </div>
                  <div class="small opacity-75">{formatNumber(userSeat.chips)}점</div>
                  <div class="cards my-2">
                    {#each userSeat.cards as card, i (`user-${i}`)}
                      {#if i === 0}
                        <span
                          class="hwatu-flip"
                          class:flipped={openCardFlipped}
                          class:gwang={openCardFlipped && card.gwang}
                        >
                          <span class="hwatu-face back">?</span>
                          <span class="hwatu-face front open"><HwatuCardFace {card} /></span>
                        </span>
                      {:else}
                        <button
                          type="button"
                          class="hwatu-flip hole-btn"
                          class:flipped={holeRevealed || isShowdown}
                          class:gwang={(holeRevealed || isShowdown) && card.gwang}
                          class:tap-hint={!holeRevealed && !isShowdown}
                          disabled={holeRevealed || isShowdown || userSeat.folded}
                          aria-label={holeRevealed ? cardText(card) : '뒷장 까기'}
                          onclick={openPeelLayer}
                        >
                          <span class="hwatu-face back">?</span>
                          <span class="hwatu-face front open"><HwatuCardFace {card} /></span>
                        </button>
                      {/if}
                    {/each}
                  </div>
                  {#if !holeRevealed && !isShowdown && !userSeat.folded}
                    <div class="small peel-tip">뒷장 눌러서 까기 ↓</div>
                  {/if}
                  {#if userSeat.handName && (holeRevealed || isShowdown)}
                    <div class="badge text-bg-primary mb-2 hand-pop">{userSeat.handName}</div>
                  {/if}
                  {#if userSeat.lastAction}
                    <div
                      class="action-effect"
                      class:raise={userSeat.lastAction === '레이즈'}
                      class:fold={userSeat.lastAction === '다이'}
                    >
                      {actionEffectText(userSeat)}
                    </div>
                  {/if}
                </div>
              {/if}

              {#if canAct}
                <div class="turn-action-layer" role="group" aria-label="내 행동 선택">
                  <div class="turn-label">내 차례</div>
                  <div class="turn-bet-controls">
                    <div class="turn-bet-meta">
                      <span>콜 {formatNumber(toCall)} · 레이즈 최소 {formatNumber(minRaise)}</span>
                      <span>보유 {formatNumber(maxRaise)}</span>
                    </div>
                    <div class="turn-bet-input-row">
                      <label for="turn-raise-bet">레이즈</label>
                      <input
                        id="turn-raise-bet"
                        class="form-control form-control-sm turn-bet-input"
                        type="number"
                        min={minRaise}
                        max={maxRaise}
                        bind:value={raiseBet}
                        onchange={() => {
                          let v = Number(raiseBet);
                          if (!Number.isFinite(v)) v = minRaise;
                          raiseBet = Math.min(maxRaise, Math.max(minRaise, v));
                        }}
                      />
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-light"
                        onclick={() => setRaisePreset('min')}>최소</button
                      >
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-light"
                        onclick={() => setRaisePreset('plus')}
                        >+{formatNumber(roundAnte * 2)}</button
                      >
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-light"
                        onclick={() => setRaisePreset('plus100')}
                        >+{formatNumber(roundAnte * 10)}</button
                      >
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-light"
                        onclick={() => setRaisePreset('half')}>절반</button
                      >
                      <button
                        type="button"
                        class="btn btn-sm btn-outline-light"
                        onclick={() => setRaisePreset('all')}>최대</button
                      >
                    </div>
                  </div>
                  <div class="d-flex gap-2 justify-content-center flex-wrap">
                    <button class="btn btn-light" disabled={busy} onclick={() => act('die')}
                      >다이</button
                    >
                    <button class="btn btn-primary" disabled={busy} onclick={() => act('call')}>
                      {toCall === 0 ? '체크' : `콜 ${formatNumber(toCall)}`}
                    </button>
                    <button
                      class="btn btn-danger"
                      disabled={busy || maxRaise < minRaise}
                      onclick={() => act('raise')}
                    >
                      레이즈 +{formatNumber(Math.min(raiseBet, maxRaise))}
                    </button>
                  </div>
                </div>
              {/if}
            </div>

            {#if peelOpen && userSeat?.cards[1]}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="peel-backdrop"
                role="dialog"
                aria-modal="true"
                aria-label="패 까기"
                onclick={(e) => {
                  if (e.target === e.currentTarget && !peelDragging) closePeelLayer();
                }}
                onkeydown={(e) => {
                  if (e.key === 'Escape') closePeelLayer();
                }}
              >
                <div class="peel-sheet">
                  <p class="peel-guide mb-3">현재 패를 아래로 내려 새 패 확인</p>
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="peel-card"
                    ontouchstart={(e) => {
                      e.preventDefault();
                      onPeelStart(e.touches[0].clientY);
                    }}
                    ontouchmove={(e) => {
                      e.preventDefault();
                      onPeelMove(e.touches[0].clientY);
                    }}
                    ontouchend={() => onPeelEnd()}
                    onmousedown={(e) => onPeelStart(e.clientY)}
                    onmousemove={(e) => {
                      if (peelDragging) onPeelMove(e.clientY);
                    }}
                    onmouseup={() => onPeelEnd()}
                    onmouseleave={() => {
                      if (peelDragging) onPeelEnd();
                    }}
                  >
                    <div class="peel-face"><HwatuCardFace card={userSeat.cards[1]} /></div>
                    <div
                      class="peel-cover"
                      class:snapping={!peelDragging}
                      style="transform: translateY({peelPull * PEEL_MAX_PX}px)"
                    >
                      <div class="peel-cover-inner">
                        <HwatuCardFace card={userSeat.cards[0]} />
                        <span class="peel-drag-hint">↓ 내려서 새 패 보기</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-light mt-3"
                    onclick={closePeelLayer}>닫기</button
                  >
                </div>
              </div>
            {/if}

            {#if ddaengLayerOpen && round.ddaengValuePerLoser}
              <div
                class="ddaeng-value-backdrop"
                role="dialog"
                aria-modal="true"
                aria-label="땡값 정산"
                tabindex="-1"
                onclick={(event) => {
                  if (event.target === event.currentTarget) closeDdaengLayer();
                }}
                onkeydown={(event) => {
                  if (event.key === 'Escape') closeDdaengLayer();
                }}
              >
                <div class="ddaeng-value-layer">
                  <div class="ddaeng-value-sparks" aria-hidden="true">✦ 🪙 ✦</div>
                  <div class="ddaeng-value-label">땡값 정산</div>
                  <strong class="ddaeng-value-hand">{round.ddaengHandName ?? '땡'}</strong>
                  <div class="ddaeng-value-winner">{ddaengWinner?.name ?? '승자'} 수령</div>
                  <div class="ddaeng-value-amounts">
                    <span>1인당 <strong>{formatNumber(round.ddaengValuePerLoser)}점</strong></span>
                    <span>총 <strong>{formatNumber(round.ddaengTotalPaid)}점</strong></span>
                  </div>
                  <button class="btn btn-warning fw-bold" type="button" onclick={closeDdaengLayer}>
                    확인
                  </button>
                </div>
              </div>
            {/if}

            {#if isShowdown && revealDone && !ddaengLayerOpen && !shareOpen && !resultLayerDismissed}
              <div
                class="result-action-backdrop"
                role="dialog"
                aria-modal="true"
                aria-label="섯다 판 결과"
                tabindex="-1"
              >
                <div class="result-action-layer">
                  <span class="result-action-label">HAND COMPLETE</span>
                  <strong class:loss={!userWon && !isDraw} class="result-action-title">
                    {#if isDraw}무승부
                    {:else if userWon}이겼다!
                    {:else}졌다…{/if}
                  </strong>
                  <div class="result-action-hand">
                    {userSeat?.handName ?? (isDraw ? '무승부' : userWon ? '승리' : '패배')}
                  </div>
                  <div
                    class:win={userChipDelta > 0}
                    class:loss={userChipDelta < 0}
                    class="result-action-delta"
                  >
                    {#if userChipDelta > 0}
                      +{formatNumber(userChipDelta)}점 땄다
                    {:else if userChipDelta < 0}
                      -{formatNumber(Math.abs(userChipDelta))}점 잃었다
                    {:else}
                      본전
                    {/if}
                  </div>
                  <div class="result-action-balance">
                    {formatNumber(userChipsBefore)}점 → {formatNumber(userChipsAfter)}점
                  </div>
                  {#if isBustResult}
                    <div
                      class="alert alert-warning py-2 px-3 mb-3 result-action-oops"
                      role="status"
                    >
                      오링! 5분 뒤 700점이 리필됩니다.
                    </div>
                  {/if}
                  <div class="result-action-buttons">
                    <button class="btn btn-outline-light" disabled={busy} onclick={openShare}>
                      <span aria-hidden="true">🎴</span>
                      게시판 공유
                    </button>
                    {#if isBustResult}
                      <button
                        class="btn btn-warning fw-bold"
                        disabled={busy}
                        onclick={closeResultLayer}
                      >
                        닫기
                      </button>
                    {:else}
                      <button class="btn btn-warning fw-bold" disabled={busy} onclick={nextRound}>
                        다음 판
                        <span aria-hidden="true">→</span>
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}

            {#if shareOpen}
              <div
                class="share-backdrop"
                role="presentation"
                onpointerdown={(event) => {
                  if (event.target === event.currentTarget) closeShare();
                }}
              >
                <form
                  class="share-panel"
                  aria-label="섯다 결과 게시판 공유"
                  onsubmit={(event) => {
                    event.preventDefault();
                    void submitShare();
                  }}
                >
                  <h5 class="mb-3">섯다 결과 공유</h5>
                  <label class="form-label" for="seotda-share-board">게시판</label>
                  <select id="seotda-share-board" class="form-select mb-3" bind:value={shareBoard}>
                    <option value="free">자유게시판</option>
                    <option value="bug">버그신고</option>
                  </select>
                  <label class="form-label" for="seotda-share-title">제목</label>
                  <input
                    id="seotda-share-title"
                    class="form-control mb-3"
                    bind:value={shareTitle}
                    maxlength="80"
                    required
                  />
                  <label class="form-label" for="seotda-share-note">내용 (선택)</label>
                  <textarea
                    id="seotda-share-note"
                    class="form-control mb-3"
                    bind:value={shareNote}
                    maxlength="500"
                    rows="4"
                    placeholder="판 설명을 적어주세요."
                  ></textarea>
                  <div class="d-flex gap-2 justify-content-end">
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      disabled={shareSending}
                      onclick={closeShare}>취소</button
                    >
                    <button type="submit" class="btn btn-primary" disabled={shareSending}>
                      {shareSending ? '올리는 중…' : '게시하기'}
                    </button>
                  </div>
                </form>
              </div>
            {/if}

            <div
              class="log small seotda-log rounded-3 border p-2"
              style="max-height: 140px; overflow: auto;"
            >
              {#each round.log as line, i (i)}
                <div>{line}</div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="col-lg-4 order-1 order-lg-2">
      <div class="card shadow rounded-4 border-0">
        <div class="card-body">
          <h5 class="mb-3">섯다 Top10</h5>
          {#if rankList.length === 0}
            <p class="text-muted small mb-0">아직 랭킹 없음</p>
          {:else}
            <ol class="list-group list-group-numbered list-group-flush">
              {#each rankList as r, i (r.nickname + i)}
                <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                  <div>
                    <span>{r.nickname}</span>
                    {#if r.updatedAt}
                      <small class="d-block text-muted">{formatRankAt(r.updatedAt)}</small>
                    {/if}
                  </div>
                  <span class="fw-bold font-monospace">{formatNumber(r.balance)}</span>
                </li>
              {/each}
            </ol>
          {/if}
        </div>
      </div>
    </div>
  </div>
  <SharedGameComments loggedIn={isLoggedIn} refreshToken={commentRefreshToken} game="seotda" />
</div>

<style>
  .seotda-table {
    position: relative;
    background: linear-gradient(160deg, #1a4d3a 0%, #0f3328 100%);
    color: #f3f0e6;
    min-height: 280px;
    perspective: 800px;
  }
  .npc-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
    gap: clamp(0.25rem, 1.5vw, 0.75rem);
  }
  .npc-row .seat {
    min-width: 0;
  }
  .npc-row .seat > .fw-semibold {
    min-height: 1.5rem;
    white-space: nowrap;
  }
  .npc-row .cards {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: center;
    flex-wrap: nowrap;
    gap: 0.25rem;
  }
  .npc-row .hwatu-flip {
    flex: 0 1 3.5rem;
    width: min(3.5rem, calc((100% - 0.25rem) / 2));
    min-width: 0;
    margin-inline: 0;
  }
  .seat.folded {
    opacity: 0.45;
  }
  .seat.winner .hwatu-flip.flipped .front {
    box-shadow: 0 0 0 2px #f5c542;
  }
  .seat.revealing {
    transform: scale(1.06);
    transition: transform 0.25s ease;
  }
  .reveal-hint {
    color: #f5c542;
    font-weight: 600;
    animation: pulse 0.9s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.55;
    }
  }
  .hand-pop {
    animation: popIn 0.35s ease;
  }
  @keyframes popIn {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .result-action-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1050;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(2, 9, 7, 0.62);
    backdrop-filter: blur(3px);
    animation: resultBackdropIn 0.28s ease-out;
  }
  .result-action-layer {
    display: grid;
    justify-items: center;
    width: min(100%, 23rem);
    padding: 1.4rem;
    overflow: hidden;
    border: 2px solid #d8b24c;
    border-radius: 1.25rem;
    background:
      radial-gradient(circle at 50% 0, rgba(255, 215, 94, 0.24), transparent 45%),
      linear-gradient(150deg, #164b36, #071e17);
    color: #fff7d6;
    text-align: center;
    box-shadow: 0 20px 58px rgba(0, 0, 0, 0.52);
    animation: resultLayerIn 0.42s cubic-bezier(0.2, 0.82, 0.25, 1.18);
  }
  .result-action-label {
    color: #d9bd6b;
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.18em;
  }
  .result-action-title {
    margin-top: 0.2rem;
    color: #ffd75e;
    font-size: clamp(2rem, 10vw, 3rem);
    line-height: 1.15;
    text-shadow: 0 0 22px rgba(255, 215, 94, 0.42);
  }
  .result-action-title.loss {
    color: #ff9b9b;
    text-shadow: 0 0 22px rgba(255, 91, 91, 0.34);
  }
  .result-action-hand {
    margin-top: 0.25rem;
    color: #f6edca;
    font-size: 0.95rem;
    font-weight: 800;
  }
  .result-action-delta {
    margin-top: 0.75rem;
    color: #e9e3ce;
    font-size: clamp(1.35rem, 7vw, 1.8rem);
    font-weight: 900;
    line-height: 1.15;
  }
  .result-action-delta.win {
    color: #75e3a8;
    text-shadow: 0 0 18px rgba(62, 221, 136, 0.3);
  }
  .result-action-delta.loss {
    color: #ff9b9b;
    text-shadow: 0 0 18px rgba(255, 91, 91, 0.28);
  }
  .result-action-balance {
    margin-top: 0.25rem;
    color: #aebfb6;
    font-size: 0.78rem;
    font-weight: 700;
  }
  .result-action-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
    width: 100%;
    margin-top: 1.1rem;
  }
  .result-action-buttons .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 3rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  @keyframes resultBackdropIn {
    from {
      opacity: 0;
    }
  }
  @keyframes resultLayerIn {
    from {
      opacity: 0;
      transform: translateY(18px) scale(0.78);
    }
  }
  @media (max-width: 380px) {
    .result-action-buttons {
      grid-template-columns: 1fr;
    }
  }
  .ddaeng-value-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1070;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(3, 10, 8, 0.78);
    backdrop-filter: blur(5px);
  }
  .ddaeng-value-layer {
    position: relative;
    width: min(100%, 24rem);
    overflow: hidden;
    padding: 1.35rem;
    border: 2px solid #ffd75e;
    border-radius: 1.25rem;
    background:
      radial-gradient(circle at 50% 0, rgba(255, 215, 94, 0.3), transparent 42%),
      linear-gradient(150deg, #164b36, #071e17);
    color: #fff7d6;
    text-align: center;
    box-shadow: 0 0 45px rgba(255, 201, 55, 0.35);
    animation: ddaengValueEnter 0.48s cubic-bezier(0.2, 0.82, 0.25, 1.18);
  }
  .ddaeng-value-sparks {
    color: #ffd75e;
    font-size: 1.4rem;
    letter-spacing: 0.35rem;
    animation: ddaengValueSpark 1s ease-in-out infinite alternate;
  }
  .ddaeng-value-label {
    margin-top: 0.25rem;
    color: #d9bd6b;
    font-size: 0.76rem;
    font-weight: 900;
    letter-spacing: 0.18em;
  }
  .ddaeng-value-hand {
    display: block;
    margin: 0.25rem 0;
    color: #ffd75e;
    font-size: clamp(2rem, 10vw, 3.4rem);
    line-height: 1.1;
    text-shadow: 0 0 22px rgba(255, 215, 94, 0.5);
  }
  .ddaeng-value-winner {
    margin-bottom: 0.85rem;
    font-weight: 800;
  }
  .ddaeng-value-amounts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
    margin-bottom: 1rem;
  }
  .ddaeng-value-amounts span {
    padding: 0.65rem 0.4rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 0.75rem;
    background: rgba(0, 0, 0, 0.22);
    font-size: 0.82rem;
  }
  .ddaeng-value-amounts strong {
    display: block;
    color: #ffd75e;
    font-size: 1.05rem;
  }
  @keyframes ddaengValueEnter {
    from {
      opacity: 0;
      transform: translateY(18px) scale(0.72) rotate(-2deg);
    }
  }
  @keyframes ddaengValueSpark {
    from {
      opacity: 0.55;
      transform: scale(0.92);
    }
    to {
      opacity: 1;
      transform: scale(1.08);
    }
  }
  .share-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1060;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.68);
  }
  .share-panel {
    width: min(100%, 30rem);
    padding: 1.25rem;
    border-radius: 1rem;
    background: var(--bs-body-bg);
    color: var(--bs-body-color);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  }

  .hwatu-flip {
    display: inline-block;
    width: clamp(2.75rem, 10vw, 3.5rem);
    aspect-ratio: 5 / 7;
    height: auto;
    margin: 0 0.15rem;
    position: relative;
    transform-style: preserve-3d;
    transition: transform 0.45s ease;
    vertical-align: middle;
  }
  .hwatu-flip.flipped {
    transform: rotateY(180deg);
  }
  .hwatu-face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.35rem;
    font-weight: 700;
    font-size: 0.85rem;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  }
  .hwatu-face.back {
    background: #2a2a2a;
    color: #eee;
    border: 1px solid #444;
  }
  .hwatu-face.front {
    background: #f7f2e8;
    color: #1a1a1a;
    border: 1px solid #c9b896;
    transform: rotateY(180deg);
  }
  .hwatu-flip.gwang .front {
    color: #c0392b;
  }
  button.hwatu-flip {
    border: none;
    padding: 0;
    background: transparent;
    cursor: pointer;
  }
  .hwatu-flip.tap-hint {
    animation: wiggle 1.4s ease-in-out infinite;
  }
  @keyframes wiggle {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-3px);
    }
  }
  .hwatu-flip.tap-hint.flipped {
    animation: none;
  }
  .peel-tip {
    color: #f5c542;
    opacity: 0.9;
  }
  .peel-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1050;
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    touch-action: none;
  }
  .peel-sheet {
    text-align: center;
    color: #f3f0e6;
  }
  .peel-guide {
    font-size: 0.95rem;
    opacity: 0.9;
  }
  .peel-card {
    position: relative;
    width: min(56vw, 180px);
    aspect-ratio: 5 / 7;
    margin: 0 auto;
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
    user-select: none;
    touch-action: none;
    cursor: grab;
  }
  .peel-face {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f7f2e8;
    color: #1a1a1a;
    font-size: 3.2rem;
    font-weight: 800;
    border: 2px solid #c9b896;
    border-radius: 0.75rem;
  }
  .peel-cover {
    position: absolute;
    inset: 0;
    z-index: 2;
    will-change: transform;
  }
  .peel-cover.snapping {
    transition: transform 0.25s ease;
  }
  .peel-cover-inner {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #f7f2e8;
    border: 2px solid #555;
    border-radius: 0.75rem;
    color: #1a1a1a;
  }
  .peel-drag-hint {
    position: absolute;
    z-index: 3;
    left: 50%;
    bottom: 2.1rem;
    transform: translateX(-50%);
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    background: rgba(20, 20, 20, 0.78);
    color: white;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .action-effect {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 0.25rem;
    min-height: 1.75rem;
    padding: 0.2rem 0.65rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    color: #163a2f;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    font-size: 0.8rem;
    font-weight: 800;
    white-space: nowrap;
    animation: actionPop 0.28s ease;
  }
  .action-effect.raise {
    background: #dc3545;
    color: #fff;
  }
  .action-effect.fold {
    background: #495057;
    color: #fff;
  }
  .action-effect.thinking {
    opacity: 0.82;
    animation: pulse 0.8s ease-in-out infinite;
  }
  .spark-taunt {
    position: relative;
    z-index: 2;
    width: max-content;
    max-width: min(16rem, 70vw);
    margin: 0.4rem auto 0;
    padding: 0.45rem 0.7rem;
    border: 1px solid rgba(255, 210, 80, 0.8);
    border-radius: 0.75rem;
    background: rgba(18, 18, 18, 0.94);
    color: #ffd75e;
    font-size: 0.78rem;
    font-weight: 800;
    line-height: 1.35;
    animation: actionPop 0.28s ease;
  }
  @keyframes actionPop {
    from {
      transform: translateY(5px) scale(0.85);
      opacity: 0;
    }
  }
  .turn-action-layer {
    position: sticky;
    bottom: 0.75rem;
    z-index: 10;
    width: min(100%, 42rem);
    max-width: calc(100% - 1rem);
    margin: 1rem auto 0;
    padding: 0.7rem 0.8rem 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 1rem;
    background: rgba(9, 24, 19, 0.92);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
  }
  .turn-label {
    margin-bottom: 0.45rem;
    color: #f5c542;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-align: center;
  }
  .turn-bet-controls {
    margin-bottom: 0.65rem;
    padding-bottom: 0.65rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.16);
  }
  .turn-bet-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    margin-bottom: 0.45rem;
    color: #d8e1dc;
    font-size: 0.76rem;
  }
  .turn-bet-meta span:last-child {
    color: #aebcb5;
    white-space: nowrap;
  }
  .turn-bet-input-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .turn-bet-input-row label {
    margin-right: 0.1rem;
    color: #f3f0e6;
    font-size: 0.8rem;
    font-weight: 800;
  }
  .turn-bet-input {
    width: 6.5rem;
    background: rgba(255, 255, 255, 0.96);
    color: #212529;
  }
  .guide-panel {
    background: #f8f6f1;
    color: #212529;
  }
  .guide-list {
    font-size: 0.9rem;
  }
  .seotda-log {
    background: #f8f9fa;
    color: #212529;
  }

  :global([data-bs-theme='dark']) .guide-panel {
    background: #2b3035;
    border-color: #495057 !important;
    color: #e9ecef;
  }
  :global([data-bs-theme='dark']) .guide-panel .text-muted {
    color: #adb5bd !important;
  }
  :global([data-bs-theme='dark']) .guide-panel .badge {
    background: #495057 !important;
    color: #f8f9fa !important;
    border-color: #6c757d !important;
  }
  :global([data-bs-theme='dark']) .seotda-log {
    background: #212529;
    border-color: #495057 !important;
    color: #dee2e6;
  }

  .deal-curtain {
    position: fixed;
    z-index: 1090;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 46%, rgba(40, 128, 86, 0.42), transparent 38%),
      rgba(2, 25, 18, 0.94);
    color: #fff3bd;
  }

  .deal-stage {
    position: relative;
    width: min(92vw, 560px);
    height: min(72vh, 430px);
    overflow: hidden;
    border: 2px solid rgba(238, 194, 75, 0.72);
    border-radius: 1.4rem;
    background:
      repeating-linear-gradient(115deg, transparent 0 30px, rgba(255, 255, 255, 0.018) 30px 34px),
      #073b2a;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
  }

  .deal-deck {
    position: absolute;
    inset: 0;
  }

  .deal-deck i {
    --deal-x: 0px;
    --deal-y: -120px;
    position: absolute;
    top: 53%;
    left: 50%;
    width: 54px;
    aspect-ratio: 2 / 3;
    border: 2px solid #f0cf68;
    border-radius: 0.38rem;
    background: repeating-linear-gradient(45deg, #a31d22 0 7px, #5b090e 7px 14px);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.42);
    animation: dealCardFlight 4.8s cubic-bezier(0.25, 0.72, 0.3, 1) infinite;
    animation-delay: calc(var(--deal-index) * 0.17s);
  }

  .deal-deck i:nth-child(1) {
    --deal-x: -180px;
    --deal-y: -115px;
  }
  .deal-deck i:nth-child(2) {
    --deal-x: -115px;
    --deal-y: -115px;
  }
  .deal-deck i:nth-child(3) {
    --deal-x: 65px;
    --deal-y: -115px;
  }
  .deal-deck i:nth-child(4) {
    --deal-x: 130px;
    --deal-y: -115px;
  }
  .deal-deck i:nth-child(5) {
    --deal-x: -180px;
    --deal-y: 88px;
  }
  .deal-deck i:nth-child(6) {
    --deal-x: -115px;
    --deal-y: 88px;
  }
  .deal-deck i:nth-child(7) {
    --deal-x: 65px;
    --deal-y: 88px;
  }
  .deal-deck i:nth-child(8) {
    --deal-x: 130px;
    --deal-y: 88px;
  }

  .deal-copy {
    position: absolute;
    z-index: 2;
    top: 48%;
    left: 50%;
    width: min(82%, 320px);
    padding: 0.8rem 1rem;
    border: 1px solid rgba(238, 194, 75, 0.35);
    border-radius: 999px;
    background: rgba(1, 25, 17, 0.88);
    text-align: center;
    transform: translate(-50%, -50%);
  }

  .deal-copy strong {
    display: block;
    color: #ffd85e;
    font-size: 1.15rem;
    letter-spacing: 0.12em;
  }

  .deal-copy span {
    position: absolute;
    top: calc(100% + 0.65rem);
    left: 0;
    width: 100%;
    opacity: 0;
    font-size: 0.92rem;
    animation: dealCopyCycle 9s ease-in-out infinite;
  }

  .deal-copy span:nth-of-type(2) {
    animation-delay: 3s;
  }

  .deal-copy span:nth-of-type(3) {
    animation-delay: 6s;
  }

  @keyframes dealCardFlight {
    0%,
    12% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(-10deg) scale(0.88);
    }
    22% {
      opacity: 1;
    }
    42% {
      transform: translate(calc(-50% + 10px), calc(-50% - 5px)) rotate(12deg) scale(1);
    }
    72% {
      opacity: 1;
      transform: translate(calc(-50% + var(--deal-x)), calc(-50% + var(--deal-y))) rotate(-3deg);
    }
    92%,
    100% {
      opacity: 0;
      transform: translate(calc(-50% + var(--deal-x)), calc(-50% + var(--deal-y))) rotate(-3deg);
    }
  }

  @keyframes dealCopyCycle {
    0%,
    8% {
      opacity: 0;
      transform: translateY(5px);
    }
    14%,
    28% {
      opacity: 1;
      transform: translateY(0);
    }
    34%,
    100% {
      opacity: 0;
      transform: translateY(-5px);
    }
  }

  @media (max-width: 575.98px) {
    .seotda-table {
      padding: 0.75rem !important;
    }
    .npc-row {
      gap: 0.2rem;
    }
    .npc-row .seat > .fw-semibold {
      font-size: 0.9rem;
    }
    .npc-row .seat > .small {
      font-size: 0.75rem;
    }
    .npc-row .action-effect {
      max-width: 100%;
      padding-inline: 0.35rem;
      overflow: hidden;
      font-size: 0.68rem;
      text-overflow: ellipsis;
    }
    .turn-action-layer {
      bottom: 0.4rem;
      max-width: 100%;
      padding: 0.6rem;
    }
    .turn-bet-meta {
      gap: 0.35rem;
      font-size: 0.68rem;
    }
    .turn-bet-input-row {
      gap: 0.3rem;
    }
    .turn-bet-input-row .btn {
      padding-inline: 0.55rem;
    }
  }
</style>
