<script>
  import { onDestroy, onMount } from 'svelte';
  import { Editor, mergeAttributes, Node } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Image from '@tiptap/extension-image';
  import Link from '@tiptap/extension-link';
  import Placeholder from '@tiptap/extension-placeholder';
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
  /** @type {Editor | null} */
  let editor = $state(null);
  /** @type {HTMLInputElement | null} */
  let fileInput = null;
  /** @type {string} */
  let lastSyncedEditorData = '';
  let loading = $state(false);

  const Video = Node.create({
    name: 'video',
    group: 'block',
    atom: true,
    addAttributes() {
      return {
        src: { default: null }
      };
    },
    parseHTML() {
      return [{ tag: 'video[src]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'video',
        mergeAttributes(HTMLAttributes, {
          controls: '',
          style: 'max-width: 100%; height: auto; display: block; margin: 1em 0;'
        })
      ];
    }
  });

  const IFrame = Node.create({
    name: 'iframe',
    group: 'block',
    atom: true,
    addAttributes() {
      return {
        src: { default: null },
        width: { default: '560' },
        height: { default: '315' }
      };
    },
    parseHTML() {
      return [{ tag: 'iframe[src]' }];
    },
    renderHTML({ HTMLAttributes }) {
      const width = String(HTMLAttributes.width || '560').replace('px', '');
      const height = String(HTMLAttributes.height || '315').replace('px', '');
      return [
        'iframe',
        mergeAttributes(HTMLAttributes, {
          width,
          height,
          frameborder: '0',
          allowfullscreen: 'true',
          style: `max-width: 100%; width: ${width}px; aspect-ratio: ${width} / ${height}; height: auto; display: block; margin: 0 auto; border: none; padding: 0;`
        })
      ];
    }
  });

  const OGCard = Node.create({
    name: 'ogcard',
    group: 'block',
    atom: true,
    addAttributes() {
      return {
        url: { default: '' },
        image: { default: '' },
        title: { default: '' },
        description: { default: '' },
        siteName: { default: '' }
      };
    },
    parseHTML() {
      return [
        {
          tag: 'div.og-card-blot',
          getAttrs: (/** @type {HTMLElement} */ node) => {
            const link = node.querySelector('a');
            const image = node.querySelector('img');
            return {
              url: node.getAttribute('data-url') || link?.getAttribute('href') || '',
              image: image?.getAttribute('src') || '',
              title: node.querySelector('[data-og-title]')?.textContent || link?.textContent || '',
              description: node.querySelector('[data-og-description]')?.textContent || '',
              siteName: node.querySelector('[data-og-site]')?.textContent || ''
            };
          }
        }
      ];
    },
    renderHTML({ node, HTMLAttributes }) {
      const attrs = node.attrs;
      const url = attrs.url || HTMLAttributes.url || '';
      const siteName = attrs.siteName || safeHostname(url);
      return [
        'div',
        mergeAttributes(HTMLAttributes, {
          class: 'og-card-blot border rounded my-2 shadow text-decoration-none',
          contenteditable: 'false',
          'data-url': url,
          style: 'display: block; margin: 8px 0; max-width: 500px; width: 100%;'
        }),
        [
          'a',
          {
            href: url,
            target: 'dgst_out_link',
            rel: 'noopener noreferrer',
            style:
              'text-decoration: none; color: inherit; display: block; border: 1px solid var(--bs-border-color); border-radius: 8px; margin: 8px 0; max-width: 100%; background: transparent; cursor: pointer; overflow: hidden; padding: 0;'
          },
          ...(attrs.image
            ? [
                [
                  'img',
                  {
                    src: attrs.image,
                    alt: '',
                    style:
                      'width: 100%; height: 200px; object-fit: cover; display: block; margin: 0; border: 0;'
                  }
                ]
              ]
            : []),
          [
            'div',
            {
              'data-og-title': '',
              style:
                'font-weight: 700; font-size: 14px; line-height: 1.25; margin: 12px 16px 2px; color: var(--bs-body-color);'
            },
            attrs.title || url
          ],
          [
            'div',
            {
              'data-og-description': '',
              style:
                'color: var(--bs-secondary-color); font-size: 12px; line-height: 1.35; margin: 0 16px 2px; opacity: 0.9;'
            },
            attrs.description || ''
          ],
          [
            'div',
            {
              'data-og-site': '',
              style:
                'color: var(--bs-secondary-color); font-size: 12px; display: flex; align-items: center; font-weight: 600; margin: 0 16px 4px;'
            },
            siteName
          ],
          [
            'div',
            {
              style:
                'color: var(--bs-primary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0 16px 10px;'
            },
            url
          ]
        ]
      ];
    }
  });

  /** @param {string} url */
  function safeHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
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

  /** @param {string} value */
  function setEditorHtml(value) {
    if (!editor) return;
    if ((value || '') === lastSyncedEditorData) return;
    editor.commands.setContent(value || '', { emitUpdate: false });
    lastSyncedEditorData = editor.getHTML();
  }

  function syncEditorData() {
    if (!editor) return;
    lastSyncedEditorData = editor.getHTML();
    editorData = lastSyncedEditorData;
  }

  /** @param {File[]} files */
  async function uploadAndInsertFiles(files) {
    if (!editor || files.length === 0) return;
    loading = true;

    try {
      for (const file of files) {
        uploadPlus?.();
        const formData = new FormData();
        formData.append('upload', file);

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

        if (file.type.startsWith('video/')) {
          editor.chain().focus().insertContent({ type: 'video', attrs: { src: url } }).run();
        } else {
          editor.chain().focus().setImage({ src: url }).insertContent('<p></p>').run();
        }
        uploadMinus?.();
      }
      syncEditorData();
    } catch (error) {
      console.error('Tiptap upload failed:', error);
      uploadMinus?.();
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
    const previousUrl = editor.getAttributes('link').href;
    const url = prompt('URL을 입력하세요:', previousUrl || 'https://');
    if (url === null) return;

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      syncEditorData();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    syncEditorData();
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
      editor
        .chain()
        .focus()
        .insertContent({ type: 'ogcard', attrs: { ...ogData, url } })
        .insertContent('<p></p>')
        .run();
    } catch (error) {
      console.error('Tiptap OG card failed:', error);
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'paragraph',
          content: [{ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }]
        })
        .run();
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
        console.error('Tiptap media title load failed:', error);
      } finally {
        onLoadingChange?.(false);
      }
    }

    const youtube = getYouTubeEmbed(url);
    if (youtube) {
      editor.chain().focus().insertContent({ type: 'iframe', attrs: youtube }).insertContent('<p></p>').run();
    } else if (url.includes('instagram.com')) {
      const cleanUrl = url.split('?')[0];
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'ogcard',
          attrs: {
            url: cleanUrl,
            title: `Instagram ${cleanUrl.includes('/reel/') ? 'Reel' : 'Post'}`,
            description: 'View this post on Instagram',
            image: 'https://www.instagram.com/static/images/ico/favicon-192.png',
            siteName: 'Instagram'
          }
        })
        .insertContent('<p></p>')
        .run();
    } else if (url.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) {
      editor.chain().focus().insertContent({ type: 'video', attrs: { src: url } }).insertContent('<p></p>').run();
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
    if (!text || !/^https?:\/\/\S+$/i.test(text)) return;

    event.preventDefault();
    if (isMediaUrl(text)) {
      await insertMediaUrl(text);
    } else {
      await createOGCard(text);
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

  onMount(() => {
    if (!editorElement) return;

    editor = new Editor({
      element: editorElement,
      extensions: [
        StarterKit,
        Image.configure({ inline: false, allowBase64: false }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {
            target: '_blank',
            rel: 'noopener noreferrer'
          }
        }),
        Placeholder.configure({ placeholder: '내용을 입력하세요...' }),
        Video,
        IFrame,
        OGCard
      ],
      content: editorData || '',
      editorProps: {
        attributes: {
          class: 'tiptap-editor__content',
          autocapitalize: 'off',
          autocorrect: 'off',
          autocomplete: 'off',
          spellcheck: 'false'
        },
        handlePaste(view, event) {
          void handlePaste(event);
          return false;
        }
      },
      onUpdate: () => {
        syncEditorData();
      }
    });

    lastSyncedEditorData = editor.getHTML();
    editorData = lastSyncedEditorData;
  });

  onDestroy(() => {
    editor?.destroy();
    editor = null;
  });

  export function focusEditor() {
    editor?.commands.focus();
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

<main class="tiptap-editor">
  <input
    bind:this={fileInput}
    class="d-none"
    type="file"
    accept="image/*,video/*"
    multiple
    onchange={handleFileChange}
  />

  <div class="tiptap-toolbar" aria-label="에디터 툴바">
    <button type="button" class:active={editor?.isActive('bold')} onclick={() => editor?.chain().focus().toggleBold().run()}>B</button>
    <button type="button" class:active={editor?.isActive('italic')} onclick={() => editor?.chain().focus().toggleItalic().run()}>I</button>
    <button type="button" class:active={editor?.isActive('strike')} onclick={() => editor?.chain().focus().toggleStrike().run()}>S</button>
    <button type="button" onclick={addLink}>Link</button>
    <button type="button" onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
    <button type="button" onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
    <button type="button" onclick={() => editor?.chain().focus().toggleBulletList().run()}>• List</button>
    <button type="button" onclick={() => editor?.chain().focus().toggleOrderedList().run()}>1. List</button>
    <button type="button" onclick={() => editor?.chain().focus().toggleBlockquote().run()}>Quote</button>
    <button type="button" onclick={openFilePicker}>Image/Video</button>
  </div>

  <div class="tiptap-editor__box" class:loading>
    {#if loading}
      <div class="tiptap-editor__loading">처리 중...</div>
    {/if}
    <div bind:this={editorElement}></div>
  </div>
</main>

<style>
  .tiptap-editor {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .tiptap-toolbar {
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

  .tiptap-toolbar button {
    border: 1px solid var(--bs-border-color);
    border-radius: var(--dgst-radius-sm);
    background: var(--bs-body-bg);
    color: var(--bs-body-color);
    padding: 0.25rem 0.5rem;
    font-size: 0.95rem;
  }

  .tiptap-toolbar button.active {
    border-color: var(--bs-primary);
    color: var(--bs-primary);
  }

  .tiptap-editor__box {
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

  .tiptap-editor__box.loading {
    pointer-events: none;
  }

  :global(.tiptap-editor__content) {
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

  :global(.tiptap-editor__content p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    color: var(--bs-secondary-color);
    pointer-events: none;
  }

  :global(.tiptap-editor__content img),
  :global(.tiptap-editor__content video),
  :global(.tiptap-editor__content iframe) {
    max-width: 100%;
  }

  .tiptap-editor__loading {
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

  @media (max-width: 768px) {
    .tiptap-editor__box {
      min-height: 400px;
      max-height: 400px;
    }

    :global(.tiptap-editor__content) {
      min-height: 400px;
    }
  }

  @media (max-width: 768px) and (min-height: 800px) {
    .tiptap-editor__box {
      min-height: 600px;
      max-height: 600px;
    }

    :global(.tiptap-editor__content) {
      min-height: 600px;
    }
  }
</style>
