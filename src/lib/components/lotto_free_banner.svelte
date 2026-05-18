<script lang="ts">
  import { Button, Col, Row } from '@sveltestrap/sveltestrap';
  import { invalidate } from '$app/navigation';
  import { format, parseISO } from 'date-fns';
  import Swal from 'sweetalert2';

  interface LottoHistoryEntry {
    id: string;
    nickname: string;
    numbers: number[];
    createdAt: string;
  }

  interface Props {
    /** 최근 24시간 로또 기록, 최신순 */
    lottoHistory: LottoHistoryEntry[];
    session?: { user?: { nickname?: string | null; email?: string | null } } | null;
  }

  let { lottoHistory, session = null }: Props = $props();

  /** 1..45 에 따른 번호별 색(그라데이션 볼) */
  function ballStyle(n: number): string {
    const t = (n - 1) / 44;
    const h1 = Math.round(10 + t * 300);
    const h2 = Math.round(h1 + 25);
    return `background:linear-gradient(145deg,hsl(${h1},88%,56%),hsl(${h2},72%,42%));min-width:2rem;height:2rem;font-size:0.85rem;box-shadow:0 2px 4px rgba(0,0,0,0.12);`;
  }

  let expanded = $state(true);
  let loading = $state(false);
  let lastPick = $state<number[] | null>(null);

  /** 로또 6개 발급 저장 */
  async function handlePick() {
    if (!session?.user?.email) {
      await Swal.fire({
        icon: 'info',
        title: '로그인이 필요합니다',
        text: '로그인 후 번호를 뽑을 수 있어요.',
        confirmButtonText: '확인'
      });
      return;
    }

    loading = true;
    try {
      const res = await fetch('/board/lotto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        const msg =
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof (data as { message: unknown }).message === 'string'
            ? (data as { message: string }).message
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
        typeof data === 'object' &&
        data !== null &&
        'numbers' in data &&
        Array.isArray((data as { numbers: unknown }).numbers)
          ? (data as { numbers: number[] }).numbers
              .filter((x) => typeof x === 'number' && Number.isInteger(x))
              .slice(0, 6)
          : [];

      if (numbers.length === 6) {
        lastPick = [...numbers].sort((a, b) => a - b);
      }

      await invalidate('board-list');
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
</script>

<Row class="px-3 py-3 mx-0 border-bottom border-secondary-subtle bg-body-secondary bg-opacity-25 rounded-top-4">
  <Col xs="12" class="d-flex flex-wrap align-items-center gap-2">
    <Button
      color="warning"
      class="fw-semibold"
      disabled={loading}
      onclick={handlePick}
      type="button"
    >
      {#if loading}
        <span class="spinner-border spinner-border-sm me-1" role="status"></span>
      {/if}
      💵인생역전❤️
    </Button>
    <Button color="outline-secondary" size="sm" onclick={() => (expanded = !expanded)} type="button">
      {expanded ? '접기' : '펼치기'}
    </Button>
    <small class="text-muted ms-auto">무작위 6개(1–45)·최근 24시간 기록입니다. 참고용이에요.</small>
  </Col>

  {#if expanded}
    <Col xs="12" class="mt-3">
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
          <li class="mb-2 pb-2 border-bottom border-secondary-subtle">
            <span class="fw-medium">{row.nickname}</span><span class="text-muted"
              >[{format(parseISO(row.createdAt), 'HH:mm')}]</span
            >
            <span class="text-muted"> - </span>
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
          </li>
        {:else}
          <li class="text-muted">아직 기록이 없어요. 첫 주인공이 되어 보세요.</li>
        {/each}
      </ul>
    </Col>
  {/if}
</Row>
