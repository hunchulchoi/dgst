<script>
  import { onMount } from 'svelte';
  let { data } = $props();
  let balance = $state(data.balance || 0);
  let bet = $state(10);
  let spinning = $state(false);
  let reels = $state(['-', '-', '-']);
  let message = $state('');
  let rankList = $state([]);

  async function refreshBalance() {
    const res = await fetch('/games/slot');
    if (res.ok) {
      const j = await res.json();
      balance = j.balance;
    }
  }

  async function loadRank() {
    const res = await fetch('/games/slot?rank=1');
    if (res.ok) {
      const j = await res.json();
      rankList = j.rank || [];
    }
  }

  async function play() {
    try {
      spinning = true;
      message = '';
      const res = await fetch('/games/slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bet: Number(bet) })
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j?.message || '실패');
      reels = j.reels;
      balance = j.balance;
      const sign = j.delta >= 0 ? '+' : '';
      message = `${sign}${j.delta} (${j.payout})`;
      await loadRank();
    } catch (e) {
      message = e.message || '오류';
    } finally {
      spinning = false;
    }
  }

  onMount(loadRank);
</script>

<main class="container my-4">
  <div class="row justify-content-center">
    <div class="col-md-6 order-2 order-md-1">
      <div class="card shadow rounded-4">
        <div class="card-body">
          <h4 class="mb-3">슬롯머신</h4>
          <div class="d-flex justify-content-between mb-2">
            <div>보유 점수: <strong>{balance}</strong></div>
            <div>
              <input type="number" min="1" class="form-control form-control-sm d-inline-block" style="width: 120px;" bind:value={bet} />
            </div>
          </div>
          <div class="slot border rounded-3 p-3 text-center mb-3">
            <div class="display-4">{reels[0]} {reels[1]} {reels[2]}</div>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-primary" disabled={spinning} on:click={play}>
              {spinning ? '스핀 중...' : '스핀'}
            </button>
            <button class="btn btn-secondary" on:click={refreshBalance}>새로고침</button>
          </div>
          {#if message}
          <div class="mt-3 fw-bold">{message}</div>
          {/if}
        </div>
      </div>
    </div>
    <div class="col-md-4 order-1 order-md-2 mb-3 mb-md-0">
      <div class="card shadow rounded-4">
        <div class="card-body">
          <h5 class="mb-3">랭킹 Top 10</h5>
          <ol class="list-group list-group-numbered">
            {#each rankList as r, i}
              <li class="list-group-item d-flex justify-content-between align-items-center">
                <span>{r.nickname}</span>
                <span class="fw-bold">{r.balance}</span>
              </li>
            {/each}
          </ol>
        </div>
      </div>
    </div>
  </div>
</main>

<style>
  .slot {
    background: var(--bs-secondary-bg);
  }
</style>


