<script>
  import BoardIndexView from '$lib/components/board_index_view.svelte';
  import { page } from '$app/stores';

  let { data } = $props();

  const boardId = $derived($page.params.boardId);
  const pageNo = $derived($page.params.pageNo);
  const session = $derived(data.session);
</script>

<BoardIndexView {data} {boardId} {pageNo} {session} />
