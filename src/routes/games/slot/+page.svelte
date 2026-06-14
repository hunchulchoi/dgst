<script lang="ts">
  import { onMount } from 'svelte';
  import { ko } from 'date-fns/locale';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import { invalidateAll } from '$app/navigation';
  import { swalFire } from '$lib/util/swal.js';
  import { isOnlyOneEmoji } from '$lib/util/emoji.js';
  import type { PageData } from './$types';
  import dgstData from '$lib/data/dgst_data.json';

  interface SlotTodayStats {
    spins: number;
    users: number;
  }

  interface SpinPhrase {
    top: string;
    middle?: string;
    bottom: string;
  }

  interface TravelJapaneseItem {
    japanese: string;
    pronunciation: string;
    korean: string;
  }

  interface TriviaItem {
    id: number;
    category: string;
    text: string;
  }

  interface QuoteItem {
    id: number;
    category: string;
    quote: string;
    author: string;
  }

  interface TravelEnglishItem {
    id: number;
    category: string;
    english: string;
    pronunciation: string;
    korean: string;
    example: string;
  }

  interface JapaneseWordItem {
    japanese: string;
    romaji: string;
    korean: string;
  }

  interface FactItem {
    id: number;
    category: string;
    fact: string;
  }

  type SlotPageData = PageData & {
    todayStats?: SlotTodayStats;
  };

  interface SlotPageProps {
    data: SlotPageData;
  }

  let { data }: SlotPageProps = $props();
  let balance = $state(0);
  let hasUnreadAlarm = $state(false);
  let unreadAlarmCount = $state(0);
  let bet = $state(10);
  let spinning = $state(false);
  let reels = $state(['-', '-', '-']);
  let message = $state('');
  let rankList = $state<Array<{ nickname: string; balance: number; _id?: string }>>([]);
  let comments = $state<
    Array<{
      _id?: string;
      id?: string;
      nickname: string;
      content: string;
      createdAt: string;
      photo?: string;
      depth?: number;
      parentCommentNickname?: string;
      liked?: boolean;
    }>
  >([]);
  let commentPage = $state(1);
  let commentPerPage = $state(50);
  let commentTotal = $state(0);
  let commentHasMore = $state(false);
  let commentListLoading = $state(false);
  let commentContent = $state('');
  let commentLoading = $state(false);
  let replyingTo = $state<string | null>(null);
  let replyContent = $state<Record<string, string>>({});
  let oopsInfo = $state<{ createdAt: string; remainingMs: number } | null>(null);
  let oopsCountdown = $state<string>('');
  let refreshing = $state(false);
  let spinAnimationInterval: ReturnType<typeof setInterval> | null = null;
  let currentSpinPhrase = $state<SpinPhrase | null>(null);
  let todayStats = $state<SlotTodayStats>({ spins: 0, users: 0 });
  let isMobile = $state(false);
  let guideCollapsed = $state(false);

  $effect.pre(() => {
    balance = data.balance || 0;
    hasUnreadAlarm = data.hasUnreadAlarm ?? false;
    unreadAlarmCount = data.unreadAlarmCount ?? 0;
    todayStats = {
      spins: data.todayStats?.spins ?? 0,
      users: data.todayStats?.users ?? 0
    };
  });

  const BASE_SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '7️⃣'];
  const MEDIUM_BALANCE_THRESHOLD = 100_000; // 10만점
  const HIGH_BALANCE_THRESHOLD = 300_000; // 30만점

  const getReelSymbols = () => {
    let symbols = [...BASE_SYMBOLS];

    if (balance >= HIGH_BALANCE_THRESHOLD) {
      // 30만점 이상: 💎, 🍀 추가
      symbols = [...symbols, '💎', '🍀'];
    } else if (balance >= MEDIUM_BALANCE_THRESHOLD) {
      // 10만점 이상: 🍀 추가
      symbols = [...symbols, '🍀'];
    }

    return symbols;
  };

  const setMobileState = (matches: boolean) => {
    isMobile = matches;
    if (!matches) {
      guideCollapsed = false;
    }
  };

  const collapseGuideAfterBet = () => {
    if (isMobile) {
      guideCollapsed = true;
    }
  };

  const toggleGuideCollapse = () => {
    guideCollapsed = !guideCollapsed;
  };

  async function refreshBalance() {
    try {
      const res = await fetch('/games/slot');
      if (res.ok) {
        const j = await res.json();
        balance = j.balance;
        const prevOopsInfo = oopsInfo;
        oopsInfo = j.oopsInfo || null;
        if (j.todayStats) {
          todayStats = {
            spins: Number(j.todayStats.spins ?? 0),
            users: Number(j.todayStats.users ?? 0)
          };
        }

        // oopsInfo가 새로 설정되거나 업데이트되면 카운트다운 시작
        if (oopsInfo && (!prevOopsInfo || prevOopsInfo.createdAt !== oopsInfo.createdAt)) {
          updateOopsCountdown();
          // 카운트다운 인터벌이 없으면 시작
          if (!countdownInterval) {
            countdownInterval = setInterval(() => {
              if (oopsInfo) {
                updateOopsCountdown();
              } else if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
              }
            }, 1000);
          }
        } else if (!oopsInfo && prevOopsInfo) {
          // oopsInfo가 사라졌으면 카운트다운 중지
          if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
          }
          oopsCountdown = '';
        }
      }
    } catch (err) {
      console.error('잔액 새로고침 실패:', err);
    }
  }

  function updateOopsCountdown() {
    if (!oopsInfo) {
      oopsCountdown = '';
      return;
    }
    const now = Date.now();
    const createdAt = new Date(oopsInfo.createdAt).getTime();
    const WAIT_DURATION_MS = 5 * 60 * 1000;
    const elapsed = now - createdAt;
    const remaining = WAIT_DURATION_MS - elapsed;

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

  function pickRandom<T>(items: T[]): T | null {
    if (items.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex];
  }

  const getRandomPhrase = (): SpinPhrase | null => {
    if (!dgstData) return null;

    // 6개 카테고리 중 하나 무작위 선택
    const categories = ['여행일본어', '상식', '명언', '여행영어', '일본어단어', 'facts'] as const;
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];

    // 카테고리별로 적절한 필드 매핑
    switch (randomCategory) {
      case '여행일본어': {
        const item = pickRandom(dgstData['여행일본어'] as TravelJapaneseItem[]);
        if (!item) return null;
        return {
          top: item.japanese || '',
          middle: item.pronunciation || '',
          bottom: item.korean || ''
        };
      }
      case '상식': {
        const item = pickRandom(dgstData['상식'] as TriviaItem[]);
        if (!item) return null;
        return {
          top: item.text || '',
          bottom: '' // 상식은 하단 없음
        };
      }
      case '명언': {
        const item = pickRandom(dgstData['명언'] as QuoteItem[]);
        if (!item) return null;
        return {
          top: item.quote || '',
          bottom: item.author ? `- ${item.author}` : ''
        };
      }
      case '여행영어': {
        const item = pickRandom(dgstData['여행영어'] as TravelEnglishItem[]);
        if (!item) return null;
        return {
          top: item.english || '',
          middle: item.example || '',
          bottom: item.korean || ''
        };
      }
      case '일본어단어': {
        const item = pickRandom(dgstData['일본어단어'] as JapaneseWordItem[]);
        if (!item) return null;
        return {
          top: item.japanese || '',
          middle: item.romaji || '',
          bottom: item.korean || ''
        };
      }
      case 'facts': {
        const item = pickRandom(dgstData.facts as FactItem[]);
        if (!item) return null;
        return {
          top: item.fact || '',
          bottom: '' // facts는 하단 없음
        };
      }
      default:
        return null;
    }
  };

  const startReelAnimation = () => {
    try {
      stopReelAnimation();

      // 스핀 시작 시 하나의 문장만 선택하여 표시
      currentSpinPhrase = getRandomPhrase();

      spinAnimationInterval = setInterval(() => {
        const symbols = getReelSymbols();
        reels = Array.from({ length: 3 }, () => {
          const randomIndex = Math.floor(Math.random() * symbols.length);
          return symbols[randomIndex];
        });
      }, 80);
    } catch (err) {
      console.error('릴 애니메이션 시작 실패:', err);
    }
  };

  const stopReelAnimation = () => {
    try {
      if (spinAnimationInterval) {
        clearInterval(spinAnimationInterval);
        spinAnimationInterval = null;
      }
      // 문장은 유지 (스핀이 끝나도 남아있도록)
    } catch (err) {
      console.error('릴 애니메이션 중지 실패:', err);
    }
  };

  async function loadRank() {
    const res = await fetch(`/games/slot?rank=1&_=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const j = await res.json();
      rankList = j.rank || [];
    }
  }

  async function play() {
    const previousReels = [...reels];
    let spinResolved = false;
    try {
      spinning = true;
      message = '';
      collapseGuideAfterBet();
      startReelAnimation();
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
      // 최소 3초 오버레이 유지
      const elapsed = Date.now() - start;
      if (elapsed < 3000) {
        await new Promise((r) => setTimeout(r, 3000 - elapsed));
      }
      stopReelAnimation();
      reels = nextReels;
      spinResolved = true;
      balance = nextBalance;
      message = nextMessage;
      // 스핀 후 랭킹 실시간 반영
      loadRank();

      // Triple 체크 (3개 모두 같음)
      const isTriple = nextReels[0] === nextReels[1] && nextReels[1] === nextReels[2];
      const reelStr = `${nextReels[0]} ${nextReels[1]} ${nextReels[2]}`;

      if (isTriple && j.delta > 0) {
        // Triple 당첨 시 큰 alert
        const is777 = nextReels[0] === '7️⃣';
        await swalFire({
          icon: 'success',
          title: is777 ? '🎰 7️⃣7️⃣7️⃣ 잭팟! 20배! 🎰' : '🎉 Triple! 10배! 🎉',
          html: `<div style="font-size: 48px; margin: 20px 0;">${reelStr}</div><div style="font-size: 24px; font-weight: bold;">+${j.delta}점</div>`,
          showConfirmButton: true,
          confirmButtonText: '확인',
          width: '500px'
        });

        // Triple 당첨 시 자동 댓글 작성
        try {
          const formattedDelta = formatNumber(j.delta);
          const tripleComment = is777
            ? `🎰 ${reelStr} 잭팟 당첨! +${formattedDelta} 🎰`
            : `🎉 ${reelStr} Triple 당첨! +${formattedDelta} 🎉`;

          const formData = new FormData();
          formData.set('content', tripleComment);

          const commentRes = await fetch('/games/slot/comment', {
            method: 'POST',
            body: formData
          });

          if (commentRes.ok) {
            // 댓글 작성 성공 시 리스트 새로고침 (보상은 서버에서 처리)
            await Promise.all([loadComments(1), refreshBalance(), loadRank()]);
          }
        } catch (e) {
          // 댓글 작성 실패는 조용히 무시 (사용자 경험 방해 방지)
          console.error('Triple 댓글 자동 작성 실패:', e);
        }
      } else {
        // 일반 결과는 toast
        const toastMessage =
          j.delta > 0
            ? `🎉 당첨! +${j.delta}점 (${reelStr})`
            : `😢 -${Math.abs(j.delta)}점 (${reelStr})`;

        await swalFire({
          icon: j.delta > 0 ? 'success' : 'error',
          title: toastMessage,
          toast: true,
          position: isMobile ? 'bottom' : 'center',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      }

      // 오링 상태 확인 (실제 스핀에서 balance가 0이 된 경우)
      if (nextBalance === 0 && j.delta < 0) {
        // 오링 시 자동 댓글 작성 (보상 있음)
        try {
          const formattedLoss = formatNumber(j.delta);
          const oopsComment = `😢 오링! 인생여전ㅜ... ${formattedLoss}`;

          const formData = new FormData();
          formData.set('content', oopsComment);

          const commentRes = await fetch('/games/slot/comment', {
            method: 'POST',
            body: formData
          });

          if (commentRes.ok) {
            // 댓글 작성 성공 시 리스트 새로고침 (보상은 서버에서 처리)
            // refreshBalance()에서 자동으로 oopsInfo 확인 및 카운트다운 시작
            await Promise.all([loadComments(1), refreshBalance(), loadRank()]);
          }
        } catch (e) {
          // 댓글 작성 실패는 조용히 무시
          console.error('오링 댓글 자동 작성 실패:', e);
        }
      } else {
        oopsInfo = null;
      }
      await Promise.all([loadRank(), loadComments(1), refreshBalance()]);
    } catch (e: any) {
      stopReelAnimation();
      if (!spinResolved) {
        reels = previousReels;
      }
      message = e?.message || '오류';
      await swalFire({
        icon: 'error',
        title: e?.message || '오류가 발생했습니다.',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });
    } finally {
      stopReelAnimation();
      spinning = false;
    }
  }

  async function loadComments(page = 1, append = false) {
    if (commentListLoading && append) {
      return;
    }
    commentListLoading = true;
    try {
      const query = new URLSearchParams({
        page: String(page),
        limit: String(commentPerPage)
      });
      const res = await fetch(`/games/slot/comment?${query.toString()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.comments) ? data.comments : [];
        if (append) {
          comments = [...comments, ...list];
        } else {
          comments = list;
        }
        commentPage = typeof data?.page === 'number' ? data.page : page;
        commentPerPage = typeof data?.perPage === 'number' ? data.perPage : commentPerPage;
        commentTotal =
          typeof data?.total === 'number' ? data.total : append ? commentTotal : list.length;
        commentHasMore = Boolean(data?.hasMore);

        if (!append) {
          // 알람이 읽음 처리되었으므로 레이아웃의 알람 카운트 갱신
          await invalidateAll();

          // 댓글 로드 후 URL에 댓글 ID가 있으면 스크롤
          const urlParams = new URLSearchParams(window.location.search);
          const commentId = urlParams.get('cmt');
          if (commentId) {
            scrollToComment(commentId);
          } else if (window.location.hash.startsWith('#comment-')) {
            const hashComment = window.location.hash.slice('#comment-'.length);
            scrollToComment(hashComment);
          }
        }
      }
    } catch (e) {
      console.error('댓글 로드 실패:', e);
    } finally {
      commentListLoading = false;
    }
  }

  const loadMoreComments = async () => {
    if (!commentHasMore || commentListLoading) return;
    await loadComments(commentPage + 1, true);
  };

  async function writeComment(parentId?: string) {
    const content = parentId ? replyContent[parentId] : commentContent;
    if (!content?.trim() || commentLoading) return;

    commentLoading = true;
    try {
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
        // 댓글 작성 시 잔액과 랭킹 갱신
        const result = await res.json();
        await Promise.all([loadComments(1), refreshBalance(), loadRank()]);

        // 댓글 작성 보상 toast 알림 (보상을 받은 경우에만)
        if (result.rewardGiven) {
          await swalFire({
            icon: 'success',
            title: '💬 댓글 작성 보상 +100점',
            toast: true,
            position: 'center',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
          });
        }

        // 알람 카운트 갱신
        await invalidateAll();
      } else {
        const err = await res.json();
        await swalFire({
          icon: 'error',
          title: err?.message || '댓글 작성 실패',
          toast: true,
          position: 'center',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        });
      }
    } catch (e) {
      console.error('댓글 작성 실패:', e);
      await swalFire({
        icon: 'error',
        title: '댓글 작성 중 오류가 발생했습니다.',
        toast: true,
        position: 'center',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });
    } finally {
      commentLoading = false;
    }
  }

  async function refreshAll() {
    refreshing = true;
    try {
      await Promise.all([refreshBalance(), loadRank(), loadComments(1)]);
      // 오링 상태면 카운트다운 시작
      if (oopsInfo) {
        updateOopsCountdown();
        // 카운트다운 인터벌이 없으면 시작
        if (!countdownInterval) {
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
        }
      }
    } finally {
      refreshing = false;
    }
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
        clearCommentAnchor();
      }
    }, 500);
  }

  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  const formatNumber = (value: number | null | undefined): string => {
    try {
      return new Intl.NumberFormat('ko-KR').format(value ?? 0);
    } catch (err) {
      console.error('숫자 포맷팅 실패:', err);
      return String(value ?? 0);
    }
  };

  const clearCommentAnchor = () => {
    try {
      const url = new URL(window.location.href);
      const params = url.searchParams;
      if (params.has('cmt')) {
        params.delete('cmt');
      }
      url.hash = '';
      const searchString = params.toString();
      const cleanUrl = `${url.pathname}${searchString ? `?${searchString}` : ''}`;
      history.replaceState(null, '', cleanUrl);
    } catch (err) {
      console.error('댓글 앵커 정리 실패:', err);
    }
  };

  // balance가 변경되면 bet이 balance를 초과하지 않도록 제한
  $effect(() => {
    if (balance > 0 && bet > balance) {
      bet = balance;
    }
  });

  onMount(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleMediaChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const matches = 'matches' in event ? event.matches : mediaQuery.matches;
      setMobileState(matches);
    };

    handleMediaChange(mediaQuery);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange as EventListener);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleMediaChange);
    }

    const initialize = async () => {
      try {
        await refreshBalance();
        await loadRank();
        await loadComments(1);

        // URL에 댓글 ID가 있으면 해당 댓글로 스크롤
        const urlParams = new URLSearchParams(window.location.search);
        const commentId = urlParams.get('cmt');
        scrollToComment(commentId);
        if (!commentId && window.location.hash.startsWith('#comment-')) {
          const hashComment = window.location.hash.slice('#comment-'.length);
          scrollToComment(hashComment);
        }

        // 오링 카운트다운 업데이트
        updateOopsCountdown();
        countdownInterval = setInterval(() => {
          if (oopsInfo) {
            updateOopsCountdown();
          } else if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
          }
        }, 1000);
      } catch (err) {
        console.error('슬롯 초기화 실패:', err);
      }
    };

    void initialize();

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleMediaChange as EventListener);
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(handleMediaChange);
      }
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      stopReelAnimation();
    };
  });
