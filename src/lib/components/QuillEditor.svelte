<script>
  /**
   * Quill Editor Svelte 5 통합 컴포넌트
   * @description Svelte 5용 Quill 에디터 (CKEditor 대체)
   */
  import { onMount, onDestroy } from 'svelte';
  import Loader from 'svelte-loading-overlay/Loader.svelte';
  import Swal from 'sweetalert2';
  import { blobToWebP } from 'webp-converter-browser';

  // Svelte 5 Runes - Props
  let { uploadPlus, uploadMinus, editorData = $bindable() } = $props();

  // 로컬 상태
  /** @type {HTMLDivElement | null} */
  let editorElement = null;
  /** @type {any} */
  let quillInstance = null;
  /** @type {boolean} */
  let loadingImage = $state(false);
  /** @type {HTMLDivElement | undefined} */
  let editorDiv;
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
  /** @type {boolean} */
  let ffmpegReady = false;
  
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
   * 이미지 EXIF Orientation 읽기 함수
   * @param {File|Blob} fileOrBlob
   * @returns {Promise<number>}
   */
  function getImageOrientation(fileOrBlob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        const view = new DataView(e.target.result);
        if (view.getUint16(0, false) !== 0xFFD8) {
          resolve(1); // JPEG가 아니면 기본값
          return;
        }
        
        const length = view.byteLength;
        let offset = 2;
        
        while (offset < length) {
          if (view.getUint16(offset, false) !== 0xFFE1) {
            offset += 2;
            continue;
          }
          
          const exifLength = view.getUint16(offset + 2, false);
          offset += 4;
          
          if (view.getUint32(offset, false) !== 0x45786966) {
            offset += exifLength - 4;
            continue;
          }
          
          offset += 6;
          const tiffOffset = offset;
          const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
          
          if (view.getUint16(tiffOffset + 2, littleEndian) !== 0x002A) {
            resolve(1);
            return;
          }
          
          const firstIFDOffset = view.getUint32(tiffOffset + 4, littleEndian);
          const ifdOffset = tiffOffset + firstIFDOffset;
          const numEntries = view.getUint16(ifdOffset, littleEndian);
          
          for (let i = 0; i < numEntries; i++) {
            const entryOffset = ifdOffset + 2 + (i * 12);
            const tag = view.getUint16(entryOffset, littleEndian);
            
            if (tag === 0x0112) { // Orientation tag
              const orientation = view.getUint16(entryOffset + 8, littleEndian);
              resolve(orientation);
              return;
            }
          }
          
          resolve(1);
          return;
        }
        
        resolve(1);
      };
      reader.readAsArrayBuffer(fileOrBlob);
    });
  }

  /**
   * EXIF Orientation을 적용한 WebP 변환 함수
   * @param {File|Blob} file
   * @param {Object} options
   * @returns {Promise<Blob>}
   */
  async function convertToWebPWithOrientation(file, options = {}) {
    const orientation = await getImageOrientation(file);
    console.log('EXIF Orientation:', orientation);
    
    // 1단계: 먼저 WebP로 변환
    const webpBlob = await blobToWebP(file, options);
    console.log('WebP 변환 완료, 크기:', webpBlob.size);

    // Orientation이 1이면 그대로 반환 (회전 불필요)
    if (orientation === 1) {
      console.log('Orientation 1 - 회전 불필요');
      return webpBlob;
    }
    
    console.log('EXIF Orientation 적용을 위한 Canvas 회전, Orientation:', orientation);
    
    // 2단계: Canvas를 사용한 회전
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 원본 이미지 크기
        const originalWidth = img.width;
        const originalHeight = img.height;
        console.log('원본 이미지 크기:', originalWidth, 'x', originalHeight);
        
        // 이미지 비율 계산
        const aspectRatio = originalWidth / originalHeight;
        const isPortrait = originalHeight > originalWidth;
        const isLandscape = originalWidth > originalHeight;
        const isSquare = Math.abs(aspectRatio - 1) < 0.1;
        
        console.log('이미지 비율 정보:', {
          aspectRatio: aspectRatio.toFixed(2),
          isPortrait,
          isLandscape,
          isSquare
        });
        
        // Orientation과 이미지 비율을 고려한 회전 결정
        let shouldRotate = false;
        let rotationAngle = 0;
        let needsFlip = false;
        
        // Orientation이 1이 아니고 null이 아니고 landscape 비율일 때만 회전
        if (orientation !== 1 && orientation !== null && isLandscape) {
          shouldRotate = true;
          
          switch (orientation) {
            case 2: // 좌우 반전
              needsFlip = true;
              break;
            case 3: // 180도 회전
              rotationAngle = 180;
              break;
            case 4: // 상하 반전
              rotationAngle = 180;
              needsFlip = true;
              break;
            case 5: // 90도 회전 + 좌우 반전
              rotationAngle = 90;
              needsFlip = true;
              break;
            case 6: // 90도 회전
              rotationAngle = 90;
              console.log('Landscape 이미지 90도 회전 적용');
              break;
            case 7: // 270도 회전 + 좌우 반전
              rotationAngle = 270;
              needsFlip = true;
              break;
            case 8: // 270도 회전
              rotationAngle = 270;
              console.log('Landscape 이미지 270도 회전 적용');
              break;
          }
        } else if (orientation !== 1 && orientation !== null && isPortrait) {
          console.log('Portrait 이미지는 회전하지 않음');
        } else if (orientation !== 1 && orientation !== null && isSquare) {
          console.log('Square 이미지는 회전하지 않음');
        } else if (orientation === null) {
          console.log('Orientation이 null - 회전하지 않음');
        }
        
        if (!shouldRotate) {
          console.log('회전 불필요 - 원본 WebP 반환');
          resolve(webpBlob);
          return;
        }
        
        // Orientation에 따른 캔버스 크기 설정
        let canvasWidth, canvasHeight;
        
        if (rotationAngle === 90 || rotationAngle === 270) {
          // 90도 또는 270도 회전 시 가로세로 바뀜
          canvasWidth = originalHeight;
          canvasHeight = originalWidth;
        } else {
          // 180도 회전 시 크기 유지
          canvasWidth = originalWidth;
          canvasHeight = originalHeight;
        }
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        console.log('Canvas 크기 설정:', canvasWidth, 'x', canvasHeight);
        
        // Canvas 변환 적용
        if (rotationAngle === 90) {
          ctx.translate(canvasWidth, 0);
          ctx.rotate(Math.PI / 2);
          if (needsFlip) {
            ctx.scale(-1, 1);
          }
        } else if (rotationAngle === 180) {
          ctx.translate(canvasWidth, canvasHeight);
          ctx.rotate(Math.PI);
          if (needsFlip) {
            ctx.scale(-1, 1);
          }
        } else if (rotationAngle === 270) {
          ctx.translate(0, canvasHeight);
          ctx.rotate(-Math.PI / 2);
          if (needsFlip) {
            ctx.scale(-1, 1);
          }
        }
        
        // 이미지 그리기
        ctx.drawImage(img, 0, 0, originalWidth, originalHeight);
        
        console.log('Canvas 회전 적용 완료:', {
          orientation,
          rotationAngle,
          needsFlip,
          finalSize: `${canvasWidth}x${canvasHeight}`
        });
        
        // Canvas를 WebP Blob으로 변환
        canvas.toBlob((blob) => {
          if (blob) {
            console.log('회전된 WebP 생성 완료:', orientation, '크기:', blob.size);
            resolve(blob);
          } else {
            reject(new Error('Canvas to WebP 변환 실패'));
          }
        }, 'image/webp', options.quality || 0.9);
      };
      
      img.onerror = () => {
        reject(new Error('이미지 로드 실패'));
      };
      
      img.src = URL.createObjectURL(webpBlob);
    });
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
  async function imageHandler() {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*,video/*');
    input.setAttribute('multiple', 'true'); // 여러 파일 선택 가능
    input.click();

    input.onchange = async () => {
      const files = input.files ? Array.from(input.files) : [];
      if (!files.length) return;

      // 단일 이미지 업로드 여부 결정
      isSingleImageUpload = files.length === 1 && files[0].type.startsWith('image/');

      // 이미지가 포함된 경우 업로드 오버레이 표시
      loadingImage = files.some(f => f.type.startsWith('image/'));
      totalFiles = files.length;
      currentFile = 0;
      uploadProgress = 0;

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
          }

          // 이미지 파일이면 EXIF Orientation 적용해서 WebP 변환
          if (file.type.startsWith('image/') && !file.type.endsWith('gif') && !file.type.endsWith('webp')) {
            console.log('이미지 파일 감지, EXIF Orientation 적용하여 WebP 변환...');
            try {
              const webpBlob = await convertToWebPWithOrientation(file, { width: 1400 });
              // 원본 파일명에서 확장자 제거 후 .webp로 교체
              const dotIdx = file.name.lastIndexOf('.');
              const base = dotIdx > -1 ? file.name.substring(0, dotIdx) : file.name;
              const newName = `${base}.webp`;
              file = new File([webpBlob], newName, { type: 'image/webp' });
              console.log('WebP 파일명으로 변환:', newName, 'size:', webpBlob.size);
            } catch (e) {
              console.warn('WebP 변환 실패, 원본으로 업로드합니다:', e);
              
              // 서버에 로그 전송
              try {
                await fetch('/api/log', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    level: 'warn',
                    message: 'Client WebP conversion failed',
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type,
                    error: e.message,
                    stack: e.stack
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

          // uploadMinus 콜백 호출
          if (uploadMinus) {
            uploadMinus();
          }
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
          embedHtml = `<div style="max-width: 460px"><div style="position: relative;width:100%;padding-bottom:177.777%;"><iframe src="https://www.youtube.com/embed/${videoId}" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe></div></div>`;
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
      class OGBlot extends BlockEmbed {
        static create(value) {
          console.log('value', value);
          const node = super.create();
          node.setAttribute('class', 'og-card-blot border rounded p-3 my-2 bg-light shadow text-decoration-none');
          node.style.cssText = 'display: block; max-width: 350px; margin: 8px 0;';
          node.setAttribute('contenteditable', 'false');
          node.setAttribute('data-url', value.url);
          
          // a 태그로 감싸기
          const link = document.createElement('a');
          link.href = value.url;
          link.target = 'dgst_out_link';
          link.rel = 'noopener noreferrer';
          link.style.cssText = 'text-decoration: none; color: inherit; display: block; border: 1px solid #e0e0e0; border-radius: 8px; padding: 10px; margin: 8px 0; max-width: 350px; background: #fafafa; cursor: pointer;';
          
          link.onclick = (e) => {
            console.log('OG 카드 링크 클릭:', value.url);
            // 기본 링크 동작을 허용하므로 preventDefault 제거
          };
          
          if (value.image) {
            const img = document.createElement('img');
            img.src = value.image;
            img.style.cssText = 'width: 100%; max-height: 80px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;';
            link.appendChild(img);
          }
          
          const title = document.createElement('div');
          title.style.cssText = 'font-weight: bold; font-size: 14px; margin-bottom: 4px; color: #1a73e8;';
          title.textContent = value.title || value.url;
          link.appendChild(title);
          
          if (value.description) {
            const desc = document.createElement('div');
            desc.style.cssText = 'color: #5f6368; font-size: 12px; line-height: 1.3; margin-bottom: 4px;';
            desc.textContent = value.description.substring(0, 80) + (value.description.length > 80 ? '...' : '');
            link.appendChild(desc);
          }
          
          const site = document.createElement('div');
          site.style.cssText = 'color: #70757a; font-size: 12px; display: flex; align-items: center; font-weight: bold;';
          
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
          url.style.cssText = 'color: #70757a; font-size: 10px; word-break: break-all;';
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

      // 데이터 변경 감지 및 양방향 바인딩
      quillInstance.on('text-change', () => {
        editorData = quillInstance.root.innerHTML;
      });

      // URL 붙여넣기 감지 및 자동 임베드
      console.log('🔗 붙여넣기 이벤트 리스너 등록 중...');
      quillInstance.root.addEventListener('paste', async (e) => {
        console.log('📋 붙여넣기 이벤트 발생!');
        const clipboardData = e.clipboardData || window.clipboardData;
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
  <script defer src="//www.instagram.com/embed.js"></script>
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
    font-size: 16px;
    overflow-y: auto; /* 세로 스크롤 활성화 */
    border: 1px solid #ccc;
    border-radius: 0 0 4px 4px;
  }

  main :global(.ql-editor) {
    min-height: 450px; /* 에디터 최소 높이를 더 크게 조정 */
    height: auto; /* 내용에 따라 자동 높이 조정 */
    padding: 12px 15px;
  }

  /* 에디터 placeholder 색상 변경 */
  main :global(.ql-editor.ql-blank::before) {
    color: #6c757d !important; /* 회색으로 변경 */
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
    background: #f8f9fa;
    border: 1px solid #ccc;
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    padding: 8px;
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

