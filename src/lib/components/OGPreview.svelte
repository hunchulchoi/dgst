<script>
  import { onMount } from 'svelte';
  import sanitizeHtml from 'sanitize-html';

  /** @typedef {{ title: string; description: string; image?: string; favicon?: string; siteName?: string }} OgData */

  let { url } = $props();
  let ogData = $state(/** @type {OgData | null} */ (null));
  let loading = $state(true);
  let error = $state(false);

  onMount(async () => {
    console.log('🔍 OGPreview 시작:', url);
    try {
      const response = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
      console.log('📡 API 응답 상태:', response.status);
      if (response.ok) {
        const nextOgData = /** @type {OgData} */ (await response.json());
        ogData = nextOgData;
        console.log('📊 OG 데이터:', nextOgData);
        if (!nextOgData.title || !nextOgData.description) {
          console.error('❌ OG 데이터 부족:', {
            title: nextOgData.title,
            description: nextOgData.description
          });
          error = true;
        }
      } else {
        console.error('❌ API 응답 실패:', response.status);
        error = true;
      }
    } catch (err) {
      console.error('❌ OG 데이터 로드 실패:', err);
      error = true;
    } finally {
      loading = false;
      console.log('✅ OGPreview 로딩 완료');
    }
  });
</script>

{#if loading}
  <div class="og-preview border rounded p-3 my-2" style="max-width: 500px;">
    <div class="d-flex align-items-center">
      <div class="spinner-border spinner-border-sm me-3" role="status">
        <span class="visually-hidden">로딩중...</span>
      </div>
      <span class="text-muted">미리보기 로딩중...</span>
    </div>
  </div>
{:else if error || !ogData}
  <!-- OG 데이터가 없으면 일반 링크로 표시 -->
  <a href={url} target="dgst_out_link" rel="noopener noreferrer" class="text-decoration-none">
    <div class="og-preview border rounded p-3 my-2" style="max-width: 500px; cursor: pointer;">
      <div class="d-flex align-items-center">
        <div class="me-3">
          <i class="bi bi-link-45deg text-primary" style="font-size: 24px;"></i>
        </div>
        <div class="flex-grow-1">
          <div class="fw-bold text-primary text-break">{url}</div>
          <small class="text-muted" style="font-size: 11px;">{new URL(url).hostname}</small>
        </div>
      </div>
    </div>
  </a>
{:else}
  <!-- OG 미리보기 표시 -->

  <div
    class="og-preview border rounded my-2 shadow overflow-hidden"
    style="max-width: 500px; cursor: pointer; padding: 0; line-height: normal;"
  >
    <a href={url} target="dgst_out_link" rel="noopener noreferrer" class="text-decoration-none">
      {#if ogData.image}
        <img src={ogData.image} class="og-cover" alt="미리보기 이미지" loading="lazy" />
      {/if}
      <div class="og-body p-3">
        <h6
          class="mb-1"
          style="font-size: 14px; font-weight: 700; line-height: 1.25; color: var(--bs-body-color); margin-bottom: 4px;"
        >
          {@html sanitizeHtml(ogData.title, { allowedTags: [], allowedAttributes: {} })}
        </h6>
        <p
          class="mb-2"
          style="font-size: 12px; line-height: 1.35; color: var(--bs-secondary-color); opacity: 0.9; margin-bottom: 6px;"
        >
          {@html sanitizeHtml(ogData.description, { allowedTags: [], allowedAttributes: {} })}
        </p>
        <div class="d-flex align-items-center mb-1">
          {#if ogData.favicon}
            <img
              src={ogData.favicon}
              alt="favicon"
              class="me-1"
              style="width: 16px; height: 16px; border-radius: 2px;"
            />
          {/if}
          <small style="color: var(--bs-secondary-color); font-weight: 600;"
            >{ogData.siteName}</small
          >
        </div>
        <small class="og-url text-primary">{url}</small>
      </div>
    </a>
  </div>
{/if}

<style>
  .og-preview:hover {
    background-color: var(--bs-gray-50);
    transition: background-color 0.2s ease;
  }

  .og-preview a {
    color: inherit;
    text-decoration: none;
    display: block;
    pointer-events: auto;
    cursor: pointer;
  }

  .og-preview a:hover {
    color: inherit;
    text-decoration: none;
  }

  .og-cover {
    width: 100%;
    height: 200px;
    object-fit: cover;
    display: block;
    margin: 0 !important;
    border: 0 !important;
  }

  .og-url {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
</style>
