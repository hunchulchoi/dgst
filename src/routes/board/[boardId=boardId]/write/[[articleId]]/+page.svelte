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
  } from '@sveltestrap/sveltestrap';
  import QuillEditor from '$lib/components/QuillEditor.svelte';
  import { goto } from '$app/navigation';
  /**
   * SvelteKit page store import for accessing current route info
   * @see https://kit.svelte.dev/docs/modules#$app-stores
   */
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import Swal from 'sweetalert2';

  // Svelte 5 Runes
  let { data } = $props();
  
  /**
   * Swal toast 메시지 표시
   * @param {string} message - 표시할 메시지
   * @param {object} options - 토스트 옵션
   * @param {string} [options.icon='info'] - 메시지 아이콘 ('success', 'error', 'warning', 'info', 'primary')
   * @param {string} [options.position='center'] - 토스트 위치 ('top', 'top-start', 'top-end', 'center', 'center-start', 'center-end', 'bottom', 'bottom-start', 'bottom-end')
   * @param {number} [options.timer=1000] - 토스트 지속 시간 (0일 경우 지속 시간 없음)
   * @param {boolean} [options.isToast=true] - 토스트 표시 여부
   */
  async function toast(message, options = {}) {
    const {
      icon = 'info',
      position = 'center',
      timer = 1000,
      isToast = true
    } = options;

    if(icon === 'error'){
      // error 타입은 일반 모달로 표시
      await Swal.fire({
        icon,
        title: message,
        confirmButtonColor: '#3085d6',
        confirmButtonText: '확인'
      }); 
    } else {
      // 그 외 타입은 toast로 표시
      await Swal.fire({
        icon,
        title: message,
        toast: isToast,  
        timer,
        timerProgressBar: timer > 0,
        position,  
      });
    }
  }
  
  const { boardId, articleId } = $page.params;

  let ffmpeg;
  
  const uploadPlus = () => {
    uploading++;
  };

  const uploadMinus = () => {
    uploading--;
  };

  onMount(async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { fetchFile } = await import('@ffmpeg/util');

    ffmpeg = new FFmpeg();
    await ffmpeg.load();
    
    // 모바일에서 제목 입력칸으로 스크롤하고 포커스
    setTimeout(() => {
      const titleInput = document.getElementById('title');
      if (titleInput) {
        // 제목 입력칸으로 스크롤
        titleInput.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // 모바일에서만 포커스 (데스크톱에서는 autofocus가 이미 있음)
        if (window.innerWidth <= 768) {
          titleInput.focus();
        }
      }
    }, 100); // DOM 렌더링 완료 후 실행
  });

  async function list() {
    if (title || content) {
      const result = await Swal.fire({
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
    goto(`/board/${boardId}`);
  }

  let title = $state(data.title || '');
  let content = $state(data.content || '');
  let uploading = $state(0);
  let isLoadingOG = $state(false); // OG 정보 로딩 중 상태
  let insertUrlFromTitle = $state(null); // 제목에서 본문으로 이동할 URL

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

  /**
   * 제목 입력란에 URL 붙여넣기 처리
   * @param {ClipboardEvent} event - 붙여넣기 이벤트
   */
  function handleTitlePaste(event) {
    const pastedText = event.clipboardData?.getData('text');
    
    if (!pastedText) return;
    
    // URL인지 확인 (http:// 또는 https://로 시작)
    const urlPattern = /^https?:\/\/.+/i;
    
    if (urlPattern.test(pastedText.trim())) {
      // URL인 경우
      event.preventDefault(); // 기본 붙여넣기 동작 방지
      
      // QuillEditor에 URL 삽입 (반응형 변수 업데이트)
      insertUrlFromTitle = pastedText.trim();
      
      // 제목 입력란 비우기
      title = '';
    }
  }

  $effect(() => {
    console.log('uploading', uploading);
  });

  async function compressVideo(file) {
    try {
      uploadPlus();

      // 파일을 FFmpeg에 쓰기
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
      const compressedData = await ffmpeg.readFile('output.mp4');
      const compressedBlob = new Blob([compressedData.buffer], { type: 'video/mp4' });

      uploadMinus();
      return compressedBlob;
    } catch (error) {
      console.error('비디오 압축 중 오류 발생:', error);
      uploadMinus();
      throw error;
    }
  }

  // CKEditor 설정을 위한 함수 추가
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

<main class="container my-1">
  <Row class="border border-secondary-subtle rounded-4 py-5 shadow">
    <form
      method="POST"
      use:enhance={({ formElement, formData, action, cancel, submitter }) => {
        if (!submitter || submitter.role !== 'submit') {
          return cancel();
        }

        // 동기 검증 (제출 전)
        const titleValue = title || '';
        const contentValue = content || '';
        
        // 제목 검증
        if (titleValue.replace(/\s/g, '').length < 2) {
          toast('제목이 너무 짧습니다.', {icon:'warning', isToast: false});
          return cancel();
        }
        
        // content 검증: 비어있거나 HTML 태그만 있는 경우 거부
        if (!contentValue || contentValue.trim().length === 0) {
          toast('본문을 입력해주세요.', {icon:'warning', isToast: false});
          return cancel();
        }
        
        // HTML 태그 제거 후 실제 텍스트 내용 확인
        const textContent = contentValue
          //.replace(/<[^>]*>/g, '') // HTML 태그 제거
          .replace(/<p>\s*<br\s*\/?>(\s|\u00A0)*<\/p>/g, '<br>') // <p><br></p>를 <br>로 변환
          .replace(/&nbsp;/g, ' ') // &nbsp;를 공백으로
          .replace(/[\s\u00A0]/g, '') // 모든 공백 및 줄바꿈 제거
          .trim();
        
        if (textContent.length < 5) {
          toast('본문이 너무 짧습니다. 최소 5자 이상 입력해주세요.', {icon:'warning', isToast: false});
          return cancel();
        }

        // 제출 직전에 에디터 내용 및 식별자 주입
        try {
          formData.set('content', content || '');
          if (articleId) {
            formData.set('articleId', articleId);
          } else {
            formData.delete('articleId');
          }
        } catch (e) {
          console.error('formData 주입 실패:', e);
        }

        // 결과 처리
        return async ({ result, update }) => {
          await update();
          
          if (result.type === 'failure') {
            const errorMessage = typeof result.data === 'object' && result.data?.message 
              ? String(result.data.message) 
              : '저장중에 오류가 발생하였습니다.';
            await toast(errorMessage, {icon:'error', isToast: false});
            return;
          }
          
          if (result.type === 'success') {
            const data = result.data;
            
            if (!data?.success) {
              await toast('저장중에 오류가 발생하였습니다.', {icon:'error', isToast: false});
            } else {
              await toast('저장되었습니다.', {icon:'success', timer: 1000});

              title = '';
              content = '';
              
              // 방금 작성/수정한 글의 상세 페이지로 이동
              const savedArticleId = data.articleId || articleId;
              if (savedArticleId) {
                goto(`/board/${boardId}/${savedArticleId}`);
              } else {
                await list();
              }
            }
          }
        };
      }}
    >
      <input type="hidden" name="articleId" value={articleId} />
      <FormGroup floating label="제목">
        <input 
          type="text" 
          id="title" 
          name="title" 
          class="form-control" 
          bind:value={title} 
          onpaste={handleTitlePaste}
          required 
          autofocus 
          placeholder=" " 
        />
      </FormGroup>
      <QuillEditor 
        bind:editorData={content} 
        bind:insertUrlFromTitle={insertUrlFromTitle}
        {uploadPlus} 
        {uploadMinus} 
        onTitleUpdate={handleTitleUpdate}
        onLoadingChange={handleLoadingChange}
      />
      <Row class="text-end pe-2 mt-4">
        <Col md="10" xs="8" class="text-end">
          <Button color="warning" onclick={list}>
            <Icon name="x-lg" class="pe-2" />
            취소
          </Button>
        </Col>
        <Col md="2" xs="4">
          <Button color="primary" role="submit" id="uploadBtn" disabled={uploading > 0 || isLoadingOG}>
            {#if uploading > 0}
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
            <Tooltip isOpen={isLoadingOG} target="uploadBtn">링크 정보를 가져오는 중입니다.</Tooltip>
          {/if}
        </Col>
      </Row>
    </form>
  </Row>
</main>
