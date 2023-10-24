<script>
  import { Button, Col, FormGroup, Icon, Input, Row } from 'sveltestrap';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { onMount } from "svelte"

  function list() {
    if (title || content) {
      if (!confirm('취소 하시겠습니까? 작성하던 글은 사라집니다.')) return false;
    }
    goto(`/board/${$page.params.boardId}`);
  }

  export let data;

  let { title, content } = data;


  let editor;

  export let toolbarOptions = [
		[{ header: 1 }, { header: 2 }, "blockquote", "link", "image", "video"],
		["bold", "italic", "underline", "strike"],
		[{ list: "ordered" }, { list: "ordered" }],
		[{ align: [] }],
		["clean"]
	];

  onMount(async () => {
		const { default: Quill } = await import("quill");
	
    let quill = new Quill(editor, {
      modules: {
        toolbar: toolbarOptions
      },
      theme: "snow",
      placeholder: "Write your story..."
    });
  });


</script>

<main class="container my-1">
  <Row class="border border-secondary-subtle rounded-4 py-5 shadow">
         <Input type="hidden" name="articleId" value={$page.params.articleId} />
      <Input type="hidden" name="content" bind:value={content} required />
      <FormGroup floating label="제목">
        <Input id="title" name="title" bind:value={title} required autofocus />
      </FormGroup>
      
      <div class="editor-wrapper">
        <div bind:this={editor} />
      </div>
      
  </Row>
</main>

<style>
  @import 'https://cdn.quilljs.com/1.3.6/quill.snow.css';
</style>