<script>
  import {
    attachmentFileNameFromUrl,
    formatAttachmentFileSize,
    isPdfAttachment,
    isVideoAttachment,
    parseAttachmentFileName
  } from '$lib/util/attachmentMedia.js';
  import {
    applyAttachmentImageSizing,
    applyTallAttachmentSizing
  } from '$lib/util/attachmentImageSizing.js';

  /** @type {{
   *   src: string;
   *   video?: boolean;
   *   pdf?: boolean;
   *   fileName?: string;
   *   fileSize?: number;
   *   alt?: string;
   *   ariaLabel?: string;
   *   tallAttachmentSize?: boolean;
   *   imageStyle?: string;
   *   videoStyle?: string;
   *   onimageload?: (event: Event) => void;
   * }} */
  let {
    src,
    video = false,
    pdf = false,
    fileName = '',
    fileSize,
    alt = '',
    ariaLabel = '첨부 동영상',
    tallAttachmentSize = false,
    imageStyle = 'max-width: 100%;',
    videoStyle = 'max-width: 100%; height: auto;',
    onimageload
  } = $props();

  /** @param {unknown} value @returns {string} */
  function withVideoPreviewTime(value) {
    if (typeof value !== 'string') return '';
    if (!value || value.includes('#t=')) return value;
    return `${value.split('#', 1)[0]}#t=0.1`;
  }

  let videoSrc = $derived(withVideoPreviewTime(src));
  let displayFileName = $state('PDF 파일');
  let displayFileSize = $state(/** @type {number | undefined} */ (undefined));

  $effect(() => {
    const currentSrc = src;
    const currentFileName = fileName;
    const currentFileSize = fileSize;
    const currentIsPdf = pdf || isPdfAttachment(currentSrc);

    if (!currentIsPdf) return;

    displayFileName = currentFileName || attachmentFileNameFromUrl(currentSrc);
    displayFileSize = currentFileSize;

    if (currentSrc.startsWith('blob:') || (currentFileName && Number.isFinite(currentFileSize))) {
      return;
    }

    const controller = new AbortController();
    void fetch(currentSrc, { method: 'HEAD', signal: controller.signal })
      .then((response) => {
        if (!response.ok) return;
        displayFileName =
          parseAttachmentFileName(response.headers.get('content-disposition')) || displayFileName;
        const contentLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength >= 0) {
          displayFileSize = contentLength;
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('PDF 첨부 정보 조회 실패:', error);
      });

    return () => controller.abort();
  });

  /** @param {Event} event */
  function handleVideoMetadata(event) {
    const element = /** @type {HTMLVideoElement | null} */ (event.currentTarget);
    if (!element) return;

    if (element.currentTime < 0.01) {
      const previewTime =
        Number.isFinite(element.duration) && element.duration > 0
          ? Math.min(0.1, element.duration / 2)
          : 0.1;
      element.currentTime = previewTime;
    }

    if (element.videoWidth && element.videoHeight) {
      applyAttachmentImageSizing(element.style, {
        naturalWidth: element.videoWidth,
        naturalHeight: element.videoHeight
      });
    }

    if (tallAttachmentSize) {
      applyTallAttachmentSizing(element.style);
    }
  }

  /** @param {Event} event */
  function handleImageLoad(event) {
    if (typeof onimageload === 'function') {
      onimageload(event);
    }
  }
</script>

{#if video || isVideoAttachment(src)}
  <video
    src={videoSrc}
    class="attachment-video"
    class:attachment-video--tall-attachment={tallAttachmentSize}
    controls
    muted
    playsinline
    preload="metadata"
    aria-label={ariaLabel}
    style={videoStyle}
    onloadedmetadata={handleVideoMetadata}
  ></video>
{:else if pdf || isPdfAttachment(src)}
  <a
    class="attachment-pdf"
    href={src}
    download={displayFileName}
    aria-label={`${displayFileName} 다운로드`}
  >
    <span class="attachment-pdf__icon" aria-hidden="true">PDF</span>
    <span class="attachment-pdf__body">
      <strong class="attachment-pdf__name">{displayFileName}</strong>
      <span class="attachment-pdf__meta">
        PDF{#if displayFileSize !== undefined}
          · {formatAttachmentFileSize(displayFileSize)}{/if}
      </span>
    </span>
    <span class="attachment-pdf__action">PDF 다운로드</span>
  </a>
{:else}
  <img {src} {alt} style={imageStyle} onload={handleImageLoad} />
{/if}

<style>
  .attachment-video {
    display: block;
    max-width: 100%;
    border-radius: 0.75rem;
    background: #111;
  }

  .attachment-video--tall-attachment {
    object-fit: contain;
  }

  .attachment-pdf {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    max-width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid var(--bs-border-color);
    border-radius: 0.75rem;
    background: var(--bs-body-bg);
    font-weight: 600;
    text-decoration: none;
  }

  .attachment-pdf__icon {
    padding: 0.2rem 0.4rem;
    border-radius: 0.25rem;
    background: var(--bs-danger);
    color: white;
    font-size: 0.75rem;
  }

  .attachment-pdf__body {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }

  .attachment-pdf__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-pdf__meta,
  .attachment-pdf__action {
    color: var(--bs-secondary-color);
    font-size: 0.8125rem;
    font-weight: 400;
  }
</style>
