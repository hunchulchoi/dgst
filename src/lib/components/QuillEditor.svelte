<script>
  /**
   * Quill Editor Svelte 5 통합 컴포넌트
   * @description Svelte 5용 Quill 에디터 (CKEditor 대체)
   */
  import { onMount, onDestroy } from 'svelte';
  import Loader from 'svelte-loading-overlay/Loader.svelte';

  // Svelte 5 Runes - Props
  let { uploadPlus, uploadMinus, editorData = $bindable('') } = $props();

  // 로컬 상태
  /** @type {HTMLDivElement | null} */
  let editorElement = null;
  /** @type {any} */
  let quillInstance = null;
  /** @type {boolean} */
  let loadingImage = false;
  /** @type {HTMLDivElement | undefined} */
  let editorDiv;
  /** @type {any} */
  let Quill;
  /** @type {any} */
  let ImageUploader;
  /** @type {any} */
  let ffmpeg = null;
  /** @type {any} */
  let FFmpeg = null;
  /** @type {any} */
  let fetchFile = null;
  /** @type {boolean} */
  let ffmpegReady = false;
  
  // 비디오 압축 진행 상태
  /** @type {boolean} */
  let isCompressing = false;
  /** @type {number} */
  let compressionProgress = 0;
  /** @type {number} */
  let compressionTime = 0; // 경과 시간 (초)
  /** @type {number} */
  let estimatedTime = 0; // 예상 총 시간 (초)

  /**
   * 초를 HH:MM:SS 형식으로 변환
   * @param {number} seconds
   * @returns {string}
   */
  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * 비디오 압축 함수
   * @param {File} file
   * @returns {Promise<File>}
   */
  async function compressVideo(file) {
    try {
      console.log('비디오 압축 시작:', file.name, 'size:', file.size);

      // FFmpeg 로드 대기
      if (!ffmpegReady) {
        console.log('⏳ FFmpeg 로드 대기 중...');
        isCompressing = true;
        compressionProgress = 0;
        
        // 최대 30초 대기
        let waitCount = 0;
        while (!ffmpegReady && waitCount < 60) {
          await new Promise(resolve => setTimeout(resolve, 500));
          waitCount++;
          compressionProgress = Math.min(5, waitCount);
          console.log(`FFmpeg 로드 대기... (${waitCount * 0.5}초)`);
        }
        
        if (!ffmpegReady) {
          console.warn('⚠️ FFmpeg 로드 시간 초과 - 원본 파일 업로드');
          isCompressing = false;
          compressionProgress = 0;
          // 압축 없이 원본 파일 반환
          return file;
        }
        
        console.log('✅ FFmpeg 준비 완료');
      }

      isCompressing = true;
      compressionProgress = 0;
      compressionTime = 0;
      estimatedTime = 0;
      uploadPlus?.();
      
      const startTime = Date.now();

      // 1초마다 경과 시간 업데이트
      const timeInterval = setInterval(() => {
        compressionTime = Math.round((Date.now() - startTime) / 1000);
      }, 1000);

      // Progress 이벤트 리스너 설정
      const progressHandler = ({ progress, time }) => {
        compressionProgress = Math.round(progress * 100);
        
        // 예상 시간 계산 (진행률 기반)
        if (progress > 0.01) {
          estimatedTime = Math.round(compressionTime / progress);
        }
        
        console.log(`압축 진행률: ${compressionProgress}%`, `경과: ${compressionTime}초`, `남은: ${Math.max(0, estimatedTime - compressionTime)}초`);
      };
      
      ffmpeg.on('progress', progressHandler);

      // FFmpeg에 파일 쓰기
      compressionProgress = 5;
      await ffmpeg.writeFile('input.mp4', await fetchFile(file));
      console.log('파일 쓰기 완료');

      // 비디오 압축 실행
      compressionProgress = 10;
      console.log('FFmpeg 압축 시작...');
      
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-vf', "scale='min(640,iw)':'min(640,ih)':force_original_aspect_ratio=decrease",  // 긴 쪽을 640px로 제한
        '-c:v', 'libx264',      // H.264 코덱
        '-crf', '28',           // 압축률 (0-51, 28은 중간)
        '-preset', 'medium',    // 속도/품질 밸런스
        '-c:a', 'aac',          // 오디오 AAC
        '-b:a', '128k',         // 오디오 비트레이트
        'output.mp4'
      ]);
      
      console.log('FFmpeg 압축 완료');

      // 압축된 파일 가져오기
      compressionProgress = 95;
      const compressedData = await ffmpeg.readFile('output.mp4');
      const compressedBlob = new Blob([compressedData.buffer], { type: 'video/mp4' });
      const compressedFile = new File([compressedBlob], file.name, { type: 'video/mp4' });

      compressionProgress = 100;
      uploadMinus?.();
      
      console.log('비디오 압축 완료:', 'original:', file.size, 'compressed:', compressedFile.size);
      
      // Progress 이벤트 리스너 및 타이머 제거
      ffmpeg.off('progress');
      clearInterval(timeInterval);
      
      // 잠시 후 오버레이 제거 (100% 표시)
      setTimeout(() => {
        isCompressing = false;
        compressionProgress = 0;
        compressionTime = 0;
        estimatedTime = 0;
      }, 500);
      
      return compressedFile;
    } catch (error) {
      console.error('비디오 압축 실패:', error);
      uploadMinus?.();
      isCompressing = false;
      compressionProgress = 0;
      compressionTime = 0;
      estimatedTime = 0;
      ffmpeg.off('progress');
      clearInterval(timeInterval);
      return file; // 압축 실패 시 원본 반환
    }
  }

  /**
   * 커스텀 이미지/비디오 업로드 핸들러
   * @returns {Promise<void>}
   */
  async function imageHandler() {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*,video/*');
    input.click();

    input.onchange = async () => {
      let file = input.files[0];
      if (!file) return;

      loadingImage = true;

      try {
        // uploadPlus 콜백 호출
        if (uploadPlus) {
          uploadPlus();
        }

        // 비디오 파일이면 압축 시도 (FFmpeg 사용 가능한 경우에만)
        if (file.type.startsWith('video/')) {
          if (ffmpegReady && ffmpeg) {
            console.log('비디오 파일 감지, 압축 시작...');
            file = await compressVideo(file);
          } else {
            console.log('⚠️ FFmpeg 미준비 - 원본 비디오 업로드');
          }
        }

        // FormData 생성
        const formData = new FormData();
        formData.append('upload', file);

        // 서버에 업로드
        const response = await fetch('/board/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Upload failed:', response.status, errorText);
          throw new Error(`Upload failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('Upload response:', data);
        const url = data.url;

        // 에디터에 이미지/비디오 삽입
        const range = quillInstance.getSelection(true);
        
        if (file.type.startsWith('video/')) {
          // 커스텀 Video Blot으로 비디오 삽입
          quillInstance.insertEmbed(range.index, 'video', url);
          quillInstance.insertText(range.index + 1, '\n');
          quillInstance.setSelection(range.index + 2);
          console.log('비디오 삽입 완료:', url, 'type:', file.type);
        } else {
          // 이미지 태그로 삽입
          quillInstance.insertEmbed(range.index, 'image', url);
          quillInstance.setSelection(range.index + 1);
          console.log('이미지 삽입 완료:', url);
        }

        // uploadMinus 콜백 호출
        if (uploadMinus) {
          uploadMinus();
        }
      } catch (error) {
        console.error('Image upload failed:', error);
        alert('이미지 업로드에 실패했습니다.');
      } finally {
        loadingImage = false;
      }
    };
  }

  /**
   * 비디오 임베드 핸들러
   * @returns {void}
   */
  function videoHandler() {
    const url = prompt('YouTube, Instagram, TikTok 또는 비디오 URL을 입력하세요:');
    if (!url) return;

    const range = quillInstance.getSelection(true);
    let embedHtml = '';

    // YouTube (일반 및 Shorts)
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      let videoId;
      if (url.includes('youtube.com/shorts/')) {
        const match = url.match(/youtube\.com\/shorts\/([\w-]+)/);
        videoId = match ? match[1] : null;
        if (videoId) {
          embedHtml = `<div style="max-width: 460px"><div style="position: relative;width:100%;padding-bottom:177.777%;"><iframe src="https://www.youtube.com/embed/${videoId}" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe></div></div>`;
        }
      } else if (url.includes('youtube.com/watch')) {
        const match = url.match(/[?&]v=([^&]+)/);
        videoId = match ? match[1] : null;
        if (videoId) {
          embedHtml = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        }
      } else if (url.includes('youtu.be/')) {
        const match = url.match(/youtu\.be\/([\w-]+)/);
        videoId = match ? match[1] : null;
        if (videoId) {
          embedHtml = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        }
      }
    }
    // Instagram
    else if (url.includes('instagram.com')) {
      if (url.includes('/reel/')) {
        const match = url.match(/instagram\.com\/reel\/([\w-]+)/);
        const id = match ? match[1] : null;
        if (id) {
          embedHtml = `<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/reel/${id}/" style="max-width:540px; min-width:326px;"></blockquote>`;
        }
      } else if (url.includes('/p/')) {
        const match = url.match(/instagram\.com\/p\/([\w-]+)/);
        const id = match ? match[1] : null;
        if (id) {
          embedHtml = `<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/${id}/" style="max-width:540px; min-width:326px;"></blockquote>`;
        }
      }
    }
    // TikTok
    else if (url.includes('tiktok.com')) {
      const match = url.match(/tiktok\.com\/(.*)\/video\/([\w-]+)/);
      if (match) {
        const userId = match[1];
        const videoId = match[2];
        embedHtml = `<blockquote class="tiktok-embed" cite="https://www.tiktok.com/${userId}/video/${videoId}" data-video-id="${videoId}" style="max-width: 605px;min-width: 325px;"></blockquote>`;
      }
    }
    // Naver TV
    else if (url.includes('tv.naver.com')) {
      const match = url.match(/tv\.naver\.com\/v\/([\w-]+)/);
      const id = match ? match[1] : null;
      if (id) {
        embedHtml = `<iframe src='https://tv.naver.com/embed/${id}' frameborder='no' scrolling='no' width='544' height='306' allowfullscreen></iframe>`;
      }
    }
    // 일반 비디오 URL
    else {
      quillInstance.insertEmbed(range.index, 'video', url);
      quillInstance.setSelection(range.index + 1);
      return;
    }

    if (embedHtml) {
      quillInstance.clipboard.dangerouslyPasteHTML(range.index, embedHtml);
      quillInstance.setSelection(range.index + 1);
    }
  }

  /**
   * Quill 에디터 설정
   * @returns {object}
   */
  const modules = {
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ size: ['small', false, 'large', 'huge'] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ align: [] }],
        ['link', 'image', 'video'],
        ['blockquote', 'code-block'],
        ['clean']
      ],
      handlers: {
        image: imageHandler,
        video: videoHandler
      }
    },
    clipboard: {
      matchVisual: false,
      matchers: [
        // video 태그 허용
        ['video', (node, delta) => {
          const src = node.getAttribute('src');
          if (src) {
            return delta;
          }
          return new Delta();
        }]
      ]
    }
  };

  /**
   * Quill 초기화
   */
  onMount(async () => {
    if (typeof window === 'undefined') return;

    console.log('QuillEditor onMount 시작');

    // editorElement 확인
    if (!editorElement) {
      console.error('❌ editorElement가 null입니다');
      return;
    }
    console.log('✅ editorElement 준비됨');

    try {
      // Quill 동적 import
      console.log('Quill import 시작...');
      const QuillModule = await import('quill');
      Quill = QuillModule.default;
      console.log('✅ Quill imported');

      // Quill 스타일 import
      await import('quill/dist/quill.snow.css');
      console.log('✅ Quill CSS loaded');

      // Video Blot 등록 (div로 감싼 video 태그)
      const BlockEmbed = Quill.import('blots/block/embed');
      class VideoBlot extends BlockEmbed {
        static create(value) {
          const node = super.create();
          node.setAttribute('class', 'video-container');
          node.setAttribute('style', 'margin: 1em 0;');
          
          const video = document.createElement('video');
          video.setAttribute('src', value);
          video.setAttribute('controls', '');
          video.setAttribute('style', 'max-width: 100%; height: auto; display: block;');
          
          node.appendChild(video);
          return node;
        }

        static value(node) {
          const video = node.querySelector('video');
          return video ? video.getAttribute('src') : '';
        }
      }
      VideoBlot.blotName = 'video';
      VideoBlot.tagName = 'div';
      Quill.register(VideoBlot);
      console.log('✅ Video Blot 등록됨 (div로 감싼 video)');

      // Quill 인스턴스 생성
      console.log('Quill 인스턴스 생성 중...');
      quillInstance = new Quill(editorElement, {
        theme: 'snow',
        modules: modules,
        placeholder: '내용을 입력하세요...'
      });
      console.log('✅ Quill 인스턴스 생성됨');

      // 초기 데이터 설정
      if (editorData) {
        quillInstance.root.innerHTML = editorData;
        console.log('✅ 초기 데이터 설정됨');
      }

      // 데이터 변경 감지 및 양방향 바인딩
      quillInstance.on('text-change', () => {
        editorData = quillInstance.root.innerHTML;
      });

      console.log('🎉 Quill Editor initialized successfully');
    } catch (error) {
      console.error('❌ Quill 초기화 실패:', error);
    }

    // FFmpeg 로드 (비동기, 에디터 초기화와 분리)
    (async () => {
      try {
        console.log('FFmpeg 로드 시작 (백그라운드)...');
        
        const FFmpegModule = await import('@ffmpeg/ffmpeg');
        const UtilModule = await import('@ffmpeg/util');
        FFmpeg = FFmpegModule.FFmpeg;
        fetchFile = UtilModule.fetchFile;
        
        console.log('FFmpeg 클래스 로드 완료, 인스턴스 생성...');
        ffmpeg = new FFmpeg();
        
        // FFmpeg 로그 활성화
        ffmpeg.on('log', ({ message }) => {
          console.log('[FFmpeg]', message);
        });
        
        console.log('FFmpeg 코어 로드 중... (시간이 걸릴 수 있습니다)');
        
        // timeout으로 로드 시간 제한
        const loadPromise = ffmpeg.load();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('FFmpeg load timeout')), 60000) // 60초
        );
        
        await Promise.race([loadPromise, timeoutPromise]);
        
        ffmpegReady = true;
        console.log('✅ FFmpeg loaded successfully and ready!');
      } catch (err) {
        console.error('❌ FFmpeg 로드 실패 (비디오는 압축 없이 원본 업로드됩니다):', err);
        ffmpegReady = false;
        ffmpeg = null;
      }
    })();
  });

  /**
   * 정리
   */
  onDestroy(() => {
    if (quillInstance) {
      quillInstance = null;
    }
  });

  // editorData prop 변경 감지 (외부에서 변경 시)
  $effect(() => {
    if (quillInstance && editorData !== quillInstance.root.innerHTML) {
      const currentSelection = quillInstance.getSelection();
      quillInstance.root.innerHTML = editorData;
      if (currentSelection) {
        quillInstance.setSelection(currentSelection);
      }
    }
  });
