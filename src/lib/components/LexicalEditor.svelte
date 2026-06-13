<script>
  import { onDestroy, onMount } from 'svelte';
  import {
    $createParagraphNode as createParagraphNode,
    $getRoot as getRoot,
    $getSelection as getSelection,
    $insertNodes as insertNodes,
    $isRangeSelection as isRangeSelection,
    COMMAND_PRIORITY_LOW,
    DecoratorNode,
    FORMAT_TEXT_COMMAND,
    createEditor
  } from 'lexical';
  import {
    $generateHtmlFromNodes as generateHtmlFromNodes,
    $generateNodesFromDOM as generateNodesFromDOM
  } from '@lexical/html';
  import {
    $createHeadingNode as createHeadingNode,
    $createQuoteNode as createQuoteNode,
    HeadingNode,
    QuoteNode,
    registerRichText
  } from '@lexical/rich-text';
  import {
    INSERT_ORDERED_LIST_COMMAND,
    INSERT_UNORDERED_LIST_COMMAND,
    ListItemNode,
    ListNode,
    registerList
  } from '@lexical/list';
  import { $toggleLink as toggleLink, LinkNode } from '@lexical/link';
  import { $setBlocksType as setBlocksType } from '@lexical/selection';
  import { mergeRegister } from '@lexical/utils';
  import { swalFire } from '$lib/util/swal.js';

  let {
    uploadPlus,
    uploadMinus,
    editorData = $bindable(),
    onTitleUpdate,
    onLoadingChange,
    insertUrlFromTitle = $bindable(/** @type {string | null} */ (null))
  } = $props();

  /** @type {HTMLDivElement | null} */
  let editorElement = null;
  /** @type {HTMLInputElement | null} */
  let fileInput = null;
  /** @type {import('lexical').LexicalEditor | null} */
  let editor = null;
  /** @type {string} */
  let lastSyncedEditorData = '';
  /** @type {any} */
  let ffmpeg = null;
  /** @type {typeof import('@ffmpeg/util').fetchFile | null} */
  let fetchFile = null;
  /** @type {Promise<void> | null} */
  let ffmpegLoadPromise = null;
  /** @type {any} */
  let heic2any = null;
  /** @type {(() => void) | null} */
  let unregister = null;
  let loading = $state(false);
  let isComposing = false;

  /** @extends {DecoratorNode<null>} */
  class HtmlBlockNode extends DecoratorNode {
    /** @param {string} html @param {string=} key */
    constructor(html, key) {
      super(key);
      this.__html = html;
    }

    static getType() {
      return 'html-block';
    }

    /** @param {HtmlBlockNode} node */
    static clone(node) {
      return new HtmlBlockNode(node.__html, node.__key);
    }

    static importDOM() {
      return {
        div: () => ({
          conversion: (/** @type {HTMLElement} */ element) => {
            if (element.getAttribute('data-lexical-html-block') !== 'true') return null;
            return { node: new HtmlBlockNode(element.innerHTML) };
          },
          priority: /** @type {2} */ (2)
        })
      };
    }

    /** @param {import('lexical').SerializedLexicalNode & { html?: string }} serializedNode */
    static importJSON(serializedNode) {
      return new HtmlBlockNode(serializedNode.html || '');
    }

    exportJSON() {
      return {
        type: 'html-block',
        version: 1,
        html: this.__html
      };
    }

    createDOM() {
      const dom = document.createElement('div');
      dom.setAttribute('data-lexical-html-block', 'true');
      dom.setAttribute('contenteditable', 'false');
      dom.style.maxWidth = '100%';
      dom.innerHTML = this.__html;
      return dom;
    }

    /** @param {HtmlBlockNode} previousNode @param {HTMLElement} dom */
    updateDOM(previousNode, dom) {
      if (previousNode.__html !== this.__html) {
        dom.innerHTML = this.__html;
      }
      return false;
    }

    exportDOM() {
      const element = document.createElement('div');
      element.setAttribute('data-lexical-html-block', 'true');
      element.innerHTML = this.__html;
      return { element };
    }

    decorate() {
      return null;
    }
  }

  /** @param {string} value */
  function escapeHtml(value) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  /** @param {string} url */
  function safeHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  /** @param {string} str */
  function decodeHtmlEntities(str) {
    try {
      const txt = document.createElement('textarea');
      txt.innerHTML = String(str ?? '');
      return txt.value;
    } catch {
      return String(str ?? '');
    }
  }

  /** @param {string} url */
  function isMediaUrl(url) {
    return (
      url.includes('youtube.com') ||
      url.includes('youtu.be') ||
      url.includes('instagram.com') ||
      url.includes('tiktok.com') ||
      url.includes('tv.naver.com') ||
      /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)
    );
  }

  /** @param {string} url */
  function getYouTubeEmbed(url) {
    let videoId = null;
    let width = '560';
    let height = '315';

    if (url.includes('youtube.com/shorts/') || url.includes('/shorts/')) {
      videoId = url.match(/\/shorts\/([\w-]+)/)?.[1] || null;
      width = '315';
      height = '560';
    } else if (url.includes('youtube.com/embed/')) {
      videoId = url.match(/youtube\.com\/embed\/([\w-]+)/)?.[1] || null;
    } else if (url.includes('youtube.com/watch')) {
      videoId = url.match(/[?&]v=([^&]+)/)?.[1] || null;
    } else if (url.includes('youtu.be/')) {
      videoId = url.match(/youtu\.be\/([\w-]+)/)?.[1] || null;
    }

    return videoId
      ? { src: `https://www.youtube.com/embed/${videoId}`, width, height }
      : null;
  }

  function syncEditorData() {
    const currentEditor = editor;
    if (!currentEditor) return;
    currentEditor.getEditorState().read(() => {
      lastSyncedEditorData = generateHtmlFromNodes(currentEditor);
      editorData = lastSyncedEditorData;
    });
  }

  /** @param {string} value */
  function setEditorHtml(value) {
    const currentEditor = editor;
    if (!currentEditor) return;
    if ((value || '') === lastSyncedEditorData) return;

    currentEditor.update(() => {
      const root = getRoot();
      root.clear();
      if (value) {
        const parser = new DOMParser();
        const dom = parser.parseFromString(value, 'text/html');
        const nodes = generateNodesFromDOM(currentEditor, dom);
        root.append(...nodes);
      }
      if (root.getChildrenSize() === 0) {
        root.append(createParagraphNode());
      }
      lastSyncedEditorData = value || '';
    });
  }

  /** @param {string} html */
  function createHtmlBlockNode(html) {
    return new HtmlBlockNode(html);
  }

  /** @param {string} html */
  function insertHtmlBlock(html) {
    if (!editor) return;
    editor.update(() => {
      insertNodes([createHtmlBlockNode(html), createParagraphNode()]);
    });
  }

  async function ensureFfmpegLoaded() {
    if (ffmpeg && fetchFile) return;

    if (!ffmpegLoadPromise) {
      ffmpegLoadPromise = (async () => {
        const [{ FFmpeg }, ffmpegUtil] = await Promise.all([
          import('@ffmpeg/ffmpeg'),
          import('@ffmpeg/util')
        ]);
        fetchFile = ffmpegUtil.fetchFile;
        ffmpeg = new FFmpeg();
        await ffmpeg.load();
      })().finally(() => {
        ffmpegLoadPromise = null;
      });
    }

    await ffmpegLoadPromise;
  }

  /**
   * @param {File} file
   * @param {{width?: number, quality?: number}} options
   * @returns {Promise<File | Blob>}
   */
  async function convertToWebP(file, options = {}) {
    const fileSizeMB = file.size / (1024 * 1024);
    const lowerType = (file.type || '').toLowerCase();
    const lowerName = (file.name || '').toLowerCase();

    if (
      fileSizeMB <= 1 ||
      lowerType === 'image/gif' ||
      lowerType.includes('image/heic') ||
      lowerType.includes('image/heif') ||
      lowerName.endsWith('.heic') ||
      lowerName.endsWith('.heif')
    ) {
      return file;
    }

    const imageCompression = (await import('browser-image-compression')).default;
    return imageCompression(file, {
      maxSizeMB: 10,
      maxWidthOrHeight: options.width || 1400,
      useWebWorker: true,
      fileType: 'image/webp',
      initialQuality: options.quality || 0.85
    });
  }

  /** @param {File} file */
  async function convertHeicToJpeg(file) {
    const lowerType = (file.type || '').toLowerCase();
    const lowerName = (file.name || '').toLowerCase();
    const isHeic =
      lowerType.includes('image/heic') ||
      lowerType.includes('image/heif') ||
      lowerName.endsWith('.heic') ||
      lowerName.endsWith('.heif');

    if (!isHeic) return file;

    if (!heic2any) {
      heic2any = (await import('heic2any')).default;
    }

    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
    const jpgBlob = Array.isArray(converted) ? converted[0] : converted;
    const baseName = file.name.replace(/\.(heic|heif)$/i, '') || 'image';
    return new File([jpgBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
  }

  /** @param {File} file */
  async function compressVideo(file) {
    try {
      await Promise.race([
        ensureFfmpegLoaded(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('FFmpeg load timeout')), 60000))
      ]);

      if (!ffmpeg || !fetchFile) return file;

      await ffmpeg.writeFile('input.mp4', await fetchFile(file));
      await ffmpeg.exec([
        '-i',
        'input.mp4',
        '-vf',
        "scale='min(640,iw)':'min(640,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
        '-c:v',
        'libx264',
        '-crf',
        '28',
        '-preset',
        'medium',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-pix_fmt',
        'yuv420p',
        'output.mp4'
      ]);

      const data = await ffmpeg.readFile('output.mp4');
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
      const blob = new Blob([/** @type {BlobPart} */ (bytes)], { type: 'video/mp4' });
      return new File([blob], file.name.replace(/\.[^.]+$/, '.mp4'), { type: 'video/mp4' });
    } catch (error) {
      console.warn('Lexical video compression failed; uploading original file:', error);
      return file;
    }
  }

  /** @param {File} file */
  async function prepareUploadFile(file) {
    if (file.type.startsWith('image/')) {
      let prepared = await convertHeicToJpeg(file);
      if (prepared.type !== 'image/webp') {
        const webp = await convertToWebP(prepared, { width: 1400, quality: 0.85 });
        if (webp !== prepared) {
          const base = prepared.name.replace(/\.[^.]+$/, '') || 'image';
          prepared = new File([webp], `${base}.webp`, { type: 'image/webp' });
        }
      }
      return prepared;
    }

    if (file.type.startsWith('video/')) {
      return compressVideo(file);
    }

    return file;
  }

  /** @param {File[]} files */
  async function uploadAndInsertFiles(files) {
    if (!editor || files.length === 0) return;
    loading = true;

    try {
      for (const file of files) {
        uploadPlus?.();
        try {
          const preparedFile = await prepareUploadFile(file);
          const formData = new FormData();
          formData.append('upload', preparedFile);

          const response = await fetch('/board/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include'
          });

          if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
          }

          const data = await response.json();
          const url = data.url;
          if (typeof url !== 'string') {
            throw new Error('Upload response has no url');
          }

          if (preparedFile.type.startsWith('video/')) {
            insertHtmlBlock(
              `<video src="${escapeHtml(url)}" controls style="max-width: 100%; height: auto; display: block; margin: 1em 0;"></video>`
            );
          } else {
            insertHtmlBlock(
              `<img src="${escapeHtml(url)}" alt="" style="max-width: 100%; height: auto; display: block; margin: 1em 0;">`
            );
          }
        } finally {
          uploadMinus?.();
        }
      }
      syncEditorData();
    } catch (error) {
      console.error('Lexical upload failed:', error);
      await swalFire({
        icon: 'error',
        title: '업로드 실패',
        text: '파일 업로드에 실패했습니다.',
        confirmButtonText: '확인'
      });
    } finally {
      loading = false;
    }
  }

  function openFilePicker() {
    fileInput?.click();
  }

  /** @param {Event} event */
  async function handleFileChange(event) {
    const target = /** @type {HTMLInputElement} */ (event.currentTarget);
    const files = target.files ? Array.from(target.files) : [];
    target.value = '';
    await uploadAndInsertFiles(files);
  }

  async function addLink() {
    if (!editor) return;
    const url = prompt('URL을 입력하세요:', 'https://');
    if (url === null) return;
    editor.update(() => {
      toggleLink(url || null);
    });
    syncEditorData();
  }

  /** @param {string} url */
  function createInstagramCard(url) {
    const cleanUrl = url.split('?')[0];
    const isReel = cleanUrl.includes('/reel/');
    insertHtmlBlock(`
      <div class="og-card-blot border rounded my-2 shadow text-decoration-none" data-url="${escapeHtml(cleanUrl)}" contenteditable="false" style="display: block; margin: 8px 0; max-width: 500px; width: 100%;">
        <a href="${escapeHtml(cleanUrl)}" target="dgst_out_link" rel="noopener noreferrer" style="text-decoration: none; color: inherit; display: block; border: 1px solid var(--bs-border-color); border-radius: 8px; margin: 8px 0; max-width: 100%; background: transparent; cursor: pointer; overflow: hidden; padding: 0;">
          <div aria-label="Instagram preview" style="height: 140px; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%); color: white; font-size: 18px; font-weight: 800; letter-spacing: 0.02em;">Instagram</div>
          <div data-og-title style="font-weight: 700; font-size: 14px; line-height: 1.25; margin: 12px 16px 2px; color: var(--bs-body-color);">Instagram ${isReel ? 'Reel' : 'Post'}</div>
          <div data-og-description style="color: var(--bs-secondary-color); font-size: 12px; line-height: 1.35; margin: 0 16px 2px; opacity: 0.9;">View this post on Instagram</div>
          <div data-og-site style="color: var(--bs-secondary-color); font-size: 12px; display: flex; align-items: center; font-weight: 600; margin: 0 16px 4px;">Instagram</div>
          <div style="color: var(--bs-primary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0 16px 10px;">${escapeHtml(cleanUrl)}</div>
        </a>
      </div>
    `);
  }

  /** @param {string} url */
  async function createOGCard(url) {
    if (!editor) return;
    loading = true;
    onLoadingChange?.(true);

    try {
      const response = await fetch('/api/og', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) throw new Error(`OG request failed: ${response.status}`);

      const ogData = await response.json();
      if (ogData.title) onTitleUpdate?.(decodeHtmlEntities(ogData.title));
      const siteName = ogData.siteName || safeHostname(url);
      const image = ogData.image
        ? `<img src="${escapeHtml(ogData.image)}" alt="" style="width: 100%; height: 200px; object-fit: cover; display: block; margin: 0; border: 0;">`
        : '';

      insertHtmlBlock(`
        <div class="og-card-blot border rounded my-2 shadow text-decoration-none" data-url="${escapeHtml(url)}" contenteditable="false" style="display: block; margin: 8px 0; max-width: 500px; width: 100%;">
          <a href="${escapeHtml(url)}" target="dgst_out_link" rel="noopener noreferrer" style="text-decoration: none; color: inherit; display: block; border: 1px solid var(--bs-border-color); border-radius: 8px; margin: 8px 0; max-width: 100%; background: transparent; cursor: pointer; overflow: hidden; padding: 0;">
            ${image}
            <div data-og-title style="font-weight: 700; font-size: 14px; line-height: 1.25; margin: 12px 16px 2px; color: var(--bs-body-color);">${escapeHtml(ogData.title || url)}</div>
            <div data-og-description style="color: var(--bs-secondary-color); font-size: 12px; line-height: 1.35; margin: 0 16px 2px; opacity: 0.9;">${escapeHtml(ogData.description || '')}</div>
            <div data-og-site style="color: var(--bs-secondary-color); font-size: 12px; display: flex; align-items: center; font-weight: 600; margin: 0 16px 4px;">${escapeHtml(siteName)}</div>
            <div style="color: var(--bs-primary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0 16px 10px;">${escapeHtml(url)}</div>
          </a>
        </div>
      `);
    } catch (error) {
      console.error('Lexical OG card failed:', error);
      insertHtmlBlock(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`);
    } finally {
      loading = false;
      onLoadingChange?.(false);
      syncEditorData();
    }
  }

  /** @param {string} url */
  async function insertMediaUrl(url) {
    if (!editor) return;

    if (
      (url.includes('youtube.com') || url.includes('youtu.be')) &&
      onTitleUpdate &&
      typeof onTitleUpdate === 'function'
    ) {
      try {
        onLoadingChange?.(true);
        const response = await fetch('/api/og', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (response.ok) {
          const ogData = await response.json();
          if (ogData.title) onTitleUpdate(decodeHtmlEntities(ogData.title));
        }
      } catch (error) {
        console.error('Lexical media title load failed:', error);
      } finally {
        onLoadingChange?.(false);
      }
    }

    const youtube = getYouTubeEmbed(url);
    if (youtube) {
      insertHtmlBlock(
        `<iframe src="${escapeHtml(youtube.src)}" width="${youtube.width}" height="${youtube.height}" frameborder="0" allowfullscreen="true" style="max-width: 100%; width: ${youtube.width}px; aspect-ratio: ${youtube.width} / ${youtube.height}; height: auto; display: block; margin: 0 auto; border: none; padding: 0;"></iframe>`
      );
    } else if (url.includes('instagram.com')) {
      createInstagramCard(url);
    } else if (url.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) {
      insertHtmlBlock(
        `<video src="${escapeHtml(url)}" controls style="max-width: 100%; height: auto; display: block; margin: 1em 0;"></video>`
      );
    } else if (url.includes('tiktok.com')) {
      const match = url.match(/tiktok\.com\/(.*)\/video\/([\w-]+)/);
      if (match) {
        insertHtmlBlock(
          `<blockquote class="tiktok-embed" cite="https://www.tiktok.com/${escapeHtml(match[1])}/video/${escapeHtml(match[2])}" data-video-id="${escapeHtml(match[2])}" style="max-width: 605px; min-width: 0; width: 100%;"></blockquote>`
        );
      } else {
        await createOGCard(url);
        return;
      }
    } else if (url.includes('tv.naver.com')) {
      const id = url.match(/tv\.naver\.com\/v\/([\w-]+)/)?.[1] || null;
      if (id) {
        insertHtmlBlock(
          `<iframe src="https://tv.naver.com/embed/${escapeHtml(id)}" width="544" height="306" frameborder="0" allowfullscreen="true" style="max-width: 100%; width: 544px; aspect-ratio: 544 / 306; height: auto; display: block; margin: 0 auto; border: none; padding: 0;"></iframe>`
        );
      } else {
        await createOGCard(url);
        return;
      }
    } else {
      await createOGCard(url);
      return;
    }

    syncEditorData();
  }

  /** @param {ClipboardEvent} event */
  async function handlePaste(event) {
    if (!editor) return;

    const files = Array.from(event.clipboardData?.files || []);
    if (files.length > 0) {
      event.preventDefault();
      await uploadAndInsertFiles(files);
      return;
    }

    const text = event.clipboardData?.getData('text')?.trim();
    if (!text) return;

    const isMarkdown =
      /^(#|##|###|- |\* |\d+\. |> |`|\[.*\]\(.*\)|_{1,2}\w+_{1,2}|\*{1,2}\w+\*{1,2})/m.test(
        text
      );

    if (isMarkdown && text.includes('\n')) {
      event.preventDefault();
      const { marked } = await import('marked');
      const html = await marked.parse(text);
      insertHtmlBlock(html);
      syncEditorData();
      return;
    }

    if (!/^https?:\/\/\S+$/i.test(text)) return;

    event.preventDefault();
    if (isMediaUrl(text)) {
      await insertMediaUrl(text);
    } else {
      await createOGCard(text);
    }
  }

  /** @param {'h1' | 'h2'} level */
  function toggleHeading(level) {
    editor?.update(() => {
      const selection = getSelection();
      if (isRangeSelection(selection)) {
        setBlocksType(selection, () => createHeadingNode(level));
      }
    });
  }

  function toggleQuote() {
    editor?.update(() => {
      const selection = getSelection();
      if (isRangeSelection(selection)) {
        setBlocksType(selection, () => createQuoteNode());
      }
    });
  }

  onMount(() => {
    if (!editorElement) return;

    editor = createEditor({
      namespace: 'dgst-lexical-editor',
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, HtmlBlockNode],
      onError(error) {
        console.error('Lexical editor error:', error);
      },
      theme: {
        paragraph: 'lexical-paragraph',
        text: {
          bold: 'lexical-text-bold',
          italic: 'lexical-text-italic',
          strikethrough: 'lexical-text-strike'
        }
      }
    });

    editor.setRootElement(editorElement);

    unregister = mergeRegister(
      registerRichText(editor),
      registerList(editor),
      editor.registerUpdateListener(() => {
        if (isComposing) return;
        syncEditorData();
      }),
      editor.registerCommand(
        FORMAT_TEXT_COMMAND,
        () => {
          setTimeout(syncEditorData, 0);
          return false;
        },
        COMMAND_PRIORITY_LOW
      )
    );

    editorElement.addEventListener('paste', handlePaste);
    editorElement.addEventListener('compositionstart', () => {
      isComposing = true;
    });
    editorElement.addEventListener('compositionend', () => {
      isComposing = false;
      setTimeout(syncEditorData, 0);
    });

    setEditorHtml(editorData || '');
    syncEditorData();
  });

  onDestroy(() => {
    unregister?.();
    unregister = null;
    if (editorElement) {
      editorElement.removeEventListener('paste', handlePaste);
    }
    editor?.setRootElement(null);
    editor = null;
  });

  export function focusEditor() {
    editor?.focus();
  }

  $effect(() => {
    if (!editor) return;
    if ((editorData || '') === lastSyncedEditorData) return;
    setEditorHtml(editorData || '');
  });

  $effect(() => {
    if (!insertUrlFromTitle || !editor) return;
    const url = insertUrlFromTitle;
    insertUrlFromTitle = null;
    void insertMediaUrl(url);
  });
