<script>
  import BoardIndexView from '$lib/components/board_index_view.svelte';

  let { data } = $props();

  const session = $derived(data.session);
</script>

<BoardIndexView {data} boardId="free" {session} />
