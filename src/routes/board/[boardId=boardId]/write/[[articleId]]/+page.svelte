<script>
  import { onMount } from 'svelte';
  import {
    Button,
    Col,
    FormGroup,
    Icon,
    Input,
    Row,
    Spinner,
    Tooltip
  } from '$lib/components/ui/index.js';
  import { goto, invalidate } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { boardListPath } from '$lib/util/boardPaths.js';
  /**
   * SvelteKit page store import for accessing current route info
   * @see https://kit.svelte.dev/docs/modules#$app-stores
   */
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { swalFire } from '$lib/util/swal.js';
  import { reportClientError } from '$lib/util/reportClientPageError.js';
  import { validateArticleContent } from '$lib/util/articleContentValidation.js';

  /** @typedef {import('sweetalert2').SweetAlertIcon} SweetAlertIcon */
  /** @typedef {import('sweetalert2').SweetAlertPosition} SweetAlertPosition */

  // Svelte 5 Runes
  let { data } = $props();

  /**
   * Swal toast 메시지 표시
   * @param {string} message - 표시할 메시지
   * @param {object} options - 토스트 옵션
   * @param {SweetAlertIcon} [options.icon='info'] - 메시지 아이콘
   * @param {SweetAlertPosition} [options.position='center'] - 토스트 위치
   * @param {number} [options.timer=1000] - 토스트 지속 시간 (0일 경우 지속 시간 없음)
   * @param {boolean} [options.isToast=true] - 토스트 표시 여부
   */
  async function toast(message, options = {}) {
    const { icon = 'info', position = 'center', timer = 1000, isToast = true } = options;

    if (icon === 'error') {
      // error 타입은 일반 모달로 표시
      await swalFire({
        icon,
        title: message,
        confirmButtonColor: '#3085d6',
        confirmButtonText: '확인'
      });
    } else {
      // 그 외 타입은 toast로 표시
      await swalFire({
        icon,
        title: message,
        toast: isToast,
        timer,
        timerProgressBar: timer > 0,
        position
      });
    }
  }

  const { boardId, articleId } = $page.params;

  /** @type {import('@ffmpeg/ffmpeg').FFmpeg | null} */
  let ffmpeg = null;
  /** @type {typeof import('@ffmpeg/util').fetchFile | null} */
  let fetchFile = null;
  /** @type {Promise<void> | null} */
  let ffmpegLoadPromise = null;

  const uploadPlus = () => {
    uploading++;
  };

  const uploadMinus = () => {
    uploading--;
  };

  onMount(async () => {
    try {
      QuillEditor = (await import('$lib/components/LexicalEditor.svelte')).default;
    } catch (error) {
      console.error('Lexical 에디터 로드 실패:', error);
      reportClientError(error, {
        type: 'editor-import-error',
        message: 'Lexical 에디터 로드 실패',
        pathname: typeof location !== 'undefined' ? location.pathname : undefined,
        href: typeof location !== 'undefined' ? location.href : undefined,
        search: typeof location !== 'undefined' ? location.search : undefined,
        routeId: $page.route.id ?? undefined,
        importTarget: '$lib/components/LexicalEditor.svelte',
        phase: 'write-page-onMount'
      });
      editorLoadError = true;
      await swalFire({
        icon: 'error',
        title: '에디터 초기화 실패',
        text: '에디터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.',
        confirmButtonText: '확인'
      });
    }

    // 모바일에서 제목 입력칸으로 스크롤하고 포커스
    setTimeout(() => {
      const titleInput = document.getElementById('title');
      if (titleInput) {
        // 제목 입력칸으로 스크롤
        titleInput.scrollIntoView({ behavior: 'smooth', block: 'start' });
        titleInput.focus();
      }
    }, 100); // DOM 렌더링 완료 후 실행
  });

  async function ensureFfmpegLoaded() {
    if (ffmpeg) return;
    if (!ffmpegLoadPromise) {
      ffmpegLoadPromise = (async () => {
        const [{ FFmpeg }, ffmpegUtil] = await Promise.all([
          import('@ffmpeg/ffmpeg'),
          import('@ffmpeg/util')
        ]);

        fetchFile = ffmpegUtil.fetchFile;
        ffmpeg = new FFmpeg();
        await ffmpeg.load();
      })().finally(() => {
        ffmpegLoadPromise = null;
      });
    }

    await ffmpegLoadPromise;
  }

  async function list() {
    if (title || content) {
      const result = await swalFire({
        title: '작성 취소',
        text: '취소 하시겠습니까? 작성하던 글은 사라집니다.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: '취소',
        cancelButtonText: '계속 작성'
      });

      if (!result.isConfirmed) return false;
    }
    goto(resolve(boardListPath(boardId ?? 'free')));
  }

  let title = $state('');
  let content = $state('');

  /** 수정 글 로드 시에만 서버 data 반영 (저장 실패 후 update()로 본문이 지워지지 않게) */
  let hydratedEditArticleId = $state(/** @type {string | null} */ (null));

  $effect.pre(() => {
    if (!articleId) return;
    if (hydratedEditArticleId === articleId) return;
    hydratedEditArticleId = articleId;
    title = data.title ?? '';
    content = data.content ?? '';
  });

  let uploading = $state(0);
  let formSubmitting = $state(false);
  let isLoadingOG = $state(false); // OG 정보 로딩 중 상태
  let insertUrlFromTitle = $state(/** @type {string | null} */ (null)); // 제목에서 본문으로 이동할 URL

  /** @type {import('svelte').Component | null} */
  let QuillEditor = $state(null);
  let editorLoadError = $state(false);

  /** @type {{ focusEditor: () => void; getEditorHtml?: () => string } | null} */
  let quillEditorRef = $state(null);

  /**
   * 제목 입력에서 Tab → 에디터 본문으로 포커스 (툴바 건너뜀)
   * @param {KeyboardEvent} event
   */
  function handleTitleKeydown(event) {
    if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    event.preventDefault();
    quillEditorRef?.focusEditor();
  }

  /**
   * URL 붙여넣기 시 제목 업데이트 콜백
   * @param {string} newTitle - 새로운 제목
   */
  function handleTitleUpdate(newTitle) {
    // 제목이 비어있을 때만 업데이트
    if (!title || title.trim().length === 0) {
      title = newTitle;
    }
  }

  /**
   * OG 로딩 상태 변경 콜백
   * @param {boolean} loading - 로딩 중 여부
   */
  function handleLoadingChange(loading) {
    isLoadingOG = loading;
  }

  let prevTitleLength = 0;

  /**
   * 본문/제목 입력란에 URL 붙여넣기 처리
   * @param {ClipboardEvent} event - 붙여넣기 이벤트
   */
  async function handleTitlePaste(event) {
    let pastedText = event.clipboardData?.getData('text');

    // 안드로이드 일부 브라우저에서 clipboardData가 비어있는 경우
    if (!pastedText && navigator.clipboard) {
      try {
        pastedText = await navigator.clipboard.readText();
      } catch (e) {
        console.warn('클립보드 읽기 권한 없음');
      }
    }

    if (!pastedText) return;

    // URL인지 확인 (http:// 또는 https://로 시작)
    const urlPattern = /^https?:\/\/.+/i;

    if (urlPattern.test(pastedText.trim())) {
      // URL인 경우
      event.preventDefault(); // 기본 붙여넣기 동작 방지

      // QuillEditor에 URL 삽입 (반응형 변수 업데이트)
      insertUrlFromTitle = pastedText.trim();

      // 제목 입력란 비우기
      setTimeout(() => {
        title = '';
        prevTitleLength = 0;
      }, 10);
    }
  }

  /**
   * 안드로이드에서 paste 이벤트에서 텍스트를 잡지 못할 때 동작하는 폴백
   * @param {Event} event - input 이벤트
   */
  /** @param {Event & { currentTarget: HTMLInputElement }} event */
  function handleTitleInput(event) {
    const text = event.currentTarget.value;
    const diff = text.length - prevTitleLength;
    prevTitleLength = text.length;

    const trimmed = text.trim();
    const urlPattern = /^https?:\/\/.+/i;

    if (urlPattern.test(trimmed)) {
      // URL 내부에 공백이 없는 단일 주소인지 판단
      if (trimmed.split(/\s+/).length === 1) {
        // 타이핑이 아닌 한 번에 5글자 이상 들어온 경우(붙여넣기) 또는 명시적 붙여넣기 이벤트인 경우
        if (
          diff > 5 ||
          /** @type {InputEvent} */ (/** @type {unknown} */ (event)).inputType ===
            'insertFromPaste' ||
          /** @type {InputEvent} */ (/** @type {unknown} */ (event)).inputType ===
            'insertReplacementText'
        ) {
          insertUrlFromTitle = trimmed;
          setTimeout(() => {
            title = '';
            prevTitleLength = 0;
          }, 10);
        }
      }
    }
  }

  $effect(() => {
    console.log('uploading', uploading);
  });

  /** @param {File} file */
  async function compressVideo(file) {
    try {
      uploadPlus();
      await ensureFfmpegLoaded();

      // 파일을 FFmpeg에 쓰기
      if (!ffmpeg || !fetchFile) throw new Error('FFmpeg is not ready');
      await ffmpeg.writeFile('input.mp4', await fetchFile(file));

      // 비디오 압축 실행
      await ffmpeg.exec([
        '-i',
        'input.mp4',
        '-c:v',
        'libx264',
        '-crf',
        '28', // 압축률 조정 (18-28 권장, 숫자가 높을수록 더 많이 압축)
        '-preset',
        'medium',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        'output.mp4'
      ]);

      // 압축된 파일 가져오기
      const compressedData = /** @type {Uint8Array} */ (await ffmpeg.readFile('output.mp4'));
      const compressedBlob = new Blob([/** @type {any} */ (compressedData)], {
        type: 'video/mp4'
      });

      uploadMinus();
      return compressedBlob;
    } catch (error) {
      console.error('비디오 압축 중 오류 발생:', error);
      uploadMinus();
      throw error;
    }
  }

  // CKEditor 설정을 위한 함수 추가
  /** @param {{ file: Promise<File> }} loader */
  function customUploadAdapter(loader) {
    return {
      upload: async () => {
        try {
          const file = await loader.file;

          // 비디오 파일인 경우 압축 처리
          if (file.type.startsWith('video/')) {
            const compressedVideo = await compressVideo(file);
            // 여기서 압축된 비디오를 서버에 업로드하는 로직 구현
            // ... 서버 업로드 코드 ...
          } else {
            // 기존 이미지 업로드 로직
            // ... 기존 코드 ...
          }
        } catch (error) {
          console.error('업로드 중 오류 발생:', error);
          throw error;
        }
      }
    };
  }
