<script>
  import {
    Navbar,
    NavbarBrand,
    Image,
    Nav,
    NavItem,
    NavLink,
    Icon,
    Button,
    Styles,
    Dropdown,
    DropdownToggle,
    DropdownItem,
    Collapse,
    NavbarToggler,
    DropdownMenu
  } from 'sveltestrap';

  import theme from '$lib/shared/stores/theme.js';

  let isOpen = false;

  function handleUpdate(event) {
    isOpen = event.detail.isOpen;
  }

  import { signIn, signOut } from '@auth/sveltekit/client';
  import { page } from '$app/stores';

  const handleGoogleSignIn = () => {
    console.log('handleGoogleSignIn');
    signIn('google', { callbackUrl: '/' });
  };

  const handleSignOut = () => {
    signOut();
  };

  $: colorModeIcon =
    $theme === 'light' ? 'sun-fill' : $theme === 'dark' ? 'moon-stars-fill' : 'circle-half';
  $: loginButton = `/oauth/btn_google_signin_${
    $theme === 'light' ? 'ligth' : 'dark'
  }_normal_web.png`;
</script>

<Styles theme={$theme} />

<Navbar expand="md" class="m-1 rounded shadow text-dark-emphasis" style="background-color: #fafae4">
  <NavbarBrand href="/" class="p-0">
    <Image
      fluid
      alt="dgst logo"
      src="/logo/logo_transparent_100.png"
      class="p-0"
      style="height: 40px"
    />
  </NavbarBrand>
  <Nav>
    <NavItem>
      <NavLink href="/board/free">자유게시판</NavLink>
    </NavItem>
  </Nav>
  <NavbarToggler on:click={() => (isOpen = !isOpen)} />
  <Collapse {isOpen} navbar expand="md" on:update={handleUpdate}>
    <Nav class="ms-auto" navbar>
      <NavItem>
        {#if $page.data.session?.user.nickname}
          <Image
            thumbnail
            alt="{$page.data.session.user.nickname} 프로필 사진"
            src={$page.data.session.user.photo ?? '/icons/unknown-person-icon-4.jpg'}
            class="p-0 rounded"
            style="max-height: 30px;max-width: 30px"
          />
            <span class="text-secondary">{$page.data.session.user.nickname}</span>
          <Button class="bi bi-door-closed" size="sm" on:click={handleSignOut}>logout</Button>
        {:else}
          <NavLink on:click={handleGoogleSignIn} class="p-0">
            <Image fluid alt="google계정으로 로그인" src={loginButton} class="p-0" />
          </NavLink>
        {/if}
      </NavItem>
      <Dropdown nav inNavbar class="text-muted">
        <DropdownToggle nav caret><Icon name={colorModeIcon} /></DropdownToggle>
        <DropdownMenu end>
          <DropdownItem on:click={() => theme.set('auto')}
            ><Icon name="circle-half" /> 자동</DropdownItem
          >
          <DropdownItem divider />
          <DropdownItem on:click={() => theme.set('light')}
            ><Icon name="sun-fill" /> 밝게</DropdownItem
          >
          <DropdownItem on:click={() => theme.set('dark')}
            ><Icon name="moon-stars-fill" /> 어둡게</DropdownItem
          >
        </DropdownMenu>
      </Dropdown>
    </Nav>
  </Collapse>
</Navbar>