</script>

<svelte:head>
  <script defer src="//www.tiktok.com/embed.js"></script>
</svelte:head>

<main class="lexical-editor">
  <input
    bind:this={fileInput}
    class="d-none"
    type="file"
    accept="image/*,video/*"
    multiple
    onchange={handleFileChange}
  />

  <div class="lexical-toolbar" aria-label="에디터 툴바">
    <button type="button" onclick={() => editor?.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}>B</button>
    <button type="button" onclick={() => editor?.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}>I</button>
    <button type="button" onclick={() => editor?.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}>S</button>
    <button type="button" onclick={addLink}>Link</button>
    <button type="button" onclick={() => toggleHeading('h1')}>H1</button>
    <button type="button" onclick={() => toggleHeading('h2')}>H2</button>
    <button type="button" onclick={() => editor?.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}>• List</button>
    <button type="button" onclick={() => editor?.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}>1. List</button>
    <button type="button" onclick={toggleQuote}>Quote</button>
    <button type="button" onclick={openFilePicker}>Image/Video</button>
  </div>

  <div class="lexical-editor__box" class:loading>
    {#if loading}
      <div class="lexical-editor__loading">처리 중...</div>
    {/if}
    <div
      bind:this={editorElement}
      class="lexical-editor__content"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      autocapitalize="off"
      spellcheck="false"
    ></div>
  </div>
</main>

<style>
  .lexical-editor {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .lexical-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    padding: 0.5rem;
    border: 1px solid var(--bs-border-color);
    border-bottom: 0;
    border-radius: 4px 4px 0 0;
    background: var(--bs-secondary-bg);
  }

  .lexical-toolbar button {
    border: 1px solid var(--bs-border-color);
    border-radius: var(--dgst-radius-sm);
    background: var(--bs-body-bg);
    color: var(--bs-body-color);
    padding: 0.25rem 0.5rem;
    font-size: 0.95rem;
  }

  .lexical-editor__box {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 450px;
    max-height: 450px;
    overflow-y: auto;
    overflow-x: hidden;
    border: 1px solid var(--bs-border-color);
    border-radius: 0 0 4px 4px;
    background: var(--bs-body-bg);
  }

  .lexical-editor__box.loading {
    pointer-events: none;
  }

  .lexical-editor__content {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 450px;
    padding: 12px 15px;
    color: var(--bs-body-color);
    background: var(--bs-body-bg);
    font-size: 16px;
    line-height: 1.5;
    outline: none;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .lexical-editor__content :global(img),
  .lexical-editor__content :global(video),
  .lexical-editor__content :global(iframe) {
    max-width: 100%;
  }

  .lexical-editor__loading {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-weight: 700;
  }

  :global(.lexical-text-bold) {
    font-weight: 700;
  }

  :global(.lexical-text-italic) {
    font-style: italic;
  }

  :global(.lexical-text-strike) {
    text-decoration: line-through;
  }

  @media (max-width: 768px) {
    .lexical-editor__box {
      min-height: 400px;
      max-height: 400px;
    }

    .lexical-editor__content {
      min-height: 400px;
    }
  }

  @media (max-width: 768px) and (min-height: 800px) {
    .lexical-editor__box {
      min-height: 600px;
      max-height: 600px;
    }

    .lexical-editor__content {
      min-height: 600px;
    }
  }
</style>
