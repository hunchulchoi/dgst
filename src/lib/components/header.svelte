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
  } from '@sveltestrap/sveltestrap';



  import theme from '$lib/shared/stores/theme.js';

  import { signIn, signOut } from '@auth/sveltekit/client';
  import { goto } from '$app/navigation';
  import { navigating } from '$app/stores';

  import { alarmCount } from '$lib/util/store.js';

  // Svelte 5 Runes - Props
  let { session, pathname } = $props();
  
  let showSpinner = $state(false);
  
  $effect(() => {
    if ($navigating) {
      showSpinner = true;
    } else {
      setTimeout(() => {
        showSpinner = false;
      }, 500);
    }
  });

    const handleGoogleSignIn = () => {
    //console.log('handleGoogleSignIn');
    signIn('google', { callbackUrl: '/' });
  };

  let colorModeIcon = $derived(
    $theme === 'light' ? 'sun-fill' : $theme === 'dark' ? 'moon-stars-fill' : 'circle-half'
  );
  let loginButton = $derived(
    `/oauth/btn_google_signin_${$theme === 'light' ? 'light' : 'dark'}_normal_web.png`
  );

</script>

<Styles theme={$theme} />

<Row class="m-0">
<Navbar expand="md" class="m-0 rounded shadow text-secondary" style="background-color: #fafae4">
  <NavbarBrand href="/" class="p-0">
    {#if new Date().getMonth() === 3 && new Date().getDate() >= 15 && new Date().getDate() <= 17}
      <Image
        fluid
        title="잊지않을께"
        alt="remember0416"
        src="/icons/remember0416.png"
        class="p-0"
        style="height: 40px"
      />
    {:else}
      <Image
        fluid
        alt="dgst logo"
        src="/logo/logo_transparent_100.png"
        class="p-0"
        style="height: 40px"
      />
    {/if}
  </NavbarBrand>
  <Nav>
    <NavItem>
      {#if session?.user?.nickname}
        <Image
          thumbnail
          alt="{session.user.nickname} 프로필 사진"
          src={session.user.photo ?? '/icons/unknown-person-icon-4.jpg'}
          class="p-0 rounded"
          style="max-height: 30px;max-width: 30px"
        />
        <button type="button" class="btn btn-link text-secondary p-0" onclick={()=>goto('/auth/profile')}>{session.user.nickname}</button>
      {:else}
        <NavLink onclick={handleGoogleSignIn} class="p-0 m-0">
          <Image alt="google계정으로 로그인" src={loginButton} class="p-0" style="max-width:40vw"/>
        </NavLink>
      {/if}
    </NavItem>
    <Dropdown nav class="col-xs-1">
      <DropdownToggle nav caret class="text-secondary"><Icon name={colorModeIcon} /></DropdownToggle>
      <DropdownMenu end>
        <DropdownItem onclick={() => theme.set('auto')}
        ><Icon name="circle-half" /> 자동</DropdownItem
        >
        <DropdownItem divider />
        <DropdownItem onclick={() => theme.set('light')}
        ><Icon name="sun-fill" /> 밝게</DropdownItem
        >
        <DropdownItem onclick={() => theme.set('dark')}
        ><Icon name="moon-stars-fill" /> 어둡게</DropdownItem
        >
      {#if session?.user?.nickname}
          <DropdownItem divider />
          <DropdownItem onclick={signOut} class="text-bg-danger-subtle"
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
        <NavLink href="/board/free" 
                 data-sveltekit-invalidate="all" 
                 data-sveltekit-preload-data="tap"
                 active={pathname?.startsWith('/board/free')}>
          자유게시판
          {#if showSpinner}
            <span class="spinner-border spinner-border-sm ms-2 text-primary" role="status" aria-hidden="true"></span>
          {/if}
        </NavLink>
      </NavItem>
      {#if session?.user?.nickname}
        <NavItem>
          <NavLink href="/board/alarm" data-sveltekit-invalidate="all"
                  data-sveltekit-replace
                  data-sveltekit-preload-data="tap"
                  active={pathname?.startsWith('/board/alarm')}>
            <Icon name="megaphone" class="text-success me-2"/>알림
            {#if $alarmCount}
              <Badge pill color="danger">{$alarmCount}</Badge>
            {/if}
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink href="/board/bug" active={pathname?.startsWith('/board/bug')}>
            <Icon name="bug-fill" class="text-warning me-2"/>버그 신고
          </NavLink>
        </NavItem>
      {/if}
      <!--<NavItem>
        <NavLink href="/game/56471" active={$page.data.pathname.startsWith('/game/56471')}>
          <Icon name="bi bi-joystick" class="text-primary"/>
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink href="/game/52531" active={$page.data.pathname.startsWith('/game/52531')}>
          <Icon name="bi bi-joystick" class="text-warning"/>
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink href="/game/47767" active={$page.data.pathname.startsWith('/game/47767')}>
          <Icon name="bi bi-joystick" class="text-info"/>
        </NavLink>
      </NavItem>-->
    </Nav>
  </Navbar>
</Row>


