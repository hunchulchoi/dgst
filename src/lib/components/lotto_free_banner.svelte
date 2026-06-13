<script lang="ts">
  import { Badge, Button, Col, Icon, Row } from '$lib/components/ui/index.js';
  import { formatAbsoluteTime, parseSafeDate } from '$lib/util/formatRelativeTime.js';
  import { onMount } from 'svelte';
  import { swalFire } from '$lib/util/swal.js';

  interface LottoHistoryEntry {
    id: string;
    nickname: string;
    numbers: number[];
    createdAt: string;
    mine?: boolean;
    photo?: string;
  }

  interface LottoOfficial {
    drwNo: number;
    drwNoDate: string;
    mains: number[];
    bonus: number;
  }

  interface WeekWinnerRow {
    rank: number;
    nickname: string;
    numbers: number[];
    createdAt: string;
    pickId: string;
    photo?: string;
  }

  interface LottoWeekMatchSummary {
    hasOfficial: boolean;
    official: LottoOfficial | null;
    weekLabel: string;
    winners: WeekWinnerRow[];
    picksInWeek: number;
  }

  interface Props {
    session?: { user?: { nickname?: string | null; email?: string | null } } | null;
  }

  let { session = null }: Props = $props();

  let lottoHistory = $state<LottoHistoryEntry[]>([]);
  let lottoWeekMatch = $state<LottoWeekMatchSummary | null>(null);
  let lottoTotalPicks24h = $state(0);

  function ballStyle(n: number): string {
    const t = (n - 1) / 44;
    const h1 = Math.round(10 + t * 300);
    const h2 = Math.round(h1 + 25);
    return `background:linear-gradient(145deg,hsl(${h1},88%,56%),hsl(${h2},72%,42%));min-width:2rem;height:2rem;font-size:0.85rem;box-shadow:0 2px 4px rgba(0,0,0,0.12);`;
  }

  function bonusBallStyle(n: number): string {
    const base = ballStyle(n);
    return `${base}box-shadow:inset 0 0 0 3px #e53935,min-width:2rem;height:2rem;`;
  }

  function rankToLabel(rank: number): string {
    if (rank === 1) return '1등';
    if (rank === 2) return '2등';
    if (rank === 3) return '3등';
    if (rank === 4) return '4등';
    if (rank === 5) return '5등';
    return '-';
  }

  function rankBadgeColor(rank: number): 'danger' | 'warning' | 'success' {
    if (rank <= 2) return 'danger';
    if (rank === 3) return 'warning';
    return 'success';
  }

  const LOTTO_HISTORY_MS = 24 * 60 * 60 * 1000;

  let expanded = $state(false);
  let loading = $state(false);
  let refreshing = $state(false);
  let summaryLoading = $state(true);
  let lastPick = $state<number[] | null>(null);

  let myDisplayNumbers = $derived.by(() => {
    if (lastPick?.length === 6) return lastPick;
    const mine = lottoHistory.find((r) => r.mine === true);
    return mine?.numbers?.length === 6 ? mine.numbers : null;
  });

  function formatHistoryTime(iso: string): string {
    const at = parseSafeDate(iso);
    if (!at) return '';
    if (Date.now() - at.getTime() > LOTTO_HISTORY_MS) {
      return formatAbsoluteTime(at, 'M/d HH:mm');
    }
    return formatAbsoluteTime(at, 'HH:mm');
  }

  async function loadLottoSummary() {
    try {
      const res = await fetch('/api/board/lotto-summary');
      if (!res.ok) return;
      const body = await res.json();
      lottoHistory = body.lottoHistory ?? [];
      lottoWeekMatch = body.lottoWeekMatch ?? null;
      lottoTotalPicks24h = body.lottoTotalPicks24h ?? 0;
    } catch (err) {
      console.error('lotto summary load failed', err);
    } finally {
      summaryLoading = false;
    }
  }

  async function refreshBanner() {
    refreshing = true;
    try {
      await loadLottoSummary();
    } finally {
      refreshing = false;
    }
  }

  async function handlePick() {
    loading = true;
    try {
      const res = await fetch('/board/lotto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        json = {};
      }

      if (!res.ok) {
        const msg =
          typeof json === 'object' &&
          json !== null &&
          'message' in json &&
          typeof (json as { message: unknown }).message === 'string'
            ? (json as { message: string }).message
            : `요청 실패 (${res.status})`;
        await swalFire({
          icon: 'error',
          title: '앗!',
          text: msg,
          confirmButtonText: '확인'
        });
        return;
      }

      const numbers =
        typeof json === 'object' &&
        json !== null &&
        'numbers' in json &&
        Array.isArray((json as { numbers: unknown }).numbers)
          ? (json as { numbers: number[] }).numbers
              .filter((x) => typeof x === 'number' && Number.isInteger(x))
              .slice(0, 6)
          : [];

      if (numbers.length === 6) {
        lastPick = [...numbers].sort((a, b) => a - b);
      }

      await loadLottoSummary();
    } catch (err) {
      console.error('lotto pick failed', err);
      await swalFire({
        icon: 'error',
        title: '오류',
        text: '네트워크 오류로 번호를 받지 못했습니다.',
        confirmButtonText: '확인'
      });
    } finally {
      loading = false;
    }
  }

  async function onLottoMainClick() {
    if (!session?.user?.email) {
      await swalFire({
        icon: 'info',
        title: '로그인이 필요합니다',
        text: '로그인 후 번호를 뽑을 수 있어요.',
        confirmButtonText: '확인'
      });
      return;
    }

    if (!expanded) {
      const result = await swalFire({
        icon: 'question',
        title: '인생을 역전할 로또번호를 생성하시겠습니까?',
        showCancelButton: true,
        confirmButtonText: '생성',
        cancelButtonText: '아니요'
      });

      if (result.isConfirmed) {
        expanded = true;
        await handlePick();
        return;
      }
      if (result.dismiss === 'cancel') {
        expanded = true;
      }
      return;
    }

    await handlePick();
  }

  onMount(() => {
    loadLottoSummary();
  });
