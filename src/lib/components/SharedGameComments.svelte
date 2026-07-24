<script lang="ts">
  import { onMount } from 'svelte';
  import { ko } from 'date-fns/locale';
  import GameProfilePhoto from '$lib/components/GameProfilePhoto.svelte';
  import { swalFire } from '$lib/util/swal.js';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';

  type GameComment = {
    id?: string;
    _id?: string;
    nickname: string;
    content: string;
    createdAt: string;
    photo?: string | null;
    depth?: number;
    parentCommentNickname?: string;
  };

  interface Props {
    loggedIn?: boolean;
    refreshToken?: number;
    game?: 'slot' | 'seotda';
    onReward?: (reward: { amount: number; balance: number }) => void;
  }

  let {
    loggedIn = false,
    refreshToken = 0,
    game = 'seotda',
    onReward
  }: Props = $props();
  let comments = $state<GameComment[]>([]);
  let content = $state('');
  let replyContent = $state<Record<string, string>>({});
  let replyingTo = $state<string | null>(null);
  let loading = $state(false);
  let loadingMore = $state(false);
  let page = $state(1);
  let hasMore = $state(false);
  let total = $state(0);
  let seenRefreshToken = -1;

  function commentId(comment: GameComment): string {
    return String(comment.id ?? comment._id ?? '');
  }

  function socialTime(value: string): string {
    return formatRelativeTime(value, { locale: ko, addSuffix: true });
  }

  async function loadComments(nextPage = 1, append = false) {
    if (loadingMore) return;
    loadingMore = true;
    try {
      const query = new URLSearchParams({ page: String(nextPage), limit: '50' });
      query.set('game', game);
      const response = await fetch(`/games/slot/comment?${query}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) return;
      const result = await response.json();
      const nextComments = Array.isArray(result?.comments) ? result.comments : [];
      comments = append ? [...comments, ...nextComments] : nextComments;
      page = Number(result?.page ?? nextPage);
      total = Number(result?.total ?? comments.length);
      hasMore = Boolean(result?.hasMore);
    } catch (error) {
      console.error('[seotda comments load]', error);
    } finally {
      loadingMore = false;
    }
  }

  async function writeComment(parentId?: string) {
    const text = (parentId ? replyContent[parentId] : content).trim();
    if (loading || text.length < 2) return;
    loading = true;
    try {
      const form = new FormData();
      form.set('content', text);
      form.set('game', game);
      if (parentId) form.set('parentCommentId', parentId);
      const response = await fetch('/games/slot/comment', { method: 'POST', body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message ?? '리플 등록 실패');
      }
      if (parentId) {
        replyContent[parentId] = '';
        replyingTo = null;
      } else {
        content = '';
      }
      await loadComments(1);
      if (result.rewardGiven) {
        const rewardBalance = Number(result.rewardBalance);
        if (Number.isFinite(rewardBalance)) {
          onReward?.({ amount: 100, balance: rewardBalance });
        }
        await swalFire({
          icon: 'success',
          title: '💬 리플 보상 +100점',
          text: '뺑뺑이·섯다 합산 하루 10개까지',
          toast: true,
          position: 'center',
          showConfirmButton: false,
          timer: 2600
        });
      }
    } catch (error) {
      await swalFire({
        icon: 'error',
        title: error instanceof Error ? error.message : '리플 등록 실패',
        toast: true,
        position: 'center',
        showConfirmButton: false,
        timer: 2600
      });
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadComments();
  });

  $effect(() => {
    const token = refreshToken;
    if (seenRefreshToken < 0) {
      seenRefreshToken = token;
      return;
    }
    if (token !== seenRefreshToken) {
      seenRefreshToken = token;
      void loadComments();
    }
  });
</script>

<section
  class="shared-comments card shadow-sm rounded-4 border-0 mt-3"
  aria-label={game === 'seotda' ? '섯다 리플' : '뺑뺑이 리플'}
>
  <div class="card-body">
    <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
      <div>
        <h5 class="mb-1">{game === 'seotda' ? '섯다' : '뺑뺑이'} 리플</h5>
        <div class="small text-muted">리플 보상 100점 · 하루 10개</div>
      </div>
      <span class="badge text-bg-secondary">{total}</span>
    </div>

    {#if loggedIn}
      <div class="d-flex gap-2 mb-3">
        <textarea
          class="form-control"
          rows="2"
          placeholder="같이 놀 한마디를 남겨보세요"
          bind:value={content}
          disabled={loading}
        ></textarea>
        <button
          class="btn btn-primary align-self-stretch"
          type="button"
          onclick={() => void writeComment()}
          disabled={loading || content.trim().length < 2}
        >
          {loading ? '등록 중' : '등록'}
        </button>
      </div>
    {/if}

    {#if loadingMore && comments.length === 0}
      <div class="text-center text-muted py-3">리플 불러오는 중…</div>
    {:else if comments.length === 0}
      <div class="text-center text-muted py-3">첫 리플을 남겨보세요.</div>
    {:else}
      <div class="comment-list">
        {#each comments as comment (commentId(comment))}
          {@const id = commentId(comment)}
          <article
            class="comment-row"
            class:is-reply={(comment.depth ?? 1) > 1}
            style:--comment-depth={Math.min(3, Math.max(0, (comment.depth ?? 1) - 1))}
          >
            <div class="d-flex justify-content-between align-items-center gap-2">
              <div class="d-flex align-items-center gap-2 min-w-0">
                <GameProfilePhoto src={comment.photo} name={comment.nickname} size={28} />
                <strong class="small">
                  {#if comment.parentCommentNickname}
                    <span class="text-primary">@{comment.parentCommentNickname}</span>
                  {/if}
                  {comment.nickname}
                </strong>
              </div>
              <time class="small text-muted">{socialTime(comment.createdAt)}</time>
            </div>
            <div class="comment-content mt-1">{comment.content}</div>
            {#if loggedIn && id}
              {#if replyingTo === id}
                <div class="d-flex gap-2 mt-2">
                  <textarea
                    class="form-control form-control-sm"
                    rows="2"
                    placeholder="답글을 입력하세요"
                    bind:value={replyContent[id]}
                    disabled={loading}
                  ></textarea>
                  <button
                    class="btn btn-sm btn-primary"
                    type="button"
                    onclick={() => void writeComment(id)}
                    disabled={loading || (replyContent[id]?.trim().length ?? 0) < 2}>등록</button
                  >
                  <button
                    class="btn btn-sm btn-outline-secondary"
                    type="button"
                    onclick={() => {
                      replyingTo = null;
                      replyContent[id] = '';
                    }}>취소</button
                  >
                </div>
              {:else}
                <button
                  class="btn btn-sm btn-link px-0 py-1"
                  type="button"
                  onclick={() => {
                    replyingTo = id;
                    replyContent[id] ||= '';
                  }}>답글</button
                >
              {/if}
            {/if}
          </article>
        {/each}
      </div>
    {/if}

    {#if hasMore}
      <div class="text-center mt-3">
        <button
          class="btn btn-sm btn-outline-secondary"
          type="button"
          onclick={() => void loadComments(page + 1, true)}
          disabled={loadingMore}>{loadingMore ? '불러오는 중…' : '더 보기'}</button
        >
      </div>
    {/if}
  </div>
</section>

<style>
  .comment-list {
    display: grid;
    gap: 0.65rem;
    max-height: 34rem;
    overflow-y: auto;
  }

  .comment-row {
    margin-left: calc(var(--comment-depth, 0) * 1.15rem);
    padding: 0.75rem 0.85rem;
    border: 1px solid rgba(128, 128, 128, 0.2);
    border-radius: 0.8rem;
    background: rgba(128, 128, 128, 0.045);
  }

  .comment-row.is-reply {
    border-left: 3px solid rgba(13, 110, 253, 0.5);
  }

  .comment-content {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  @media (max-width: 575.98px) {
    .comment-row {
      margin-left: calc(var(--comment-depth, 0) * 0.45rem);
    }

    .shared-comments textarea + .btn {
      min-width: 4.25rem;
    }
  }
</style>
