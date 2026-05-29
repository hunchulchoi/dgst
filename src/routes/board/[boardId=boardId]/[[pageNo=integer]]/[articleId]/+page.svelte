<script>
  import {
    Badge,
    Button,
    Col,
    Icon,
    InputGroup,
    Row
  } from '$lib/components/ui/index.js';
  import { goto, invalidate } from '$app/navigation';
  import { boardListPath } from '$lib/util/boardPaths.js';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { scale } from 'svelte/transition';

  import { formatDistanceToNowStrict, formatISO9075, parseISO } from 'date-fns';
  import { ko } from 'date-fns/locale';

  import imageCompression from 'browser-image-compression';
  import { swalFire } from '$lib/util/swal.js';

  import { alarmCount } from '$lib/util/store.js';
  import { onMount } from 'svelte';
  import BoardList from '$lib/components/board_list.svelte';
  import OGPreview from '$lib/components/OGPreview.svelte';
  import sanitizeHtml from 'sanitize-html';
  import { countEmojis } from '$lib/util/emoji.js';

  /** @type {typeof import('$lib/util/embeder.js') | null} */
  let embeder = $state(null);

  // Svelte 5 Runes - Props
  let { data } = $props();

  const boardId = $derived($page.params.boardId);
  const articleId = $derived($page.params.articleId);
  const pageNo = $derived($page.params.pageNo);

  // 애니메이션 관련 상태
  let likeAnimation = $state(false);
  let commentLikeAnimations = $state(new Set());

  // 댓글 좋아요 애니메이션 함수
  function triggerLikeAnimation(commentId) {
    commentLikeAnimations.add(commentId);
    setTimeout(() => {
      commentLikeAnimations.delete(commentId);
    }, 1000);
  }

  function like() {
    likeAnimation = true;
    fetch(`/board/${boardId}/${articleId}/like`, { method: 'POST' })
      .then((res) => res.json())
      .then((d) => {
        articleLike = d.like;
        articleLiked = d.liked;
        setTimeout(() => {
          likeAnimation = false;
        }, 600);
      });
  }

  async function likeComment(commentId) {
    try {
      const response = await fetch(`/board/${boardId}/${articleId}/like/${commentId}`, {
        method: 'POST'
      });
      const updatedComment = await response.json();

      // 개별 댓글만 업데이트
      commentData = commentData.map((comment) => {
        if (comment._id === commentId) {
          return {
            ...comment,
            like: updatedComment.like,
            liked: updatedComment.liked
          };
        }
        return comment;
      });

      // 좋아요 애니메이션 트리거
      triggerLikeAnimation(commentId);
    } catch (error) {
      console.error('댓글 좋아요 실패:', error);
    }
  }

  function comments() {
    console.log('🔄 댓글 새로고침 시작:', `/board/${boardId}/${articleId}/comment`);
    fetch(`/board/${boardId}/${articleId}/comment`)
      .then((res) => {
        console.log('✅ 댓글 응답:', res.status);
        return res.json();
      })
      .then((d) => {
        console.log('📝 댓글 데이터:', d.length, '개');
        // $state 직접 업데이트
        commentData = d;
      })
      .catch((err) => {
        console.error('❌ 댓글 새로고침 실패:', err);
      });
  }

  async function list() {
    const currentPageNo = pageNo || 1;

    await invalidate('board-list');
    goto(boardListPath(boardId, currentPageNo), { replaceState: true });
  }

  async function preview(event, el) {
    if (event.type === 'paste') {
      /*console.log('event.clipboardData.files', event.clipboardData.files)
        console.log('event.clipboardData.files[0]', event.clipboardData.files[0])
        console.log('event.clipboardData.files[0].type', event.clipboardData.files[0].type)*/

      if (
        event.clipboardData.files?.length &&
        event.clipboardData.files[0].type.startsWith('image')
      ) {
        commentImage = event.clipboardData.files[0];

        event.preventDefault();
      } else return;
    } else commentImage = event.target.files[0];

    if (commentImage) {
      el.src = window.URL.createObjectURL(commentImage);
    }

    el.onload = async (evt) => {
      commentLoading = true;

      //console.log('commentImage.type', commentImage.type)

      if (
        commentImage &&
        !commentImage.type.endsWith('gif') &&
        !commentImage.type.endsWith('webp')
      ) {
        const fileSizeMB = commentImage.size / (1024 * 1024);
        // 1MB 이하는 변환하지 않고 원본 유지
        if (fileSizeMB > 1) {
          try {
            const webp = await imageCompression(commentImage, {
              maxSizeMB: 10,
              maxWidthOrHeight: 800,
              useWebWorker: true,
              fileType: 'image/webp',
              initialQuality: 0.85
            });
            commentImage =
              webp instanceof File
                ? webp
                : new File([webp], commentImage.name, { type: 'image/webp' });
          } catch (error) {
            console.error('[browser-image-compression] 댓글 이미지 변환 실패:', error);
            // 변환 실패 시 원본 사용
          }
        } else {
          console.log(
            '[browser-image-compression] 1MB 이하 댓글 이미지는 원본 유지:',
            fileSizeMB.toFixed(2),
            'MB'
          );
        }
      }

      // WebP 변환 시 이미 회전이 적용됨

      el.style.maxHeight = getImageMaxHeight(el);
      el.classList.remove('d-none');

      commentLoading = false;
    };
  }

  let reCommentDiv = $state(null);
  let reCommentContent = $state('');
  /** @type {HTMLImageElement | null} */
  let rePreviewEl = $state(null);
  /** @type {HTMLInputElement | null} */
  let reCommentImageEl = $state(null);

  /** @type {HTMLDivElement | null} */
  let commentDiv = $state(null);
  let commentContent = $state('');
  let commentImage = $state(null);
  /** @type {HTMLImageElement | null} */
  let previewEl = $state(null);
  /** @type {HTMLInputElement | null} */
  let commentImageEl = $state(null);

  let commentLoading = $state(false);

  // 댓글 수정 관련 상태
  let editingCommentId = $state('');
  let editCommentContent = $state('');
  let editCommentImage = $state(null);
  /** @type {HTMLImageElement | null} */
  let editPreviewEl = $state(null);
  /** @type {HTMLInputElement | null} */
  let editCommentImageEl = $state(null);

  async function writeComment(parentCommentId) {
    //console.log(commentContent, parentCommentId, reCommentContent)

    // 중복 클릭 방지
    if (commentLoading) {
      console.log('⚠️ 이미 댓글 저장 중입니다.');
      return;
    }

    if ((!parentCommentId && !commentContent) || (parentCommentId && !reCommentContent)) {
      toast('내용을 입력하세요', 'warning');
      return;
    }

    // 댓글 저장 시작 시 즉시 오버레이 표시
    console.log('🔄 댓글 저장 시작 - commentLoading:', commentLoading);
    commentLoading = true;
    console.log('✅ commentLoading = true로 설정');

    const formData = new FormData();

    if (!parentCommentId) {
      formData.append('content', commentContent);
      if (commentImage) formData.append('image', commentImage);
    } else {
      formData.append('content', reCommentContent);
      formData.append('parentCommentId', parentCommentId);
      if (commentImage) formData.append('image', commentImage);
    }

    fetch(`/board/${boardId}/${articleId}/comment`, {
      method: 'POST',
      body: formData
    })
      .then(async (res) => {
        console.debug('res', res);

        if (res.status !== 201) {
          const { message } = await res.json();
          toast(message, 'error');
          return;
        }

        commentContent = '';
        commentImage = null;
        commentImageEl.value = '';
        previewEl.src = '';
        previewEl.classList.add('d-none');

        visibleReply = '';
        reCommentContent = '';
        if (parentCommentId) {
          reCommentImageEl.value = '';
          rePreviewEl.src = '';
          rePreviewEl.classList.add('d-none');
        }

        toast('저장 되었습니다.', 'success');

        comments();
      })
      .catch((error) => {
        console.error('❌ 댓글 저장 실패:', error);
        //toast(error.message ?? '저장 중 오류가 발생했습니다.', 'danger');

        toast(error.message ?? '저장 중 오류가 발생했습니다.', 'error');
      })
      .finally(() => {
        console.log('🏁 댓글 저장 완료 - commentLoading을 false로 설정');
        commentLoading = false;
      });
  }

  async function deleteComment(commentId) {
    const result = await swalFire({
      title: '삭제 하시겠습니까?',
      text: '삭제 하시겠습니까?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: '삭제'
    });

    if (result.isConfirmed) {
        commentLoading = true;

        fetch(`/board/${boardId}/${articleId}/comment`, {
          method: 'DELETE',
          body: JSON.stringify({ commentId })
        })
          .then(async (res) => {
            if (res.status !== 200) {
              const { message } = await res.json();
              await toast(message, 'error');
              return;
            }

            const _message = await res.text();

            await toast(_message || '삭제 되었습니다.', 'success');

            commentLoading = false;
            comments();
          })
          .catch(async (err) => {
            console.error(err);

            await toast(err.message ?? '삭제 중 오류가 발생했습니다.', 'error');
          })
          .finally(() => {
            commentLoading = false;
          });
    }
  }

  // 댓글 수정 시작
  function startEditComment(comment) {
    editingCommentId = comment._id;
    editCommentContent = comment.content;
    editCommentImage = null;

    // DOM이 업데이트된 후 미리보기 설정
    setTimeout(() => {
      if (editPreviewEl) {
        if (comment.image) {
          editPreviewEl.src = comment.image;
          editPreviewEl.classList.remove('d-none');
        } else {
          editPreviewEl.src = '';
          editPreviewEl.classList.add('d-none');
        }
      }
    }, 0);
  }

  // 댓글 수정 취소
  function cancelEditComment() {
    editingCommentId = '';
    editCommentContent = '';
    editCommentImage = null;
    if (editCommentImageEl) editCommentImageEl.value = '';
    if (editPreviewEl) {
      editPreviewEl.src = '';
      editPreviewEl.classList.add('d-none');
    }
  }

  // 댓글 수정 저장
  async function saveEditComment() {
    // 중복 클릭 방지
    if (commentLoading) {
      console.log('⚠️ 이미 댓글 수정 저장 중입니다.');
      return;
    }

    if (!editCommentContent.trim()) {
      toast('내용을 입력하세요', 'warning');
      return;
    }

    commentLoading = true;

    const formData = new FormData();
    formData.append('content', editCommentContent);
    formData.append('commentId', editingCommentId);

    // 새 이미지가 있으면 추가, 없으면 기존 이미지 유지
    if (editCommentImage) {
      formData.append('image', editCommentImage);
    }

    try {
      const response = await fetch(`/board/${boardId}/${articleId}/comment`, {
        method: 'PUT',
        body: formData
      });

      if (response.status !== 200) {
        const { message } = await response.json();
        toast(message || '댓글 수정 중 오류가 발생했습니다.', 'error');
        return;
      }

      toast('댓글이 수정되었습니다.', 'success');

      cancelEditComment();
      comments();
    } catch (error) {
      console.error('댓글 수정 실패:', error);

      toast('댓글 수정 중 오류가 발생했습니다.', 'error');
    } finally {
      commentLoading = false;
    }
  }

  // 댓글 이미지 삭제
  function removeEditCommentImage() {
    editCommentImage = null;
    if (editCommentImageEl) editCommentImageEl.value = '';
    if (editPreviewEl) {
      editPreviewEl.src = '';
      editPreviewEl.classList.add('d-none');
    }
  }

  // 댓글 이미지 미리보기
  function previewEditImage(event, el) {
    if (event.type === 'paste') {
      if (
        event.clipboardData.files?.length &&
        event.clipboardData.files[0].type.startsWith('image')
      ) {
        editCommentImage = event.clipboardData.files[0];
        event.preventDefault();
      } else return;
    } else {
      editCommentImage = event.target.files[0];
    }

    if (editCommentImage) {
      el.src = window.URL.createObjectURL(editCommentImage);
    }

    el.onload = async (evt) => {
      if (
        editCommentImage &&
        !editCommentImage.type.endsWith('gif') &&
        !editCommentImage.type.endsWith('webp')
      ) {
        const fileSizeMB = editCommentImage.size / (1024 * 1024);
        // 1MB 이하는 변환하지 않고 원본 유지
        if (fileSizeMB > 1) {
          try {
            const webp = await imageCompression(editCommentImage, {
              maxSizeMB: 10,
              maxWidthOrHeight: 800,
              useWebWorker: true,
              fileType: 'image/webp',
              initialQuality: 0.85
            });
            editCommentImage =
              webp instanceof File
                ? webp
                : new File([webp], editCommentImage.name, { type: 'image/webp' });
          } catch (error) {
            console.error('[browser-image-compression] 댓글 이미지 변환 실패:', error);
            // 변환 실패 시 원본 사용
          }
        } else {
          console.log(
            '[browser-image-compression] 1MB 이하 댓글 이미지는 원본 유지:',
            fileSizeMB.toFixed(2),
            'MB'
          );
        }
      }

      // WebP 변환 시 이미 회전이 적용됨

      el.style.maxHeight = getImageMaxHeight(el);
      el.classList.remove('d-none');
    };
  }

  async function remove(articleId) {
    const result = await swalFire({
      icon: 'warning',
      title: '삭제 하시겠습니까?',
      text: '삭제 하시겠습니까?',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: '삭제'
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/board/${boardId}/${articleId}/delete`, {
        method: 'DELETE',
        body: JSON.stringify({ articleId })
      });

      if (res.status !== 200) {
        const { message } = await res.json();
        await toast(message, 'error');
        return;
      }

      await toast('삭제되었습니다', 'success');
      list();
    } catch (err) {
      console.error(err);
      await toast(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.', 'error');
    }
  }

  function edit(articleId) {
    goto(`/board/${boardId}/write/${articleId}`);
  }

  function write() {
    goto(`/board/${boardId}/write`);
  }

  /**
   * page 이동
   * @param pageNo {number}
   */
  function gopage(pageNo) {
    goto(`/board/${boardId}/${pageNo}?v=${new Date().getSeconds()}`, { invalidateAll: true });
  }

  /** 세로가 가로의 2배를 초과하는 긴 이미지(긴짤) */
  function isLongImage(img) {
    if (!img?.naturalWidth || !img?.naturalHeight) return false;
    return img.naturalHeight > img.naturalWidth * 2;
  }

  /**
   * 첨부 이미지 max-height — 긴짤은 80vh, 그 외는 뷰포트 높이를 넘지 않음
   * @param {HTMLImageElement | null | undefined} img
   */
  function getImageMaxHeight(img) {
    if (!img) return '100vh';
    if (isLongImage(img)) {
      return '80vh';
    }
    return '100vh';
  }

  /** OG 카드 썸네일 등 레이아웃 고정 이미지는 제외 */
  function isBoardAttachmentImage(img) {
    return img instanceof HTMLImageElement && !img.closest('.og-card-blot, .og-preview');
  }

  /**
   * @param {HTMLImageElement} img
   */
  function applyAttachmentImageMaxHeight(img) {
    if (!isBoardAttachmentImage(img)) return;
    img.style.maxWidth = '100%';
    img.style.maxHeight = getImageMaxHeight(img);
  }

  /**
   * @param {ParentNode} [root]
   */
  function applyAttachmentImagesIn(root = document) {
    root.querySelectorAll('.article-content img, .comment-section img').forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return;
      if (img.complete && img.naturalWidth > 0) {
        applyAttachmentImageMaxHeight(img);
      } else {
        img.addEventListener('load', () => applyAttachmentImageMaxHeight(img), { once: true });
      }
    });
  }

  /**
   * Swal toast 메시지 표시
   * @param {string} message - 표시할 메시지
   * @param {string} type - 메시지 타입 ('success', 'error', 'warning', 'info', 'primary')
   */
  async function toast(message, type = 'primary') {
    // type을 Swal icon으로 매핑
    const iconMap = {
      success: 'success',
      error: 'error',
      danger: 'error',
      warning: 'warning',
      info: 'info',
      primary: 'success' // 기본값은 success
    };

    const icon = iconMap[type] || 'success';

    if (type === 'error') {
      // error 타입은 일반 모달로 표시
      return await swalFire({
        icon: 'error',
        title: message,
        confirmButtonColor: '#3085d6',
        confirmButtonText: '확인'
      });
    } else {
      // 그 외 타입은 toast로 표시
      return await swalFire({
        icon: icon,
        title: message,
        toast: true,
        timer: 1000,
        timerProgressBar: true,
        showConfirmButton: false,
        position: 'center'
      });
    }
  }

  /** 게시글 열람 시 알림 읽음 + 헤더 뱃지 갱신 (SSR blocking 제거) */
  $effect(() => {
    if (!browser || !articleId || !data.session?.user?.nickname) return;

    let cancelled = false;

    fetch('/api/alarm/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId })
    })
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((body) => {
        if (!cancelled) alarmCount.set(body.count ?? 0);
      })
      .catch(() => {
        if (!cancelled) alarmCount.set(0);
      });

    return () => {
      cancelled = true;
    };
  });

  let visibleReply = $state('');

  // 댓글 데이터를 $state로 관리
  let commentData = $state([]);
  let articleLike = $state(0);
  let articleLiked = $state(false);

  $effect.pre(() => {
    commentData = data.article.comments;
    articleLike = data.article.like;
    articleLiked = data.article.liked;
  });

  $effect(() => {
    console.log('🔄 게시글 상세 페이지 - articleId:', articleId);
    console.log('📝 게시글:', data.article.title);
    console.log('💬 댓글 수:', data.article.comments?.length);
  });

  // 댓글 내용에서 URL 추출하는 함수
  function extractUrls(text) {
    const urlRegex =
      /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/g;
    return text.match(urlRegex) || [];
  }

  // 게시물 내용에서 URL 추출하는 함수
  function extractUrlsFromArticle(htmlContent) {
    // HTML 태그를 제거하고 텍스트만 추출
    const textContent = htmlContent.replace(/<[^>]*>/g, '');
    const urls = extractUrls(textContent);
    console.log('게시물에서 추출된 URLs:', urls);
    return urls;
  }

  // 게시물 내용을 처리하는 함수 (URL 제거하고 HTML 정리)
  function processArticleContent(htmlContent) {
    // sanitize-html 설정에서 인스타그램 임베드 허용
    return sanitizeHtml(htmlContent, {
      allowedTags: [
        'p',
        'br',
        'strong',
        'em',
        'u',
        's',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'ul',
        'ol',
        'li',
        'blockquote',
        'a',
        'img',
        'video',
        'iframe',
        'div',
        'span',
        'pre',
        'code'
      ],
      allowedAttributes: {
        blockquote: ['class', 'data-instgrm-permalink', 'style'],
        iframe: [
          'src',
          'width',
          'height',
          'frameborder',
          'allow',
          'allowfullscreen',
          'style',
          'position'
        ],
        video: ['src', 'controls', 'style', 'width', 'height'],
        a: ['href', 'target', 'rel'],
        img: ['src', 'alt', 'width', 'height', 'style'],
        div: ['class', 'style', 'position'],
        span: ['style', 'class'],
        pre: ['class'],
        code: ['class']
      },
      allowedStyles: {
        '*': {
          'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
          color: [
            /^#(?:[0-9a-fA-F]{3,4}){1,2}$/,
            /^rgb\(/,
            /^rgba\(/,
            /^hsl\(/,
            /^hsla\(/,
            /^[a-z]+$/
          ],
          'background-color': [
            /^#(?:[0-9a-fA-F]{3,4}){1,2}$/,
            /^rgb\(/,
            /^rgba\(/,
            /^hsl\(/,
            /^hsla\(/,
            /^[a-z]+$/
          ],
          'font-size': [/^\d+(?:px|em|rem|%)$/],
          width: [/^\d+(?:px|em|rem|%)$/],
          height: [/^\d+(?:px|em|rem|%)$/],
          'max-width': [/^\d+(?:px|em|rem|%)$/],
          'aspect-ratio': [/.*/],
          margin: [/.*/],
          display: [/.*/],
          position: [/.*/],
          top: [/.*/],
          left: [/.*/],
          'padding-bottom': [/.*/]
        }
      }
    });
  }

  onMount(async () => {
    embeder = await import('$lib/util/embeder.js');
    // 인스타그램 임베드 처리
    setTimeout(() => {
      console.log('인스타그램 임베드 확인:', document.querySelector('blockquote.instagram-media'));
      if (document.querySelector('blockquote.instagram-media')) {
        console.log('인스타그램 임베드 처리 시작');
        if (typeof instgrm !== 'undefined' && instgrm.Embeds) {
          instgrm.Embeds.process();
          console.log('인스타그램 임베드 처리 완료');
        } else {
          console.log('instgrm 객체를 찾을 수 없음');
        }
      }
    }, 1000);

    // 추가로 3초 후에도 다시 시도
    setTimeout(() => {
      if (document.querySelector('blockquote.instagram-media')) {
        console.log('인스타그램 임베드 재처리 시도');
        if (typeof instgrm !== 'undefined' && instgrm.Embeds) {
          instgrm.Embeds.process();
        }
      }
    }, 3000);

    console.log('url', $page.url);

    const hash = $page.url.searchParams.get('a');

    if (hash) {
      const el = document.querySelector(`#${hash}`);
      setTimeout(
        () => el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }),
        500
      );
    }

    // Quill ql-syntax 코드 하이라이트 적용 (PrismJS)
    setTimeout(async () => {
      if (typeof document !== 'undefined') {
        const { default: Prism } = await import('prismjs');
        await import('prismjs/components/prism-clike.js');
        await import('prismjs/components/prism-javascript.js');
        await import('prismjs/components/prism-css.js');
        await import('prismjs/components/prism-markup.js');

        const qlBlocks = document.querySelectorAll('.ql-syntax');
        qlBlocks.forEach((block) => {
          if (!block.dataset.highlighted) {
            block.dataset.highlighted = 'true';
            const text = block.textContent || '';

            // 언어 자동 추론 (간단한 휴리스틱)
            let lang = 'javascript';
            if (
              text.includes('{') &&
              text.includes('}') &&
              (text.includes(';') || text.includes(':'))
            ) {
              if (
                !text.includes('function') &&
                !text.includes('const') &&
                !text.includes('=>') &&
                !text.includes('let ')
              ) {
                lang = 'css';
              }
            }
            if (
              text.includes('<html') ||
              text.includes('</div>') ||
              text.includes('</scr' + 'ipt>') ||
              text.includes('</p>')
            ) {
              lang = 'markup';
            }

            // 코드 블록 변환 및 하이라이트
            block.classList.remove('ql-syntax');
            block.classList.add(`language-${lang}`);

            block.innerHTML = `<code class="language-${lang}"></code>`;
            // textContent로 주입하여 XSS 방지
            // @ts-ignore
            block.querySelector('code').textContent = text;

            try {
              // @ts-ignore
              Prism.highlightElement(block.querySelector('code'));
            } catch (e) {
              console.warn('Prism highlighting failed:', e);
            }
          }
        });
      }
    }, 100);

    applyAttachmentImagesIn(document);
  });

  $effect(() => {
    if (!browser || !data.article?._id) return;
    const articleId = data.article._id;
    void articleId;
    queueMicrotask(() => applyAttachmentImagesIn(document));
  });
