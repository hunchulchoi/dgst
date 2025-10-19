<script>

  import { Badge, Button, Col, Icon, Image, Pagination, PaginationItem, PaginationLink, Row } from '@sveltestrap/sveltestrap';

  import { formatDistanceToNowStrict, parseISO } from 'date-fns';
  import { ko } from 'date-fns/locale';

  // Svelte 5 Runes - Props
  let { data, write, boardId, pageNo = 1, session } = $props();

  
</script>

{#if !data.articles.length}
  <Row class="my-5 mx-0">
    <Row>
      <Col class="text-center">
        <Image src="/icons/nothing.webp" alt="없어요 그냥 짤" class="mt-2" style="width:540px; max-width: 100%"/>
      </Col>
    </Row>
    <Row>
      <Col style="height: 20vh" class="fs-2 text-center mt-5">
        🤦🏻‍♀🤦🏾‍♂ 게시물이 없습니다. 뻘글 하나 쓰고 가세여 ㅜㅜ
      </Col>
    </Row>
  </Row>
{:else}
  {#each data.articles as article}
    <Row class="p-2 border-bottom border-secondary-subtle m-0">
      <Col lg="7" md="5" xs="12"
           class="text-break link-opacity-hover-50 pb-1 position-relative">
        <a data-sveltekit-preload-data="tap" data-sveltekit-invalidate="all"
           href={`/board/${boardId}/${pageNo || 1}/${article._id}`}
           style="cursor: pointer; font-size: 1.1em"
           class="link-underline link-underline-opacity-0 link-offset-2 link-underline-opacity-50-hover stretched-link">
          {article.title}
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
      <Col lg="2" md="2" xs="5" class="text-muted" style="font-size: small">
        {article.nickname}
      </Col>
      <Col lg="1" md="1" xs="1" class="text-muted text-end" style="font-size: small">{article.read}</Col>
      <Col lg="1" md="1" xs="2" class="text-muted text-end" style="font-size: small">
        {#if article.like > 0}
          <Icon name="hand-thumbs-up" class="text-success pe-1" />{article.like}
        {/if}
      </Col>
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
        ><PaginationLink first href="{`/board/${boardId}`}" data-sveltekit-preload-data="hover"/></PaginationItem
        >
        {#each Array((data.endNo - data.startNo +1)) as _, i}
          <PaginationItem
            active={(!data.pageNo && (data.startNo -i) === 1) || (i + data.startNo) == data.pageNo}
          >
            <PaginationLink href={`/board/${boardId}/${i + data.startNo}`}  data-sveltekit-preload-data="hover">
              {i + data.startNo}
            </PaginationLink>
          </PaginationItem>
        {/each}
        <PaginationItem
        ><PaginationLink href={`/board/${boardId}/${data.maxPage}`}  data-sveltekit-preload-data="hover"
                         last /></PaginationItem>
      </Pagination>
    </Col>
  </Row>
{/if}

{#if session?.user?.nickname}
  <Row class="px-0 mx-0 pe-3 pb-4 mt-2">
    <Col class="d-flex justify-content-end p-0">
      <Button class="px-2" color="primary" onclick={write}>
        <Icon name="pencil-fill" class="pe-2 " />글쓰기
      </Button>
    </Col>
  </Row>
{/if}

<style>
    a:visited{
        color: var(--bs-gray);
    }
</style>
