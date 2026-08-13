<script>
  import { isVideoAttachment } from '$lib/util/attachmentMedia.js';
  import {
    applyAttachmentImageSizing,
    applyTallAttachmentSizing
  } from '$lib/util/attachmentImageSizing.js';

  /** @type {{
   *   src: string;
   *   video?: boolean;
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
{:else}
  <img {src} {alt} style={imageStyle} onload={onimageload} />
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
</style>
