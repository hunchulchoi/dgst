<script>
  import {
    Badge,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownToggle,
    Icon,
    Nav,
    Navbar,
    NavbarBrand,
    NavItem,
    NavLink
  } from '$lib/components/ui/index.js';

  import theme from '$lib/shared/stores/theme.js';

  import { signIn, signOut } from '@auth/sveltekit/client';
  import { goto, invalidate } from '$app/navigation';
  import { navigating } from '$app/stores';
  import { browser } from '$app/environment';

  import { alarmCount, boardListReloading, boardListReloadKey } from '$lib/util/store.js';
  import { isFreeBoardHomePath } from '$lib/util/boardPaths.js';

  // Svelte 5 Runes - Props
  let { session, pathname } = $props();

  let navigatingSpinner = $state(false);

  $effect(() => {
    if ($navigating) {
      navigatingSpinner = true;
    } else {
      const timer = setTimeout(() => {
        navigatingSpinner = false;
      }, 500);
      return () => clearTimeout(timer);
    }
  });

  const showSpinner = $derived(navigatingSpinner || $boardListReloading);

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: '/' });
  };

  /** 알림 뱃지 — 레이아웃 blocking 제거 후 클라이언트에서 조회 */
  $effect(() => {
    if (!browser) return;

    if (!session?.user?.nickname) {
      alarmCount.set(0);
      return;
    }

    let cancelled = false;

    fetch('/api/alarm/unread-count')
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((body) => {
        if (!cancelled) alarmCount.set(body.count ?? 0);
      })
      .catch(() => {
        if (!cancelled) alarmCount.set(0);
      });

    return () => {
      cancelled = true;
    };
  });

  let colorModeIcon = $derived(
    $theme === 'light' ? 'sun-fill' : $theme === 'dark' ? 'moon-stars-fill' : 'circle-half'
  );
  let loginButton = $derived(
    `/oauth/btn_google_signin_${$theme === 'light' ? 'light' : 'dark'}_normal_web.png`
  );

  /** 게시판·알림: 탭과 본문 패널을 한 덩어리로 붙임 */
  const isFreeBoardPath = $derived(
    pathname === '/' || Boolean(pathname?.startsWith('/board/free'))
  );
  const boardChromeConnect = $derived(Boolean(pathname?.startsWith('/board')) || pathname === '/');

  /** 자유게시판 탭 — 목록 reload + blur */
  /** @param {MouseEvent} e */
  async function handleFreeBoardTabClick(e) {
    e.preventDefault();

    const currentPath = pathname?.split('?')[0] ?? '';
    const onHome = isFreeBoardHomePath(currentPath);

    boardListReloading.set(true);
    boardListReloadKey.update((n) => n + 1);

    try {
      if (!onHome) {
        await goto('/', { invalidateAll: false, replaceState: true });
      }

      await invalidate('board-list');
    } finally {
      boardListReloading.set(false);
    }
  }
</script>

