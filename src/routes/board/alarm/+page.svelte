<script>
  import { Badge, Col, Icon, Row } from '@sveltestrap/sveltestrap';
  import { formatDistanceToNowStrict, parseISO } from 'date-fns';
  import { ko } from 'date-fns/locale';
  import { alarmCount } from '$lib/util/store.js';

  // Svelte 5 Runes
  let { data } = $props();

  alarmCount.update((alarmCount) => Array.from(data.alarms)?.filter((a) => !a.readAt).length);
</script>

<main class="container my-md-2" style="min-height: 60vh">
  <Row class="py-2 shadow rounded-4 mx-0">
    {#if !data.alarms?.length}
      <Row class="mt-2 mx-0">
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
            <div>🤦🏻‍♀🤦🏾‍♂ 딱히 알려 드릴게 없네유.</div>
            <div>그런 날도 있는거져 ㅜㅜ</div>
          </Col>
        </Row>
      </Row>
    {:else}
      {#each data.alarms as alarm, index}
        <Row
          class="py-2 border-bottom border-secondary-subtle m-0 {index % 2 === 1
            ? 'bg-secondary bg-opacity-25'
            : ''}"
        >
          {#if alarm.comment}
            <Col
              lg="7"
              md="5"
              xs="9"
              class="text-break link-opacity-hover-50 pb-1 px-0 position-relative"
            >
              {@const commentId =
                alarm.comment ||
                (alarm.comments && alarm.comments.length > 0
                  ? alarm.comments[alarm.comments.length - 1]
                  : '')}
              <a
                data-sveltekit-preload-data="tap"
                data-sveltekit-invalidate="all"
                href={alarm.boardId === 'slot'
                  ? commentId
                    ? `/games/slot?cmt=${commentId}`
                    : `/games/slot`
                  : `/board/${alarm.boardId}/${alarm.articleId}?a=cmt${alarm.comment}`}
                style="cursor: pointer; font-size: 1.1em"
                class="link-underline link-underline-opacity-0 link-offset-2 link-underline-opacity-50-hover stretched-link"
              >
                {#if alarm.readAt}
                  <span class="text-muted">
                    <Icon name="chat-square-dots" class="text-info" />
                    <em>{alarm.commentContent}</em>
                    <Badge color="secondary">{alarm.commentCount}</Badge>
                  </span>
                {:else}
                  <Icon name="chat-square-dots" class="text-info" />
                  {alarm.commentContent}
                  <Badge color="danger" class="bg-opacity-50">{alarm.commentCount}</Badge>
                {/if}
              </a>
            </Col>
            <Col lg="1" md="2" xs="3" class="text-muted text-end px-0" style="font-size: small"
              >{formatDistanceToNowStrict(parseISO(alarm.updatedAt), {
                locale: ko,
                addSuffix: true
              })}</Col
            >
          {:else}
            <Col
              lg="7"
              md="5"
              xs="8"
              class="text-break link-opacity-hover-50 pb-1 position-relative"
            >
              {@const commentIdForGeneral =
                alarm.comments && alarm.comments.length > 0
                  ? alarm.comments[alarm.comments.length - 1]
                  : ''}
              <a
                data-sveltekit-preload-data="tap"
                data-sveltekit-invalidate="all"
                href={alarm.boardId === 'slot'
                  ? commentIdForGeneral
                    ? `/games/slot?cmt=${commentIdForGeneral}`
                    : `/games/slot`
                  : `/board/${alarm.boardId}/${alarm.articleId}`}
                style="cursor: pointer; font-size: 1.1em"
                class="link-underline link-underline-opacity-0 link-offset-2 link-underline-opacity-50-hover stretched-link"
              >
                {#if alarm.readAt}
                  <span class="text-muted d-inline-block"
                    ><em>
                      {alarm.title}
                      <Badge color="secondary">{alarm.commentCount}</Badge>
                    </em></span
                  >
                {:else}
                  {alarm.title}
                  <Badge color="danger" class="bg-opacity-50">{alarm.commentCount}</Badge>
                {/if}
              </a>
            </Col>
            <Col lg="1" md="2" xs="4" class="text-muted text-end" style="font-size: small"
              >{formatDistanceToNowStrict(parseISO(alarm.updatedAt), {
                locale: ko,
                addSuffix: true
              })}</Col
            >
          {/if}
        </Row>
      {/each}
    {/if}
  </Row>
</main>
