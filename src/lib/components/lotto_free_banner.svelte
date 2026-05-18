<script lang="ts">
  import { Badge, Button, Col, Icon, Row } from '@sveltestrap/sveltestrap';
  import { invalidateAll } from '$app/navigation';
  import { format, parseISO } from 'date-fns';
  import Swal from 'sweetalert2';

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
    /** 최근 24시간 로또 기록, 최신순 */
    lottoHistory: LottoHistoryEntry[];
    session?: { user?: { nickname?: string | null; email?: string | null } } | null;
    /** 직전 주 뽑기 vs 저장된 최신 동행복권 회차 매칭 */
    lottoWeekMatch?: LottoWeekMatchSummary | null;
    /** 최근 24시간 동안 저장된 인생역전 전체 뽑기 건수(뱃지) */
    lottoTotalPicks24h?: number;
  }

  let {
    lottoHistory,
    session = null,
    lottoWeekMatch = null,
    lottoTotalPicks24h = 0
  }: Props = $props();

  /** 1..45 에 따른 번호별 색(그라데이션 볼) */
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

  let expanded = $state(false);
  let loading = $state(false);
  let refreshing = $state(false);
  let lastPick = $state<number[] | null>(null);

  async function refreshBanner() {
    refreshing = true;
    try {
      await invalidateAll();
    } catch (err) {
      console.error('lotto banner refresh failed', err);
    } finally {
      refreshing = false;
    }
  }

  /** 로또 6개 발급 저장(API 호출). 로그인 여부는 호출 전에 검사할 것. */
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
        await Swal.fire({
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

      await invalidateAll();
    } catch (err) {
      console.error('lotto pick failed', err);
      await Swal.fire({
        icon: 'error',
        title: '오류',
        text: '네트워크 오류로 번호를 받지 못했습니다.',
        confirmButtonText: '확인'
      });
    } finally {
      loading = false;
    }
  }

  /** 메인 버튼: 접힌 상태에서는 생성 여부 확인 후 분기 */
  async function onLottoMainClick() {
    if (!session?.user?.email) {
      await Swal.fire({
        icon: 'info',
        title: '로그인이 필요합니다',
        text: '로그인 후 번호를 뽑을 수 있어요.',
        confirmButtonText: '확인'
      });
      return;
    }

    if (!expanded) {
      const result = await Swal.fire({
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
      if (result.dismiss === Swal.DismissReason.cancel) {
        expanded = true;
      }
      return;
    }

    await handlePick();
  }
</script>

<Row class="px-3 py-3 mx-0 border-bottom border-secondary-subtle bg-body-secondary bg-opacity-25 rounded-top-4">
  <Col xs="12" class="d-flex flex-wrap align-items-center gap-2">
    <Button
      color="warning"
      class="fw-semibold d-inline-flex align-items-center gap-1"
      disabled={loading}
      onclick={onLottoMainClick}
      type="button"
    >
      {#if loading}
        <span class="spinner-border spinner-border-sm" role="status"></span>
      {/if}
      <span>💵인생역전❤️</span>
      {#if lottoTotalPicks24h > 0}
        <span class="badge rounded-pill badge-success align-middle">{lottoTotalPicks24h}</span>
      {/if}
    </Button>
    <Button color="outline-secondary" size="sm" onclick={() => (expanded = !expanded)} type="button">
      {expanded ? '접기' : '펼치기'}
    </Button>
    <Button
      color="outline-secondary"
      size="sm"
      onclick={refreshBanner}
      disabled={refreshing || loading}
      type="button"
      title="기록 새로고침"
    >
      {#if refreshing}
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      {:else}
        <Icon name="arrow-clockwise" class="me-1" aria-hidden="true" />
      {/if}
      새로고침
    </Button>
    <small class="text-muted ms-auto">무작위 뽑기(1–45)·최근 24시간 기록</small>
  </Col>

  {#if expanded}
    <Col xs="12" class="mt-3">
      {#if lottoWeekMatch?.hasOfficial && lottoWeekMatch.official}
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
                      class="rounded-1 me-1 flex-shrink-0 align-middle object-fit-cover"
                      loading="lazy"
                    />
                  {/if}
                  <span class="fw-medium">{w.nickname}</span>
                  <span class="text-muted"
                    >[{format(parseISO(w.createdAt), 'M/d HH:mm')}]</span
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

      {#if lastPick?.length === 6}
        <h3 class="h5 mb-2">내번호 {lastPick.join(',')}</h3>
        <div class="d-flex flex-wrap gap-1 mb-3" aria-label="방금 뽑은 번호">
          {#each lastPick as n (n)}
            <span
              class="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-bold"
              style={ballStyle(n)}
            >
              {n}
            </span>
          {/each}
        </div>
      {:else}
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
                  class="rounded-1 mt-1 flex-shrink-0 object-fit-cover align-top"
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
                  >[{format(parseISO(row.createdAt), 'HH:mm')}]</span
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
