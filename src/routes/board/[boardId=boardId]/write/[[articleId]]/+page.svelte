<script>
  import { Button, Col, FormGroup, Icon, Input, Row, Spinner, Tooltip } from '@sveltestrap/sveltestrap';
  import CKEditor5 from '$lib/components/CKEditor5.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';

  function list() {
    if (title || content) {
      if (!confirm('취소 하시겠습니까? 작성하던 글은 사라집니다.')) return false;
    }
    goto(`/board/${$page.params.boardId}`);
  }

  export let data;

  let { title, content } = data;

  $: uploading =0

  $:{console.log('uploading', uploading)}

  function uploadPlus(){
    uploading++;
  }

  function uploadMinus(){
    uploading--;
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
          //console.debug('result', result, 'update', update);

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
      <Input type="hidden" name="articleId" value={$page.params.articleId} />
      <Input type="hidden" name="content" bind:value={content} required />
      <FormGroup floating label="제목">
        <Input id="title" name="title" bind:value={title} required autofocus />
      </FormGroup>
      <CKEditor5 bind:editorData={content} {uploadPlus} {uploadMinus} />
      <Row class="text-end pe-2 mt-4">
        <Col md="10" xs="8" class="text-end">
          <Button color="warning" on:click={list}>
            <Icon name="x-lg" class="pe-2" />
            취소
          </Button>
        </Col>
        <Col md="2" xs="4">
          <Button color="primary" role="submit" id="uploadBtn" disabled={uploading>0}>
            {#if uploading>0}
              <Spinner color="info" size="sm"/>
            {:else}
              <Icon name="pencil-fill" class="pe-2" />
            {/if}
            저장
          </Button>
          <Tooltip isOpen={uploading>0} target="uploadBtn">이미지 업로드 중입니다.</Tooltip>
        </Col>
      </Row>
    </form>
  </Row>
</main>
