<script>
  import { onMount } from 'svelte';
  import {
    Button,
    Col,
    FormGroup,
    Icon,
    Input,
    Row,
    Spinner,
    Tooltip
  } from '@sveltestrap/sveltestrap';
  import QuillEditor from '$lib/components/QuillEditor.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';

  // Svelte 5 Runes
  let { data } = $props();
  
  const { boardId, articleId } = $page.params;

  let ffmpeg;
  
  const uploadPlus = () => {
    uploading++;
  };

  const uploadMinus = () => {
    uploading--;
  };

  onMount(async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { fetchFile } = await import('@ffmpeg/util');

    ffmpeg = new FFmpeg();
    await ffmpeg.load();
  });

  function list() {
    if (title || content) {
      if (!confirm('취소 하시겠습니까? 작성하던 글은 사라집니다.')) return false;
    }
    goto(`/board/${boardId}`);
  }

  let title = $state(data.title || '');
  let content = $state(data.content || '');
  let uploading = $state(0);

  $effect(() => {
    console.log('uploading', uploading);
  });

  async function compressVideo(file) {
    try {
      uploadPlus();

      // 파일을 FFmpeg에 쓰기
      await ffmpeg.writeFile('input.mp4', await fetchFile(file));

      // 비디오 압축 실행
      await ffmpeg.exec([
        '-i',
        'input.mp4',
        '-c:v',
        'libx264',
        '-crf',
        '28', // 압축률 조정 (18-28 권장, 숫자가 높을수록 더 많이 압축)
        '-preset',
        'medium',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        'output.mp4'
      ]);

      // 압축된 파일 가져오기
      const compressedData = await ffmpeg.readFile('output.mp4');
      const compressedBlob = new Blob([compressedData.buffer], { type: 'video/mp4' });

      uploadMinus();
      return compressedBlob;
    } catch (error) {
      console.error('비디오 압축 중 오류 발생:', error);
      uploadMinus();
      throw error;
    }
  }

  // CKEditor 설정을 위한 함수 추가
  function customUploadAdapter(loader) {
    return {
      upload: async () => {
        try {
          const file = await loader.file;

          // 비디오 파일인 경우 압축 처리
          if (file.type.startsWith('video/')) {
            const compressedVideo = await compressVideo(file);
            // 여기서 압축된 비디오를 서버에 업로드하는 로직 구현
            // ... 서버 업로드 코드 ...
          } else {
            // 기존 이미지 업로드 로직
            // ... 기존 코드 ...
          }
        } catch (error) {
          console.error('업로드 중 오류 발생:', error);
          throw error;
        }
      }
    };
  }
</script>

<svelte:head>
  <style>
    #_editor {
      border: 1px solid lightgrey;
      border-radius: 4px;
    }
    .ck-editor__editable {
      min-height: 400px;
      border: 1px solid black;
      max-height: 500px;
    }
    .ck-content .image {
      display: inline-block;
      text-align: left;
    }
    .ck-content .image img {
      width: 100%;
      max-width: 100%;
    }
  </style>
</svelte:head>

<main class="container my-1">
  <Row class="border border-secondary-subtle rounded-4 py-5 shadow">
    <form
      method="POST"
      use:enhance={({ formElement, formData, action, cancel, submitter }) => {
        if (!submitter || submitter.role !== 'submit') {
          return cancel();
        }

        if (title.replace(' ', '').length < 1) {
          alert('제목이 너무 짧습니다.');
          return cancel();
        }
        if (content.replace(' ', '').length < 5) {
          alert('본문이 너무 짧습니다.');
          return cancel();
        }

        return async ({ result, update }) => {
          if (!result.data.success) {
            alert('저장중에 오류가 발생하였습니다.');
          } else {
            title = '';
            content = '';

            list();
          }
        };
      }}
    >
      <Input type="hidden" name="articleId" value={articleId} />
      <Input type="hidden" name="content" bind:value={content} required />
      <FormGroup floating label="제목">
        <Input id="title" name="title" bind:value={title} required autofocus />
      </FormGroup>
      <QuillEditor bind:editorData={content} {uploadPlus} {uploadMinus} />
      <Row class="text-end pe-2 mt-4">
        <Col md="10" xs="8" class="text-end">
          <Button color="warning" onclick={list}>
            <Icon name="x-lg" class="pe-2" />
            취소
          </Button>
        </Col>
        <Col md="2" xs="4">
          <Button color="primary" role="submit" id="uploadBtn" disabled={uploading > 0}>
            {#if uploading > 0}
              <Spinner color="info" size="sm" />
            {:else}
              <Icon name="pencil-fill" class="pe-2" />
            {/if}
            저장
          </Button>
          {#if uploading > 0}
            <Tooltip isOpen={uploading > 0} target="uploadBtn">이미지 업로드 중입니다.</Tooltip>
          {/if}
        </Col>
      </Row>
    </form>
  </Row>
</main>