</script>

<main class="container my-4">
  <section class="mb-4">
    <div class="card shadow-sm border-0 bg-info-subtle rounded-4">
      <div class="card-body stats-banner py-2">
        <p class="mb-0 stats-inline">
          <span class="stats-item"
            >오늘의 참여 인원: <strong>{formatNumber(todayStats.users)}</strong></span
          >
          <span class="stats-item"
            >총 스핀 횟수: <strong>{formatNumber(todayStats.spins)}</strong></span
          >
        </p>
      </div>
    </div>
  </section>
  <div class="row justify-content-center">
    <div class="col-md-6 order-2 order-md-1">
      <div
        class="card shadow rounded-4 position-relative overflow-hidden"
        class:overflow-visible={guideCollapsed && isMobile}
      >
        <div
          class="alert alert-info mb-4 rounded-4 border-0 bg-gradient text-white slot-guide"
          data-collapsed={guideCollapsed && isMobile}
        >
          <div class="slot-guide-inner">
            <div class="slot-guide-header py-1">
              <div class="slot-guide-title">
                <button
                  type="button"
                  class="display-6 mb-0 flex-shrink-0 border-0 bg-transparent p-0"
                  class:slot-guide-dice-clickable={guideCollapsed && isMobile}
                  onclick={() => {
                    if (guideCollapsed && isMobile) toggleGuideCollapse();
                  }}
                  style={guideCollapsed && isMobile ? 'cursor: pointer;' : ''}
                  aria-label="가이드 펼치기">🎲</button
                >
                <h6 class="fw-bold mb-0">뺑뺑이는 즐거운 놀이터입니다</h6>
              </div>
              <button
                class="btn btn-sm btn-outline-light slot-guide-toggle"
                type="button"
                onclick={toggleGuideCollapse}
                aria-expanded={!(guideCollapsed && isMobile)}
                aria-controls="slot-guide-text"
              >
                <span class="slot-guide-toggle-icon" aria-hidden="true"
                  >{guideCollapsed && isMobile ? '⌄' : '⌃'}</span
                >
                <span class="visually-hidden"
                  >{guideCollapsed && isMobile ? '안내 펼치기' : '안내 접기'}</span
                >
              </button>
            </div>
            <p
              id="slot-guide-text"
              class="slot-guide-text mb-0 small mt-3 mt-md-2"
              hidden={guideCollapsed && isMobile}
            >
              뺑뺑이 점수는 무료로 무제한 제공되며 어떤 형태로든 타인에게 이전하거나 현금·재화로
              전환되지 않는 순수한 놀이용 포인트입니다.
              <br />오직 게임의 재미를 위해 활용해 주세요!
              <br /><strong
                >모든 확률은 어떠한 인위적 개입이 없는 기계적인 무작위의 결과입니다.</strong
              >
              <br /><strong class="text-danger"
                >🥶현실의 도박세계는 훨씬 냉혹하고 무섭습니다.☠️</strong
              >
            </p>
          </div>
        </div>
        {#if spinning || refreshing}
          <div class="slot-overlay"></div>
        {/if}
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h4 class="mb-0">뺑뺑이</h4>
            <button
              class="btn btn-sm btn-outline-secondary"
              onclick={refreshAll}
              title="새로고침"
              disabled={refreshing || spinning}
            >
              🔄
            </button>
          </div>
          <div class="mb-2">
            <div>보유 점수: <strong>{formatNumber(balance)}</strong></div>
          </div>
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="d-flex align-items-center gap-2">
              <input
                type="tel"
                class="form-control form-control-sm bet-input"
                style="width: 100px;"
                bind:value={bet}
                oninput={(e) => {
                  const target = e.target as HTMLInputElement;
                  if (!target) return;
                  const val = Number(target.value);
                  if (val > balance) bet = balance;
                  else if (val >= 1) bet = val;
                }}
              />
              <button
                class="btn btn-sm btn-light"
                onclick={() => (bet = Math.min(bet + 10, balance))}
                disabled={spinning || refreshing || balance < 10}
              >
                <em class="bi bi-dice-1 me-0 me-md-2"></em><span class="d-none d-lg-inline">10</span
                >
              </button>
              <button
                class="btn btn-sm btn-success"
                onclick={() => (bet = Math.floor(balance * 0.05))}
                disabled={spinning || refreshing || balance < 20}
              >
                <em class="bi bi-5-square-fill me-0 me-md-2"></em><span class="d-none d-lg-inline"
                  >5%</span
                >
              </button>
              <button
                class="btn btn-sm btn-info"
                onclick={() => (bet = Math.floor(balance * 0.1))}
                disabled={spinning || refreshing || balance < 10}
              >
                <em class="bi bi-percent me-0 me-md-2"></em><span class="d-none d-lg-inline"
                  >10%</span
                >
              </button>
              <button
                class="btn btn-sm btn-warning"
                onclick={() => (bet = Math.floor(balance / 2))}
                disabled={spinning || refreshing || balance < 2}
              >
                <em class="bi bi-dice-3 me-0 me-md-2"></em><span class="d-none d-lg-inline"
                  >반틈</span
                >
              </button>
              <button
                class="btn btn-sm btn-danger"
                onclick={() => (bet = balance)}
                disabled={spinning || refreshing || balance < 1}
              >
                <em class="bi bi-dice-6 me-0 me-md-2"></em><span class="d-none d-lg-inline"
                  >올인</span
                >
              </button>
            </div>
          </div>
          <div class="slot border rounded-3 p-3 text-center mb-3" class:slot-spinning={spinning}>
            {#if currentSpinPhrase}
              <div class="slot-phrase mb-3">
                <div class="fs-5 fw-bold text-primary mb-2">{currentSpinPhrase.top}</div>
                {#if currentSpinPhrase.middle}
                  <div class="fs-6 text-secondary mb-1">{currentSpinPhrase.middle}</div>
                {/if}
                {#if currentSpinPhrase.bottom}
                  <div class="small text-muted">{currentSpinPhrase.bottom}</div>
                {/if}
              </div>
            {/if}
            <div class="slot-reels display-4 fw-semibold">
              {#each reels as reel, reelIndex (`reel-${reelIndex}`)}
                <span class="slot-reel" class:slot-reel-spinning={spinning}>{reel}</span>
              {/each}
            </div>
          </div>
          <button
            class="btn btn-lg btn-primary w-100"
            disabled={spinning || balance < bet || balance === 0}
            onclick={play}
          >
            {spinning ? '스핀 중...' : '🎁 ㄱㄱ'}
          </button>
          {#if message}
            <div class="mt-3 fw-bold">{message}</div>
          {/if}
          {#if oopsInfo && oopsCountdown}
            <div class="mt-3 p-3 bg-warning-subtle rounded border border-warning">
              <div class="fw-bold text-danger mb-2">욕심은 화를 부릅니다</div>
              <div class="mb-1">
                남은 시간: <strong class="text-danger" style="font-size: 1.2em;"
                  >{oopsCountdown}</strong
                >
              </div>
              <small class="text-muted">5분 후에 700점이 자동 지급됩니다.</small>
            </div>
          {/if}
        </div>
      </div>
    </div>
    <div class="col-md-4 order-1 order-md-2 mb-3 mb-md-0">
      <div class="card shadow rounded-4 position-relative overflow-hidden">
        {#if refreshing}
          <div class="card-overlay">
            <div class="spinner-border text-light" role="status"></div>
          </div>
        {/if}
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">랭킹 Top 10</h5>
            <button
              class="btn btn-sm btn-outline-secondary"
              onclick={refreshAll}
              title="새로고침"
              disabled={refreshing || spinning}
            >
              🔄
            </button>
          </div>
          <ol class="list-group list-group-numbered">
            {#each rankList as r, i (r._id ?? `${r.nickname}:${r.balance}`)}
              <li class="list-group-item d-flex justify-content-between align-items-center">
                <span>{r.nickname}</span>
                <span class="fw-bold font-monospace">{formatNumber(r.balance)}</span>
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
        {#if refreshing && !commentLoading}
          <div class="card-overlay">
            <div class="spinner-border text-light" role="status"></div>
          </div>
        {/if}
        {#if commentLoading}
          <div class="slot-overlay d-flex flex-column justify-content-center align-items-center">
            <div class="spinner-border text-light" role="status"></div>
            <div class="mt-2 fw-bold text-light">댓글 등록 중...</div>
          </div>
        {/if}
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0">💬 리플 ({formatNumber(commentTotal)})</h5>
            <button
              class="btn btn-sm btn-outline-secondary"
              onclick={refreshAll}
              title="새로고침"
              disabled={refreshing || spinning}
            >
              🔄
            </button>
          </div>

          <!-- 댓글 작성 폼 (위) - 댓글이 있을 때만 표시 -->
          {#if data.session?.user && 'nickname' in data.session.user && comments.length > 0}
            <div class="comment-input-wrapper mb-3">
              <textarea
                class="form-control comment-textarea"
                rows="3"
                placeholder="리플 작성시 100점 줍니다 (하루 10개까지 보상)"
                bind:value={commentContent}
                disabled={commentLoading}
              ></textarea>
              <button
                class="btn btn-primary comment-submit-btn"
                type="button"
                onclick={() => writeComment()}
                disabled={commentLoading ||
                  !commentContent.trim() ||
                  commentContent.trim().length < 2}
              >
                {commentLoading ? '등록 중...' : '등록'}
              </button>
            </div>

            <hr />
          {/if}

          <!-- 댓글 목록 -->
          {#if comments.length > 0}
            <div class="mb-3">
              {#each comments as comment (comment._id ?? comment.id ?? `${comment.nickname}:${comment.createdAt}`)}
                <div class="border-bottom pb-3 mb-3 d-flex">
                  {#if comment.parentCommentNickname}
                    <div class="me-2 flex-shrink-0">
                      <i class="bi bi-arrow-return-right text-success"></i>
                    </div>
                  {/if}
                  <div class="flex-grow-1 {(comment.depth ?? 1) > 1 ? 'ms-2' : ''}">
                    {#if comment.parentCommentNickname}
                      <div class="mb-2">
                        <span class="badge bg-secondary text-warning">
                          <span>@</span>
                          <span class="text-muted small">{comment.parentCommentNickname}</span>
                        </span>
                      </div>
                    {/if}
                    <div class="d-flex align-items-start gap-2 mb-2">
                      {#if comment.photo}
                        <img
                          src={comment.photo}
                          alt="프로필"
                          class="rounded-circle"
                          style="width: 32px; height: 32px; object-fit: cover;"
                        />
                      {/if}
                      <div class="flex-grow-1">
                        <div class="d-flex align-items-center gap-2">
                          <span class="fw-bold">{comment.nickname}</span>
                          <small class="text-muted">
                            {formatRelativeTime(comment.createdAt, {
                              locale: ko,
                              addSuffix: true
                            })}
                          </small>
                        </div>
                      </div>
                    </div>
                    <div class="ms-1" id={comment.id ? `comment-${comment.id}` : undefined}>
                      {#if isOnlyOneEmoji(comment.content)}
                        <span class="slot-comment-single-emoji">{comment.content}</span>
                      {:else}
                        {comment.content}
                      {/if}
                    </div>
                    <!-- 대댓글 작성 폼 -->
                    {#if data.session?.user && 'nickname' in data.session.user}
                      <div class="mt-2">
                        {#if comment.id && replyingTo === comment.id}
                          <div class="comment-input-wrapper">
                            <textarea
                              class="form-control comment-textarea"
                              rows="2"
                              placeholder="답글을 입력하세요..."
                              bind:value={replyContent[comment.id]}
                              disabled={commentLoading}
                            ></textarea>
                            <div class="d-flex gap-2">
                              <button
                                class="btn btn-primary comment-submit-btn"
                                type="button"
                                onclick={() => comment.id && writeComment(comment.id)}
                                disabled={commentLoading ||
                                  !replyContent[comment.id]?.trim() ||
                                  (replyContent[comment.id]?.trim().length ?? 0) < 2}
                              >
                                {commentLoading ? '등록 중...' : '등록'}
                              </button>
                              <button
                                class="btn btn-secondary comment-submit-btn"
                                type="button"
                                onclick={() => {
                                  if (comment.id) {
                                    replyingTo = null;
                                    replyContent[comment.id] = '';
                                  }
                                }}
                                disabled={commentLoading}
                              >
                                취소
                              </button>
                            </div>
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
                </div>
              {/each}
            </div>
            {#if commentHasMore}
              <div class="text-center mt-3">
                <button
                  class="btn btn-outline-secondary btn-sm"
                  onclick={() => void loadMoreComments()}
                  disabled={commentListLoading || refreshing}
                >
                  {commentListLoading ? '불러오는 중...' : '더 보기'}
                </button>
                <div class="text-muted small mt-2">
                  {formatNumber(comments.length)} / {formatNumber(commentTotal)}
                </div>
              </div>
            {/if}
          {:else}
            <div class="text-muted text-center py-3">
              아직 리플이 없습니다. 첫 리플을 남겨보세요! 💬
            </div>
          {/if}

          <!-- 댓글 작성 폼 -->
          {#if data.session?.user && 'nickname' in data.session.user}
            <div class="comment-input-wrapper mt-3">
              <textarea
                class="form-control comment-textarea"
                rows="3"
                placeholder="리플 작성시 100점 줍니다 (하루 10개까지 보상)"
                bind:value={commentContent}
                disabled={commentLoading}
              ></textarea>
              <button
                class="btn btn-primary comment-submit-btn"
                type="button"
                onclick={() => writeComment()}
                disabled={commentLoading ||
                  !commentContent.trim() ||
                  commentContent.trim().length < 2}
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
  .stats-banner {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1.25rem;
  }
  .stats-inline {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    gap: 1.5rem;
    flex-wrap: wrap;
    font-size: 0.95rem;
    color: var(--bs-body-color);
  }
  .stats-item {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
  }
  .stats-inline strong {
    font-size: 1.05rem;
  }
  .slot-guide {
    --bs-alert-bg: transparent;
    --bs-alert-border-color: rgba(255, 255, 255, 0.2);
    --bs-alert-color: #fff;
    background: linear-gradient(
      135deg,
      rgba(9, 132, 227, 0.95),
      rgba(45, 197, 253, 0.95)
    ) !important;
    border: none;
    color: #fff;
    box-shadow: 0 10px 30px rgba(9, 132, 227, 0.25);
  }
  .slot-guide-inner {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .slot-guide-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 1rem;
    flex-wrap: nowrap;
  }
  .slot-guide-title {
    display: inline-flex;
    align-items: center;
    gap: 0.8rem;
    flex: 1;
    min-width: 0;
  }
  .slot-guide-title :global(h6) {
    margin: 0;
  }
  .slot-guide-toggle {
    position: static;
    border-color: rgba(255, 255, 255, 0.6);
    color: #fff;
    font-weight: 600;
  }
  .slot-guide-text {
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .slot-guide-text strong {
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .slot-guide-toggle-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    line-height: 1;
  }
  .slot-guide-toggle:focus,
  .slot-guide-toggle:hover {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.85);
    background-color: rgba(255, 255, 255, 0.15);
  }
  .slot-guide[data-collapsed='true'] {
    position: fixed;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    width: auto;
    min-width: auto;
    max-width: 60px;
    margin: 0;
    z-index: 1000;
    padding: 0.5rem 0.25rem;
    border-radius: 0 0.5rem 0.5rem 0;
    box-shadow: 4px 0 12px rgba(0, 0, 0, 0.15);
  }
  .slot-guide[data-collapsed='true'] .slot-guide-inner {
    gap: 0;
    flex-direction: column;
    align-items: center;
  }
  .slot-guide[data-collapsed='true'] .slot-guide-header {
    flex-direction: column;
    gap: 0;
    align-items: center;
    width: 100%;
  }
  .slot-guide[data-collapsed='true'] .slot-guide-title {
    flex-direction: column;
    gap: 0;
    align-items: center;
  }
  .slot-guide[data-collapsed='true'] .slot-guide-title :global(h6) {
    display: none;
  }
  .slot-guide[data-collapsed='true'] .slot-guide-title :global(.display-6) {
    font-size: 1.5rem;
    margin: 0;
  }
  .slot-guide[data-collapsed='true'] .slot-guide-toggle {
    display: none;
  }
  .slot-guide[data-collapsed='true'] .slot-guide-dice-clickable {
    transition: transform 0.2s ease;
  }
  .slot-guide[data-collapsed='true'] .slot-guide-dice-clickable:hover {
    transform: scale(1.2);
  }
  .slot.slot-spinning {
    border-color: var(--bs-warning);
    box-shadow: 0 0 18px rgba(255, 193, 7, 0.35);
    transition:
      box-shadow 0.3s ease,
      border-color 0.3s ease;
  }
  .slot-phrase {
    display: block !important;
    opacity: 1 !important;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    min-height: 3rem;
  }
  .slot-reels {
    display: flex;
    justify-content: center;
    gap: 1.5rem;
    align-items: center;
    min-height: 72px;
  }
  .slot-reel {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 68px;
    height: 68px;
    border-radius: 16px;
    transition:
      transform 0.2s ease,
      background-color 0.2s ease;
  }
  .slot-reel-spinning {
    animation: reelBounce 0.32s ease-in-out infinite alternate;
    background-color: rgba(255, 255, 255, 0.08);
    transform: scale(1.05);
  }
  @keyframes reelBounce {
    from {
      transform: translateY(-6px) scale(1.05);
      opacity: 0.85;
    }
    to {
      transform: translateY(6px) scale(1.05);
      opacity: 1;
    }
  }
  .slot-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0);
    z-index: 10;
  }
  /* 모바일에서 접힌 상태일 때 카드 overflow 허용 */
  @media (max-width: 768px) {
    .card:has(.slot-guide[data-collapsed='true']) {
      overflow: visible !important;
    }
  }
  .card-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 12;
    backdrop-filter: blur(1px);
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
  .slot-comment-single-emoji {
    display: inline-block;
    font-size: 3em;
    line-height: 1;
  }
  /* 모바일에서 스핀 문구 영역 패딩 줄이기 및 댓글 입력창이 보이도록 */
  @media (max-width: 768px) {
    .slot {
      padding: 0.75rem !important;
    }
    .slot-phrase {
      padding: 0.5rem !important;
    }
    .comment-input-wrapper {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      position: relative;
      z-index: 1;
    }
    .stats-banner {
      justify-content: flex-start;
      padding: 1rem;
    }
    .stats-inline {
      gap: 1rem;
      font-size: 0.9rem;
    }
    .slot-guide-header {
      flex-wrap: wrap;
      justify-content: space-between;
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
