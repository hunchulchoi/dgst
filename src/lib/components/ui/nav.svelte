<script>
  let { tabs = false, navbar = false, class: className = '', children, ...rest } = $props();
</script>

<ul class="nav {navbar ? 'navbar-nav' : ''} {tabs ? 'nav-tabs' : ''} {className}" {...rest}>
  {@render children()}
</ul>