</script>

<svelte:head>
  <style>
    /* CKEditor 전용 스타일 제거 -> Quill 기준으로 정리 */
    /* Quill 컨테이너 높이만 페이지 레벨에서 보강이 필요할 경우 사용 가능
    .ql-container { height: 450px; }
    */
  </style>
</svelte:head>

<main class="container board-page-inset my-1">
  <Row class="write-form-card border border-secondary-subtle rounded-4 py-5 shadow">
    <form
      class="write-form"
      method="POST"
      use:enhance={({ formElement, formData, action, cancel, submitter }) => {
        /* 취소 등 type="button"만 클릭한 경우 — Enter 제출(submitter null)은 허용 */
        if (submitter && /** @type {HTMLButtonElement} */ (submitter).type !== 'submit') {
          return cancel();
        }

        if (formSubmitting) {
          cancel();
          return;
        }
        formSubmitting = true;

        // 동기 검증 (제출 전)
        let titleValue = '';
        let latestContent = '';
        try {
          titleValue = title || '';
          latestContent = quillEditorRef?.getEditorHtml?.() ?? content ?? '';
          content = latestContent;
        } catch (e) {
          formSubmitting = false;
          console.error('에디터 본문 동기화 실패:', e);
          reportClientError(e, {
            type: 'write-submit-editor-sync-error',
            pathname: $page.url.pathname,
            phase: 'write-page-submit'
          });
          toast('저장 준비 중 오류가 발생했습니다. 페이지를 새로고침해주세요.', {
            icon: 'error',
            isToast: false
          });
          return cancel();
        }

        // 제목 검증
        if (titleValue.replace(/\s/g, '').length < 2) {
          formSubmitting = false;
          toast('제목이 너무 짧습니다.', { icon: 'warning', isToast: false });
          return cancel();
        }

        const contentCheck = validateArticleContent(latestContent, { minTextLength: 5 });
        if (!contentCheck.ok) {
          formSubmitting = false;
          toast(contentCheck.message, { icon: 'warning', isToast: false });
          return cancel();
        }

        // 제출 직전에 에디터 내용 및 식별자 주입
        try {
          formData.set('content', latestContent);
          if (articleId) {
            formData.set('articleId', articleId);
          } else {
            formData.delete('articleId');
          }
        } catch (e) {
          console.error('formData 주입 실패:', e);
        }

        // 결과 처리 — 실패 시 update() 생략해 작성 중 제목·본문 유지
        return async ({ result, update }) => {
          try {
            if (result.type === 'failure') {
              const errorMessage =
                typeof result.data === 'object' && result.data?.message
                  ? String(result.data.message)
                  : '저장중에 오류가 발생하였습니다.';
              console.error('[글쓰기 실패]', {
                type: result.type,
                status: result.status,
                data: result.data
              });
              await toast(errorMessage, { icon: 'error', isToast: false });
              return;
            }

            if (result.type === 'error') {
              console.error('[글쓰기 에러]', result.error);
              await toast(result.error?.message || '서버 오류가 발생하였습니다.', {
                icon: 'error',
                isToast: false
              });
              return;
            }

            if (result.type === 'success') {
              const actionData = result.data;

              if (!actionData?.success) {
                console.error('[글쓰기 저장 실패]', actionData);
                await toast('저장중에 오류가 발생하였습니다.', { icon: 'error', isToast: false });
                return;
              }

              await update();

              await toast('저장되었습니다.', { icon: 'success', timer: 1000 });

              title = '';
              content = '';

              await invalidate('board-list');

              const savedArticleId = actionData.articleId || articleId;
              if (savedArticleId) {
                goto(resolve(`/board/${boardId}/${savedArticleId}`));
              } else {
                await list();
              }
            }
          } finally {
            formSubmitting = false;
            // 업로드/OG 카운터 꼬임 시 저장 버튼·오버레이가 풀리지 않는 것 방지
            isLoadingOG = false;
            if (uploading !== 0) {
              uploading = 0;
            }
          }
        };
      }}
    >
      <input type="hidden" name="articleId" value={articleId} />
      <FormGroup floating label="제목" labelFor="title" class="write-title-field">
        <input
          type="text"
          id="title"
          name="title"
          class="form-control"
          bind:value={title}
          onpaste={handleTitlePaste}
          oninput={handleTitleInput}
          onkeydown={handleTitleKeydown}
          required
          placeholder=" "
        />
      </FormGroup>
      {#if QuillEditor}
        <QuillEditor
          bind:this={quillEditorRef}
          bind:editorData={content}
          bind:insertUrlFromTitle
          {uploadPlus}
          {uploadMinus}
          onTitleUpdate={handleTitleUpdate}
          onLoadingChange={handleLoadingChange}
        />
      {:else if editorLoadError}
        <div class="alert alert-danger my-4 text-center" role="alert">
          에디터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.
        </div>
      {:else}
        <div class="text-center py-5">
          <Spinner />
        </div>
      {/if}
      <Row class="write-action-row text-end pe-2 mt-4">
        <Col md="10" xs="8" class="text-end">
          <Button type="button" color="warning" onclick={list}>
            <Icon name="x-lg" class="pe-2" />
            취소
          </Button>
        </Col>
        <Col md="2" xs="4">
          <Button
            type="submit"
            color="primary"
            id="uploadBtn"
            disabled={formSubmitting || uploading > 0 || isLoadingOG}
          >
            {#if uploading > 0}
              <Spinner color="info" size="sm" />
            {:else if formSubmitting}
              <Spinner color="info" size="sm" />
            {:else if isLoadingOG}
              <Spinner color="info" size="sm" />
            {:else}
              <Icon name="pencil-fill" class="pe-2" />
            {/if}
            저장
          </Button>
          {#if uploading > 0}
            <Tooltip isOpen={uploading > 0} target="uploadBtn">이미지 업로드 중입니다.</Tooltip>
          {:else if isLoadingOG}
            <Tooltip isOpen={isLoadingOG} target="uploadBtn">링크 정보를 가져오는 중입니다.</Tooltip
            >
          {/if}
        </Col>
      </Row>
    </form>
  </Row>
</main>

{#if formSubmitting || uploading > 0 || isLoadingOG}
  <div
    class="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column justify-content-center align-items-center bg-dark bg-opacity-50"
    style="z-index: 9999; backdrop-filter: blur(2px);"
  >
    <Spinner color="light" style="width: 4rem; height: 4rem;" />
    <span class="text-white mt-3 fw-bold fs-5">
      {uploading > 0
        ? '이미지를 업로드 중입니다...'
        : formSubmitting
          ? '글을 저장 중입니다...'
          : '링크 정보를 분석 중입니다...'}
    </span>
  </div>
{/if}

<style>
  :global(.write-form-card) {
    --bs-gutter-x: 0;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin-right: 0 !important;
    margin-left: 0 !important;
    overflow-x: clip;
  }

  .write-form {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    padding-inline: 0.75rem;
  }

  :global(.write-title-field) {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  :global(.write-title-field > .form-control) {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  :global(.write-action-row) {
    --bs-gutter-x: 0;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin-right: 0 !important;
    margin-left: 0 !important;
  }

  @supports not (overflow: clip) {
    :global(.write-form-card) {
      overflow-x: hidden;
    }
  }

  @media (max-width: 575.98px) {
    .write-form {
      padding-inline: 0.5rem;
    }
  }
</style>
