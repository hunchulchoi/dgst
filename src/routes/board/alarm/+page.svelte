<script>
  import {Badge, Col, Row} from "sveltestrap";
  import {formatDistanceToNowStrict, parseISO} from "date-fns";
  import ko from "date-fns/locale/ko/index.js";

  export let data;
</script>

<main class="container my-md-2" style="min-height: 60vh">
  <Row class="p-2 shadow rounded-4">

    {#if !data.alarms?.length }
      <Row class="mt-2">
        <Col style="height: 300px" class="fs-2 text-center align-middle">
          <div>🤦🏻‍♀🤦🏾‍♂ 딱히 알려 드릴게 없네유.</div>
          <div>그런 날도 있는거져 ㅜㅜ</div>
        </Col>
      </Row>
    {:else}
      {#each data.alarms as alarm}
        <Row class="py-2 border-bottom border-secondary-subtle m-0">
          <Col lg="7" md="5" xs="12"
               class="text-break link-opacity-hover-50 pb-1">
            <a data-sveltekit-preload-data="tap"
               href={`/board/${alarm.boardId}/${alarm.articleId}`}
               style="cursor: pointer; font-size: 1.1em"
               class="link-underline link-underline-opacity-0 link-offset-2 link-underline-opacity-50-hover">
              {alarm.title}
              <Badge color="danger" class="bg-opacity-50">{alarm.commentCount}</Badge>
            </a>
          </Col>
          <Col lg="1" md="2" xs="4" class="text-muted text-end" style="font-size: small"
          >{formatDistanceToNowStrict(parseISO(alarm.updatedAt), {
            locale: ko,
            addSuffix: true
          })}</Col
          >
        </Row>
      {/each}
    {/if}
  </Row>
</main>
