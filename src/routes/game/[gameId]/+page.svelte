<script>
  // Svelte 5 Runes
  let { data } = $props();
</script>

<iframe
  title="게임 플레이"
  src="https://retropang.daonamu.com/embed/{data.gameId}"
  width="100%"
  height="500"
  style="max-width: 600px;"
  frameborder="no"
  allowfullscreen={true}
  scrolling="no"
></iframe>
