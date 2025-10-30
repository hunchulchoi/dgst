<script lang="ts">
  // @ts-nocheck
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import Swal from 'sweetalert2';
  import theme from '$lib/shared/stores/theme';

  // Svelte 5 Runes - Props
  let { editorData = $bindable('') } = $props();

  /** @type {any} */
  let editor = null;
  /** @type {HTMLDivElement | null} */
  let editorRoot = null;
  /** @type {HTMLInputElement | null} */
  let fileInput = null;

  // 업로드 진행 상태
  let loadingImage = $state(false);
  let totalFiles = $state(0);
  let currentFile = $state(0);
  let uploadProgress = $state(0); // 0~100
  
  // OG 카드 생성 중복 방지
  let processingUrl = $state('');

  // ffmpeg 관련 전역
  /** @type {any} */ let FFmpeg = null;
  /** @type {any} */ let fetchFile = null;
  /** @type {any} */ let ffmpeg = null;
  let ffmpegReady = false;

  // 압축 진행 전역 상태 Quill 방식으로 추가
  let isCompressing = $state(false);
  let compressionProgress = $state(0);
  let compressionTime = $state(0);
  let estimatedTime = $state(0);

  // 동적 로드 (SSR 안전)
  onMount(async () => {
    if (!browser) return;
    const [{ Editor }] = await Promise.all([
      import('@toast-ui/editor'),
      Promise.resolve()
    ]);

    // 레이아웃 연산 직후 초기화하여 ResizeObserver 경고 완화
    requestAnimationFrame(() => {
      // 현재 테마에 따라 에디터 테마 결정
      const currentTheme = $theme;
      const editorTheme = currentTheme === 'light' ? 'light' : 'dark';
      
      editor = new Editor({
        el: editorRoot,
        height: '500px',
        initialEditType: 'wysiwyg',
        previewStyle: 'vertical',
        usageStatistics: false,
        theme: editorTheme,
        initialValue: editorData || ''
      });

      // 에디터 렌더 후 툴바에 직접 버튼 삽입 (가장 앞)
      const injectToolbarButton = () => {
        const toolbar = editorRoot?.querySelector?.('.toastui-editor-toolbar');
        const group = toolbar?.querySelector?.('.toastui-editor-toolbar-group');
        if (group) {
          // 완전한 부트스트랩 버튼 제작
          const multiBtn = document.createElement('button');
          multiBtn.type = 'button';
          multiBtn.className = 'btn btn-primary btn-sm tui-multi-btn';
          multiBtn.setAttribute('aria-label', '이미지 여러개');
          multiBtn.title = '이미지 선택(여러 개)';
          multiBtn.innerHTML = '<i class="bi bi-camera fs-4 camera-strong"></i>';
          multiBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openMultiImagePicker();
          });
          group.insertBefore(multiBtn, group.firstChild);

          // 기존 기본 이미지 삽입 버튼 제거 (커스텀만 남김)
          Array.from(group.querySelectorAll('button'))
            .filter((b) => b !== multiBtn && b.querySelector('.toastui-editor-toolbar-icons.ti-image'))
            .forEach((b) => b.remove());
          return true;
        }
        return false;
      };

      // 즉시 시도 후 실패 시 MutationObserver로 대기
      if (!injectToolbarButton()) {
        const toolbar = editorRoot?.querySelector?.('.toastui-editor-toolbar');
        const observer = new MutationObserver(() => {
          if (injectToolbarButton()) {
            observer.disconnect();
          }
        });
        if (toolbar) observer.observe(toolbar, { childList: true, subtree: true });
        // 추가 안전장치: 짧은 지연 재시도
        setTimeout(injectToolbarButton, 50);
        setTimeout(injectToolbarButton, 100);
      }

      // 값 변경 → 양방향 바인딩
      editor.on('change', () => {
        editorData = editor.getHTML();
      });

      // 붙여넣기 이벤트 감지 및 OG 카드 생성
      const wysiwygEditor = editorRoot?.querySelector('.toastui-editor-ww-editor');
      if (wysiwygEditor) {
        wysiwygEditor.addEventListener('paste', async (e) => {
          const pastedText = (e.clipboardData || window.clipboardData).getData('text');
          console.log('[ToastEditor] 붙여넣은 텍스트:', pastedText);
          
          // URL 패턴 감지
          const urlRegex = /(https?:\/\/[^\s<>"']+(?:\?[^\s<>"']*)?)/g;
          const urlMatch = pastedText.match(urlRegex);
          
          if (urlMatch && urlMatch.length > 0) {
            const url = urlMatch[0];
            
            // YouTube, Instagram 등 미디어 URL은 제외
            if (!url.includes('youtube.com') && !url.includes('youtu.be') && 
                !url.includes('instagram.com') && !url.includes('tiktok.com') && 
                !url.includes('tv.naver.com')) {
              
              // 약간의 지연 후 확인 (Toast가 HTML로 변환하는 시간 대기)
              setTimeout(async () => {
                const html = editor.getHTML();
                
                // 이미 플레이스홀더가 있으면 무시
                if (html.includes('OG_CARD_START')) return;
                
                console.log('[ToastEditor] URL 붙여넣기 감지, OG 카드 생성:', url);
                processingUrl = url;
                await createOGCard(url);
                processingUrl = '';
              }, 100);
            }
          }
        });
      }

      // 이미지 업로드 훅
      editor.addHook('addImageBlobHook', async (blob, callback) => {
        try {
          loadingImage = true;
          totalFiles = 1;
          currentFile = 1;
          uploadProgress = 5;

          const form = new FormData();
          form.append('upload', blob);

          const res = await fetch('/board/upload', {
            method: 'POST',
            body: form,
            credentials: 'include'
          });

          if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
          uploadProgress = 70;
          const data = await res.json();
          const url = data.url;

          callback(url, blob.name || 'image');
          uploadProgress = 100;
        } catch (e) {
          console.error('[ToastEditor] 이미지 업로드 실패', e);
        } finally {
          setTimeout(() => {
            loadingImage = false;
            totalFiles = 0;
            currentFile = 0;
            uploadProgress = 0;
          }, 400);
        }
      });
    });

    /* ffmpeg를 미리 동적 import (압축이 필요하면 첫 video에서 실사용) */
    // 동영상 압축 쓸 브라우저인지 점검 (Safari 등은 wasm/worker 제한 가능)
    // 압축은 on-demand로 최초로 필요할 때만 불러옴
  });

  // 테마 변경 감지 및 에디터 테마 업데이트
  $effect(() => {
    if (editor && browser) {
      const currentTheme = $theme;
      const editorTheme = currentTheme === 'light' ? 'light' : 'dark';
      
      // Toast UI Editor의 changeTheme API 사용
      if (editor.changeTheme) {
        editor.changeTheme(editorTheme);
        console.log('[ToastEditor] 테마 변경:', editorTheme);
      }
    }
  });

  onDestroy(() => {
    try {
      editor?.destroy?.();
    } catch {}
    editor = null;
  });

  // Quill 방식의 compressVideo 함수
  /**
   * @param {File} file
   */
  async function compressVideo(file) {
    try {
      // ffmpeg 준비
      if (!ffmpegReady) {
        const ffmpegModule = await import('@ffmpeg/ffmpeg');
        const utilModule = await import('@ffmpeg/util');
        FFmpeg = ffmpegModule.FFmpeg;
        fetchFile = utilModule.fetchFile;
        ffmpeg = new FFmpeg();
        await ffmpeg.load();
        ffmpegReady = true;
      }
      isCompressing = true;
      compressionProgress = 0;
      compressionTime = 0;
      estimatedTime = 0;
      const startTime = Date.now();

      // 진행률 핸들러 등록
      const progressHandler = ({ progress, time }) => {
        compressionProgress = Math.round(progress * 100);
        if (progress > 0.01) estimatedTime = Math.round(compressionTime / progress);
      };
      ffmpeg.on('progress', progressHandler);
      // 경과시간 interval
      const interval = setInterval(() => {
        compressionTime = Math.round((Date.now() - startTime) / 1000);
      }, 1000);

      // 파일 write → exec → read
      await ffmpeg.writeFile('input.mp4', await fetchFile(file));
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-vf', "scale='min(640,iw)':'min(640,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
        '-c:v', 'libx264', '-crf', '28',
        '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k', '-pix_fmt', 'yuv420p', 'output.mp4'
      ]);
      const compressedData = await ffmpeg.readFile('output.mp4');
      const compressedBlob = new Blob([compressedData.buffer], { type: 'video/mp4' });
      // 후처리
      isCompressing = false;
      compressionProgress = 100;
      ffmpeg.off('progress');
      clearInterval(interval);
      setTimeout(() => { isCompressing = false; compressionProgress = 0; compressionTime=0; estimatedTime=0; }, 600);
      return new File([compressedBlob], file.name.replace(/\.[^.]+$/, '.mp4'), { type: 'video/mp4' });
    } catch (err) {
      isCompressing = false;
      compressionProgress = 0;
      compressionTime = 0;
      estimatedTime = 0;
      ffmpeg.off('progress');
      alert('비디오 압축 실패(원본 업로드): ' + err);
      return file; // 압축 실패시 fallback
    }
  }

  /**
   * @param {File} file
   * @param {number} index
   * @param {number} count
   */
  async function uploadAndInsertMedia(file, index = 1, count = 1) {
    let isVideo = file.type.startsWith('video/');
    let isImage = file.type.startsWith('image/');
    try {
      let uploadedFile = file;
      if (isVideo) {
        try {
          console.log('[ToastEditor] 압축 시작:', file.name, file.type);
          uploadedFile = await compressVideo(file);
          console.log('[ToastEditor] 압축 완료:', uploadedFile.name, uploadedFile.type);
        } catch (err) {
          alert('비디오 압축 실패: 원본 업로드 - ' + err);
          uploadedFile = file;
        }
      }
      loadingImage = true;
      totalFiles = count;
      currentFile = index;
      uploadProgress = 5;
      const form = new FormData();
      form.append('upload', uploadedFile);
      const res = await fetch('/board/upload', {
        method: 'POST',
        body: form,
        credentials: 'include'
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      uploadProgress = 80;
      const data = await res.json();
      const url = data.url;
      let tag = '';
      if (isImage) {
        tag = `<img src="${url}" alt="" style="max-width:100%;height:auto;"/>`;
      } else if (isVideo) {
        // video 태그 대신 다운로드/재생 링크만 남김
        tag = `<a href="${url}" target="_blank" rel="noopener">[동영상 다운로드/재생]</a>`;
        Swal.fire({
          icon: 'info',
          title: '직접적인 동영상 삽입은 에디터에서 지원하지 않습니다.',
          text: '글을 저장하면 상세 보기에서 자동으로 동영상으로 표시됩니다.',
          confirmButtonText: '확인'
        });
      }
      if (tag && editor?.getHTML) {
        const before = editor.getHTML();
        console.log('[ToastEditor] setHTML 전:', before);
        const injected = `${before}\n<p>${tag}</p>\n`;
        editor.setHTML(injected);
        setTimeout(() => {
          console.debug('[ToastEditor] setHTML 후:', editor.getHTML());
        }, 120);
      } else if (tag) {
        editor?.insertText(`\n${url}\n`);
      } else {
        alert('이미지/동영상만 지원');
      }
      uploadProgress = 100;
    } catch (e) {
      alert('업로드 실패: '+e);
      console.error(e);
    } finally {
      if (index === count) setTimeout(() => { loadingImage = false; totalFiles = 0; currentFile = 0; uploadProgress = 0; }, 400);
    }
  }

  function openMultiImagePicker() {
    if (!browser) return;
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*,video/*';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
      fileInput.addEventListener('change', async () => {
        const files = Array.from(fileInput?.files || []);
        const count = files.length;
        for (let i = 0; i < count; i++) {
          const f = files[i];
          await uploadAndInsertMedia(f, i + 1, count);
        }
        // 선택 초기화
        if (fileInput) fileInput.value = '';
      });
    }
    fileInput.click();
  }

  // OG 카드 생성 함수
  async function createOGCard(url) {
    try {
      loadingImage = true;
      
      const response = await fetch('/api/og', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        console.error('[ToastEditor] OG 데이터 가져오기 실패 - URL만 삽입');
        const html = editor.getHTML();
        // URL을 링크로 변경
        const updatedHtml = html.replace(url, `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
        editor.setHTML(updatedHtml);
        loadingImage = false;
        return;
      }

      const ogData = await response.json();
      console.log('[ToastEditor] ✅ OG 데이터:', ogData);

      const html = editor.getHTML();
      
      // URL을 특수 마크다운 블록으로 변환 (div 대신)
      // Toast UI Editor가 HTML을 파싱하므로 특수 플레이스홀더 사용
      // JSON을 base64로 인코딩하여 특수문자 문제 해결
      const ogDataJson = JSON.stringify(ogData);
      const ogDataBase64 = btoa(unescape(encodeURIComponent(ogDataJson)));
      const ogCardPlaceholder = `OG_CARD_START:${url}:${ogDataBase64}:OG_CARD_END`;
      
      const updatedHtml = html.replace(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ogCardPlaceholder);
      editor.setHTML(updatedHtml);
      
      console.log('[ToastEditor] ✅ OG 카드 삽입 완료');
    } catch (err) {
      console.error('[ToastEditor] OG 카드 생성 실패 - URL만 삽입:', err);
      const html = editor.getHTML();
      const updatedHtml = html.replace(url, `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
      editor.setHTML(updatedHtml);
    } finally {
      loadingImage = false;
    }
  }
</script>

<svelte:head>
  <!-- Toast UI Editor CSS (CDN) -->
  <link rel="stylesheet" href="https://uicdn.toast.com/editor/latest/toastui-editor.css" />
  <link rel="stylesheet" href="https://uicdn.toast.com/editor/latest/theme/toastui-editor-dark.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css" />
</svelte:head>

<div class="toast-editor-wrap">
  <div bind:this={editorRoot}></div>
  {#if isCompressing}
    <div class="upload-overlay">
      <div class="upload-card">
        <div class="title title-compressing">동영상 압축 중...</div>
        <div class="files">{compressionProgress}%</div>
        {#if compressionTime > 0}
          <div class="time-info">
            경과: {compressionTime}초
            {#if estimatedTime > 0 && compressionProgress > 5}
              <br />예상: {estimatedTime}초
            {/if}
          </div>
        {/if}
        <div class="progress" style="height: 10px;">
          <div
            class="progress-bar progress-bar-striped progress-bar-animated bg-warning"
            role="progressbar"
            style={`width:${compressionProgress}%`}
            aria-valuenow={compressionProgress}
            aria-valuemin="0"
            aria-valuemax="100"
          ></div>
        </div>
      </div>
    </div>
  {:else if loadingImage}
    <div class="upload-overlay">
      <div class="upload-card">
        <div class="title">업로드 중...</div>
        {#if totalFiles > 1}
          <div class="files">{currentFile} / {totalFiles}</div>
        {/if}
        <div class="progress" style="height: 10px;">
          <div
            class="progress-bar progress-bar-striped progress-bar-animated"
            role="progressbar"
            style={`width:${uploadProgress}%`}
            aria-valuenow={uploadProgress}
            aria-valuemin="0"
            aria-valuemax="100"
          ></div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Toast UI Editor 스타일 조정 */
  :global(.toastui-editor-defaultUI) {
    border-radius: 4px;
    background-color: #ffffff !important; /* Bootstrap 기본 배경 */
    border-color: #dee2e6 !important; /* Bootstrap 기본 테두리 색상 */
  }
  
  /* 에디터 내용 영역 - Bootstrap 기본 스타일 */
  :global(.toastui-editor-contents) {
    font-size: 1rem !important; /* Bootstrap 기본 16px */
    color: #212529 !important; /* Bootstrap 기본 텍스트 색상 */
    line-height: 1.5 !important;
    background-color: #ffffff !important; /* Bootstrap 기본 배경 */
  }
  
  /* WYSIWYG 모드 */
  :global(.toastui-editor-ww-editor) {
    background-color: #ffffff !important;
  }
  
  /* 마크다운 모드 */
  :global(.toastui-editor-md-editor) {
    background-color: #ffffff !important;
  }
  
  /* 다크 테마 적용 */
  @media (prefers-color-scheme: dark) {
    :global(.toastui-editor-defaultUI) {
      background-color: #212529 !important; /* Bootstrap 다크 배경 */
      border-color: #495057 !important;
    }
    
    :global(.toastui-editor-contents) {
      color: #f8f9fa !important; /* Bootstrap 다크 모드 텍스트 색상 */
      background-color: #212529 !important;
    }
    
    :global(.toastui-editor-ww-editor) {
      background-color: #212529 !important;
    }
    
    :global(.toastui-editor-md-editor) {
      background-color: #212529 !important;
    }
  }
  
  /* 제목 크기 조정 */
  :global(.toastui-editor-contents h1) {
    font-size: 2.5rem !important;
  }
  :global(.toastui-editor-contents h2) {
    font-size: 2rem !important;
  }
  :global(.toastui-editor-contents h3) {
    font-size: 1.75rem !important;
  }
  :global(.toastui-editor-contents h4) {
    font-size: 1.5rem !important;
  }
  :global(.toastui-editor-contents h5) {
    font-size: 1.25rem !important;
  }
  :global(.toastui-editor-contents h6) {
    font-size: 1rem !important;
  }
  
  /* 단락 간격 */
  :global(.toastui-editor-contents p) {
    margin-bottom: 1rem !important;
  }
  
  :global(.tui-multi-btn .bi-camera) {
    color:#fff!important; text-shadow: 0 1px 2px #0005;
  }
  :global(.tui-multi-btn:hover .bi-camera) {
    color:#fff!important; filter:none!important;
  }

.upload-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.upload-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 20px;
  width: 280px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.15);
  text-align: center;
}
.upload-card .title { 
  font-weight: 600; 
  margin-bottom: 8px; 
  font-size: 16px; 
  color: #333;
}
.upload-card .title-compressing {
  color: #f97316 !important;
  font-size: 17px;
  font-weight: 700;
}
.upload-card .files { 
  color: #666; 
  font-size: 14px; 
  font-weight: 600;
  margin-bottom: 10px; 
}
.upload-card .time-info { color: #888; font-size: 11px; margin-bottom: 8px; line-height: 1.4; }

/* (기존 upload-overlay 등 기존 toast 에디터 스타일 유지) */
/* og-card, og-card-new 등 OG 카드 커스텀 스타일은 전부 삭제 */
</style>