</script>

<svelte:head>
  <script async src="//www.instagram.com/embed.js"></script>
  <script async src="//www.tiktok.com/embed.js"></script>
</svelte:head>

<main>
  <div bind:this={editorDiv}>
    <Loader active={loadingImage} container={editorDiv} component="Dot" opacity="0.7" />
    
    {#if isCompressing}
      <div class="compression-overlay">
        <div class="progress-container bg-light">
          <h5 class="mb-3 text-dark">
            <span class="spinner-border spinner-border-sm me-2" role="status"></span>
            비디오 압축 중...
          </h5>
          <div class="progress mb-3" style="height: 30px; background-color: #e9ecef;">
            <div 
              class="progress-bar progress-bar-striped progress-bar-animated" 
              role="progressbar" 
              style="width: {compressionProgress}%; background-color: #28a745;"
              aria-valuenow={compressionProgress} 
              aria-valuemin="0" 
              aria-valuemax="100">
              <strong style="color: white;">{compressionProgress}%</strong>
            </div>
          </div>
          <div class="time-info mb-2">
            <span class="badge bg-primary me-2">
              경과: {formatTime(compressionTime)}
            </span>
            {#if estimatedTime > 0}
              <span class="badge bg-warning">
                남은 시간: {formatTime(Math.max(0, estimatedTime - compressionTime))}
              </span>
            {/if}
          </div>
          <small class="text-secondary">
            압축이 완료될 때까지 기다려주세요...<br/>
            (브라우저 탭을 닫지 마세요)
          </small>
        </div>
      </div>
    {/if}
    
    <div bind:this={editorElement}></div>
  </div>
</main>

<style>
  .compression-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(4px);
  }

  .progress-container {
    background: white;
    padding: 2.5rem;
    border-radius: 12px;
    min-width: 400px;
    max-width: 500px;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }

  .progress {
    border-radius: 8px;
    overflow: hidden;
  }

  .progress {
    background-color: #e9ecef;
  }

  .progress-bar {
    font-size: 14px;
    line-height: 30px;
    background-color: #28a745;
    transition: width 0.3s ease;
  }
  
  .progress-bar-animated {
    animation: progress-bar-stripes 1s linear infinite;
  }
  
  @keyframes progress-bar-stripes {
    0% {
      background-position: 1rem 0;
    }
    100% {
      background-position: 0 0;
    }
  }
  
  .progress-bar-striped {
    background-image: linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.15) 25%,
      transparent 25%,
      transparent 50%,
      rgba(255, 255, 255, 0.15) 50%,
      rgba(255, 255, 255, 0.15) 75%,
      transparent 75%,
      transparent
    );
    background-size: 1rem 1rem;
  }

  .time-info {
    font-size: 0.9rem;
  }

  main :global(.ql-container) {
    min-height: 400px;
    font-size: 16px;
  }

  main :global(.ql-editor) {
    min-height: 400px;
  }

  main :global(.ql-toolbar) {
    background: #f8f9fa;
    border-radius: 4px 4px 0 0;
  }

  main :global(.ql-container) {
    border-radius: 0 0 4px 4px;
  }
</style>

