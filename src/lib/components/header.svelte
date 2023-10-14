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
        DropdownMenu, Row, Breadcrumb, BreadcrumbItem
    } from 'sveltestrap';

  import theme from '$lib/shared/stores/theme.js';

  import { signIn, signOut } from '@auth/sveltekit/client';
  import { page } from '$app/stores';
    import {goto} from "$app/navigation";

  const handleGoogleSignIn = () => {
    console.log('handleGoogleSignIn');
    signIn('google', { callbackUrl: '/' });
  };

  function free(){
    goto(`/board/free/?v=${new Date().getMinutes()}`)
  }

  $: colorModeIcon =
    $theme === 'light' ? 'sun-fill' : $theme === 'dark' ? 'moon-stars-fill' : 'circle-half';
  $: loginButton = `/oauth/btn_google_signin_${
    $theme === 'light' ? 'light' : 'dark'
  }_normal_web.png`;
</script>

<Styles theme={$theme} />

<Row class="m-0">
<Navbar expand="md" class="m-0 rounded shadow text-secondary" style="background-color: #fafae4">
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
      {#if $page.data.session?.user.nickname}
        <Image
          thumbnail
          alt="{$page.data.session.user.nickname} 프로필 사진"
          src={$page.data.session.user.photo ?? '/icons/unknown-person-icon-4.jpg'}
          class="p-0 rounded"
          style="max-height: 30px;max-width: 30px"
        />
        <span class="text-secondary">{$page.data.session.user.nickname}</span>
      {:else}
        <NavLink on:click={handleGoogleSignIn} class="p-0 m-0">
          <Image alt="google계정으로 로그인" src={loginButton} class="p-0" style="max-width:40vw"/>
        </NavLink>
      {/if}
    </NavItem>
    <Dropdown nav class="col-xs-1">
      <DropdownToggle nav caret class="text-secondary"><Icon name={colorModeIcon} /></DropdownToggle>
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
      {#if $page.data.session?.user.nickname}
          <DropdownItem divider />
          <DropdownItem on:click={signOut} class="text-bg-danger-subtle"
          ><Icon name="door-closed" /> 로그아웃</DropdownItem
          >
      {/if}
      </DropdownMenu>
    </Dropdown>
  </Nav>
</Navbar>
    <Breadcrumb class="pt-2 pb-0 text-bg-light bg-opacity-10">
        <BreadcrumbItem
          class="ps-4 pb-0 mb-0"><a on:click={free} href='#top'>자유게시판</a></BreadcrumbItem>
    </Breadcrumb>
</Row>
