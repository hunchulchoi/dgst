<script>
  import { Button, Col, Icon, Row } from '@sveltestrap/sveltestrap';
  import { page } from '$app/stores';

  import BoardList from '$lib/components/board_list.svelte';
  import LottoFreeBanner from '$lib/components/lotto_free_banner.svelte';

  import { alarmCount } from '$lib/util/store.js';
  import { goto } from '$app/navigation';

  import Swal from 'sweetalert2';
  import { onMount } from 'svelte';

  // Svelte 5 Runes
  let { data } = $props();

  const { boardId, pageNo } = $page.params;

  // 게시판 이름 매핑
  const getBoardName = (boardId) => {
    const boardNames = {
      free: '자유게시판',
      bug: '버그신고',
      alarm: '알림'
    };
    return boardNames[boardId] || '게시판';
  };

  const boardName = getBoardName(boardId);
  const pageTitle = pageNo ? `${boardName} ${pageNo}페이지` : boardName;

  // 도메인 변경 안내
  onMount(() => {
    const host = window.location.hostname;

    if (host === 'dgst.site' || host === 'www.dgst.site') {
      Swal.fire({
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

  /**
   * page 이동
   * @param pageNo {number}
   */
  function gopage(pageNum) {
    goto(`/board/${boardId}/${pageNum}?v=${new Date().getSeconds()}`, { invalidateAll: true });
  }

  $effect(() => {
    console.log('🔄 게시판 페이지 새로고침 - boardId:', boardId, 'pageNo:', pageNo);
    console.log('📊 게시글 수:', data.articles?.length);
  });

  alarmCount.update((alarmCount) => data.alarmCount);
</script>

<svelte:head>
  <!-- Open Graph 메타 태그 -->
  <title>{pageTitle} - dgst.me</title>
  <meta
    name="description"
    content={`${boardName}에서 최신 게시글을 확인하세요. ${data.articles?.length || 0}개의 게시글이 있습니다.`}
  />

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://www.dgst.me/board/{boardId}" />
  <meta property="og:title" content={pageTitle} />
  <meta
    property="og:description"
    content={`${boardName}에서 최신 게시글을 확인하세요. ${data.articles?.length || 0}개의 게시글이 있습니다.`}
  />
  <meta property="og:image" content="https://www.dgst.me/logo/twitter_header_photo_2.png" />
  <meta property="og:site_name" content="dgst.me" />

  <!-- Twitter (name 사용이 스펙에 맞음) -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta
    name="twitter:url"
    content="https://www.dgst.me/board/{boardId}{pageNo ? `/${pageNo}` : ''}"
  />
  <meta name="twitter:title" content={pageTitle} />
  <meta
    name="twitter:description"
    content={`${boardName}에서 최신 게시글을 확인하세요. ${data.articles?.length || 0}개의 게시글이 있습니다.`}
  />
  <meta name="twitter:image" content="https://www.dgst.me/logo/twitter_header_photo_2.png" />
</svelte:head>

<main class="container my-md-2" style="min-height: 50vh">
  <Row class="py-2 shadow rounded-4 mx-0">
    {#if boardId === 'free'}
      <LottoFreeBanner lottoHistory={data.lottoHistory ?? []} session={data.session} />
    {/if}
    {#if data.session?.user?.nickname}
      <Row class="px-0 mx-0 pe-3 mt-2 pb-3 border-bottom border-secondary-subtle">
        <Col class="d-flex justify-content-end p-0">
          <Button class="px-2" color="primary" onclick={write}>
            <Icon name="pencil-fill" class="pe-2 " />글쓰기
          </Button>
        </Col>
      </Row>
    {/if}

    <BoardList {data} {write} {boardId} {pageNo} session={data.session} />
  </Row>
</main>