<header class="site-header w-100 m-0">
  <Navbar expand="md" class="site-header-top m-0 rounded-top">
    <NavbarBrand href="/" class="p-0">
      {#if new Date().getMonth() === 3 && new Date().getDate() >= 15 && new Date().getDate() <= 17}
        <img
          title="잊지않을께"
          alt="remember0416"
          src="/icons/remember0416.png"
          class="p-0"
          style="height: 40px; width: auto;"
        />
      {:else}
        <img
          alt="dgst logo"
          src="/logo/logo_transparent_100.png"
          class="p-0"
          style="height: 40px; width: auto;"
        />
      {/if}
    </NavbarBrand>
    <Nav navbar class="ms-auto flex-row align-items-center gap-2">
      <NavItem>
        {#if session?.user?.nickname}
          <div class="inline-flex items-center gap-1 flex-nowrap">
            <img
              alt="{session.user.nickname} 프로필 사진"
              src={session.user.photo ?? '/icons/unknown-person-icon-4.jpg'}
              class="p-0 rounded shrink-0"
              style="max-height: 30px;max-width: 30px; height: auto; width: auto;"
            />
            <button
              type="button"
              class="btn btn-link text-secondary p-0 text-nowrap leading-none"
              onclick={() => goto('/auth/profile')}>{session.user.nickname}</button
            >
          </div>
        {:else}
          <NavLink onclick={handleGoogleSignIn} class="p-0 m-0">
            <img
              alt="Google 계정으로 로그인"
              src={loginButton}
              class="p-0"
              style="max-width:40vw; width: auto; height: auto;"
            />
          </NavLink>
        {/if}
      </NavItem>
      <Dropdown nav class="col-xs-1">
        <DropdownToggle nav caret class="text-secondary"
          ><Icon name={colorModeIcon} /></DropdownToggle
        >
        <DropdownMenu end class="site-header-dropdown-menu">
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
            <DropdownItem onclick={() => signOut()} class="text-bg-danger-subtle"
              ><Icon name="door-closed" /> 로그아웃</DropdownItem
            >
          {/if}
        </DropdownMenu>
      </Dropdown>
    </Nav>
  </Navbar>
  <div class="site-header-tabs-wrap">
    <Navbar
      color="secondary-subtle"
      class="w-100 pb-0 tab-nav-bar bg-body {boardChromeConnect
        ? 'tab-nav-bar-attached rounded-0 shadow-sm mb-0'
        : 'rounded-bottom shadow-sm'}"
    >
    <Nav tabs class="w-100 flex-nowrap" data-sveltekit-preload-data="false">
      <NavItem>
        <NavLink
          href="/"
          active={isFreeBoardPath}
          data-sveltekit-invalidate="board-list"
          onclick={handleFreeBoardTabClick}
        >
          자유게시판
          {#if showSpinner}
            <span
              class="spinner-border spinner-border-sm ms-2 text-primary"
              role="status"
              aria-label="목록 불러오는 중"
            ></span>
          {/if}
        </NavLink>
      </NavItem>
      {#if session?.user?.nickname}
        <NavItem>
          <NavLink
            href="/board/alarm"
            active={pathname?.startsWith('/board/alarm')}
            class="px-3 text-center"
          >
            <Icon name="megaphone" class="text-success" /><span class="d-none d-sm-inline ms-1"
              >알림</span
            >
            {#if $alarmCount && $alarmCount > 0}
              <Badge color="danger" class="ms-1">{$alarmCount}</Badge>
            {/if}
          </NavLink>
        </NavItem>
        <!-- <NavItem>
          <NavLink href="/board/bug" active={pathname?.startsWith('/board/bug')}>
            <Icon name="bug-fill" class="text-warning me-2"/>버그 신고
          </NavLink>
        </NavItem> -->
        <NavItem>
          <NavLink
            href="/games/slot"
            active={pathname?.startsWith('/games/slot')}
            class="px-3 text-center"
          >
            <Icon name="dice-3-fill" class="text-info" /><span class="d-none d-sm-inline ms-1"
              >뺑뺑이</span
            >
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink
            href="/games/watermelon"
            active={pathname?.startsWith('/games/watermelon')}
            class="px-3 text-center"
          >
            <span>🍉</span><span class="d-none d-sm-inline ms-1">과일</span>
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink
            href="/games/2048"
            active={pathname?.startsWith('/games/2048')}
            class="px-3 text-center"
          >
            <Icon name="grid-3x3-gap-fill" class="text-warning" /><span
              class="d-none d-sm-inline ms-1">2048</span
            >
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink
            href="/games/minesweeper"
            active={pathname?.startsWith('/games/minesweeper')}
            class="px-3 text-center"
          >
            <span>💣</span><span class="d-none d-sm-inline ms-1">지뢰</span>
          </NavLink>
        </NavItem>
      {/if}
      <!--<NavItem>
        <NavLink href="/game/56471" active={pathname?.startsWith('/game/56471')}>
          <Icon name="bi bi-joystick" class="text-primary"/>
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink href="/game/52531" active={pathname?.startsWith('/game/52531')}>
          <Icon name="bi bi-joystick" class="text-warning"/>
        </NavLink>
      </NavItem>
      <NavItem>
        <NavLink href="/game/47767" active={pathname?.startsWith('/game/47767')}>
          <Icon name="bi bi-joystick" class="text-info"/>
        </NavLink>
      </NavItem>-->
    </Nav>
    </Navbar>
  </div>
</header>

<style>
  .site-header {
    max-width: 100%;
    overflow-x: hidden;
  }

  .site-header :global(.site-header-top) {
    box-shadow: none !important;
    border-top-left-radius: var(--dgst-radius) !important;
    border-top-right-radius: var(--dgst-radius) !important;
  }

  .site-header :global(.site-header-top .container-fluid),
  .site-header :global(.site-header-top .navbar-brand) {
    background-color: transparent;
  }

  .site-header :global(.site-header-top .container-fluid) {
    padding: 0.55rem 0.75rem !important;
  }

  .site-header-tabs-wrap {
    margin-top: 0;
    padding-top: 0.75rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    background-color: var(--bs-body-bg);
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .site-header :global(.tab-nav-bar .container-fluid) {
    padding-left: 0.35rem !important;
    padding-right: 0.35rem !important;
  }

  .site-header :global(.tab-nav-bar-attached) {
    border-bottom: 1px solid var(--bs-border-color);
  }

  .site-header :global(.tab-nav-bar .nav-tabs) {
    flex-wrap: nowrap;
    overflow-x: visible;
  }

  .site-header :global(.tab-nav-bar .nav-link) {
    white-space: nowrap;
  }

  @media (min-width: 768px) {
    .site-header :global(.site-header-top .container-fluid) {
      padding: 0.65rem 1rem !important;
    }

    .site-header-tabs-wrap {
      padding-left: 0.75rem;
      padding-right: 0.75rem;
    }
  }

  @media (max-width: 767.98px) {
    .site-header :global(.site-header-top .container-fluid) {
      padding: 0.5rem 0.65rem !important;
    }

    .site-header-tabs-wrap {
      padding-left: 0.35rem;
      padding-right: 0.35rem;
    }

    .site-header :global(.tab-nav-bar .nav-item) {
      flex-shrink: 0;
    }
  }
</style>
