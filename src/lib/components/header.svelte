<script>
  import {
    Badge,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownToggle,
    Icon,
    Image,
    Nav,
    Navbar,
    NavbarBrand,
    NavItem,
    NavLink,
    Row,
    Styles
  } from 'sveltestrap';

  import theme from '$lib/shared/stores/theme.js';

  import { signIn, signOut } from '@auth/sveltekit/client';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  import { alarmCount } from '$lib/util/store.js';

  const handleGoogleSignIn = () => {
    //console.log('handleGoogleSignIn');
    signIn('google', { callbackUrl: '/' });
  };

  function free(){
    goto(`/board/free?v=${new Date().getSeconds()}`, {invalidateAll: true, replaceState: true});
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
      {#if $page.data.session?.user?.nickname}
        <Image
          thumbnail
          alt="{$page.data.session.user.nickname} 프로필 사진"
          src={$page.data.session.user.photo ?? '/icons/unknown-person-icon-4.jpg'}
          class="p-0 rounded"
          style="max-height: 30px;max-width: 30px"
        />
        <span class="text-secondary" on:click={()=>goto('/auth/profile')}>{$page.data.session.user.nickname}</span>
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
  <Navbar color="secondary-subtle" fixed="true" class="ms-auto pb-0">

    <Nav tabs data-svelteit-preload-data="false">
      <NavItem>
        <NavLink on:click={free} active={$page.data.pathname.startsWith('/board/free')}>자유게시판
        </NavLink>
      </NavItem>
      {#if $page.data.session?.user?.nickname}
        <NavItem>
          <NavLink href="/board/alarm" data-sveltekit-invalidate="all"
                   data-sveltekit-replace
                   data-sveltekit-preload-data="tap"
                   active={$page.data.pathname.startsWith('/board/alarm')}>
            <Icon name="megaphone" class="text-success me-2"/>알림
            {#if $alarmCount}
              <Badge pill color="danger">{$alarmCount}</Badge>
            {/if}
          </NavLink>
        </NavItem>
      {/if}
      <NavItem>
        <NavLink href="/game/25845" active={$page.data.pathname.startsWith('/game/25845')}>
          <Icon name="bi bi-joystick" class="text-warning"/>
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink href="/game/26112" active={$page.data.pathname.startsWith('/game/26112')}>
          <Icon name="bi bi-joystick" class="text-primary"/>
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink href="/game/21094" active={$page.data.pathname.startsWith('/game/21094')}>
          <Icon name="bi bi-joystick" class="text-info"/>
        </NavLink>
      </NavItem>
    </Nav>
  </Navbar>
</Row>


