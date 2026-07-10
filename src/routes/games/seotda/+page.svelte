<script lang="ts">
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
    showdown: boolean;
    seats: SeotdaSeat[];
  }

  let { data }: SeotdaPageProps = $props();

  let balance = $state(Number(data.balance ?? 0));
  let rankList = $state<Array<{ nickname: string; balance: number }>>(data.rank ?? []);
  let round = $state<SeotdaRound | null>((data.round as SeotdaRound | null) ?? null);
  let busy = $state(false);
  let message = $state('');
  let oopsInfo = $state<{ waiting?: boolean } | null>(null);

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
      !busy
  );
  const isShowdown = $derived(!!round && (round.showdown || round.phase === 'showdown'));

  function cardText(card: SeotdaCard): string {
    if (card.hidden || card.month === 0) return '?';
    return `${card.month}${card.gwang ? '광' : ''}`;
  }

  async function refresh() {
    try {
      const res = await fetch(`/games/seotda?_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      balance = Number(j.balance ?? 0);
      rankList = j.rank ?? [];
      round = j.round ?? null;
      oopsInfo = j.oopsInfo ?? null;
    } catch (err) {
      console.error('[seotda refresh]', err);
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
      round = j.round ?? null;
      if (body.action === 'ack' || (j.round && j.round.showdown)) {
        await refresh();
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

  function ack() {
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

          <p class="small text-muted mb-3">
            NPC 3명과 라이트 섯다. 다이 / 콜 / 레이즈. 특수족보 없음. 판돈은 섯다 전용 점수.
          </p>

          {#if message}
            <div class="alert alert-warning py-2">{message}</div>
          {/if}

          {#if !round}
            <div class="text-center py-5">
              <p class="mb-3">허세왕 · 냉정 · 도박사 가 기다림.</p>
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
                  <div class="seat text-center" class:folded={npc.folded} class:winner={round.winnerId === npc.id}>
                    <div class="fw-semibold">{npc.name}</div>
                    <div class="small text-muted">{formatNumber(npc.chips)}점</div>
                    <div class="cards my-2">
                      {#each npc.cards as card, i (i)}
                        <span class="hwatu" class:gwang={card.gwang && !card.hidden}>{cardText(card)}</span>
                      {/each}
                    </div>
                    {#if npc.handName && isShowdown}
                      <div class="badge text-bg-dark">{npc.handName}</div>
                    {/if}
                    {#if npc.lastAction}
                      <div class="bubble small">{npc.lastAction}</div>
                    {/if}
                  </div>
                {/each}
              </div>

              <div class="pot text-center mb-4">
                <div class="display-6 fw-bold">{formatNumber(round.pot)}</div>
                <div class="small text-muted">팟 · 현재 벳 {formatNumber(round.currentBet)}</div>
              </div>

              {#if userSeat}
                <div class="seat user-seat text-center" class:folded={userSeat.folded} class:winner={round.winnerId === 'user'}>
                  <div class="fw-semibold">나</div>
                  <div class="small text-muted">{formatNumber(userSeat.chips)}점</div>
                  <div class="cards my-2">
                    {#each userSeat.cards as card, i (i)}
                      <span class="hwatu open" class:gwang={card.gwang}>{cardText(card)}</span>
                    {/each}
                  </div>
                  {#if userSeat.handName}
                    <div class="badge text-bg-primary mb-2">{userSeat.handName}</div>
                  {/if}
                </div>
              {/if}
            </div>

            {#if canAct}
              <div class="d-flex gap-2 justify-content-center flex-wrap mb-3">
                <button class="btn btn-outline-secondary" disabled={busy} onclick={() => act('die')}>다이</button>
                <button class="btn btn-outline-primary" disabled={busy} onclick={() => act('call')}>콜</button>
                <button class="btn btn-danger" disabled={busy} onclick={() => act('raise')}>레이즈</button>
              </div>
            {/if}

            {#if isShowdown}
              <div class="text-center mb-3">
                <p class="mb-2">
                  {#if round.winnerId === 'user'}이겼다!{:else}졌다…{/if}
                </p>
                <button class="btn btn-primary" disabled={busy} onclick={ack}>다음 판</button>
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
  }
  .seat.folded {
    opacity: 0.45;
  }
  .seat.winner .hwatu {
    box-shadow: 0 0 0 2px #f5c542;
  }
  .hwatu {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 3.2rem;
    margin: 0 0.15rem;
    border-radius: 0.35rem;
    background: #2a2a2a;
    color: #eee;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .hwatu.open {
    background: #f7f2e8;
    color: #1a1a1a;
    border: 1px solid #c9b896;
  }
  .hwatu.gwang {
    color: #c0392b;
  }
  .bubble {
    display: inline-block;
    margin-top: 0.25rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
  }
</style>
