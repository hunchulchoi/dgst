<script>
  let visible = $state(true);
</script>

{#if visible}
  <aside class="celebration-banner" aria-label="진급 축하">
    <p>
      <span class="congratulation">경)</span> 🌸 진천의 2번 아들 <strong>8급 진급</strong>🎊🎉
      <span class="congratulation">(축</span>
    </p>
    <button type="button" aria-label="축하 배너 닫기" onclick={() => (visible = false)}>×</button>
  </aside>
{/if}

<style>
  .celebration-banner {
    position: relative;
    margin: 0.75rem;
    padding: 1rem 2.75rem;
    border: 1px solid #f9a8c5;
    border-radius: 0.75rem;
    background: linear-gradient(110deg, #fff1f5, #ffe4ef 50%, #fff5d6);
    color: #831843;
    text-align: center;
    box-shadow: 0 3px 12px rgb(190 24 93 / 10%);
  }

  p {
    margin: 0;
    font-size: clamp(1rem, 3vw, 1.75rem);
    font-weight: 700;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  strong,
  .congratulation {
    color: #be123c;
  }

  button {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    width: 2.5rem;
    height: 2.5rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: #831843;
    font-size: 1.5rem;
    cursor: pointer;
  }

  button:hover,
  button:focus-visible {
    background: #fbcfe8;
  }
</style>
