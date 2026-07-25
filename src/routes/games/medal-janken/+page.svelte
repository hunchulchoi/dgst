<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { ko } from 'date-fns/locale';
  import GameRankingRow from '$lib/components/GameRankingRow.svelte';
  import SharedGameComments from '$lib/components/SharedGameComments.svelte';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import { swalFire } from '$lib/util/swal.js';
  import type { PageData } from './$types';
  import { buildMedalJankenResultComment } from './medalJankenComments.js';

  type RankRow = {
    email: string;
    nickname: string;
    balance: number;
    updatedAt?: string | null;
    photo?: string | null;
  };

  type RoundMessage = {
    type: 'medal-janken:round';
    balance: number;
    bet: number;
    playerChoice: 'rock' | 'scissors' | 'paper';
    cpuChoice: 'rock' | 'scissors' | 'paper';
    multiplier: number;
  };

  type SettlementResult = {
    balance: number;
    outcome: 'win' | 'lose' | 'draw';
    multiplier: number;
    payout: number;
    delta: number;
    rank?: RankRow[];
    todayStats?: { hands: number; users: number };
  };

  let { data }: { data: PageData } = $props();
  let balance = $state(untrack(() => Number(data.balance ?? 1000)));
  let rank = $state<RankRow[]>(untrack(() => (data.rank ?? []) as RankRow[]));
  let todayStats = $state(untrack(() => data.todayStats ?? { hands: 0, users: 0 }));
  let iframe = $state<HTMLIFrameElement | null>(null);
  let gameHeight = $state(900);
  let settling = $state(false);
  let commentRefreshToken = $state(0);

  const loggedIn = $derived(Boolean(data.session?.user?.email));
  const currentEmail = $derived(data.session?.user?.email ?? '');

  function formatNumber(value: number) {
    return new Intl.NumberFormat('ko-KR').format(value);
  }

  function formatRankAt(value: string | null | undefined) {
    return value ? formatRelativeTime(value, { locale: ko, addSuffix: true }) : '';
  }

  function syncGame() {
    iframe?.contentWindow?.postMessage(
      {
        type: 'medal-janken:sync',
        medals: balance,
        loggedIn
      },
      window.location.origin
    );
  }

  async function refreshSummary(sync = true) {
    if (!loggedIn) return;
    const response = await fetch('/games/medal-janken/api', { cache: 'no-store' });
    if (!response.ok) return;
    const result = await response.json();
    balance = Number(result.balance ?? balance);
    rank = Array.isArray(result.rank) ? result.rank : rank;
    todayStats = result.todayStats ?? todayStats;
    if (sync) syncGame();
  }

  async function writeResultComment(result: SettlementResult, round: RoundMessage) {
    const content = buildMedalJankenResultComment(result, round);
    if (!content) return;

    try {
      const form = new FormData();
      form.set('game', 'medal-janken');
      form.set('content', content);
      const response = await fetch('/games/medal-janken/comment', {
        method: 'POST',
        body: form
      });
      const commentResult = await response.json().catch(() => ({}));
      if (!response.ok) return;

      commentRefreshToken += 1;
      const rewardBalance = Number(commentResult.rewardBalance);
      if (commentResult.rewardGiven && Number.isFinite(rewardBalance)) {
        balance = rewardBalance;
        await refreshSummary(false);
      }
    } catch (error) {
      console.error('[medal-janken auto comment]', error);
    }
  }

  async function settleRound(round: RoundMessage) {
    if (!loggedIn) {
      balance = Math.max(0, Number(round.balance ?? balance));
      return;
    }
    if (settling) return;
    settling = true;
    try {
      const response = await fetch('/games/medal-janken/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bet: round.bet,
          playerChoice: round.playerChoice,
          cpuChoice: round.cpuChoice,
          multiplier: round.multiplier
        })
      });
      const result = (await response.json().catch(() => ({}))) as SettlementResult & {
        message?: string;
      };
      if (!response.ok) throw new Error(result?.message ?? '게임 정산에 실패했습니다.');
      balance = Number(result.balance ?? balance);
      rank = Array.isArray(result.rank) ? result.rank : rank;
      todayStats = result.todayStats ?? todayStats;
      await writeResultComment(result, round);
    } catch (error) {
      await swalFire({
        icon: 'error',
        title: error instanceof Error ? error.message : '게임 정산에 실패했습니다.',
        toast: true,
        position: 'center',
        showConfirmButton: false,
        timer: 2600
      });
      await refreshSummary(false);
    } finally {
      settling = false;
      syncGame();
    }
  }

  function applyCommentReward(reward: { amount: number; balance: number }) {
    balance = reward.balance;
    commentRefreshToken += 1;
    syncGame();
    void refreshSummary();
  }

  onMount(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframe?.contentWindow) return;
      if (event.data?.type === 'medal-janken:ready') {
        syncGame();
      } else if (event.data?.type === 'medal-janken:height') {
        gameHeight = Math.min(1100, Math.max(720, Number(event.data.height) || 900));
      } else if (event.data?.type === 'medal-janken:round') {
        void settleRound(event.data as RoundMessage);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  });
