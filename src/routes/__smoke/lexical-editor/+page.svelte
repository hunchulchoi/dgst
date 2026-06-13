<script>
  import { onMount } from 'svelte';
  import LexicalEditor from '$lib/components/LexicalEditor.svelte';

  let editorData = $state('');
  let insertUrlFromTitle = $state(null);
  let loading = $state(false);
  let uploads = $state(0);
  let lastTitle = $state('');

  /** @param {string} title */
  function handleTitleUpdate(title) {
    lastTitle = title;
  }

  /** @param {boolean} value */
  function handleLoadingChange(value) {
    loading = value;
  }

  onMount(() => {
    const initialHtml = new URLSearchParams(window.location.search).get('initialHtml');
    if (initialHtml) {
      editorData = initialHtml;
    }
  });
</script>

<main class="container py-3">
  <h1>Lexical editor smoke</h1>
  <LexicalEditor
    bind:editorData
    bind:insertUrlFromTitle
    uploadPlus={() => uploads++}
    uploadMinus={() => uploads--}
    onTitleUpdate={handleTitleUpdate}
    onLoadingChange={handleLoadingChange}
    disableVideoCompression={true}
  />
  <output data-testid="editor-html">{editorData}</output>
  <output data-testid="editor-loading">{String(loading)}</output>
  <output data-testid="editor-uploads">{String(uploads)}</output>
  <output data-testid="editor-title">{lastTitle}</output>
</main>
