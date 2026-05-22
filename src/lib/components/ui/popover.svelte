<!-- 호환용: bootstrap JS 없이 title 툴팁으로 대체 -->
<script>
  let { children } = $props();
</script>

<!-- Popover 내용은 FormCheck title 등으로 대체; 빈 슬롯 유지 -->
<span class="visually-hidden">{@render children()}</span>