</script>

<svelte:head>
  <title>메달 짱껨보 | dgst.me</title>
  <meta name="description" content="CPU 손을 멈추고 룰렛 배수에 도전하는 레트로 메달 짱껨보 게임" />
</svelte:head>

<div class="container py-3 py-md-4 medal-janken-page">
  <div class="game-heading mb-3">
    <div>
      <span class="eyebrow">90'S MEDAL ARCADE</span>
      <h1>메달 짱껨보</h1>
      <p>CPU 손이 바뀌는 순간을 노려 룰렛 잭팟에 도전하세요.</p>
    </div>
    <div class="heading-stats" aria-label="메달 짱껨보 현황">
      <span>내 메달 <b>{formatNumber(balance)}</b></span>
      <span>오늘 <b>{formatNumber(todayStats.hands)}판</b></span>
      <span>참여 <b>{formatNumber(todayStats.users)}명</b></span>
    </div>
  </div>

  <div class="row g-3 align-items-start">
    <div class="col-lg-8 order-2 order-lg-1">
      <section class="game-card">
        <iframe
          bind:this={iframe}
          src="/games/medal-janken/index.html"
          title="메달 짱껨보 게임기"
          style:height={`${gameHeight}px`}
          onload={syncGame}
          scrolling="no"
          allow="autoplay"
        ></iframe>
        {#if settling}
          <div class="settling-badge" role="status">메달 정산 중…</div>
        {/if}
      </section>
      {#if !loggedIn}
        <p class="login-notice">
          게스트 게임은 이 브라우저에서만 진행됩니다. 로그인하면 메달과 랭킹이 저장됩니다.
        </p>
      {/if}
    </div>

    <aside class="col-lg-4 order-1 order-lg-2">
      <section class="ranking-card">
        <div class="ranking-head">
          <div>
            <span>HALL OF FAME</span>
            <h2>🏆 메달 Top 10</h2>
          </div>
          <button type="button" onclick={() => void refreshSummary()} disabled={!loggedIn}>
            새로고침
          </button>
        </div>
        {#if rank.length}
          <ol class="ranking-list">
            {#each rank as row, index (row.email)}
              <GameRankingRow
                {index}
                nickname={row.nickname}
                photo={row.photo}
                score={`${formatNumber(row.balance)}개`}
                meta={formatRankAt(row.updatedAt)}
                current={row.email === currentEmail}
              />
            {/each}
          </ol>
        {:else}
          <p class="empty-ranking">첫 순위의 주인공이 되어 보세요.</p>
        {/if}
      </section>

      <section class="rules-card">
        <h2>게임 방법</h2>
        <ol>
          <li>10개부터 보유 메달까지 자유롭게 베팅</li>
          <li>CPU 손이 도는 중 가위·바위·보 선택</li>
          <li>승리하면 룰렛 배수만큼 메달 획득</li>
        </ol>
      </section>
    </aside>
  </div>

  <div class="row g-3">
    <div class="col-lg-8">
      <SharedGameComments
        {loggedIn}
        refreshToken={commentRefreshToken}
        game="medal-janken"
        onReward={applyCommentReward}
      />
    </div>
  </div>
</div>

<style>
  .medal-janken-page {
    --arcade-red: #dc2626;
    --arcade-yellow: #facc15;
  }

  .game-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border: 1px solid color-mix(in srgb, var(--arcade-red) 38%, transparent);
    border-radius: 1rem;
    color: #fff7d6;
    background:
      radial-gradient(circle at 85% 0%, rgb(220 38 38 / 28%), transparent 40%),
      linear-gradient(145deg, #181818, #090909);
    box-shadow: 0 0.65rem 1.8rem rgb(0 0 0 / 16%);
  }

  .game-heading h1 {
    margin: 0.15rem 0 0.25rem;
    font-size: clamp(1.65rem, 5vw, 2.4rem);
    font-weight: 900;
    letter-spacing: -0.06em;
  }

  .game-heading p {
    margin: 0;
    color: rgb(255 255 255 / 68%);
    font-size: 0.9rem;
  }

  .eyebrow {
    color: var(--arcade-yellow);
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.18em;
  }

  .heading-stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: end;
    gap: 0.4rem;
  }

  .heading-stats span {
    padding: 0.38rem 0.55rem;
    border: 1px solid rgb(255 255 255 / 13%);
    border-radius: 999px;
    font-size: 0.75rem;
    background: rgb(0 0 0 / 32%);
    white-space: nowrap;
  }

  .heading-stats b {
    color: var(--arcade-yellow);
  }

  .game-card {
    position: relative;
    overflow: hidden;
    border: 1px solid rgb(220 38 38 / 26%);
    border-radius: 1.15rem;
    background: #050505;
    box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 18%);
  }

  .game-card iframe {
    display: block;
    width: 100%;
    min-height: 720px;
    border: 0;
    background: #050505;
  }

  .settling-badge {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    padding: 0.45rem 0.7rem;
    border-radius: 999px;
    color: #fff7d6;
    font-size: 0.72rem;
    font-weight: 800;
    background: rgb(0 0 0 / 78%);
    box-shadow: 0 0 0 1px rgb(250 204 21 / 42%);
  }

  .login-notice {
    margin: 0.75rem 0 0;
    padding: 0.75rem 0.9rem;
    border-radius: 0.75rem;
    color: #713f12;
    font-size: 0.82rem;
    background: #fef3c7;
  }

  .ranking-card,
  .rules-card {
    padding: 1rem;
    border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
    border-radius: 1rem;
    background: var(--bs-body-bg, white);
    box-shadow: 0 0.45rem 1.4rem rgb(0 0 0 / 10%);
  }

  .ranking-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.45rem;
  }

  .ranking-head span {
    color: #dc2626;
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.14em;
  }

  .ranking-head h2,
  .rules-card h2 {
    margin: 0.12rem 0 0;
    font-size: 1.02rem;
    font-weight: 900;
  }

  .ranking-head button {
    padding: 0.35rem 0.55rem;
    border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    border-radius: 0.5rem;
    color: inherit;
    font-size: 0.68rem;
    background: transparent;
  }

  .ranking-head button:disabled {
    opacity: 0.4;
  }

  .ranking-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .empty-ranking {
    margin: 0;
    padding: 1.4rem 0.5rem;
    color: color-mix(in srgb, currentColor 58%, transparent);
    font-size: 0.82rem;
    text-align: center;
  }

  .rules-card {
    margin-top: 0.75rem;
  }

  .rules-card ol {
    display: grid;
    gap: 0.45rem;
    margin: 0.8rem 0 0;
    padding-left: 1.3rem;
    color: color-mix(in srgb, currentColor 70%, transparent);
    font-size: 0.78rem;
  }

  @media (max-width: 991.98px) {
    .game-heading {
      align-items: start;
      flex-direction: column;
    }

    .heading-stats {
      justify-content: start;
    }

    .ranking-card {
      max-height: 23rem;
      overflow: auto;
    }

    .rules-card {
      display: none;
    }
  }

  @media (max-width: 575.98px) {
    .medal-janken-page {
      padding-right: 0.6rem;
      padding-left: 0.6rem;
    }

    .game-heading {
      padding: 0.85rem;
    }

    .game-heading p {
      font-size: 0.78rem;
    }
  }
</style>
