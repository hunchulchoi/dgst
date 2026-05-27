<script>
  import { Button, Col, Icon, Row } from '$lib/components/ui/index.js';

  import BoardList from '$lib/components/board_list.svelte';
  import LottoFreeBanner from '$lib/components/lotto_free_banner.svelte';

  import { goto } from '$app/navigation';
  import { swalFire } from '$lib/util/swal.js';
  import { onMount } from 'svelte';

  /** @type {{ data: Record<string, unknown>; boardId: string; pageNo?: string | number; session?: import('@auth/sveltekit').Session | null }} */
  let { data, boardId, pageNo, session } = $props();

  const getBoardName = (id) => {
    const boardNames = {
      free: '자유게시판',
      bug: '버그신고',
      alarm: '알림'
    };
    return boardNames[id] || '게시판';
  };

  const boardName = $derived(getBoardName(boardId));
  const pageTitle = $derived(pageNo ? `${boardName} ${pageNo}페이지` : boardName);
  const articles = $derived(/** @type {unknown[]} */ (data.articles ?? []));

  onMount(async () => {
    const host = window.location.hostname;

    if (host === 'dgst.site' || host === 'www.dgst.site') {
      await swalFire({
        title: '도메인 변경 안내',
        html: `dgst.site에서 <mark>dgst.me</mark>로 변경 되었습니다.
<div class="m-2"><strong class="text-danger">dgst.me</strong>로 이동합니다.</div>`,
        icon: 'info',
        confirmButtonText: '확인'
      }).then(() => {
        goto('https://www.dgst.me');
      });
    }
  });

  function write() {
    goto(`/board/${boardId}/write`);
  }
</script>

<svelte:head>
  <title>{pageTitle} - dgst.me</title>
  <meta
    name="description"
    content={`${boardName}에서 최신 게시글을 확인하세요. ${articles.length}개의 게시글이 있습니다.`}
  />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://www.dgst.me/board/{boardId}" />
  <meta property="og:title" content={pageTitle} />
  <meta
    property="og:description"
    content={`${boardName}에서 최신 게시글을 확인하세요. ${articles.length}개의 게시글이 있습니다.`}
  />
  <meta property="og:image" content="https://www.dgst.me/logo/twitter_header_photo_2.png" />
  <meta property="og:site_name" content="dgst.me" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta
    name="twitter:url"
    content="https://www.dgst.me/board/{boardId}{pageNo ? `/${pageNo}` : ''}"
  />
  <meta name="twitter:title" content={pageTitle} />
  <meta
    name="twitter:description"
    content={`${boardName}에서 최신 게시글을 확인하세요. ${articles.length}개의 게시글이 있습니다.`}
  />
  <meta name="twitter:image" content="https://www.dgst.me/logo/twitter_header_photo_2.png" />
</svelte:head>

<main class="container board-chrome-connect mt-0 mb-md-2" style="min-height: 50vh">
  <Row class="board-panel py-2 mx-0">
    {#if boardId === 'free'}
      <LottoFreeBanner {session} />
    {/if}
    {#if session?.user?.nickname}
      <Row class="px-0 mx-0 pe-3 mt-2 pb-3 border-bottom border-secondary-subtle">
        <Col class="d-flex justify-content-end p-0">
          <Button size="lg" class="px-3 fw-semibold" color="primary" onclick={write}>
            <Icon name="pencil-fill" class="pe-2" />글쓰기
          </Button>
        </Col>
      </Row>
    {/if}

    <BoardList {data} {write} {boardId} {session} />
  </Row>
</main>
