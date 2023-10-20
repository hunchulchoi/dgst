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
        'link',
        'mediaEmbed',
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
    link:{
      addTargetToExternalLinks: true,
    },
    mediaEmbed:{
      extraProviders:[
        {
          name: 'youtube shorts',
          url:/^youtube\.com\/shorts\/([\w-]+)(?:\?start=(\d+))?/,
          html: match=>{
            const id = match[ 1 ];
            const time = match[ 2 ];

            return (
                    '<div style="position: relative; padding-bottom: 100%; height: 0; padding-bottom: 56.2493%;">' +
                    `<iframe src="https://www.youtube.com/embed/${ id }${ time ? `?start=${ time }` : '' }" ` +
                    'style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" ' +
                    'frameborder="0" allow="autoplay; encrypted-media" allowfullscreen>' +
                    '</iframe>' +
                    '</div>'
            );
          },
        },
        {
          name: 'instagram reel',
          url: /^instagram\.com\/reel\/([\w-]+)(?:\?igshid=(\d+))?/,
          html: match=>{
            const id = match[ 1 ];
            const time = match[ 2 ];

            return (
                    `<blockquote class="instagram-media"
                      data-instgrm-captioned
                      data-instgrm-permalink="//www.instagram.com/reel/${id}/?utm_source=ig_embed&amp;utm_campaign=loading"
                      data-instgrm-version="14"
                      style=" background:#FFF; border:0; border-radius:3px; box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15); margin: 1px; max-width:540px; min-width:326px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);">
                     </blockquote>`
            );
          },
        }

      ],
      previewsInData: true
    },
    height: 400,
    language: 'ko',
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

<svelte:head>
  <script async src="http://www.instagram.com/embed.js"></script>
</svelte:head>

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
