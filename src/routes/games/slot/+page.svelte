<script lang="ts">
  import { onMount } from 'svelte';
  import { formatDistanceToNowStrict, parseISO } from 'date-fns';
  import { ko } from 'date-fns/locale';
  import { invalidateAll } from '$app/navigation';
  let { data } = $props();
  let balance = $state(data.balance || 0);
  let bet = $state(10);
  let spinning = $state(false);
  let reels = $state(['-', '-', '-']);
  let message = $state('');
  let rankList = $state<Array<{ nickname: string; balance: number; _id?: string }>>([]);
  let comments = $state<Array<{ 
    _id?: string; 
    id?: string; 
    nickname: string; 
    content: string; 
    createdAt: string; 
    photo?: string; 
    depth?: number; 
    parentCommentNickname?: string; 
    liked?: boolean;
  }>>([]);
  let commentContent = $state('');
  let commentLoading = $state(false);
  let replyingTo = $state<string | null>(null);
  let replyContent = $state<Record<string, string>>({});
  let oopsInfo = $state<{ createdAt: string; remainingMs: number } | null>(null);
  let oopsCountdown = $state<string>('');

  async function refreshBalance() {
    const res = await fetch('/games/slot');
    if (res.ok) {
      const j = await res.json();
      balance = j.balance;
      oopsInfo = j.oopsInfo || null;
    }
  }
  
  function updateOopsCountdown() {
    if (!oopsInfo) {
      oopsCountdown = '';
      return;
    }
    const now = Date.now();
    const createdAt = new Date(oopsInfo.createdAt).getTime();
    const TEN_MIN = 10 * 60 * 1000;
    const elapsed = now - createdAt;
    const remaining = TEN_MIN - elapsed;
    
    if (remaining <= 0) {
      oopsInfo = null;
      oopsCountdown = '';
      // 자동으로 잔액 새로고침 (700점 지급 확인)
      refreshBalance();
      return;
    }
    
    const minutes = Math.floor(remaining / (60 * 1000));
    const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
    oopsCountdown = `${minutes}분 ${seconds}초`;
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
      const start = Date.now();
      const res = await fetch('/games/slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bet: Number(bet) })
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j?.message || '실패');
      // 결과는 스핀 종료 후에만 적용
      const nextReels = j.reels;
      const nextBalance = j.balance;
      const sign = j.delta >= 0 ? '+' : '';
      const extra = j.message ? ` - ${j.message}` : '';
      const nextMessage = `${sign}${j.delta} (${j.payout})${extra}`;
      // 최소 2초 오버레이 유지
      const elapsed = Date.now() - start;
      if (elapsed < 2000) {
        await new Promise(r => setTimeout(r, 2000 - elapsed));
      }
      reels = nextReels;
      balance = nextBalance;
      message = nextMessage;
      // 오링 상태 확인
      if (nextBalance === 0) {
        await refreshBalance();
      } else {
        oopsInfo = null;
      }
      await loadRank();
      await loadComments();
    } catch (e: any) {
      message = e?.message || '오류';
    } finally {
      spinning = false;
    }
  }

  async function loadComments() {
    try {
      const res = await fetch('/games/slot/comment', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        comments = data || [];
        // 알람이 읽음 처리되었으므로 레이아웃의 알람 카운트 갱신
        await invalidateAll();
        
        // 댓글 로드 후 URL에 댓글 ID가 있으면 스크롤
        const urlParams = new URLSearchParams(window.location.search);
        const commentId = urlParams.get('cmt');
        if (commentId) {
          scrollToComment(commentId);
        }
      }
    } catch (e) {
      console.error('댓글 로드 실패:', e);
    }
  }

  async function writeComment(parentId?: string) {
    const content = parentId ? replyContent[parentId] : commentContent;
    if (!content?.trim() || commentLoading) return;
    try {
      commentLoading = true;
      const formData = new FormData();
      formData.set('content', content.trim());
      if (parentId) {
        formData.set('parentCommentId', parentId);
      }
      const res = await fetch('/games/slot/comment', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        if (parentId) {
          replyContent[parentId] = '';
          replyingTo = null;
        } else {
          commentContent = '';
        }
        await loadComments();
        // 알람 카운트 갱신
        await invalidateAll();
      } else {
        const err = await res.json();
        alert(err?.message || '댓글 작성 실패');
      }
    } catch (e) {
      console.error('댓글 작성 실패:', e);
      alert('댓글 작성 중 오류가 발생했습니다.');
    } finally {
      commentLoading = false;
    }
  }

  async function refreshAll() {
    await Promise.all([
      refreshBalance(),
      loadRank(),
      loadComments()
    ]);
  }

  function scrollToComment(commentId: string | null) {
    if (!commentId) return;
    setTimeout(() => {
      const element = document.getElementById(`comment-${commentId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.backgroundColor = 'var(--bs-warning-bg-subtle)';
        setTimeout(() => {
          element.style.transition = 'background-color 2s';
          element.style.backgroundColor = '';
        }, 2000);
      }
    }, 500);
  }

  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    await refreshBalance();
    loadRank();
    await loadComments();
    
    // URL에 댓글 ID가 있으면 해당 댓글로 스크롤
    const urlParams = new URLSearchParams(window.location.search);
    const commentId = urlParams.get('cmt');
    scrollToComment(commentId);
    
    // 오링 카운트다운 업데이트
    updateOopsCountdown();
    countdownInterval = setInterval(() => {
      if (oopsInfo) {
        updateOopsCountdown();
      } else {
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
      }
    }, 1000);
    
    return () => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
  });
</script>

<main class="container my-4">
  <div class="row justify-content-center">
    <div class="col-md-6 order-2 order-md-1">
      <div class="card shadow rounded-4 position-relative overflow-hidden">
        {#if spinning}
          <div class="slot-overlay d-flex flex-column justify-content-center align-items-center">
            <div class="spinner-border text-light" role="status"></div>
            <div class="mt-2 fw-bold text-light">스핀 중...</div>
          </div>
        {/if}
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h4 class="mb-0">뺑뺑이</h4>
            <button class="btn btn-sm btn-outline-secondary" onclick={refreshAll} title="새로고침">
              🔄
            </button>
          </div>
          <div class="d-flex justify-content-between mb-2">
            <div>보유 점수: <strong>{balance}</strong></div>
            <div>
              <input type="tel" min="1" max={balance} class="form-control form-control-sm d-inline-block bet-input" style="width: 150px;" bind:value={bet} />
            </div>
          </div>
          <div class="slot border rounded-3 p-3 text-center mb-3">
            <div class="display-4">{reels[0]} {reels[1]} {reels[2]}</div>
          </div>
              <button class="btn btn-lg btn-primary w-100" disabled={spinning} onclick={play}>
            {spinning ? '스핀 중...' : '🎁 ㄱㄱ'}
          </button>
          {#if message}
          <div class="mt-3 fw-bold">{message}</div>
          {/if}
          {#if oopsInfo && oopsCountdown}
          <div class="mt-3 p-3 bg-warning-subtle rounded border border-warning">
            <div class="fw-bold text-danger mb-2">욕심은 화를 부릅니다</div>
            <div class="text-muted">남은 시간: <strong class="text-dark">{oopsCountdown}</strong></div>
            <small class="text-muted">10분 후에 700점이 자동 지급됩니다.</small>
          </div>
          {/if}
        </div>
      </div>
    </div>
    <div class="col-md-4 order-1 order-md-2 mb-3 mb-md-0">
      <div class="card shadow rounded-4">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">랭킹 Top 7</h5>
            <button class="btn btn-sm btn-outline-secondary" onclick={refreshAll} title="새로고침">
              🔄
            </button>
          </div>
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
  
  <!-- 댓글 섹션 -->
  <div class="row justify-content-center mt-4">
    <div class="col-md-10">
      <div class="card shadow rounded-4 position-relative overflow-hidden">
        {#if commentLoading}
          <div class="slot-overlay d-flex flex-column justify-content-center align-items-center">
            <div class="spinner-border text-light" role="status"></div>
            <div class="mt-2 fw-bold text-light">댓글 등록 중...</div>
          </div>
        {/if}
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">💬 리플 ({comments.length})</h5>
            <button class="btn btn-sm btn-outline-secondary" onclick={refreshAll} title="새로고침">
              🔄
            </button>
          </div>
          
          <!-- 댓글 목록 -->
          {#if comments.length > 0}
            <div class="mb-3">
              {#each comments as comment}
                <div class="border-bottom pb-3 mb-3 {(comment.depth ?? 1) > 1 ? 'ms-4' : ''}">
                  {#if comment.parentCommentNickname}
                    <div class="mb-2">
                      <span class="badge bg-secondary text-warning">@</span>
                      <span class="text-muted small">{comment.parentCommentNickname}</span>
                    </div>
                  {/if}
                  <div class="d-flex align-items-start gap-2 mb-2">
                    {#if comment.photo}
                      <img src={comment.photo} alt="프로필" class="rounded-circle" style="width: 32px; height: 32px; object-fit: cover;" />
                    {/if}
                    <div class="flex-grow-1">
                      <div class="fw-bold">{comment.nickname}</div>
                      <small class="text-muted">
                        {formatDistanceToNowStrict(parseISO(comment.createdAt), {
                          locale: ko,
                          addSuffix: true
                        })}
                      </small>
                    </div>
                  </div>
                  <div class="ms-1" id={comment.id ? `comment-${comment.id}` : undefined}>{comment.content}</div>
                  
                  <!-- 대댓글 작성 폼 -->
                  {#if data.session?.user && 'nickname' in data.session.user}
                    <div class="mt-2">
                      {#if comment.id && replyingTo === comment.id}
                        <div class="input-group input-group-sm">
                          <textarea 
                            class="form-control" 
                            rows="2" 
                            placeholder="답글을 입력하세요..."
                            bind:value={replyContent[comment.id]}
                            disabled={commentLoading}
                          ></textarea>
                          <button 
                            class="btn btn-sm btn-primary" 
                            type="button"
                            onclick={() => comment.id && writeComment(comment.id)}
                            disabled={commentLoading || !replyContent[comment.id]?.trim()}
                          >
                            {commentLoading ? '등록 중...' : '등록'}
                          </button>
                          <button 
                            class="btn btn-sm btn-secondary" 
                            type="button"
                            onclick={() => {
                              if (comment.id) {
                                replyingTo = null;
                                replyContent[comment.id] = '';
                              }
                            }}
                          >
                            취소
                          </button>
                        </div>
                      {:else if comment.id}
                        <button 
                          class="btn btn-sm btn-outline-secondary"
                          onclick={() => {
                            if (comment.id) {
                              replyingTo = comment.id;
                              if (!replyContent[comment.id]) replyContent[comment.id] = '';
                            }
                          }}
                        >
                          답글
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-muted text-center py-3">아직 리플이 없습니다. 첫 리플을 남겨보세요! 💬</div>
          {/if}
          
          <!-- 댓글 작성 폼 -->
          {#if data.session?.user && 'nickname' in data.session.user}
            <div class="comment-input-wrapper mt-3">
              <textarea 
                class="form-control comment-textarea" 
                rows="3" 
                placeholder="리플을 남겨주세요..."
                bind:value={commentContent}
                disabled={commentLoading}
              ></textarea>
              <button 
                class="btn btn-primary comment-submit-btn" 
                type="button"
                onclick={() => writeComment()}
                disabled={commentLoading || !commentContent.trim()}
              >
                {commentLoading ? '등록 중...' : '등록'}
              </button>
            </div>
          {:else}
            <div class="text-muted text-center py-2 mt-3">
              <small>로그인 후 리플을 남길 수 있습니다.</small>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</main>

<style>
  .slot {
    background: var(--bs-secondary-bg);
  }
  .slot-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 10;
  }
  /* 댓글 입력창 */
  .comment-input-wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .comment-textarea {
    font-size: 16px !important; /* iOS 줌 인 방지 */
    width: 100%;
    resize: vertical;
  }
  .comment-submit-btn {
    align-self: flex-start;
    min-width: 80px;
  }
  /* 모바일에서 댓글 입력창이 보이도록 */
  @media (max-width: 768px) {
    .comment-input-wrapper {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      position: relative;
      z-index: 1;
    }
    .comment-textarea {
      font-size: 16px !important;
      min-height: 80px;
      width: 100%;
    }
    .comment-submit-btn {
      width: 100%;
      min-width: auto;
    }
  }
  /* 1위 번호 위치에 왕관 아이콘 표시 */
  :global(.list-group-numbered > .list-group-item:first-child::before) {
    content: '👑' !important;
    background: transparent !important;
    color: inherit !important;
    font-size: 1.1rem;
    line-height: 1;
  }
  /* iOS Safari 자동 줌 인 방지 (font-size 16px 이상 필요) */
  .bet-input {
    font-size: 16px !important;
  }
</style>


