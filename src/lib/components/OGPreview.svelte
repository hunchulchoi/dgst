<script>
  import { onMount } from 'svelte';
  
  let { url } = $props();
  let ogData = $state(null);
  let loading = $state(true);
  let error = $state(false);

  onMount(async () => {
    try {
      const response = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
      if (response.ok) {
        ogData = await response.json();
        if (!ogData.title || !ogData.description) {
          error = true;
        }
      } else {
        error = true;
      }
    } catch (err) {
      console.error('OG 데이터 로드 실패:', err);
      error = true;
    } finally {
      loading = false;
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
  <a href={url} target="_blank" class="text-decoration-none">
    <div class="og-preview border rounded p-3 my-2" style="max-width: 500px;">
      <div class="d-flex align-items-center">
        <div class="me-3">
          <i class="bi bi-link-45deg text-primary" style="font-size: 24px;"></i>
        </div>
        <div class="flex-grow-1">
          <div class="fw-bold text-primary">{url}</div>
          <small class="text-muted">{new URL(url).hostname}</small>
        </div>
        <div class="ms-2">
          <i class="bi bi-arrow-up-right-square text-muted"></i>
        </div>
      </div>
    </div>
  </a>
{:else}
  <!-- OG 미리보기 표시 -->
  <a href={url} target="_blank" class="text-decoration-none">
    <div class="og-preview border rounded p-3 my-2" style="max-width: 500px;">
      <div class="d-flex">
        {#if ogData.image}
          <img 
            src={ogData.image} 
            class="me-3" 
            style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px;" 
            alt="미리보기 이미지"
            loading="lazy"
          />
        {:else}
          <div class="me-3 d-flex align-items-center justify-content-center bg-light rounded" style="width: 80px; height: 80px;">
            <i class="bi bi-link-45deg text-muted" style="font-size: 24px;"></i>
          </div>
        {/if}
        <div class="flex-grow-1">
          <h6 class="mb-1 text-dark" style="font-size: 14px; font-weight: 600; line-height: 1.3;">
            {ogData.title}
          </h6>
          <p class="mb-1 text-muted" style="font-size: 12px; line-height: 1.4;">
            {ogData.description}
          </p>
          <small class="text-muted" style="font-size: 11px;">
            {new URL(url).hostname}
          </small>
        </div>
        <div class="ms-2 d-flex align-items-center">
          <i class="bi bi-arrow-up-right-square text-muted"></i>
        </div>
      </div>
    </div>
  </a>
{/if}

<style>
  .og-preview:hover {
    background-color: var(--bs-gray-50);
    transition: background-color 0.2s ease;
  }
  
  .og-preview a {
    color: inherit;
  }
  
  .og-preview a:hover {
    color: inherit;
  }
</style>
