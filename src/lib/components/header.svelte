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

  import {signIn, signOut} from '@auth/sveltekit/client';
  import {page} from '$app/stores';

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

  $: alarmCount = $page.data.alarmCount
  $: console.log('$$ alarmCount',alarmCount, $page.data.alarmCount)
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
  <Navbar color="secondary-subtle" fixed="true" class="ms-auto pb-0">

    <Nav tabs>
      <NavItem>
        <NavLink href="#top" on:click={free} active={$page.data.pathname.startsWith('/board/free')}>자유게시판
        </NavLink>
      </NavItem>
      {#if $page.data.session?.user?.nickname}
        <NavItem>
          <NavLink data-sveltekit-reload href="/board/alarm" active={$page.data.pathname.startsWith('/board/alarm')}>
            <Icon name="megaphone" class="text-success me-2"/>알림
            {#if alarmCount}
              <Badge pill color="danger">{alarmCount}</Badge>
            {/if}
          </NavLink>
        </NavItem>
      {/if}
      <NavItem>
        <NavLink href="/board/bug" active={$page.data.pathname.startsWith('/board/bug')}>
          <Icon name="bug-fill" class="text-warning me-2"/>버그 신고
        </NavLink>
      </NavItem>
    </Nav>
  </Navbar>
</Row>
