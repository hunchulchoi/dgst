<script>
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  // Svelte 5 Runes - Props
  let { uploadPlus, uploadMinus, editorData = $bindable('') } = $props();

  /** @type {any} */
  let editor = null;
  /** @type {HTMLDivElement | null} */
  let editorRoot = null;

  // 동적 로드 (SSR 안전)
  onMount(async () => {
    if (!browser) return;
    const [{ Editor }] = await Promise.all([
      import('@toast-ui/editor'),
      // 스타일은 CDN으로 head에 주입 (아래 head 섹션 참고)
      Promise.resolve()
    ]);

    editor = new Editor({
      el: editorRoot,
      height: '500px',
      initialEditType: 'wysiwyg',
      previewStyle: 'vertical',
      usageStatistics: false,
      initialValue: editorData || ''
    });

    // 값 변경 → 양방향 바인딩
    editor.on('change', () => {
      editorData = editor.getHTML();
    });

    // 이미지 업로드 훅
    editor.addHook('addImageBlobHook', async (blob, callback) => {
      try {
        if (uploadPlus) uploadPlus();

        const form = new FormData();
        form.append('upload', blob);

        const res = await fetch('/board/upload', {
          method: 'POST',
          body: form,
          credentials: 'include'
        });

        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json();
        const url = data.url;

        // 에디터에 이미지 삽입
        callback(url, blob.name || 'image');
      } catch (e) {
        console.error('[ToastEditor] 이미지 업로드 실패', e);
      } finally {
        if (uploadMinus) uploadMinus();
      }
    });
  });

  onDestroy(() => {
    editor = null;
  });
</script>

<svelte:head>
  <!-- Toast UI Editor CSS (CDN) -->
  <link rel="stylesheet" href="https://uicdn.toast.com/editor/latest/toastui-editor.min.css" />
</svelte:head>

<div bind:this={editorRoot} />

<style>
  :global(.toastui-editor-defaultUI) {
    border: 1px solid #dee2e6;
    border-radius: 4px;
  }
</style>


