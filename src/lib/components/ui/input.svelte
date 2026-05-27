<script>
  let {
    type = 'text',
    value = $bindable(''),
    invalid = $bindable(false),
    feedback = '',
    class: className = '',
    id = undefined,
    onchange,
    oninput,
    ...rest
  } = $props();

  const controlClass = $derived(`form-control ${invalid ? 'is-invalid' : ''} ${className}`.trim());
</script>

{#if type === 'textarea'}
  <textarea {id} class={controlClass} bind:value {onchange} {oninput} {...rest}></textarea>
{:else}
  <input {type} {id} class={controlClass} bind:value {onchange} {oninput} {...rest} />
{/if}
{#if invalid && feedback}
  <div class="invalid-feedback">{feedback}</div>
{/if}
