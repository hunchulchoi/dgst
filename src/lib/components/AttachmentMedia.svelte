<script>
  import { isVideoAttachment } from '$lib/util/attachmentMedia.js';
  import { applyAttachmentImageSizing } from '$lib/util/attachmentImageSizing.js';

  let {
    src,
    video = false,
    alt = '',
    ariaLabel = '첨부 동영상',
    imageStyle = 'max-width: 100%;',
    videoStyle = 'max-width: 100%; height: auto;',
    onimageload
  } = $props();

  /** @param {Event} event */
  function handleVideoMetadata(event) {
    const element = /** @type {HTMLVideoElement | null} */ (event.currentTarget);
    if (!element?.videoWidth || !element.videoHeight) return;
    applyAttachmentImageSizing(element.style, {
      naturalWidth: element.videoWidth,
      naturalHeight: element.videoHeight
    });
  }
</script>

{#if video || isVideoAttachment(src)}
  <video
    {src}
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
