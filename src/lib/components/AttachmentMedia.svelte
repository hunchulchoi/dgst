<script>
  import { isVideoAttachment } from '$lib/util/attachmentMedia.js';

  let {
    src,
    video = false,
    alt = '',
    ariaLabel = '첨부 동영상',
    imageStyle = 'max-width: 100%;',
    videoStyle = 'max-width: 100%; height: auto;',
    onimageload
  } = $props();
</script>

{#if video || isVideoAttachment(src)}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    {src}
    controls
    playsinline
    preload="metadata"
    aria-label={ariaLabel}
    style={videoStyle}
  ></video>
{:else}
  <img {src} {alt} style={imageStyle} onload={onimageload} />
{/if}