</script>

<Row class="px-3 py-3 mx-0 border-bottom border-secondary-subtle bg-body-secondary bg-opacity-25">
  <Col xs="12" class="d-flex flex-wrap align-items-center gap-2">
    <Button
      color="warning"
      class="lotto-main-btn fw-semibold d-inline-flex align-items-center gap-2"
      disabled={loading}
      onclick={onLottoMainClick}
      type="button"
    >
      {#if loading}
        <span class="spinner-border spinner-border-sm" role="status"></span>
      {/if}
      <span>💵인생역전❤️</span>
      {#if lottoTotalPicks24h > 0}
        <Badge color="success" class="align-middle">{lottoTotalPicks24h}</Badge>
      {/if}
    </Button>
    <Button
      color="primary"
      outline
      onclick={() => (expanded = !expanded)}
      type="button"
    >
      {expanded ? '접기' : '펼치기'}
    </Button>
    <Button
      color="primary"
      outline
      class="d-inline-flex align-items-center justify-content-center gap-1 lotto-refresh-btn"
      onclick={refreshBanner}
      disabled={refreshing || loading}
      type="button"
    >
      {#if refreshing}
        <span class="spinner-border spinner-border-sm" role="status" aria-label="새로고침 중"></span>
      {:else}
        <Icon name="arrow-clockwise" aria-hidden="true" />
      {/if}
      <span class="lotto-refresh-label">새로고침</span>
    </Button>
    <small class="text-muted ms-auto">무작위 뽑기(1–45)·최근 24시간 기록</small>
  </Col>

  {#if expanded}
    <Col xs="12" class="mt-3">
      {#if summaryLoading}
        <p class="text-muted small mb-0">로또 기록 불러오는 중…</p>
      {:else if lottoWeekMatch?.hasOfficial && lottoWeekMatch.official}
        {@const dr = lottoWeekMatch.official}
        <h4 class="h6 text-secondary mb-2">직전 주 &amp; 공식 당첨 비교</h4>
        <div class="small text-muted mb-1">
          비교 구간 · <strong>{lottoWeekMatch.weekLabel}</strong> 서울 기준월~일 /
          참고 회차 동행복권 <strong>{dr.drwNo}회</strong>
          {#if dr.drwNoDate}
            (<span>{dr.drwNoDate}</span>)
          {/if}
          · 해당 주 사이트 뽑기 {lottoWeekMatch.picksInWeek}건
        </div>
        <div class="d-flex flex-wrap align-items-center gap-1 mb-2">
          <span class="text-muted small">당첨 6개</span>
          {#each dr.mains as n (n)}
            <span
              class="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-bold"
              style={ballStyle(n)}
            >
              {n}
            </span>
          {/each}
          <span class="text-muted small ms-1">보너스</span>
          <span
            class="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-bold"
            title="보너스 번호"
            style={bonusBallStyle(dr.bonus)}
          >
            {dr.bonus}
          </span>
        </div>

        {#if lottoWeekMatch.winners.length}
          <div class="mb-3 rounded-3 bg-white bg-opacity-50 p-2 border border-secondary-subtle">
            <p class="small fw-semibold mb-2 text-danger">이번 주 사이트 뽑기 중 1~5등 해당</p>
            <ul class="list-unstyled small mb-0">
              {#each lottoWeekMatch.winners as w (w.pickId)}
                <li class="mb-2 pb-2 border-bottom border-secondary-subtle">
                  <Badge color={rankBadgeColor(w.rank)} class="me-1">{rankToLabel(w.rank)}</Badge>
                  {#if w.photo && w.photo.trim() !== ''}
                    <img
                      src={w.photo}
                      alt=""
                      width="22"
                      height="22"
                      class="lotto-history-avatar me-1 flex-shrink-0 align-middle object-fit-cover"
                      loading="lazy"
                    />
                  {/if}
                  <span class="fw-medium">{w.nickname}</span>
                  <span class="text-muted"
                    >[{formatAbsoluteTime(w.createdAt, 'M/d HH:mm')}]</span
                  >
                  <span class="d-inline-flex flex-wrap gap-1 align-middle mt-1 d-block ms-0 ps-0">
                    {#each w.numbers as n (n)}
                      <span
                        class="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-bold"
                        style={`${ballStyle(n)}min-width:1.6rem;height:1.6rem;font-size:0.75rem;`}
                      >
                        {n}
                      </span>
                    {/each}
                  </span>
                </li>
              {/each}
            </ul>
          </div>
        {:else}
          <p class="small text-muted mb-3">
            위 회차 규칙(3개 이상 일치) 기준 해당 주에 뽑은 번호 중 당첨 구간 없음 · 뽑기 {lottoWeekMatch.picksInWeek}건
          </p>
        {/if}
      {/if}

      {#if myDisplayNumbers?.length === 6}
        <h3 class="h5 mb-2">내번호 {myDisplayNumbers.join(',')}</h3>
        <div class="d-flex flex-wrap gap-1 mb-3" aria-label="내 로또 번호">
          {#each myDisplayNumbers as n (n)}
            <span
              class="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-bold"
              style={ballStyle(n)}
            >
              {n}
            </span>
          {/each}
        </div>
      {:else if !summaryLoading}
        <p class="text-muted small mb-2">버튼을 누르면 여기에 방금 뽑은 번호가 표시돼요.</p>
      {/if}

      <h4 class="h6 text-secondary mb-2">최근 24시간</h4>
      <ul class="list-unstyled small mb-0 pe-1" style="max-height: 220px; overflow-y: auto">
        {#each lottoHistory as row (row.id)}
          <li
            class={`mb-2 pb-2 ${row.mine === true ? 'rounded-3 px-2 py-2 border border-warning border-2 bg-warning bg-opacity-10 shadow-sm' : 'border-bottom border-secondary-subtle'}`}
          >
            <div class="d-flex align-items-start flex-wrap gap-1">
              {#if row.photo != null && String(row.photo).trim() !== ''}
                <img
                  src={String(row.photo).trim()}
                  alt=""
                  width="26"
                  height="26"
                  class="lotto-history-avatar mt-1 flex-shrink-0 object-fit-cover align-top"
                  loading="lazy"
                  decoding="async"
                />
              {/if}
              <span class="d-inline-flex flex-wrap align-items-center flex-grow-1 min-w-0">
                {#if row.mine === true}
                  <Badge color="warning" class="me-1">나</Badge>
                {/if}
                <span class={`fw-medium align-middle ${row.mine === true ? 'text-dark' : ''}`}
                  >{row.nickname}</span
                ><span class="text-muted align-middle"
                  >[{formatHistoryTime(row.createdAt)}]</span
                >
                <span class="text-muted align-middle"> - </span>
                <span class="d-inline-flex flex-wrap gap-1 align-middle">
                  {#each row.numbers as n (n)}
                    <span
                      class="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-bold"
                      style={`${ballStyle(n)}min-width:1.6rem;height:1.6rem;font-size:0.75rem;`}
                    >
                      {n}
                    </span>
                  {/each}
                </span>
              </span>
            </div>
          </li>
        {:else}
          <li class="text-muted">아직 기록이 없어요. 첫 주인공이 되어 보세요.</li>
        {/each}
      </ul>
    </Col>
  {/if}
</Row>

<style>
  .lotto-history-avatar {
    border-radius: var(--dgst-radius) !important;
  }

  :global(.lotto-main-btn) {
    min-height: 2.5rem;
    gap: 0.5rem;
  }

  .lotto-refresh-label {
    display: none;
  }

  @media (min-width: 768px) {
    .lotto-refresh-label {
      display: inline;
    }
  }

  @media (max-width: 767.98px) {
    :global(.lotto-refresh-btn) {
      min-width: 44px;
      min-height: 44px;
      padding: 0.6rem 0.9rem;
      flex-shrink: 0;
    }

    :global(.lotto-refresh-btn .bi) {
      font-size: 1.15rem;
    }
  }
</style>
