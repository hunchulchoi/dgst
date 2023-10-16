<script>
    import {Badge, Button, Col, Icon, Pagination, PaginationItem, PaginationLink, Row} from 'sveltestrap';
    import {page} from '$app/stores';
    import {goto} from '$app/navigation';

    import {formatDistanceToNowStrict, parseISO} from 'date-fns';
    import ko from 'date-fns/locale/ko/index.js';

    function write() {
    goto(`/board/${$page.params.boardId}/write`);
  }

  export let data;
</script>

<main class="container my-md-2" style="min-height: 60vh">
  <Row class="p-2 shadow rounded-4">

        {#if !data.articles.length}
          <Row class="my-5">
            <Col style="height: 40vh" class="fs-2 text-center align-middle">
              🤦🏻‍♀🤦🏾‍♂ 게시물이 없습니다. 뻘글 하나 쓰고 가세여 ㅜㅜ
            </Col>
          </Row>
        {:else}
          {#each data.articles as article}
            <Row class="py-2 border-bottom border-secondary-subtle m-0">
              <Col lg="7" md="5" xs="12"
                      class="text-break link-opacity-hover-50 pb-1">
               <a data-sveltekit-preload-data="tap"
                  href={`/board/${$page.params.boardId}/${$page.params.pageNo || 1}/${article._id}`}
                  style="cursor: pointer; font-size: 1.1em"
                  class="link-underline link-underline-opacity-0 link-offset-2 link-underline-opacity-50-hover">
                {article.title}
                {@html article.content}
                {#if article.comment}
                  <Badge color="primary" class="bg-opacity-50">{article.comment}</Badge>
                {/if}
               </a>
              </Col>
              <Col lg="2" md="2" xs="5" class="text-muted" style="font-size: small">{article.nickname}</Col>
              <Col lg="1" md="1" xs="1" class="text-muted text-end" style="font-size: small">{article.read}</Col>
              <Col lg="1" md="1" xs="2" class="text-muted text-end" style="font-size: small"
                ><Icon name="hand-thumbs-up" class="text-success pe-" />{article.like}</Col
              >
              <Col lg="1" md="2" xs="4" class="text-muted text-end" style="font-size: small"
                >{formatDistanceToNowStrict(parseISO(article.createdAt), {
                  locale: ko,
                  addSuffix: true
                })}</Col
              >
            </Row>
          {/each}
        {/if}
  {#if data.maxPage>1}
    <Row class="mt-3 mx-0">
      <Col xs="12">
        <Pagination size="md" arialabel="페이지 네이션" class="d-flex justify-content-center">
          <PaginationItem
            ><PaginationLink first href={`/board/${$page.params.boardId}`} /></PaginationItem
          >
          {#each Array(data.maxPage) as _, i}
            <PaginationItem
              active={(!$page.params.pageNo && i === 0) || i + 1 == $page.params.pageNo}
            >
              <PaginationLink href={`/board/${$page.params.boardId}/${i + 1}`}>
                {i + 1}
              </PaginationLink>
            </PaginationItem>
          {/each}
          <PaginationItem
            ><PaginationLink
              last
              href={`/board/${$page.params.boardId}/${data.maxPage}`}
            /></PaginationItem
          >
        </Pagination>
      </Col>
    </Row>
  {/if}
  {#if $page.data.session?.user.nickname}
    <Row class="px-0 mx-0 pe-3 pb-4 mt-2">
      <Col class="d-flex justify-content-end p-0">
        <Button class="px-2" color="primary" on:click={write}>
            <Icon name="pencil-fill" class="pe-2 " />글쓰기
        </Button>
      </Col>
    </Row>
  {/if}
  </Row>
</main>

<style>
  a:visited{
      color: var(--bs-gray);
  }
</style>
