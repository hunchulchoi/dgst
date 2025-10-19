<script>
  /**
   * Quill Editor Svelte 5 통합 컴포넌트
   * @description Svelte 5용 Quill 에디터 (CKEditor 대체)
   */
  import { onMount, onDestroy } from 'svelte';
  import Loader from 'svelte-loading-overlay/Loader.svelte';

  // Props
  export let uploadPlus;
  export let uploadMinus;
  export let editorData = '';

  // 로컬 상태
  let editorElement = null;
  let quillInstance = null;
  let loadingImage = false;
  let editorDiv;
  let Quill;
  let ImageUploader;

  /**
   * 커스텀 이미지 업로드 핸들러
   */
  async function imageHandler() {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*,video/*');
    input.click();

    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;

      loadingImage = true;

      try {
        // uploadPlus 콜백 호출
        if (uploadPlus) {
          uploadPlus();
        }

        // FormData 생성
        const formData = new FormData();
        formData.append('upload', file);

        // 서버에 업로드
        const response = await fetch('/board/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Upload failed:', response.status, errorText);
          throw new Error(`Upload failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('Upload response:', data);
        const url = data.url;

        // 에디터에 이미지 삽입
        const range = quillInstance.getSelection(true);
        quillInstance.insertEmbed(range.index, 'image', url);
        quillInstance.setSelection(range.index + 1);

        // uploadMinus 콜백 호출
        if (uploadMinus) {
          uploadMinus();
        }
      } catch (error) {
        console.error('Image upload failed:', error);
        alert('이미지 업로드에 실패했습니다.');
      } finally {
        loadingImage = false;
      }
    };
  }

  /**
   * 비디오 임베드 핸들러
   */
  function videoHandler() {
    const url = prompt('YouTube, Instagram, TikTok 또는 비디오 URL을 입력하세요:');
    if (!url) return;

    const range = quillInstance.getSelection(true);
    let embedHtml = '';

    // YouTube (일반 및 Shorts)
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      let videoId;
      if (url.includes('youtube.com/shorts/')) {
        const match = url.match(/youtube\.com\/shorts\/([\w-]+)/);
        videoId = match ? match[1] : null;
        if (videoId) {
          embedHtml = `<div style="max-width: 460px"><div style="position: relative;width:100%;padding-bottom:177.777%;"><iframe src="https://www.youtube.com/embed/${videoId}" style="position: absolute; width: 100%; height: 100%; top: 0; left: 0;" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe></div></div>`;
        }
      } else if (url.includes('youtube.com/watch')) {
        const match = url.match(/[?&]v=([^&]+)/);
        videoId = match ? match[1] : null;
        if (videoId) {
          embedHtml = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        }
      } else if (url.includes('youtu.be/')) {
        const match = url.match(/youtu\.be\/([\w-]+)/);
        videoId = match ? match[1] : null;
        if (videoId) {
          embedHtml = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        }
      }
    }
    // Instagram
    else if (url.includes('instagram.com')) {
      if (url.includes('/reel/')) {
        const match = url.match(/instagram\.com\/reel\/([\w-]+)/);
        const id = match ? match[1] : null;
        if (id) {
          embedHtml = `<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/reel/${id}/" style="max-width:540px; min-width:326px;"></blockquote>`;
        }
      } else if (url.includes('/p/')) {
        const match = url.match(/instagram\.com\/p\/([\w-]+)/);
        const id = match ? match[1] : null;
        if (id) {
          embedHtml = `<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/${id}/" style="max-width:540px; min-width:326px;"></blockquote>`;
        }
      }
    }
    // TikTok
    else if (url.includes('tiktok.com')) {
      const match = url.match(/tiktok\.com\/(.*)\/video\/([\w-]+)/);
      if (match) {
        const userId = match[1];
        const videoId = match[2];
        embedHtml = `<blockquote class="tiktok-embed" cite="https://www.tiktok.com/${userId}/video/${videoId}" data-video-id="${videoId}" style="max-width: 605px;min-width: 325px;"></blockquote>`;
      }
    }
    // Naver TV
    else if (url.includes('tv.naver.com')) {
      const match = url.match(/tv\.naver\.com\/v\/([\w-]+)/);
      const id = match ? match[1] : null;
      if (id) {
        embedHtml = `<iframe src='https://tv.naver.com/embed/${id}' frameborder='no' scrolling='no' width='544' height='306' allowfullscreen></iframe>`;
      }
    }
    // 일반 비디오 URL
    else {
      quillInstance.insertEmbed(range.index, 'video', url);
      quillInstance.setSelection(range.index + 1);
      return;
    }

    if (embedHtml) {
      quillInstance.clipboard.dangerouslyPasteHTML(range.index, embedHtml);
      quillInstance.setSelection(range.index + 1);
    }
  }

  /**
   * Quill 에디터 설정
   */
  const modules = {
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ size: ['small', false, 'large', 'huge'] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ align: [] }],
        ['link', 'image', 'video'],
        ['blockquote', 'code-block'],
        ['clean']
      ],
      handlers: {
        image: imageHandler,
        video: videoHandler
      }
    },
    clipboard: {
      matchVisual: false
    }
  };

  /**
   * Quill 초기화
   */
  onMount(async () => {
    if (typeof window === 'undefined') return;

    try {
      // Quill 동적 import
      const QuillModule = await import('quill');
      Quill = QuillModule.default;

      // Quill 스타일 import
      await import('quill/dist/quill.snow.css');

      // Quill 인스턴스 생성
      quillInstance = new Quill(editorElement, {
        theme: 'snow',
        modules: modules,
        placeholder: '내용을 입력하세요...'
      });

      // 초기 데이터 설정
      if (editorData) {
        quillInstance.root.innerHTML = editorData;
      }

      // 데이터 변경 감지 및 양방향 바인딩
      quillInstance.on('text-change', () => {
        editorData = quillInstance.root.innerHTML;
      });

      console.log('Quill Editor initialized successfully');
    } catch (error) {
      console.error('Quill 초기화 실패:', error);
    }
  });

  /**
   * 정리
   */
  onDestroy(() => {
    if (quillInstance) {
      quillInstance = null;
    }
  });

  // editorData prop 변경 감지 (외부에서 변경 시)
  $: if (quillInstance && editorData !== quillInstance.root.innerHTML) {
    const currentSelection = quillInstance.getSelection();
    quillInstance.root.innerHTML = editorData;
    if (currentSelection) {
      quillInstance.setSelection(currentSelection);
    }
  }
</script>

<svelte:head>
  <script async src="//www.instagram.com/embed.js"></script>
  <script async src="//www.tiktok.com/embed.js"></script>
</svelte:head>

<main>
  <div bind:this={editorDiv}>
    <Loader active={loadingImage} container={editorDiv} component="Dot" opacity="0.7" />
    <div bind:this={editorElement}></div>
  </div>
</main>

<style>
  main :global(.ql-container) {
    min-height: 400px;
    font-size: 16px;
  }

  main :global(.ql-editor) {
    min-height: 400px;
  }

  main :global(.ql-toolbar) {
    background: #f8f9fa;
    border-radius: 4px 4px 0 0;
  }

  main :global(.ql-container) {
    border-radius: 0 0 4px 4px;
  }
</style>

