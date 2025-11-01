<script>
  /**
   * Quill Editor Svelte 5 통합 컴포넌트
   * @description Svelte 5용 Quill 에디터 (CKEditor 대체)
   */
  import { onMount, onDestroy } from 'svelte';
  import Loader from 'svelte-loading-overlay/Loader.svelte';
  import Swal from 'sweetalert2';
  import imageCompression from 'browser-image-compression';

  // Svelte 5 Runes - Props
  let { uploadPlus, uploadMinus, editorData = $bindable() } = $props();

  // 로컬 상태
  /** @type {HTMLDivElement | null} */
  let editorElement = null;
  /** @type {any} */
  let quillInstance = null;
  /** @type {boolean} */
  let loadingImage = $state(false);
  /** @type {HTMLDivElement | null} */
  // @ts-ignore - bind:this로 자동 할당되므로 반응성 불필요
  // svelte-ignore non_reactive_update
  let editorDiv = null;
  /** @type {number} */
  let uploadProgress = $state(0);
  /** @type {number} */
  let totalFiles = $state(0);
  /** @type {number} */
  let currentFile = $state(0);
  /** 단일 이미지 업로드 여부 */
  let isSingleImageUpload = $state(false);
  /** @type {any} */
  let timeInterval = null;
  /** @type {any} */
  let Quill;
  /** @type {any} */
  let Delta;
  /** @type {any} */
  let ImageUploader;
  /** @type {any} */
  let ffmpeg = null;
  /** @type {any} */
  let FFmpeg = null;
  /** @type {any} */
  let fetchFile = null;
  /** @type {any} */
  let heic2any = null;
  /** @type {boolean} */
  let ffmpegReady = false;
  /** @type {boolean} */
  let isComposing = $state(false);
  // iOS 감지 (SSR 안전)
  const IS_IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  /** @type {boolean} */
  let isUserTyping = $state(false);
  /** @type {any} */
  let syncTimer = null;
  
  
  // 비디오 압축 진행 상태
  /** @type {boolean} */
  let isCompressing = $state(false);
  /** @type {number} */
  let compressionProgress = $state(0);
  /** @type {number} */
  let compressionTime = $state(0); // 경과 시간 (초)
  /** @type {number} */
  let estimatedTime = $state(0); // 예상 총 시간 (초)

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
   * browser-image-compression을 사용한 WebP 변환 함수 (움짤 포함)
   * @param {File|Blob} file
   * @param {{width?: number, quality?: number}} options
   * @returns {Promise<Blob>}
   */
  async function convertToWebP(file, options = {}) {
    const maxWidth = options.width || 1400;
    const quality = options.quality || 0.85;
    const fileName = file instanceof File ? file.name : 'image';
    const fileSizeMB = file.size / (1024 * 1024);

    try {
      console.log('[browser-image-compression] 이미지 변환 시작:', fileName, 'type:', file.type, 'size:', file.size);
      
      // GIF/HEIC/HEIF는 클라이언트 변환 대상 아님
      const lowerType = (file.type || '').toLowerCase();
      const lowerName = (fileName || '').toLowerCase();
      if (
        lowerType === 'image/gif' ||
        lowerType.includes('image/heic') ||
        lowerType.includes('image/heif') ||
        lowerName.endsWith('.heic') ||
        lowerName.endsWith('.heif')
      ) {
        console.log('[browser-image-compression] GIF/HEIC/HEIF 파일은 변환하지 않음:', fileName, lowerType);
        return file; // 서버/사용자 측에서 처리 (브라우저 표시 불가 형식은 업로드 차단 로직에서 안내)
      }

      // 1MB 이하는 변환하지 않고 원본 유지
      if (fileSizeMB <= 1) {
        console.log('[browser-image-compression] 1MB 이하 이미지는 원본 유지:', fileSizeMB.toFixed(2), 'MB');
        return file;
      }

      // browser-image-compression으로 리사이즈 및 압축
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 10, // 최대 크기
        maxWidthOrHeight: maxWidth, // 최대 너비/높이
        useWebWorker: true, // 웹 워커 사용
        fileType: 'image/webp', // WebP 형식으로 변환
        initialQuality: quality // 품질
      });

      console.log('[browser-image-compression] WebP 변환 완료:', {
        originalSize: file.size,
        webpSize: compressedFile.size,
        savedBytes: file.size - compressedFile.size,
        savedPercent: ((1 - compressedFile.size / file.size) * 100).toFixed(1)
      });

      return compressedFile;
    } catch (error) {
      console.error('[browser-image-compression] 이미지 변환 실패:', error);
      throw error;
    }
  }

  /**
   * 삽입된 콘텐츠로 스크롤 이동
   * @param {number} index
   * @returns {void}
   */
  function scrollToInsertedContent(index) {
    // DOM 렌더링 완료를 위해 약간의 지연 추가
    setTimeout(() => {
      try {
        console.log('스크롤 이동 시작, index:', index);
        
        // Quill 에디터의 스크롤 컨테이너 찾기
        const editorContainer = quillInstance.root.parentElement;
        const scrollContainer = editorContainer?.closest('.ql-container') || editorContainer;
        
        if (scrollContainer) {
          console.log('스크롤 컨테이너 찾음:', scrollContainer);
          console.log('현재 스크롤 높이:', scrollContainer.scrollHeight);
          console.log('컨테이너 높이:', scrollContainer.clientHeight);
          
          // 간단한 방법: 에디터 끝으로 스크롤
          const targetScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
          console.log('목표 스크롤 위치:', targetScrollTop);
          
          // 부드러운 스크롤
          scrollContainer.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });
          
          console.log('스크롤 실행 완료');
        } else {
          console.warn('스크롤 컨테이너를 찾을 수 없음');
        }
      } catch (error) {
        console.warn('스크롤 이동 실패:', error);
      }
    }, 300); // 300ms로 지연 시간 더 증가
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
        '-vf', "scale='min(640,iw)':'min(640,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",  // 긴 쪽을 640px로 제한하고 짝수 크기로 패딩
        '-c:v', 'libx264',      // H.264 코덱
        '-crf', '28',           // 압축률 (0-51, 28은 중간)
        '-preset', 'medium',    // 속도/품질 밸런스
        '-c:a', 'aac',          // 오디오 AAC
        '-b:a', '128k',         // 오디오 비트레이트
        '-pix_fmt', 'yuv420p',  // 호환성 픽셀 포맷
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
  /**
   * 파일 업로드 및 삽입 공통 함수
   * @param {File[]} files - 업로드할 파일 배열
   */
  async function uploadAndInsertFiles(files) {
    if (!files.length) return;

    // 단일 이미지 업로드 여부 결정
    isSingleImageUpload = files.length === 1 && files[0].type.startsWith('image/');

    // 이미지가 포함된 경우 업로드 오버레이 표시
    loadingImage = files.some(f => f.type.startsWith('image/'));
    totalFiles = files.length;
    currentFile = 0;
    uploadProgress = 0;

    // uploadPlus 호출 횟수 추적 (실패 시 보상 호출용)
    let uploadPlusCount = 0;
    let successCount = 0; // 성공한 파일 수
    
    try {
      // 초기 커서 위치 저장
      let currentRange = quillInstance.getSelection(true);
      if (!currentRange) {
        // 커서가 없으면 에디터 끝으로 이동
        const length = quillInstance.getLength();
        currentRange = { index: length - 1, length: 0 };
      }

      // 모든 파일을 순차적으로 업로드
      for (let i = 0; i < files.length; i++) {
        let file = files[i];
        currentFile = i + 1;
        uploadProgress = Math.round((i / files.length) * 100);
        
        // uploadPlus 콜백 호출
        if (uploadPlus) {
          uploadPlus();
          uploadPlusCount++;
        }

        // 이미지 파일이면 browser-image-compression으로 WebP 변환 (움짤 포함)
        if (file.type.startsWith('image/') && file.type !== 'image/webp') {
          const typeLower = (file.type || '').toLowerCase();
          const nameLower = (file.name || '').toLowerCase();

          // HEIC/HEIF는 클라이언트에서 heic2any로 JPEG 변환 시도
          if (
            typeLower.includes('image/heic') ||
            typeLower.includes('image/heif') ||
            nameLower.endsWith('.heic') ||
            nameLower.endsWith('.heif')
          ) {
            try {
              console.log('[upload] HEIC/HEIF 감지 - heic2any로 변환 시도:', file.name);
              if (!heic2any) {
                heic2any = (await import('heic2any')).default;
              }
              const jpgBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
              const baseName = nameLower.replace(/\.(heic|heif)$/i, '');
              file = new File([jpgBlob], `${baseName || 'image'}.jpg`, { type: 'image/jpeg' });
              console.log('[upload] HEIC → JPEG 변환 완료:', file.name, file.type, file.size);
            } catch (e) {
              console.error('[upload] HEIC 변환 실패 - 업로드 중단:', e);
              // 보상 호출: 이미 uploadPlus 한 경우 감소
              if (uploadMinus) uploadMinus();
              uploadPlusCount = Math.max(0, uploadPlusCount - 1);
              await Swal.fire({
                icon: 'warning',
                title: 'HEIC 변환 실패',
                html: 'iPhone 사진(HEIC)을 변환하지 못했습니다. JPG/PNG로 저장 후 업로드해 주세요.',
                confirmButtonText: '확인'
              });
              continue;
            }
          }
          // 원본 파일 보존 (변환 실패 시 사용)
          const originalFile = file;
          console.log('[browser-image-compression] 이미지 파일 감지, WebP 변환 시작...', originalFile.name);
          
          try {
            const webpBlob = await convertToWebP(originalFile, { width: 1400, quality: 0.85 });
            // 원본 파일명에서 확장자 제거 후 .webp로 교체
            const dotIdx = originalFile.name.lastIndexOf('.');
            const base = dotIdx > -1 ? originalFile.name.substring(0, dotIdx) : originalFile.name;
            const newName = `${base}.webp`;
            file = new File([webpBlob], newName, { type: 'image/webp' });
            console.log('[browser-image-compression] WebP 변환 완료:', newName, 'size:', webpBlob.size);
          } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            console.warn('[browser-image-compression] WebP 변환 실패, 원본 파일을 서버에서 처리합니다:', error);
            
            // 원본 파일로 복원 (서버에서 처리)
            file = originalFile;
            
            // 서버에 로그 전송
            try {
              await fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  level: 'warn',
                  message: 'Client WebP conversion failed (browser-image-compression) - will process on server',
                  fileName: originalFile instanceof File ? originalFile.name : 'unknown',
                  fileSize: originalFile.size,
                  fileType: originalFile.type,
                  error: error.message,
                  stack: error.stack
                })
              });
            } catch (logError) {
              console.error('Failed to send error log to server:', logError);
            }
          }
        }

        // 비디오 파일이면 압축 시도 (FFmpeg 사용 가능한 경우에만)
        if (file.type.startsWith('video/')) {
          // 비디오 압축 중에는 이미지 오버레이 유지 (여러 파일 업로드 시)
          if (ffmpegReady) {
            console.log('비디오 파일 감지, 압축 시작...');
            file = await compressVideo(file);
          } else {
            console.log('⚠️ FFmpeg 미준비 - 원본 비디오 업로드');
          }
        }

        // 진행률 업데이트 (현재 파일 업로드 시작)
        uploadProgress = Math.round(((i + 0.5) / files.length) * 100);

        // FormData 생성
        const formData = new FormData();
        formData.append('upload', file);

        // 서버에 업로드
        const response = await fetch('/board/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        // 업로드 완료 후 진행률 업데이트
        uploadProgress = Math.round(((i + 1) / files.length) * 100);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Upload failed:', response.status, errorText);
          throw new Error(`Upload failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('Upload response:', data);
        const url = data.url;

        // 현재 커서 위치에서 이미지/비디오 삽입
        if (file.type.startsWith('video/')) {
          // 커스텀 Video Blot으로 비디오 삽입
          quillInstance.insertEmbed(currentRange.index, 'video', url);
          quillInstance.insertText(currentRange.index + 1, '\n');
          // 다음 삽입을 위해 커서 위치 업데이트
          currentRange.index += 2;
          console.log('비디오 삽입 완료:', url, 'type:', file.type);
        } else {
          // 이미지 태그로 삽입 (이미 WebP 변환 시 회전이 적용됨)
          quillInstance.insertEmbed(currentRange.index, 'image', url);
          quillInstance.insertText(currentRange.index + 1, '\n');
          
          // 다음 삽입을 위해 커서 위치 업데이트
          currentRange.index += 2;
          console.log('이미지 삽입 완료:', url);
        }

        // uploadMinus 콜백 호출 (업로드 성공 시에만)
        if (uploadMinus) {
          uploadMinus();
        }
        successCount++;
      }
      
      // 모든 업로드 완료 후 최종 커서 위치 설정 및 포커스
      quillInstance.setSelection(currentRange.index, 0);
      quillInstance.focus();
      
      // 삽입된 콘텐츠로 스크롤 이동
      scrollToInsertedContent(currentRange.index);
      console.log('최종 커서 위치 설정:', currentRange.index);
      
      // 모든 업로드 완료
      uploadProgress = 100;
      console.log(`모든 파일 업로드 완료: ${totalFiles}개`);
    } catch (error) {
      console.error('Image upload failed:', error);
      Swal.fire({
        icon: 'error',
        title: '업로드 실패',
        text: '이미지 업로드에 실패했습니다.',
        confirmButtonText: '확인'
      });
      // 실패 시: 성공한 파일은 이미 uploadMinus가 호출되었으므로
      // 실패한 파일(호출된 uploadPlus - 성공한 파일 수)만큼 uploadMinus 호출
      const failedCount = uploadPlusCount - successCount;
      if (uploadMinus && failedCount > 0) {
        for (let i = 0; i < failedCount; i++) {
          uploadMinus();
        }
      }
    } finally {
      loadingImage = false;
      isSingleImageUpload = false;
      // 진행률 초기화
      setTimeout(() => {
        uploadProgress = 0;
        totalFiles = 0;
        currentFile = 0;
      }, 1000);
    }
  }

  /**
   * 이미지 핸들러 (파일 선택 창 열기)
   */
  async function imageHandler() {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*,video/*');
    input.setAttribute('multiple', 'true'); // 여러 파일 선택 가능
    input.click();

    input.onchange = async () => {
      const files = input.files ? Array.from(input.files) : [];
      if (!files.length) return;
      
      await uploadAndInsertFiles(files);
    };
  }

  /**
   * OG 카드 생성
   * @param {string} url
   * @returns {Promise<void>}
   */
  async function createOGCard(url) {
    try {
      loadingImage = true;
      
      const response = await fetch('/api/og', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        console.error('OG 데이터 가져오기 실패 - 링크로 삽입');
        const range = quillInstance.getSelection(true) || { index: quillInstance.getLength() - 1, length: 0 };
        quillInstance.insertText(range.index, url, 'link', url);
        quillInstance.insertText(range.index + url.length, '\n');
        quillInstance.setSelection(range.index + url.length + 1);
        quillInstance.focus();
        return;
      }

      const ogData = await response.json();
      console.log('✅ OG 데이터:', ogData);

      const range = quillInstance.getSelection(true) || { index: quillInstance.getLength() - 1, length: 0 };
      quillInstance.insertEmbed(range.index, 'ogcard', ogData);
      quillInstance.insertText(range.index + 1, '\n');
      quillInstance.setSelection(range.index + 2);
      quillInstance.focus();
      
      // 삽입된 콘텐츠로 스크롤 이동
      scrollToInsertedContent(range.index + 2);
      
      console.log('✅ OG 카드 삽입 완료');
    } catch (err) {
      console.error('OG 카드 생성 실패 - 링크로 삽입:', err);
      const range = quillInstance.getSelection(true) || { index: quillInstance.getLength() - 1, length: 0 };
      quillInstance.insertText(range.index, url, 'link', url);
      quillInstance.insertText(range.index + url.length, '\n');
      quillInstance.setSelection(range.index + url.length + 1);
      quillInstance.focus();
      
      // 삽입된 콘텐츠로 스크롤 이동
      scrollToInsertedContent(range.index + url.length + 1);
    } finally {
      loadingImage = false;
    }
  }

  /**
   * 미디어 자동 임베드 (URL 붙여넣기 시)
   * @param {string} url
   * @returns {void}
   */
  function autoEmbedMedia(url) {
    console.log('🚀 autoEmbedMedia 호출:', url);
    const range = quillInstance.getSelection(true) || { index: quillInstance.getLength() };
    console.log('📍 커서 위치:', range);
    processMediaEmbed(url, range);
  }

  /**
   * 비디오 임베드 핸들러
   * @returns {void}
   */
  function videoHandler() {
    const url = prompt('YouTube, Instagram, TikTok 또는 비디오 URL을 입력하세요:');
    if (!url) return;

    const range = quillInstance.getSelection(true) || { index: quillInstance.getLength() - 1, length: 0 };
    processMediaEmbed(url, range);
  }

  /**
   * 미디어 임베드 처리 (공통 로직)
   * @param {string} url
   * @param {any} range
   * @returns {void}
   */
  function processMediaEmbed(url, range) {
    console.log('🎯 processMediaEmbed 시작:', url);
    let embedHtml = '';

    // YouTube (일반 및 Shorts 및 Embed)
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      console.log('🎥 YouTube URL 감지');
      let videoId;
      if (url.includes('youtube.com/shorts/')) {
        const match = url.match(/youtube\.com\/shorts\/([\w-]+)/);
        videoId = match ? match[1] : null;
        console.log('📱 Shorts videoId:', videoId);
        if (videoId) {
          embedHtml = `<div style="max-width: 360px"><div style="position: relative;width:100%;padding-bottom:220%;"><iframe src="https://www.youtube.com/embed/${videoId}" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe></div></div>`;
        }
      } else if (url.includes('youtube.com/embed/')) {
        const match = url.match(/youtube\.com\/embed\/([\w-]+)/);
        videoId = match ? match[1] : null;
        console.log('🔗 Embed videoId:', videoId);
        if (videoId) {
          embedHtml = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        }
      } else if (url.includes('youtube.com/watch')) {
        const match = url.match(/[?&]v=([^&]+)/);
        videoId = match ? match[1] : null;
        console.log('▶️ Watch videoId:', videoId);
        if (videoId) {
          embedHtml = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
          console.log('✅ embedHtml 생성됨:', embedHtml.substring(0, 100) + '...');
        }
      } else if (url.includes('youtu.be/')) {
        const match = url.match(/youtu\.be\/([\w-]+)/);
        videoId = match ? match[1] : null;
        console.log('📎 Short URL videoId:', videoId);
        if (videoId) {
          embedHtml = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        }
      }
      console.log('📦 최종 embedHtml:', embedHtml ? 'OK' : 'EMPTY');
    }
    // Instagram - 원래 임베드 방식으로 복원
    else if (url.includes('instagram.com')) {
      console.log('📸 Instagram URL 감지 - 임베드로 처리:', url);
      
      // URL에서 쿼리 파라미터 제거하고 정규화
      const cleanUrl = url.split('?')[0];
      console.log('📸 정리된 URL:', cleanUrl);
      
      if (cleanUrl.includes('/reel/')) {
        const match = cleanUrl.match(/\/reel\/([\w-]+)/);
        const id = match ? match[1] : null;
        console.log('📸 Instagram Reel ID:', id);
        if (id) {
          embedHtml = `<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/reel/${id}/" style="max-width:540px; min-width:326px;"></blockquote>`;
          console.log('📸 Instagram Reel embedHtml 생성됨:', embedHtml);
        } else {
          console.log('❌ Instagram Reel ID 추출 실패');
        }
      } else if (cleanUrl.includes('/p/')) {
        const match = cleanUrl.match(/\/p\/([\w-]+)/);
        const id = match ? match[1] : null;
        console.log('📸 Instagram Post ID:', id);
        if (id) {
          embedHtml = `<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/${id}/" style="max-width:540px; min-width:326px;"></blockquote>`;
          console.log('📸 Instagram Post embedHtml 생성됨:', embedHtml);
        } else {
          console.log('❌ Instagram Post ID 추출 실패');
        }
      } else {
        console.log('❌ Instagram URL 패턴 일치 안함 - /reel/ 또는 /p/ 필요. URL:', cleanUrl);
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
    // 실제 비디오 파일 URL (.mp4, .webm 등)
    else if (url.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) {
      quillInstance.insertEmbed(range.index, 'video', url);
      quillInstance.setSelection(range.index + 1);
      quillInstance.focus();
      
      // 삽입된 콘텐츠로 스크롤 이동
      scrollToInsertedContent(range.index + 1);
      return;
    }
    // 인식 불가능한 URL - 그냥 링크로 삽입
    else {
      console.warn('⚠️ 알 수 없는 URL 형식, 링크로 삽입:', url);
      const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      quillInstance.clipboard.dangerouslyPasteHTML(range.index, linkHtml);
      quillInstance.setSelection(range.index + 1);
      quillInstance.focus();
      
      // 삽입된 콘텐츠로 스크롤 이동
      scrollToInsertedContent(range.index + 1);
      return;
    }

    if (embedHtml) {
      console.log('📝 HTML 삽입 전 Quill 내용:', quillInstance.root.innerHTML.substring(0, 100));
      
      // Instagram 임베드는 OG 카드로 변환
      if (embedHtml.includes('instagram-media')) {
        console.log('📸 Instagram 임베드를 OG 카드로 변환');
        
        // URL에서 ID 추출
        const cleanUrl = url.split('?')[0];
        const isReel = cleanUrl.includes('/reel/');
        const idMatch = cleanUrl.match(isReel ? /\/reel\/([\w-]+)/ : /\/p\/([\w-]+)/);
        const instaId = idMatch ? idMatch[1] : '';
        
        // OG 카드 Blot 사용
        quillInstance.insertEmbed(range.index, 'ogcard', {
          url: cleanUrl,
          title: `Instagram ${isReel ? 'Reel' : 'Post'}`,
          description: `View this post on Instagram`,
          image: 'https://www.instagram.com/static/images/ico/favicon-192.png',
          siteName: 'Instagram'
        });
        
        quillInstance.insertText(range.index + 1, '\n');
        quillInstance.setSelection(range.index + 2);
        quillInstance.focus();
        
        scrollToInsertedContent(range.index + 2);
        console.log('✅ Instagram OG 카드 삽입 완료');
        return; // 여기서 종료하여 아래 코드 실행 방지
      }
      
      quillInstance.clipboard.dangerouslyPasteHTML(range.index, embedHtml);
      
      console.log('📝 HTML 삽입 후 Quill 내용:', quillInstance.root.innerHTML.substring(0, 200));
      
      quillInstance.setSelection(range.index + 1);
      quillInstance.focus();
      
      // 삽입된 콘텐츠로 스크롤 이동
      scrollToInsertedContent(range.index + 1);
      console.log('✅ 미디어 임베드 완료:', url);
      
    }
  }

  /**
   * Quill 에디터 설정
   * @returns {object}
   */
  const modules = {
    toolbar: {
      container: [
        ['image', 'video', 'link'], // 이미지, 비디오, 링크를 맨 앞으로
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ size: ['small', false, 'large', 'huge'] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ align: [] }]
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
        }],
        // iframe 태그 허용
        ['iframe', (node, delta) => {
          return delta;
        }],
        // blockquote 허용 (Instagram, TikTok)
        ['blockquote', (node, delta) => {
          return delta;
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
      // Quill 동적 import (지연 로드)
      console.log('Quill import 시작...');
      const [QuillModule, QuillCSS] = await Promise.all([
        import('quill'),
        import('quill/dist/quill.snow.css')
      ]);
      
      Quill = QuillModule.default;
      Delta = QuillModule.Delta;
      console.log('✅ Quill imported');

      // Video Blot 등록 (video 태그 직접 사용)
      const BlockEmbed = Quill.import('blots/block/embed');
      
      // @ts-ignore - Quill Blot 확장을 위해 onMount 내부에서 선언 필요
      // svelte-ignore perf_avoid_nested_class
      class VideoBlot extends BlockEmbed {
        static create(value) {
          const node = super.create();
          node.setAttribute('src', value);
          node.setAttribute('controls', '');
          node.setAttribute('style', 'max-width: 100%; height: auto; display: block; margin: 1em 0;');
          return node;
        }

        static value(node) {
          return node.getAttribute('src');
        }
      }
      VideoBlot.blotName = 'video';
      VideoBlot.tagName = 'video';
      Quill.register(VideoBlot);
      console.log('✅ Video Blot 등록됨 (video 태그)');

      // IFrame Blot 등록 (YouTube, Instagram 등)
      // @ts-ignore - Quill Blot 확장을 위해 onMount 내부에서 선언 필요
      // svelte-ignore perf_avoid_nested_class
      class IFrameBlot extends BlockEmbed {
        static create(value) {
          const node = super.create();
          node.setAttribute('src', value.src || value);
          node.setAttribute('frameborder', '0');
          node.setAttribute('allowfullscreen', true);
          node.setAttribute('style', 'max-width: 100%; height: 315px;');
          if (value.width) node.setAttribute('width', value.width);
          if (value.height) node.setAttribute('height', value.height);
          return node;
        }

        static value(node) {
          return {
            src: node.getAttribute('src'),
            width: node.getAttribute('width'),
            height: node.getAttribute('height')
          };
        }
      }
      IFrameBlot.blotName = 'iframe';
      IFrameBlot.tagName = 'iframe';
      Quill.register(IFrameBlot);
      console.log('✅ IFrame Blot 등록됨');

      // OG Card Blot 등록
      // @ts-ignore - Quill Blot 확장을 위해 onMount 내부에서 선언 필요
      // svelte-ignore perf_avoid_nested_class
      class OGBlot extends BlockEmbed {
        static create(value) {
          console.log('value', value);
          const node = super.create();
          node.setAttribute('class', 'og-card-blot border rounded my-2 shadow text-decoration-none');
          node.style.cssText = 'display: block; margin: 8px 0; max-width: 500px; width: 100%;';
          node.setAttribute('contenteditable', 'false');
          node.setAttribute('data-url', value.url);
          
          // a 태그로 감싸기
          const link = document.createElement('a');
          link.href = value.url;
          link.target = 'dgst_out_link';
          link.rel = 'noopener noreferrer';
          link.style.cssText = 'text-decoration: none; color: inherit; display: block; border: 1px solid var(--bs-border-color); border-radius: 8px; margin: 8px 0; max-width: 100%; background: transparent; cursor: pointer; overflow: hidden; padding: 0;';
          
          link.onclick = (e) => {
            console.log('OG 카드 링크 클릭:', value.url);
            // 기본 링크 동작을 허용하므로 preventDefault 제거
          };
          
          if (value.image) {
            const img = document.createElement('img');
            img.src = value.image;
            img.style.cssText = 'width: 100%; height: 200px; object-fit: cover; display: block; margin: 0; border: 0;';
            link.appendChild(img);
          }
          
          const title = document.createElement('div');
          title.style.cssText = 'font-weight: 700; font-size: 14px; line-height: 1.25; margin: 12px 16px 2px; color: var(--bs-body-color);';
          // HTML 엔티티 디코딩
          const decode = (str) => {
            try {
              const txt = document.createElement('textarea');
              txt.innerHTML = String(str ?? '');
              return txt.value;
            } catch (_) { return String(str ?? ''); }
          };
          title.textContent = decode(value.title || value.url);
          link.appendChild(title);
          
          if (value.description) {
            const desc = document.createElement('div');
            desc.style.cssText = 'color: var(--bs-secondary-color); font-size: 12px; line-height: 1.35; margin: 0 16px 2px; opacity: 0.9;';
            const dtext = decode(value.description || '');
            desc.textContent = dtext.substring(0, 120) + (dtext.length > 120 ? '...' : '');
            link.appendChild(desc);
          }
          
          const site = document.createElement('div');
          site.style.cssText = 'color: var(--bs-secondary-color); font-size: 12px; display: flex; align-items: center; font-weight: 600; margin: 0 16px 4px;';
          
          // favicon 추가
          const favicon = document.createElement('img');
 
          if(value.url.includes('dgst.me')) {
            favicon.src = 'https://www.dgst.me/favicon/favicon-16x16.png';
          } else {
            favicon.src = `https://www.google.com/s2/favicons?domain=${new URL(value.url).hostname}&sz=16`;
          }

          favicon.style.cssText = 'width: 16px; height: 16px; margin-right: 4px;';
          favicon.alt = 'favicon';
          favicon.onerror = () => {
            // favicon 로드 실패 시 기본 아이콘 표시
            favicon.style.display = 'none';
            site.innerHTML = `🔗 ${value.siteName || new URL(value.url).hostname}`;
          };
          
          site.appendChild(favicon);
          site.appendChild(document.createTextNode(value.siteName || new URL(value.url).hostname));
          link.appendChild(site);

          const url = document.createElement('div');
          url.style.cssText = 'color: var(--bs-primary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0 16px 10px;';
          url.textContent = `${value.url}`;
          link.appendChild(url);
          
          node.appendChild(link);
          return node;
        }

        static value(node) {
          return node.getAttribute('data-og-url');
        }
      }
      OGBlot.blotName = 'ogcard';
      OGBlot.tagName = 'div';
      Quill.register(OGBlot);
      console.log('✅ OG Card Blot 등록됨');

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
      } else {
        editorData = '';
      }

      // 입력 합성(iOS/한글 IME) 중에는 바인딩 지연
      quillInstance.root.addEventListener('compositionstart', () => {
        isComposing = true;
      });
      quillInstance.root.addEventListener('compositionend', () => {
        isComposing = false;
        // 합성 종료 후 한 번만 동기화 (iOS는 일정 스택이 밀린 뒤 반영)
        if (IS_IOS) {
          Promise.resolve().then(() => editorData = quillInstance.root.innerHTML);
        } else {
          editorData = quillInstance.root.innerHTML;
        }
      });

      // 데이터 변경 감지 및 양방향 바인딩
      quillInstance.on('text-change', (_delta, _old, source) => {
        if (isComposing) return;
        if (IS_IOS) {
          Promise.resolve().then(() => editorData = quillInstance.root.innerHTML);
        } else {
          editorData = quillInstance.root.innerHTML;
        }
      });

      // URL 붙여넣기 감지 및 자동 임베드
      console.log('🔗 붙여넣기 이벤트 리스너 등록 중...');
      quillInstance.root.addEventListener('paste', async (e) => {
        console.log('📋 붙여넣기 이벤트 발생!');
        const clipboardData = e.clipboardData || window.clipboardData;
        
        // 클립보드에서 이미지 파일 확인
        if (clipboardData.items && clipboardData.items.length > 0) {
          const items = Array.from(clipboardData.items);
          const imageItem = items.find(item => item.type.startsWith('image/'));
          
          if (imageItem) {
            e.preventDefault();
            console.log('🖼️ 이미지 붙여넣기 감지:', imageItem.type);
            
            const file = imageItem.getAsFile();
            if (file) {
              // uploadAndInsertFiles를 직접 호출하여 파일 선택 창 없이 업로드
              await uploadAndInsertFiles([file]);
              return; // 이미지 처리 후 종료
            }
          }
        }
        
        // 이미지가 없으면 텍스트 URL 처리
        const pastedText = clipboardData.getData('text');
        
        console.log('📋 붙여넣기 감지:', pastedText);
        
        // URL 패턴 감지
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        const urls = pastedText.match(urlPattern);
        
        console.log('🔍 URL 추출:', urls);
        
        if (urls && urls.length === 1) {
          const url = urls[0].trim();
          console.log('✅ 단일 URL:', url);
          
          // 미디어 플랫폼 URL인지 확인
          if (url.includes('youtube.com') || url.includes('youtu.be') || 
              url.includes('instagram.com') || url.includes('tiktok.com') || 
              url.includes('tv.naver.com')) {
            
            e.preventDefault();
            console.log('🎬 미디어 URL 감지, 자동 임베드:', url);
            
            setTimeout(() => {
              autoEmbedMedia(url);
            }, 100);
          }
          // 일반 URL - OG 카드 생성
          else {
            e.preventDefault();
            console.log('🔗 일반 URL 감지, OG 카드 생성:', url);
            await createOGCard(url);
          }
        } else {
          console.log('⚠️ 단일 URL 아님 또는 URL 없음');
        }
      });

      console.log('🎉 Quill Editor initialized successfully');
    } catch (error) {
      console.error('❌ Quill 초기화 실패:', error);
    }

    // FFmpeg 로드 (글쓰기 페이지에서만 로드)
    const isWritePage = window.location.pathname.includes('/write');
    if (isWritePage) {
      (async () => {
        try {
          console.log('FFmpeg 로드 시작 (글쓰기 페이지에서만)...');
          
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
    } else {
      console.log('📝 글쓰기 페이지가 아니므로 FFmpeg 로드 건너뜀');
    }

    // iOS 입력 관련 속성 최적화 (커서 끌림/중복 입력 방지에 도움)
    try {
      const rootEl = quillInstance?.root;
      if (rootEl) {
        rootEl.setAttribute('autocapitalize', 'off');
        rootEl.setAttribute('autocorrect', 'off');
        rootEl.setAttribute('autocomplete', 'off');
        rootEl.setAttribute('spellcheck', 'false');
        rootEl.style.webkitUserSelect = 'text';
      }
    } catch {}
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
  <script defer src="//www.tiktok.com/embed.js"></script>
</svelte:head>

<main>
  <div bind:this={editorDiv}>
    <Loader active={loadingImage && isSingleImageUpload && !isCompressing} container={editorDiv} component="Dot" opacity="0.7" />
    
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

    {#if loadingImage && !isCompressing}
      <div class="upload-overlay">
        <div class="progress-container bg-light">
          <h5 class="mb-3 text-dark">
            <span class="spinner-border spinner-border-sm me-2" role="status"></span>
            이미지 업로드 중...
          </h5>
          <div class="progress mb-3" style="height: 30px; background-color: #e9ecef;">
            <div 
              class="progress-bar progress-bar-striped progress-bar-animated" 
              role="progressbar" 
              style="width: {uploadProgress}%; background-color: #007bff;"
              aria-valuenow={uploadProgress} 
              aria-valuemin="0" 
              aria-valuemax="100">
              <strong style="color: white;">{uploadProgress}%</strong>
            </div>
          </div>
          <div class="text-muted">
            {currentFile}/{totalFiles}
            </div>
        </div>
      </div>
    {/if}
    
    <div bind:this={editorElement}></div>
  </div>
</main>

<style>
  .compression-overlay,
  .upload-overlay {
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
    height: 450px; /* 더 크게 조정 */
    max-height: 450px; /* 최대 높이 제한 */
    font-size: 1rem; /* Bootstrap 기본 폰트 크기 */
    overflow-y: auto; /* 세로 스크롤 활성화 */
    background-color: var(--bs-body-bg); /* Bootstrap 변수 기반 */
    border: 1px solid var(--bs-border-color); /* Bootstrap 변수 기반 */
    border-radius: 0 0 4px 4px;
  }

  main :global(.ql-editor) {
    min-height: 450px; /* 에디터 최소 높이를 더 크게 조정 */
    height: auto; /* 내용에 따라 자동 높이 조정 */
    padding: 12px 15px;
    color: var(--bs-body-color); /* Bootstrap 변수 기반 텍스트 색상 */
    background-color: var(--bs-body-bg); /* Bootstrap 변수 기반 배경 */
    font-size: 1rem; /* Bootstrap 기본 폰트 크기 */
    line-height: 1.5; /* Bootstrap 기본 줄간격 */
  }

  /* 에디터 placeholder 색상 변경 */
  main :global(.ql-editor.ql-blank::before) {
    color: var(--bs-secondary-color) !important; /* Bootstrap 변수 기반 */
    font-style: normal !important;
  }

  /* 모바일에서도 적당히 크게 */
  @media (max-width: 768px) {
    main :global(.ql-container) {
      height: 400px; /* 모바일에서도 적당히 크게 */
      max-height: 400px;
    }

    main :global(.ql-editor) {
      min-height: 400px; /* 모바일에서도 적당히 크게 */
    }
  }

  /* 모바일에서 화면 높이가 800px 이상일 때 더 크게 */
  @media (max-width: 768px) and (min-height: 800px) {
    main :global(.ql-container) {
      height: 600px; /* 큰 모바일 화면에서 더 크게 */
      max-height: 600px;
    }

    main :global(.ql-editor) {
      min-height: 600px; /* 큰 모바일 화면에서 더 크게 */
    }
  }

  main :global(.ql-toolbar) {
    background: var(--bs-secondary-bg); /* Bootstrap 변수 기반 */
    border: 1px solid var(--bs-border-color); /* Bootstrap 변수 기반 */
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    padding: 8px;
  }

  /* 다크/라이트에서 툴바 아이콘/텍스트 가독성 개선 */
  main :global(.ql-toolbar .ql-picker-label),
  main :global(.ql-toolbar .ql-picker-item) {
    color: var(--bs-body-color) !important;
  }

  main :global(.ql-toolbar .ql-picker-label:hover),
  main :global(.ql-toolbar .ql-picker-item:hover) {
    color: var(--bs-emphasis-color) !important;
  }

  /* Quill 기본 SVG 아이콘 stroke/fill 색상 동기화 */
  main :global(.ql-toolbar button .ql-stroke),
  main :global(.ql-toolbar .ql-picker .ql-stroke) {
    stroke: var(--bs-body-color) !important;
  }

  main :global(.ql-toolbar button .ql-fill),
  main :global(.ql-toolbar .ql-picker .ql-fill) {
    fill: var(--bs-body-color) !important;
  }

  /* 툴바 선택기 보더 대비 향상 */
  main :global(.ql-toolbar .ql-picker),
  main :global(.ql-toolbar .ql-picker-options) {
    border-color: var(--bs-border-color) !important;
    background-color: var(--bs-secondary-bg) !important;
  }

  /* OG 카드 링크 밑줄 제거 및 색상 상속 */
  main :global(.og-card-blot a) {
    text-decoration: none !important;
    color: inherit !important;
  }
  main :global(.og-card-blot a:hover),
  main :global(.og-card-blot a:focus) {
    text-decoration: none !important;
    color: inherit !important;
  }

  /* 밑줄 강제 제거 (링크 자식 포함, visited/active 상태 포함) */
  main :global(.og-card-blot a *),
  main :global(.og-card-blot a:link),
  main :global(.og-card-blot a:visited),
  main :global(.og-card-blot a:active) {
    text-decoration: none !important;
    color: inherit !important;
    border-bottom: 0 !important;
  }

  /* 에디터 전체 링크 밑줄 제거 (OG 카드 외 일반 링크 포함) */
  main :global(.ql-editor a),
  main :global(.ql-editor a *),
  main :global(.ql-editor a:link),
  main :global(.ql-editor a:visited),
  main :global(.ql-editor a:hover),
  main :global(.ql-editor a:active) {
    text-decoration: none !important;
    border-bottom: 0 !important;
    color: var(--bs-link-color, inherit) !important; /* 색상은 테마 변수 사용 */
  }

  /* 이미지 버튼 스타일링 */
  main :global(.ql-toolbar .ql-image) {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
    color: white !important;
    border-radius: 6px !important;
    margin-right: 8px !important;
    font-weight: bold !important;
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3) !important;
    transition: all 0.3s ease !important;
  }

  main :global(.ql-toolbar .ql-image:hover) {
    background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4) !important;
  }

  main :global(.ql-toolbar .ql-image:active) {
    transform: translateY(0) !important;
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3) !important;
  }

  /* 비디오 버튼도 비슷하게 스타일링 */
  main :global(.ql-toolbar .ql-video) {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%) !important;
    color: white !important;
    border-radius: 6px !important;
    margin-right: 8px !important;
    font-weight: bold !important;
    box-shadow: 0 2px 4px rgba(240, 147, 251, 0.3) !important;
    transition: all 0.3s ease !important;
  }

  main :global(.ql-toolbar .ql-video:hover) {
    background: linear-gradient(135deg, #ee82f7 0%, #f3455a 100%) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 8px rgba(240, 147, 251, 0.4) !important;
  }

  /* 링크 버튼도 스타일링 */
  main :global(.ql-toolbar .ql-link) {
    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%) !important;
    color: white !important;
    border-radius: 6px !important;
    margin-right: 8px !important;
    font-weight: bold !important;
    box-shadow: 0 2px 4px rgba(79, 172, 254, 0.3) !important;
    transition: all 0.3s ease !important;
  }

  main :global(.ql-toolbar .ql-link:hover) {
    background: linear-gradient(135deg, #3d8bfe 0%, #00e6fe 100%) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 8px rgba(79, 172, 254, 0.4) !important;
  }

  /* 에디터 스크롤바 스타일링 */
  main :global(.ql-container)::-webkit-scrollbar {
    width: 8px;
  }

  main :global(.ql-container)::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  main :global(.ql-container)::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
  }

  main :global(.ql-container)::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }
</style>

