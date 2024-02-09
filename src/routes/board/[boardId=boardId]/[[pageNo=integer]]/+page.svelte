<script>
  import {
    Badge,
    Button,
    Col,
    Icon,
    Image,
    Offcanvas,
    Pagination,
    PaginationItem,
    PaginationLink,
    Row
  } from 'sveltestrap';
    import {page} from '$app/stores';
    import {goto} from '$app/navigation';

    import {formatDistanceToNowStrict, parseISO} from 'date-fns';
    import ko from 'date-fns/locale/ko/index.js';
  import {alarmCount} from "$lib/util/store.js";

  import ccd from '$lib/shared/stores/ccd.js';

  function write() {
    goto(`/board/${$page.params.boardId}/write`);
  }

  function gopage(pageNo){
      goto(`/board/${$page.params.boardId}/${pageNo}?v=${new Date().getSeconds()}`
          , {invalidateAll: true});
  }


  export let data;

  alarmCount.update(alarmCount =>$page.data.alarmCount);
</script>

<svelte:window on:keydown|preventDefault={(evt)=>{
  console.log(evt.altKey, evt.key)
  if(evt.altKey && evt.key === 'W') write();
}}></svelte:window>


<main class="container my-md-2" style="min-height: 50vh">

  <Offcanvas isOpen={$ccd} header="🙇🏽 새해 복마니옹 받으세여 🙇🏻‍ - dgst"
             toggle={()=>ccd.set(false)}
             class="text-center bg-secondary"
             placement="top">
    <div class="neon">🌸<span class="text-danger">경)</span> 🎉진천의 아들 대기업🍾 취직🎊 <span class="text-danger">(축</span>🌼</div>

    <br>
    <h2 class="pt-5"></h2>
  </Offcanvas>

  <Row class="py-2 shadow rounded-4 mx-0">

    {#if $page.data.session?.user.nickname}
      <Row class="px-0 mx-0 pe-3 mt-2 pb-3 border-bottom border-secondary-subtle">
        <Col class="d-flex justify-content-end p-0">
          <Button class="px-2" color="primary" on:click={write}>
            <Icon name="pencil-fill" class="pe-2 " />글쓰기
          </Button>
        </Col>
      </Row>
    {/if}

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
               href={`/board/${$page.params.boardId}/${$page.params.pageNo || 1}/${article._id}`}
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
              ><PaginationLink first href="#top" on:click={()=>gopage(1)} /></PaginationItem
            >
            {#each Array((data.endNo - data.startNo +1)) as _, i}
              <PaginationItem
                active={(!data.pageNo && (data.startNo -i) === 1) || (i + data.startNo) == data.pageNo}
              >
                <PaginationLink href="#top" on:click={()=>gopage(i + data.startNo)}>
                  {i + data.startNo}
                </PaginationLink>
              </PaginationItem>
            {/each}
            <PaginationItem
              ><PaginationLink href="#top"
                last
                on:click={()=>gopage(data.maxPage)}
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
  .neon {
      font-family: 'ChosunGs';
      font-size: 2.2em;
      /*font-weight: 700;*/
      color: #fff;
      text-shadow: 0 0 0.1em rgba(0, 255, 255, 0.7);
      animation: neon-flicker 0.1s infinite alternate;
  }
  @keyframes neon-flicker {
      0% {
          text-shadow:
                  0 0 10px rgba(0, 255, 255, 0.7),
                  0 0 20px rgba(0, 255, 255, 0.7),
                  0 0 30px rgba(0, 255, 255, 0.7);
      }
      100% {
          text-shadow:
                  0 0 20px rgba(0, 255, 255, 0.7),
                  0 0 30px rgba(0, 255, 255, 0.7),
                  0 0 40px rgba(0, 255, 255, 0.7);
      }
  }

  @font-face {
      font-family: 'ChosunGs';
      src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@1.0/ChosunGs.woff') format('woff');
      font-weight: normal;
      font-style: normal;
  }

</style>