</script>

<svelte:head>
  <!-- <script defer src="https://platform.instagram.com/en_US/embeds.js"></script> -->
  <script defer src="//www.tiktok.com/embed.js"></script>
  <style>
    .article-header {
      row-gap: 0.35rem;
    }

    .article-header .article-title {
      line-height: 1.35;
      margin-bottom: 0.15rem;
    }

    .article-header .article-meta,
    .article-header .article-stats {
      font-size: 0.875rem;
      line-height: 1.45;
    }

    .article-header .article-author {
      margin-right: 0.5rem;
    }

    .article-header .article-date {
      display: inline-block;
    }

    .article-header .article-stat {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      white-space: nowrap;
    }

    .image img {
      max-width: 100% !important;
      max-height: 50vh !important;
    }

    .card-text img {
      max-width: 100%;
    }

    /* OG 카드: 링크 밑줄 제거 및 색상 상속 */
    .article-content .og-card-blot a,
    .article-content .og-card-blot a:link,
    .article-content .og-card-blot a:visited,
    .article-content .og-card-blot a:hover,
    .article-content .og-card-blot a:active,
    .article-content .og-card-blot a * {
      text-decoration: none !important;
      border-bottom: 0 !important;
      color: inherit !important;
    }

    /* OGPreview 카드: 링크 전체를 클릭 가능하게 하고 밑줄 제거 */
    .article-content .og-preview a,
    .article-content .og-preview a:link,
    .article-content .og-preview a:visited,
    .article-content .og-preview a:hover,
    .article-content .og-preview a:active,
    .article-content .og-preview a * {
      text-decoration: none !important;
      border-bottom: 0 !important;
      color: inherit !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      display: block !important;
    }

    /* OGBlot 카드: 상단 이미지를 패딩 없이 꽉 차게, 본문 연하게, URL 파란색 + ellipsis */
    .article-content .og-card-blot {
      max-width: 500px !important;
      width: 100% !important;
    }
    .article-content .og-card-blot a {
      padding: 0 !important;
      display: block !important;
      cursor: pointer !important;
    }

    /* OGPreview 카드도 동일하게 강제 적용 (주석 카드) */
    .article-content .og-preview {
      padding: 0 !important;
      overflow: hidden !important;
    }
    .article-content .og-preview > a {
      display: block !important;
    }
    .article-content .og-preview img {
      width: 100% !important;
      height: 200px !important;
      object-fit: cover !important;
      display: block !important;
      margin: 0 !important;
      border: 0 !important;
    }
    .article-content .og-preview .og-body h6 {
      line-height: 1.25 !important;
      margin-bottom: 4px !important;
      font-weight: 700 !important;
    }
    .article-content .og-preview .og-body p {
      line-height: 1.35 !important;
      margin-bottom: 6px !important;
      color: var(--bs-secondary-color) !important;
      opacity: 0.9 !important;
    }
    .article-content .og-preview .og-url {
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    .article-content .og-card-blot a > img {
      width: 100% !important;
      height: 180px !important;
      object-fit: cover !important;
      display: block !important;
      margin: 0 !important;
      border-radius: 0 !important;
    }
    .article-content .og-card-blot a > :not(img) {
      display: block;
      padding: 0 16px;
    }
    /* 제목 (첫 번째 div) */
    .article-content .og-card-blot a > div:nth-of-type(1) {
      color: var(--bs-body-color) !important;
      font-weight: 700 !important;
      font-size: 14px !important;
      line-height: 1.35 !important;
      margin-bottom: 2px !important;
      margin-top: 12px !important;
    }
    /* 설명 (두 번째 div) */
    .article-content .og-card-blot a > div:nth-of-type(2) {
      color: var(--bs-secondary-color) !important;
      opacity: 0.9 !important;
      font-size: 12px !important;
      line-height: 1.5 !important;
      margin-bottom: 2px !important;
    }
    /* URL (마지막 div) */
    .article-content .og-card-blot a > div:last-child {
      color: var(--bs-primary) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      font-size: 11px !important;
      padding-top: 0 !important;
      padding-bottom: 10px !important;
    }

    /* 밑줄 강제 제거 (요소 전체, u/ins 포함) */
    .article-content .og-card-blot,
    .article-content .og-card-blot *,
    .article-content .og-card-blot u,
    .article-content .og-card-blot ins {
      text-decoration: none !important;
      border-bottom: 0 !important;
    }

    .article-content img {
      max-width: 100%;
      max-height: 100vh;
      height: auto;
      display: block;
      margin: 0.5rem 0;
    }

    .article-content .og-preview img,
    .article-content .og-card-blot a > img {
      max-height: none;
    }

    .article-content video {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0.5rem 0;
    }

    .card-text a {
      pointer-events: auto !important;
      cursor: pointer !important;
    }

    figure {
      max-width: 100% !important;
    }

    @keyframes likeBounce {
      0%,
      100% {
        transform: scale(1);
      }
      25% {
        transform: scale(1.3);
      }
      50% {
        transform: scale(0.9);
      }
    }

    .like-animation {
      animation: likeBounce 0.6s ease;
    }
  </style>

  <script>
    window.onload = function () {};
  </script>
</svelte:head>

<main class="container board-page-inset my-md-5">
  <!-- 댓글 수정 modal -->
  <!-- <div class="d-flex justify-content-center align-item-center w-100 p-0 m-0">
    <Button color="danger" onclick={commentModalToggle}>Open Modal</Button>
    <Modal body header="Modal title" isOpen={commentModalOpen} fullscreen={true}
       class="d-flex justify-content-center align-item-start w-100 p-0 m-0 border-danger" style="height: 500px">
      Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod
      tempor incididunt ut labore et dolore magna aliqua.
    </Modal>
  </div>-->

  <Row class="mt-4 shadow rounded-bottom-4 p-1 m-0">
    <Row class="article-header border-bottom border-secondary-subtle pt-2 pb-2 px-2 m-0 gy-1">
      <Col xs="12" class="px-0">
        <h5 class="article-title mb-0 !text-[1.3rem] max-md:!text-[1.4rem] !leading-[1.45] font-semibold">{data.article.title}</h5>
      </Col>
      <Col md="6" xs="8" class="px-0 article-meta text-secondary">
        <span class="article-author">{data.article.nickname}</span>
        <span class="article-date text-muted">{formatISO9075(parseISO(data.article.createdAt))}</span>
      </Col>
      <Col class="text-end text-muted article-stats" md="6" xs="4">
        <span class="article-stat"><Icon class="pe-1" name="eye" />{data.article.read}</span>
        <span class="article-stat ms-2"
          ><Icon class="text-success pe-1" name="hand-thumbs-up" />{data.article.like}</span
        >
      </Col>
    </Row>
    <Row class="py-3 px-2 mx-0">
      <div class="text-break px-2 article-content max-w-full dgst-rich-text">
        {@html processArticleContent(
          data.article.content.replace(/<p>\s*<br\s*\/?>(\s|\u00A0)*<\/p>/g, '<br>')
        )}
      </div>
    </Row>
    <Row class="mb-3 mx-0">
      <Col xs="12" class="px-2">
        <!--프로필-->
        <div class="article-author-panel rounded-3">
          <Row class="g-2 d-flex align-items-center m-0">
            <Col xs="auto">
              <img
                alt=""
                class="article-author-photo"
                src={data.photo || '/icons/unknown-person-icon-4.jpg'}
                width="100"
                height="100"
              />
            </Col>
            <Col>
              <div class="article-author-body">
                <div class="article-author-name fw-semibold">{data.article.nickname}</div>
                <div class="text-muted pt-2">
                  <pre class="article-author-intro mb-0">{data.introduction}</pre>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      </Col>
    </Row>
    <Row class="mx-0">
      <!--버튼-->
      <Col class="article-toolbar text-end pe-md-3 p-xs-0 m-xs-0">
        {#if data.session?.user?.email && data.article.email === data.session.user.email}
          <Button
            size="lg"
            color="danger"
            onclick={() => remove(data.article._id)}
            class="article-action-btn"
          >
            <Icon name="trash" />
            삭제
          </Button>
          <Button
            size="lg"
            color="success"
            onclick={() => edit(data.article._id)}
            class="article-action-btn"
          >
            <Icon name="pencil" />
            수정
          </Button>
        {/if}
        <Button
          size="lg"
          color="primary"
          onclick={like}
          class="article-action-btn px-3 {likeAnimation ? 'like-animation' : ''}"
          disabled={articleLiked}
        >
          <Icon name={articleLiked ? 'hand-thumbs-up-fill' : 'hand-thumbs-up'} />
          {articleLike || ''}
        </Button>
        <Button size="lg" color="secondary" onclick={list} class="article-action-btn">
          <Icon name="list" />
          목록
        </Button>
      </Col>
      <Row class="comment-heading-bar my-3 bg-warning-subtle p-2 rounded-3 mb-1 mx-2 align-items-center">
        <!--리플-->
        <Col class="d-flex align-items-center gap-2 flex-wrap">
          <Icon name="chat" />
          <span>의견남기기</span>
          <Badge color="primary">{commentData.length}</Badge>
        </Col>
        <Col class="text-end article-comment-refresh d-flex align-items-center justify-content-end">
          <Button class="comment-toolbar-btn fw-bolder" onclick={comments} outline size="lg">
            <Icon name="arrow-repeat" />
          </Button>
        </Col>
      </Row>
    </Row>

    <Row class="comment-section mb-5 mx-0 px-2">
      {#each commentData as comment}
        <Row class="comment-item pt-3 pb-2 border-bottom border-gray-subtle mx-0" id="cmt{comment.id}">
          {#if comment.parentCommentNickname}
            <Col xs="auto" class="m-0 pe-1">
              <Icon name="arrow-return-right" class="text-success"></Icon>
            </Col>
          {/if}

          <Col class="p-0 m-0">
            <Row class="mx-0 align-items-start">
              <Col xs="12" class="comment-item-header p-0 m-0 mb-2">
                <div class="d-flex align-items-center gap-2">
                  <img
                    alt=""
                    class="comment-avatar rounded-circle flex-shrink-0"
                    src={comment.photo || '/icons/unknown-person-icon-4.jpg'}
                    width="40"
                    height="40"
                    loading="lazy"
                  />
                  <div class="comment-meta">
                    <div class="comment-nickname-line font-semibold !text-[1.05rem] !leading-snug">{comment.nickname}</div>
                    <div class="comment-time-line !text-[0.9375rem] !leading-snug text-muted">
                      {formatDistanceToNowStrict(parseISO(comment.createdAt), {
                        locale: ko,
                        addSuffix: true
                      })}
                    </div>
                  </div>
                </div>
              </Col>

              <Col xs="12" class="p-0 min-w-0">
                <Row class="mx-0">
                  <Col class="text-break p-0 m-0" style="max-width: 98%">
                    {#if editingCommentId === comment._id}
                      <!-- 댓글 수정 모드 -->
                      <div class="border p-3 rounded-4 shadow-sm bg-light position-relative">
                        {#if commentLoading}
                          <div
                            class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center rounded-4"
                            style="z-index: 1000; background-color: rgba(255, 255, 255, 0.50);"
                          >
                            <div class="text-center">
                              <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                              </div>
                              <div class="mt-2 fw-bold">댓글 저장 중...</div>
                            </div>
                          </div>
                        {/if}

                        <!-- 이미지 업로드 -->
                        <InputGroup class="mb-2">
                          <input
                            type="file"
                            bind:this={editCommentImageEl}
                            onchange={(evt) => previewEditImage(evt, editPreviewEl)}
                            accept="image/*"
                            class="form-control m-2"
                          />
                          {#if editPreviewEl && editPreviewEl.src}
                            <Button
                              color="danger"
                              outline
                              onclick={removeEditCommentImage}
                              class="comment-form-btn ms-2"
                            >
                              <Icon name="trash" />
                              이미지 삭제
                            </Button>
                          {/if}
                        </InputGroup>

                        <!-- 이미지 미리보기 -->
                        <div class="mb-2">
                          <img
                            src=""
                            class="d-none"
                            bind:this={editPreviewEl}
                            alt="댓글 이미지 미리보기"
                            style="max-width: 100%"
                          />
                        </div>

                        <!-- 댓글 내용 입력 -->
                        <InputGroup>
                          <textarea
                            bind:value={editCommentContent}
                            onpaste={(evt) => previewEditImage(evt, editPreviewEl)}
                            class="form-control border border-gray rounded-start-3"
                            rows="3"
                            placeholder="댓글 내용을 입력하세요"
                          ></textarea>
                          <Button
                            color="success"
                            onclick={saveEditComment}
                            class="comment-form-btn z-2"
                            disabled={commentLoading}
                          >
                            <Icon name="check" />
                            저장
                          </Button>
                          <Button
                            color="secondary"
                            onclick={cancelEditComment}
                            class="comment-form-btn z-2"
                            disabled={commentLoading}
                          >
                            <Icon name="x" />
                            취소
                          </Button>
                        </InputGroup>
                      </div>
                    {:else}
                      <!-- 일반 댓글 표시 모드 -->
                      {#if comment.state === 'write' && comment.image}
                        <Row class="pb-3 mx-0">
                          <Col class="p-0 ps-1 m-0">
                            <img
                              src={comment.image}
                              alt="리플 짤"
                              style="max-width: 100%;max-height: {browser
                                ? getImageMaxHeight(
                                    document.querySelector(`img[src='${comment.image}']`)
                                  ) || '100vh'
                                : '100vh'};"
                              onload={async (e) => {
                                const img = e.target;

                                // 서버에 저장된 이미지는 이미 올바른 방향으로 회전됨

                                img.style.maxHeight = getImageMaxHeight(img);
                              }}
                            />
                          </Col>
                        </Row>
                      {/if}

                      {#if !/[0-9a-zA-Z가-힣_-]/.test(comment.content) && countEmojis(comment.content) === 1}
                        <div class="comment-content-wrap dgst-rich-text">
                          <div class="comment-body-line">
                            {#if comment.parentCommentNickname}
                              <span class="comment-mention text-bg-secondary rounded-2"
                                ><span class="text-warning">@</span
                                >{comment.parentCommentNickname}</span
                              >
                            {/if}
                            <span class="display-1">{comment.content}</span>
                          </div>
                        </div>
                      {:else if comment.state !== 'write'}
                        <div class="comment-content-wrap text-muted dgst-rich-text"><em>{comment.content}</em></div>
                      {:else}
                        <div class="comment-content-wrap dgst-rich-text">
                          <div class="comment-body-line">
                            {#if comment.parentCommentNickname}
                              <span class="comment-mention text-bg-secondary rounded-2">
                                <span class="text-warning">@</span>{comment.parentCommentNickname}
                              </span>
                            {/if}
                            <span
                              class="comment-text"
                              bind:this={commentDiv}
                              data-comment-id={comment._id}
                            >
                              {@html embeder ? embeder.viewComment(comment.content) : comment.content}
                            </span>
                          </div>

                          <!-- 마크다운일 때는 출처 등이 OG 카드로 도배되는 것을 막기 위해 렌더링 생략 -->
                          <!-- 일반 글이더라도 URL이 여러개면 OG 폭탄 방지를 위해 첫번째 링크만 OG 렌더링 -->
                          {#if embeder && !embeder.isMarkdownContent(comment.content)}
                            {#each extractUrls(comment.content).slice(0, 1) as url}
                              {#if !url.includes('youtube.com') && !url.includes('youtu.be')}
                                <OGPreview {url} />
                              {/if}
                            {/each}
                          {/if}
                        </div>
                      {/if}
                    {/if}
                  </Col>
                </Row>
              </Col>
            </Row>

            {#if data.session?.user.nickname && comment.state === 'write'}
              <Row class="mt-2">
                <Col class="comment-actions text-end pe-2 m-0">
                  {#if comment.email === data.session?.user.email}
                    <Button
                      onclick={() => deleteComment(comment._id)}
                      outline
                      color="danger"
                      class="comment-action-btn"
                    >
                      <Icon name="trash" />
                      삭제
                    </Button>
                    <Button
                      onclick={() => startEditComment(comment)}
                      outline
                      color="primary"
                      class="comment-action-btn"
                      disabled={editingCommentId !== ''}
                    >
                      <Icon name="pencil" />
                      수정
                    </Button>
                  {/if}
                  <Button
                    onclick={() => likeComment(comment._id)}
                    outline
                    color="primary"
                    disabled={comment.liked}
                    class="comment-action-btn comment-like-btn {commentLikeAnimations.has(comment._id)
                      ? 'like-animation'
                      : ''}"
                    data-comment-id={comment._id}
                  >
                    <Icon name={comment.liked ? 'hand-thumbs-up-fill' : 'hand-thumbs-up'} />
                    {comment.like || ''}
                  </Button>
                  <Button
                    onclick={() => (visibleReply = comment._id)}
                    outline
                    color="info"
                    class="comment-action-btn"
                  >
                    <Icon name="chat-square-dots" />
                    답글
                  </Button>
                </Col>
              </Row>
            {/if}
          </Col>
        </Row>

        <!-- 대댓글 -->
        {#if visibleReply === comment._id}
          <div
            transition:scale
            class="mt-2 mx-0 border-bottom border-secondary-subtle bg-secondary bg-opacity-25"
          >
            <div
              class="border p-3 mb-2 rounded-4 shadow-sm position-relative"
              bind:this={reCommentDiv}
            >
              {#if commentLoading}
                <div
                  class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center rounded-4"
                  style="z-index: 1000; background-color: rgba(255, 255, 255, 0.75);"
                >
                  <div class="text-center">
                    <div class="spinner-border text-primary" role="status">
                      <span class="visually-hidden">Loading...</span>
                    </div>
                    <div class="mt-2 fw-bold">댓글 저장 중...</div>
                  </div>
                </div>
              {/if}
              <InputGroup class="mb-2">
                <input
                  type="file"
                  bind:this={reCommentImageEl}
                  onchange={(evt) => preview(evt, rePreviewEl)}
                  accept="image/*"
                  class="form-control m-2"
                />
              </InputGroup>

              <div>
                <img
                  src=""
                  class="d-none"
                  bind:this={rePreviewEl}
                  alt="리플 이미지 첨부 미리보기"
                  style="max-width: 100%"
                />
              </div>

              <InputGroup>
                <textarea
                  bind:value={reCommentContent}
                  onpaste={(evt) => preview(evt, rePreviewEl)}
                  class="form-control border border-gray rounded-start-3"
                  rows="3"
                ></textarea>
                <Button
                  color="primary"
                  outline
                  onclick={() => writeComment(comment._id)}
                  disabled={commentLoading}
                  class="comment-form-btn"
                >
                  <Icon name="pencil-fill" />
                  등록
                </Button>
              </InputGroup>
            </div>
          </div>
        {/if}
      {/each}

      <!--목록 끝-->

      {#if commentData?.length}
        <Row class="comment-heading-bar my-3 bg-warning-subtle p-2 rounded-3 mb-1 mx-0 align-items-center">
          <!--리플-->
          <Col class="d-flex align-items-center gap-2 flex-wrap">
            <Icon name="chat" />
            <span>의견남기기</span>
            <Badge color="primary">{commentData.length}</Badge>
          </Col>
          <Col class="text-end d-flex align-items-center justify-content-end">
            <Button class="comment-toolbar-btn fw-bolder" onclick={comments} outline>
              <Icon name="arrow-repeat" />
            </Button>
          </Col>
        </Row>
      {/if}

      <!-- 댓글 입력 -->
      {#if data.session?.user.nickname}
        <div class="border p-3 rounded-4 shadow-sm mt-3 position-relative" bind:this={commentDiv}>
          {#if commentLoading}
            <div
              class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center rounded-4"
              style="z-index: 1000; background-color: rgba(255, 255, 255, 0.50); left: 0; right: 0; top: 0; bottom: 0;"
            >
              <div class="text-center">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
                <div class="mt-2 fw-bold">댓글 저장 중...</div>
              </div>
            </div>
          {/if}
          <InputGroup class="mb-2">
            <input
              type="file"
              bind:this={commentImageEl}
              onchange={(evt) => preview(evt, previewEl)}
              accept="image/*"
              class="form-control m-2"
            />
          </InputGroup>
          <div>
            <img
              src=""
              class="img-thumbnail d-none me-2"
              bind:this={previewEl}
              alt="리플 이미지 첨부 미리보기"
              style="max-width: 100%"
            />
          </div>
          <InputGroup>
            <textarea
              bind:value={commentContent}
              onpaste={(evt) => preview(evt, previewEl)}
              class="form-control border border-gray rounded-start-3"
              rows="3"
            ></textarea>
            <Button
              color="primary"
              outline
              onclick={() => writeComment()}
              class="comment-form-btn z-2"
              disabled={commentLoading}
            >
              <Icon name="pencil-fill" />
              등록
            </Button>
          </InputGroup>
        </div>
      {/if}
    </Row>

    <Row class="mx-0 mb-3">
      <!--버튼-->
      <Col class="article-toolbar text-end pe-1">
        {#if data.article.email === data.session?.user.email}
          <Button size="lg" class="article-action-btn" color="danger" onclick={() => remove(data.article._id)}>
            <Icon name="trash" />
            삭제
          </Button>
          <Button size="lg" class="article-action-btn" color="success" onclick={() => edit(data.article._id)}>
            <Icon name="pencil" />
            수정
          </Button>
        {/if}
        <Button size="lg" class="article-action-btn px-3 fw-semibold" color="primary" onclick={write}>
          <Icon name="pencil-fill" class="pe-1" />
          글쓰기
        </Button>
        <Button size="lg" class="article-action-btn" color="secondary" onclick={list}>
          <Icon name="list" />
          목록
        </Button>
      </Col>
    </Row>
  </Row>

  <!-- 목록-->
  <Row class="mt-4 shadow rounded-4 p-1 m-0">
    <BoardList {data} {write} {boardId} session={data.session} />
  </Row>
</main>

<style>
  /* 글 상세 글쓴이 프로필 박스 (main > .row.mt-4 > :nth-child(3) .article-author-panel) */
  .article-author-panel {
    width: 100%;
    padding: 0.65rem 0.85rem;
    background-color: var(--bs-body-bg);
  }

  .article-author-body {
    color: var(--bs-body-color);
  }

  .article-author-name {
    font-size: 1rem;
    line-height: 1.35;
  }

  .article-author-intro {
    white-space: pre-line;
    font-family: inherit;
    font-size: inherit;
  }

  .article-author-photo {
    width: 100px;
    height: 100px;
    object-fit: cover;
    display: block;
  }

  /* 글 상세 액션 버튼 — 터치 영역·글씨 확대 */
  :global(.article-toolbar) {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.45rem;
  }

  :global(.article-toolbar .article-action-btn) {
    padding: 0.45rem 1rem !important;
    font-size: 1rem !important;
    line-height: 1.35 !important;
  }

  :global(.article-comment-refresh .comment-toolbar-btn) {
    padding: 0.45rem 0.9rem !important;
    font-size: 1rem !important;
    min-width: 2.75rem;
    min-height: 2.75rem;
  }

  @media (max-width: 767.98px) {
    :global(.article-toolbar) {
      gap: 0.5rem;
    }

    :global(.article-toolbar .article-action-btn) {
      min-height: 44px;
      min-width: 44px;
      padding: 0.5rem 1.1rem !important;
      font-size: 1.05rem !important;
    }

    :global(.article-comment-refresh .comment-toolbar-btn) {
      min-height: 44px;
      min-width: 44px;
      padding: 0.5rem 1rem !important;
      font-size: 1.05rem !important;
    }
  }

  :global(.comment-item-header) {
    margin-bottom: 0.5rem;
  }

  .comment-avatar {
    width: 40px;
    height: 40px;
    object-fit: cover;
  }

  .comment-meta {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    line-height: 1.35;
  }

  .comment-content-wrap {
    padding: 0 0.25rem;
  }

  .comment-body-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
    line-height: 1.55;
  }

  .comment-mention {
    display: inline-block;
    flex-shrink: 0;
    font-size: 0.8125rem !important;
    line-height: 1.4;
    padding: 0.2rem 0.5rem !important;
    margin: 0;
    vertical-align: baseline;
  }

  .comment-text {
    display: inline;
    line-height: 1.55;
    margin: 0;
    min-width: 0;
    flex: 1 1 auto;
  }

  .comment-text :global(p) {
    display: inline;
    margin: 0;
    line-height: inherit;
  }

  .comment-text :global(p:last-child) {
    margin-bottom: 0;
  }

  .comment-text :global(.markdown-body) {
    display: inline;
    line-height: 1.55;
  }

  .comment-text :global(.markdown-body > * + *) {
    margin-top: 0.35rem;
  }

  .comment-text :global(.markdown-body > :first-child) {
    display: inline;
  }

  /* 댓글 버튼 — 터치 영역 확대 */
  :global(.comment-section .comment-action-btn),
  :global(.comment-section .comment-form-btn),
  :global(.comment-section .comment-toolbar-btn) {
    padding: 0.4rem 0.85rem;
    font-size: 0.875rem;
    line-height: 1.25;
  }

  :global(.comment-actions) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    justify-content: flex-end;
    align-items: center;
  }

  :global(.comment-section .input-group .comment-form-btn) {
    align-self: stretch;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  @media (max-width: 767.98px) {
    :global(.comment-section .comment-action-btn),
    :global(.comment-section .comment-form-btn),
    :global(.comment-section .comment-toolbar-btn) {
      min-height: 44px;
      min-width: 44px;
      padding: 0.5rem 1rem !important;
      font-size: 0.9375rem !important;
    }

    :global(.comment-section .input-group .comment-form-btn) {
      min-width: 4.25rem;
      padding: 0.5rem 0.75rem !important;
    }

    :global(.comment-actions) {
      gap: 0.45rem;
    }
  }

  /* 댓글 좋아요 애니메이션 */
  :global(.comment-like-btn) {
    position: relative;
    transition: all 0.3s ease;
    overflow: hidden;
  }

  :global(.comment-like-btn.like-animation) {
    animation: likePulse 0.6s ease-in-out;
    transform: scale(1.2);
    background-color: #ff6b6b !important;
    color: white !important;
    border-color: #ff6b6b !important;
  }

  @keyframes likePulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.7);
    }
    50% {
      transform: scale(1.3);
      box-shadow: 0 0 0 10px rgba(255, 107, 107, 0);
    }
    100% {
      transform: scale(1.2);
      box-shadow: 0 0 0 0 rgba(255, 107, 107, 0);
    }
  }

  /* 하트 파티클 효과 */
  :global(.comment-like-btn.like-animation::before) {
    content: '❤️';
    position: absolute;
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 20px;
    animation: heartFloat 1s ease-out forwards;
    pointer-events: none;
    z-index: 1000;
  }

  :global(.comment-like-btn.like-animation::after) {
    content: '✨';
    position: absolute;
    top: -15px;
    left: 30%;
    transform: translateX(-50%);
    font-size: 16px;
    animation: sparkleFloat 1s ease-out 0.2s forwards;
    pointer-events: none;
    z-index: 1000;
  }

  @keyframes heartFloat {
    0% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(0.5);
    }
    50% {
      opacity: 1;
      transform: translateX(-50%) translateY(-30px) scale(1.2);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-60px) scale(1);
    }
  }

  @keyframes sparkleFloat {
    0% {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(0.3);
    }
    50% {
      opacity: 1;
      transform: translateX(-50%) translateY(-25px) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-50px) scale(0.8);
    }
  }

  /* 호버 효과 */
  :global(.comment-like-btn:hover:not(:disabled)) {
    transform: scale(1.05);
    box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
  }

  :global(.comment-like-btn:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* 좋아요 버튼 아이콘 애니메이션 */
  :global(.comment-like-btn.like-animation svg) {
    animation: iconBounce 0.6s ease-in-out;
  }

  @keyframes iconBounce {
    0%,
    100% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(-10deg);
    }
    75% {
      transform: rotate(10deg);
    }
  }
</style>
