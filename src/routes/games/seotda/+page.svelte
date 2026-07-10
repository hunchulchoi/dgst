<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PageData } from './$types';

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
    lastAction: string | null;
    needsAction?: boolean;
    cards: SeotdaCard[];
    handName: string | null;
  }

  interface SeotdaRound {
    phase: string;
    pot: number;
    currentBet: number;
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
  let rankList = $state<Array<{ nickname: string; balance: number }>>(data.rank ?? []);
  let round = $state<SeotdaRound | null>((data.round as SeotdaRound | null) ?? null);
  let busy = $state(false);
  let message = $state('');
  let oopsInfo = $state<{ waiting?: boolean } | null>(null);

  /** 쇼다운 연출: 아직 안 깐 NPC id 집합 */
  let hiddenNpcIds = $state<Set<string>>(new Set());
  /** 유저 패 딜 플립 */
  let userCardsFlipped = $state(true);
  /** 연출 끝난 뒤에만 승패/다음판 표시 */
  let revealDone = $state(true);
  /** 지금 까는 좌석 (하이라이트) */
  let revealingId = $state<string | null>(null);
  /** 족보 안내 접기 */
  let guideOpen = $state(false);

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

  const formatNumber = (value: number | null | undefined): string => {
    if (value == null || Number.isNaN(value)) return '0';
    return Number(value).toLocaleString('ko-KR');
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
    round?.winnerIds?.length
      ? round.winnerIds
      : round?.winnerId
        ? [round.winnerId]
        : []
  );
  const isDraw = $derived(isShowdown && winnerIds.length > 1);
  const userWon = $derived(winnerIds.includes('user') && !isDraw);

  function clearTimers() {
    for (const t of timers) clearTimeout(t);
    timers = [];
  }

  onDestroy(() => clearTimers());

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

  /** 새 판 시작 시 내 패 플립 */
  function startDealFlip() {
    clearTimers();
    userCardsFlipped = false;
    revealDone = true;
    hiddenNpcIds = new Set();
    revealingId = null;
    const t = setTimeout(() => {
      userCardsFlipped = true;
    }, 280);
    timers.push(t);
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
      startShowdownReveal(next);
    } else if (isNewDeal) {
      startDealFlip();
    } else if (!nowShowdown) {
      hiddenNpcIds = new Set();
      revealDone = true;
      revealingId = null;
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
      if (body.action === 'ack' || body.action === 'start') {
        // 랭킹만 갱신
        try {
          const r = await fetch(`/games/seotda?_=${Date.now()}`, { cache: 'no-store' });
          if (r.ok) {
            const jj = await r.json();
            rankList = jj.rank ?? rankList;
            oopsInfo = jj.oopsInfo ?? null;
          }
        } catch {
          /* ignore */
        }
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
    return post({ action: 'act', move });
  }

  function nextRound() {
    return post({ action: 'ack' });
  }
</script>

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
                disabled={busy || balance < 10}
                onclick={startRound}
              >
                판 시작 (판돈 10)
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
                          <span class="hwatu-face front">{open ? cardText(card) : '?'}</span>
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
                      <span
                        class="hwatu-flip"
                        class:flipped={userCardsFlipped}
                        class:gwang={userCardsFlipped && card.gwang}
                        style="transition-delay: {i * 120}ms"
                      >
                        <span class="hwatu-face back">?</span>
                        <span class="hwatu-face front open">{cardText(card)}</span>
                      </span>
                    {/each}
                  </div>
                  {#if userSeat.handName && userCardsFlipped}
                    <div class="badge text-bg-primary mb-2 hand-pop">{userSeat.handName}</div>
                  {/if}
                </div>
              {/if}
            </div>

            {#if canAct}
              <div class="d-flex gap-2 justify-content-center flex-wrap mb-3">
                <button class="btn btn-outline-secondary" disabled={busy} onclick={() => act('die')}
                  >다이</button
                >
                <button class="btn btn-outline-primary" disabled={busy} onclick={() => act('call')}
                  >콜</button
                >
                <button class="btn btn-danger" disabled={busy} onclick={() => act('raise')}
                  >레이즈</button
                >
              </div>
            {/if}

            {#if isShowdown && revealDone}
              <div class="text-center mb-3 result-banner">
                <p class="mb-2 fs-5 fw-semibold">
                  {#if isDraw}무승부! 팟 분배
                  {:else if userWon}이겼다!
                  {:else}졌다…{/if}
                </p>
                <button class="btn btn-primary" disabled={busy || balance < 10} onclick={nextRound}>
                  다음 판
                </button>
              </div>
            {/if}

            <div class="log small bg-light rounded-3 p-2" style="max-height: 140px; overflow: auto;">
              {#each round.log as line, i (i)}
                <div>{line}</div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="col-lg-4">
      <div class="card shadow rounded-4 border-0">
        <div class="card-body">
          <h5 class="mb-3">섯다 Top10</h5>
          {#if rankList.length === 0}
            <p class="text-muted small mb-0">아직 랭킹 없음</p>
          {:else}
            <ol class="list-group list-group-numbered list-group-flush">
              {#each rankList as r, i (r.nickname + i)}
                <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                  <span>{r.nickname}</span>
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
    width: 2.5rem;
    height: 3.4rem;
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
  .bubble {
    display: inline-block;
    margin-top: 0.25rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
  }
  .guide-panel {
    background: #f8f6f1;
  }
  .guide-list {
    font-size: 0.9rem;
  }
</style>
