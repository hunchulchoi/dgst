<script>
  // npm i ckeditor5-svelte
  // npm i @ckeditor/ckeditor5-build-decoupled-document/build/ckeditor
  // /node_modules\ckeditor5-svelte\src\Ckeditor.svelte 를 열어서
  // 42 라인 쯤의 //editor.isReadOnly = disabled; 를 주석처리(안하면 변경내용 binding 이 안됨)

  import DgstUploadAdapter from '$lib/util/DgstUploadAdapter.js';
  //import Uploader from "$lib/util/DgstUploadPlugin.js";
  import { onMount } from 'svelte';

  import Loader from 'svelte-loading-overlay/Loader.svelte';

  let CKEditor;

  function DgstUploadAdapterPlugin(editor) {
    //
    editor.plugins.get('FileRepository').createUploadAdapter = (loader) => {
      return new DgstUploadAdapter(loader);
    };
  }

  let Font;
  onMount(async () => {
    if (typeof window !== 'undefined') {
      CKEditor = (await import('ckeditor5-svelte')).default;

      editor = (await import('@ckeditor/ckeditor5-build-decoupled-document/build/ckeditor'))
        .default;
    }
  });

  // Setting up editor prop to be sent to wrapper component
  let editor;
  // Reference to initialised editor instance
  let editorInstance = null;
  // Setting up any initial data for the editor
  export let editorData = '';

  //아래 설정 지우시면 let editorConfig: any = {} 모든 에디터 기능 다 나옵니다.
  //버튼에 마우스오버하면 설정이름 나오는데, 눈찌껏 대문자 넣어서 네이밍 옵션에 넣으면 사굥가능합니다.
  let editorConfig = {
    extraPlugins: [DgstUploadAdapterPlugin],
    toolbar: {
      items: [
        'undo',
        'redo',
        'uploadImage',
        '|',
        'fontSize',
        'bold',
        'italic',
        'underline'
      ]
    },
    simpleUpload: {
      uploadUrl: '/board/upload',
      withCredentials: true
      /* headers:{
        'X-CSRFToken': 'CSRFToken',
        Authorization: 'Bearer <JSON Web Token>',
      }*/
    },
    image: {
      insert: {
        type: 'block'
      },
      upload: {
        types: ['jpeg', 'jpg', 'gif', 'png', 'webp']
      },
      styles: [{ name: 'side', isDefault: true, modelElements: ['imageBlock'] }]
    },
    height: 400,
    language: 'ko',
    mediaEmbed: {
      previewsInData: true
    },

  };

  function onReady({ detail: editor }) {
    // Insert the toolbar before the editable area.

    editorInstance = editor;

    editor.ui
      .getEditableElement()
      .parentElement.insertBefore(editor.ui.view.toolbar.element, editor.ui.getEditableElement());

    editor.plugins.get('FileRepository').createLoader('');

    const imageUploadEditing = editor.plugins.get('ImageUploadEditing');
    //const imageInsert = editor.plugins.get( 'ImageInsert' );

    console.log('imageUploadEditing', imageUploadEditing);
    console.log('ImageInline', editor.plugins.get('ImageInline'));
    console.log('ImageInlineEditing', editor.plugins.get('ImageInlineEditing'));

    imageUploadEditing.isEnabled = false;
    editor.plugins.get('ImageInlineEditing').isEnabled = false;

    imageUploadEditing.on('uploadComplete', (evt, { data, imageElement }) => {
      console.log('uploadComplete', evt, 'data', data, 'imageElement', imageElement);

      editor.model.change((writer) => {
        writer.setAttribute('someAttribute', 'foo', imageElement);
      });
    });

    editor.plugins.get('FileRepository').loaders._items[0].on('uploaded', (evt, data) => {
      console.log('evt', evt, 'data', data);
    });
  }

  let editorDiv;
  let loadingImage = false;
</script>

<main>
  <div bind:this={editorDiv}>
    <Loader active={loadingImage} container={editorDiv} component="Dot" opacity="0.7" />
    {#if CKEditor && editor}
      <svelte:component
        this={CKEditor}
        bind:editor
        on:ready={onReady}
        bind:config={editorConfig}
        bind:value={editorData}
      />
    {/if}
  </div>
</main>
