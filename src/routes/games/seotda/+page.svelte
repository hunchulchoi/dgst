<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ko } from 'date-fns/locale';
  import type { PageData } from './$types';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import { ANTE, dynamicAnte, minRaisePay } from './seotdaEngine.js';
  import { MAX_BET_ANTE_MULTIPLIER, MAX_POT, MAX_TOTAL_BET } from './seotdaRound.js';
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
    needsAction?: boolean;
    cards: SeotdaCard[];
    handName: string | null;
  }

  interface SeotdaRound {
    phase: string;
    pot: number;
    currentBet: number;
    antePaid: number;
    log: string[];
    winnerId: string | null;
    winnerIds?: string[];
    showdown: boolean;
    userFolded?: boolean;
    revealNpcHands?: boolean;
    seats: SeotdaSeat[];
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
  /** 지금 까는 좌석 (하이라이트) */
  let revealingId = $state<string | null>(null);
  /** 족보 안내 접기 */
  let guideOpen = $state(false);
  /** 레이즈에 넣을 칩 */
  let raiseBet = $state(20);

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
  const toCall = $derived(userSeat ? Math.max(0, (round?.currentBet ?? 0) - userSeat.contrib) : 0);
  const roundAnte = $derived(round?.antePaid ?? dynamicAnte(balance));
  const minRaise = $derived(minRaisePay(toCall, roundAnte));
  const maxRaise = $derived(
    userSeat
      ? Math.min(
          userSeat.chips,
          Math.max(0, roundAnte * MAX_BET_ANTE_MULTIPLIER - userSeat.contrib),
          Math.max(0, MAX_TOTAL_BET - (userSeat.totalContrib ?? userSeat.contrib)),
          Math.max(0, MAX_POT - (round?.pot ?? 0))
        )
      : 0
  );

  $effect(() => {
    if (!canAct) return;
    const min = minRaise;
    const max = maxRaise;
    if (raiseBet < min) raiseBet = Math.min(min, max);
    else if (raiseBet > max) raiseBet = max;
  });

  function clearTimers() {
    for (const t of timers) clearTimeout(t);
    timers = [];
  }

  function clearTopupRefreshTimer() {
    if (topupRefreshTimer) clearTimeout(topupRefreshTimer);
    topupRefreshTimer = null;
  }

  function scheduleTopupRefresh(delayMs: number) {
    clearTopupRefreshTimer();
    topupRefreshTimer = setTimeout(() => void refreshGameState(), Math.max(250, delayMs));
  }

  onMount(() => {
    if (balance < ANTE) void refreshGameState();
  });

  onDestroy(() => {
    clearTimers();
    clearTopupRefreshTimer();
  });

  function cardText(card: SeotdaCard): string {
    if (card.hidden || card.month === 0) return '?';
    return `${card.month}${card.gwang ? '광' : ''}`;
  }

  function npcCardVisible(npc: SeotdaSeat, card: SeotdaCard): boolean {
    if (npc.folded) return false;
    if (!isShowdown) return false;
    if (round?.revealNpcHands === false || userSeat?.folded) return false;
    if (hiddenNpcIds.has(npc.id)) return false;
    return !card.hidden && card.month > 0;
  }

  /**
   * 쇼다운 진입 시 NPC 패를 한 명씩 까기 (유저 다이면 스킵)
   * @param {SeotdaRound} r
   */
  function startShowdownReveal(r: SeotdaRound) {
    clearTimers();
    const userDead = !!r.seats.find((s) => s.id === 'user')?.folded || r.revealNpcHands === false;
    if (userDead) {
      hiddenNpcIds = new Set(r.seats.filter((s) => s.isNpc).map((s) => s.id));
      revealDone = true;
      revealingId = null;
      return;
    }
    const aliveNpcs = r.seats.filter((s) => s.isNpc && !s.folded);
    hiddenNpcIds = new Set(aliveNpcs.map((s) => s.id));
    revealDone = aliveNpcs.length === 0;
    revealingId = null;

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

    if (nowShowdown && fromShowdownAct) {
      holeRevealed = true;
      peelOpen = false;
      startShowdownReveal(next);
    } else if (isNewDeal) {
      startDealFlip();
    } else if (!nowShowdown) {
      hiddenNpcIds = new Set();
      revealDone = true;
      revealingId = null;
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
        scheduleTopupRefresh(Number(oopsInfo.remainingMs ?? 5_000) + 250);
      } else {
        clearTopupRefreshTimer();
      }
    } catch (err) {
      console.error('[seotda refresh]', err);
      if (balance < ANTE) scheduleTopupRefresh(5_000);
    } finally {
      topupRefreshRunning = false;
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
      balance = Number(j.balance ?? balance);
      const next = (j.round as SeotdaRound | null) ?? null;
      const hitShowdown = !!(next && (next.showdown || next.phase === 'showdown'));
      applyRound(next, body.action === 'act' && hitShowdown);
      if (body.action === 'ack' || body.action === 'start' || hitShowdown) {
        // 랭킹·오늘 통계 갱신
        await refreshGameState();
      }
    } catch (err) {
      console.error('[seotda post]', err);
      message = '네트워크 오류';
    } finally {
      busy = false;
    }
  }

  function startRound() {
    return post({ action: 'start' });
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

  function nextRound() {
    return post({ action: 'ack' });
  }
</script>

<svelte:head>
  {#each HWATU_CARD_URLS as href (href)}
    <link rel="preload" as="image" {href} />
  {/each}
</svelte:head>

<div class="container py-3 py-md-4 seotda-page">
  <div class="row g-3">
    <div class="col-lg-8">
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

          {#if !round}
            <div class="text-center py-5">
              <p class="mb-3">아귀 · 고니 · 정마담 이 기다림.</p>
              <button
                class="btn btn-primary btn-lg rounded-pill px-4"
                disabled={busy}
                onclick={startRound}
              >
                판 시작 (판돈 {formatNumber(roundAnte)})
              </button>
            </div>
          {:else}
            <div class="seotda-table rounded-4 p-3 mb-3">
              <div class="npc-row d-flex justify-content-around mb-4">
                {#each npcs as npc (npc.id)}
                  <div
                    class="seat text-center"
                    class:folded={npc.folded}
                    class:winner={revealDone && winnerIds.includes(npc.id)}
                    class:revealing={revealingId === npc.id}
                  >
                    <div class="fw-semibold">{npc.name}</div>
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
                    {#if npc.handName && !hiddenNpcIds.has(npc.id) && isShowdown && !npc.folded && round.revealNpcHands !== false && !userSeat?.folded}
                      <div class="badge text-bg-dark hand-pop">{npc.handName}</div>
                    {/if}
                    {#if npc.lastAction && !isShowdown}
                      <div class="bubble small">{npc.lastAction}</div>
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
                  <div class="fw-semibold">나</div>
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

            {#if canAct}
              <div class="bet-box rounded-3 border p-3 mb-3">
                <div class="d-flex justify-content-between align-items-center mb-2 small bet-meta">
                  <span>콜 {formatNumber(toCall)} · 레이즈 최소 {formatNumber(minRaise)}</span>
                  <span class="bet-meta-sub">보유 {formatNumber(maxRaise)}</span>
                </div>
                <div class="d-flex gap-2 align-items-center mb-2 flex-wrap">
                  <label class="small mb-0" for="raise-bet">레이즈</label>
                  <input
                    id="raise-bet"
                    class="form-control form-control-sm bet-input"
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
                    class="btn btn-sm btn-outline-secondary"
                    onclick={() => setRaisePreset('min')}>최소</button
                  >
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    onclick={() => setRaisePreset('plus')}>+{formatNumber(roundAnte * 2)}</button
                  >
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    onclick={() => setRaisePreset('plus100')}
                    >+{formatNumber(roundAnte * 10)}</button
                  >
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    onclick={() => setRaisePreset('half')}>절반</button
                  >
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    onclick={() => setRaisePreset('all')}>최대</button
                  >
                </div>
                <div class="d-flex gap-2 justify-content-center flex-wrap">
                  <button
                    class="btn btn-outline-secondary"
                    disabled={busy}
                    onclick={() => act('die')}>다이</button
                  >
                  <button
                    class="btn btn-outline-primary"
                    disabled={busy}
                    onclick={() => act('call')}
                  >
                    {toCall === 0 ? '체크' : `콜 (${formatNumber(toCall)})`}
                  </button>
                  <button
                    class="btn btn-danger"
                    disabled={busy || maxRaise < minRaise}
                    onclick={() => act('raise')}
                  >
                    레이즈 ({formatNumber(Math.min(raiseBet, maxRaise))})
                  </button>
                </div>
              </div>
            {/if}

            {#if isShowdown && revealDone}
              <div class="text-center mb-3 result-banner">
                <p class="mb-2 fs-5 fw-semibold">
                  {#if isDraw}무승부! 팟 분배
                  {:else if userWon}이겼다!
                  {:else}졌다…{/if}
                </p>
                <button class="btn btn-primary" disabled={busy} onclick={nextRound}>
                  다음 판
                </button>
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

    <div class="col-lg-4">
      <div class="card shadow rounded-4 border-0 mb-3">
        <div class="card-body py-3">
          <div class="d-flex justify-content-between small">
            <span>오늘 참여자 <strong>{formatNumber(todayStats.users)}</strong></span>
            <span>오늘 판수 <strong>{formatNumber(todayStats.hands)}</strong></span>
          </div>
        </div>
      </div>
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
</div>

<style>
  .seotda-table {
    background: linear-gradient(160deg, #1a4d3a 0%, #0f3328 100%);
    color: #f3f0e6;
    min-height: 280px;
    perspective: 800px;
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
  .result-banner {
    animation: popIn 0.4s ease;
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
  .bubble {
    display: inline-block;
    margin-top: 0.25rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
  }
  .guide-panel {
    background: #f8f6f1;
    color: #212529;
  }
  .guide-list {
    font-size: 0.9rem;
  }
  .bet-box {
    background: #faf8f4;
    color: #212529;
  }
  .bet-meta-sub {
    color: #5c636a;
  }
  .bet-input {
    width: 6.5rem;
  }
  .seotda-log {
    background: #f8f9fa;
    color: #212529;
  }

  :global([data-bs-theme='dark']) .bet-box {
    background: #2b3035;
    border-color: #495057 !important;
    color: #e9ecef;
  }
  :global([data-bs-theme='dark']) .bet-meta-sub {
    color: #adb5bd;
  }
  :global([data-bs-theme='dark']) .bet-box .form-control {
    background: #212529;
    border-color: #495057;
    color: #f8f9fa;
  }
  :global([data-bs-theme='dark']) .bet-box .btn-outline-secondary {
    color: #dee2e6;
    border-color: #6c757d;
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
</style>
