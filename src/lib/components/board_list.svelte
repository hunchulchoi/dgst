<script>
  import {
    Badge,
    Button,
    Col,
    Icon,
    Pagination,
    PaginationItem,
    PaginationLink,
    Row
  } from '$lib/components/ui/index.js';

  import { formatDistanceToNowStrict, parseISO } from 'date-fns';
  import { ko } from 'date-fns/locale';
  import { goto } from '$app/navigation';

  // Svelte 5 Runes - Props
  let { data, write, boardId, session } = $props();

  /** 서버 load의 pageNo — $page.params destructuring은 네비 후 갱신되지 않을 수 있음 */
  const currentPageNo = $derived(Number(data.pageNo) || 1);

  // 페이지 네이션 클릭 핸들러 - 중복 클릭 방지
  function handlePageClick(targetPage, e) {
    const target = Number(targetPage);

    if (target === currentPageNo) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    const path = target === 1 ? `/board/${boardId}` : `/board/${boardId}/${target}`;
    goto(path);
  }
</script>

{#if !data.articles.length}
  <Row class="my-5 mx-0">
    <Row>
      <Col class="text-center">
        <img
          src="/icons/nothing.webp"
          alt="없어요 그냥 짤"
          class="mt-2"
          style="width:540px; max-width: 100%"
        />
      </Col>
    </Row>
    <Row>
      <Col style="height: 20vh" class="fs-2 text-center mt-5">
        🤦🏻‍♀🤦🏾‍♂ 게시물이 없습니다. 뻘글 하나 쓰고 가세여 ㅜㅜ
      </Col>
    </Row>
  </Row>
{:else}
  {#each data.articles as article, index}
    <Row
      class="board-list-row p-2 border-bottom border-secondary-subtle m-0 {index % 2 === 1
        ? 'bg-secondary bg-opacity-25'
        : ''}"
    >
      <Col lg="7" md="5" xs="12" class="text-break link-opacity-hover-50 pb-1 position-relative">
        <a
          data-sveltekit-preload-data="hover"
          href={`/board/${boardId}/${currentPageNo}/${article._id}`}
          class="board-list-link link-underline link-underline-opacity-0 link-offset-2 link-underline-opacity-50-hover stretched-link"
        >
          <span class="board-list-title">{article.title}</span>
          {@html article.content}
          {#if article.comment}
            {#if article.isNewComment}
              <Badge color="warning" class="bg-opacity-50">{article.comment}</Badge>
            {:else}
              <Badge color="primary" class="bg-opacity-50">{article.comment}</Badge>
            {/if}
          {/if}
        </a>
      </Col>
      <Col
        lg="2"
        md="2"
        xs="5"
        class="board-list-meta text-muted text-truncate d-flex align-items-center"
      >
        {#if article.photo}
          <img
            src={article.photo}
            alt="Profile"
            class="board-list-avatar me-1"
          />
        {/if}
        {article.nickname}
      </Col>
      <Col lg="1" md="1" xs="1" class="board-list-meta text-muted text-end">{article.read}</Col>
      <Col lg="1" md="1" xs="2" class="board-list-meta text-muted text-end">
        {#if article.like > 0}
          <Icon name="hand-thumbs-up" class="text-success pe-1" />{article.like}
        {/if}
      </Col>
      <Col lg="1" md="2" xs="4" class="board-list-meta text-muted text-end"
        >{formatDistanceToNowStrict(parseISO(article.createdAt), {
          locale: ko,
          addSuffix: true
        })}</Col
      >
    </Row>
  {/each}
{/if}
{#if data.maxPage > 1}
  <Row class="mt-3 mx-0">
    <Col xs="12">
      <Pagination size="md" arialabel="페이지 네이션" class="d-flex justify-content-center">
        <PaginationItem
          ><PaginationLink
            first
            href={`/board/${boardId}`}
            onclick={(e) => handlePageClick(1, e)}
            data-sveltekit-preload-data="hover"
          /></PaginationItem
        >
        {#each Array(data.endNo - data.startNo + 1) as _, i}
          {@const targetPage = i + data.startNo}
          <PaginationItem active={(!data.pageNo && targetPage === 1) || targetPage == data.pageNo}>
            <PaginationLink
              href={`/board/${boardId}/${targetPage}`}
              onclick={(e) => handlePageClick(targetPage, e)}
              data-sveltekit-preload-data="hover"
            >
              {targetPage}
            </PaginationLink>
          </PaginationItem>
        {/each}
        <PaginationItem
          ><PaginationLink
            href={`/board/${boardId}/${data.maxPage}`}
            onclick={(e) => handlePageClick(data.maxPage, e)}
            data-sveltekit-preload-data="hover"
            last
          /></PaginationItem
        >
      </Pagination>
    </Col>
  </Row>
{/if}

{#if session?.user?.nickname}
  <Row class="px-0 mx-0 pe-3 pb-4 mt-2">
    <Col class="d-flex justify-content-end p-0">
      <Button size="lg" class="px-3 fw-semibold" color="primary" onclick={write}>
        <Icon name="pencil-fill" class="pe-2" />글쓰기
      </Button>
    </Col>
  </Row>
{/if}

<style>
  .board-list-link {
    cursor: pointer;
    color: var(--bs-body-color) !important;
  }

  .board-list-link:hover {
    color: var(--bs-link-hover-color) !important;
  }

  .board-list-link:visited {
    color: var(--bs-secondary-color) !important;
  }

  .board-list-title {
    font-size: 1.05rem;
    line-height: 1.4;
    font-weight: 400;
  }

  .board-list-meta {
    font-size: 0.8125rem;
  }

  .board-list-avatar {
    width: 24px;
    height: 24px;
    object-fit: cover;
    border-radius: var(--dgst-radius) !important;
  }

  /* 모바일(md 미만): 제목·메타 가독성 */
  @media (max-width: 767.98px) {
    .board-list-row {
      padding: 0.75rem 0.5rem !important;
    }

    .board-list-title {
      font-size: 1.2rem !important;
      line-height: 1.45;
      font-weight: 500;
    }

    .board-list-meta {
      font-size: 0.9375rem;
      line-height: 1.35;
      padding-top: 0.25rem;
    }

    .board-list-avatar {
      width: 28px;
      height: 28px;
    }
  }
</style>
