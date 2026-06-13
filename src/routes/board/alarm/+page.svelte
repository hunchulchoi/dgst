<script>
  import { Badge, Col, Icon, Row } from '$lib/components/ui/index.js';
  import { resolve } from '$app/paths';
  import { ko } from 'date-fns/locale';
  import { formatRelativeTime } from '$lib/util/formatRelativeTime.js';
  import { alarmCount } from '$lib/util/store.js';

  // Svelte 5 Runes
  let { data } = $props();

  $effect(() => {
    const unread = (data.alarms ?? []).filter((a) => !a.readAt).length;
    alarmCount.set(unread);
  });
</script>

<main class="container board-chrome-connect mt-0 mb-md-2" style="min-height: 60vh">
  <Row class="board-panel py-2 mx-0">
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
      {#each data.alarms as alarm, index (alarm._id ?? alarm.id)}
        <Row
          class="py-2 max-md:!py-3 border-bottom border-secondary-subtle m-0 {index % 2 === 1
            ? 'bg-secondary bg-opacity-25'
            : ''}"
        >
          {#if alarm.comment}
            <Col
              xl="7"
              lg="7"
              md="5"
              sm="12"
              xs="9"
              class="text-break link-opacity-hover-50 pb-1 px-0 position-relative"
            >
              {@const commentIds = Array.isArray(alarm.comments) ? alarm.comments : []}
              {@const commentId =
                alarm.comment || (commentIds.length > 0 ? commentIds[commentIds.length - 1] : '')}
              <a
                data-sveltekit-preload-data="tap"
                data-sveltekit-invalidate="all"
                href={resolve(
                  alarm.boardId === 'slot'
                    ? commentId
                      ? `/games/slot?cmt=${commentId}`
                      : `/games/slot`
                    : `/board/${alarm.boardId}/${alarm.articleId}?a=cmt${alarm.comment}`
                )}
                class="alarm-list-link link-underline link-underline-opacity-0 link-offset-2 link-underline-opacity-50-hover stretched-link"
              >
                {#if alarm.readAt}
                  <span class="alarm-list-title text-muted">
                    <Icon name="chat-square-dots" class="text-info" />
                    <em>{alarm.commentContent}</em>
                    <Badge color="secondary">{alarm.commentCount}</Badge>
                  </span>
                {:else}
                  <span class="alarm-list-title">
                    <Icon name="chat-square-dots" class="text-info" />
                    {alarm.commentContent}
                    <Badge color="danger" class="bg-opacity-50">{alarm.commentCount}</Badge>
                  </span>
                {/if}
              </a>
            </Col>
            <Col
              xl="1"
              lg="1"
              md="2"
              sm="12"
              xs="3"
              class="alarm-list-meta max-md:pt-1 text-muted text-end px-0"
              >{formatRelativeTime(alarm.updatedAt, {
                locale: ko,
                addSuffix: true
              })}</Col
            >
          {:else}
            <Col
              xl="7"
              lg="7"
              md="5"
              sm="12"
              xs="8"
              class="text-break link-opacity-hover-50 pb-1 position-relative"
            >
              {@const commentIdsForGeneral = Array.isArray(alarm.comments) ? alarm.comments : []}
              {@const commentIdForGeneral =
                commentIdsForGeneral.length > 0
                  ? commentIdsForGeneral[commentIdsForGeneral.length - 1]
                  : ''}
              <a
                data-sveltekit-preload-data="tap"
                data-sveltekit-invalidate="all"
                href={resolve(
                  alarm.boardId === 'slot'
                    ? commentIdForGeneral
                      ? `/games/slot?cmt=${commentIdForGeneral}`
                      : `/games/slot`
                    : `/board/${alarm.boardId}/${alarm.articleId}`
                )}
                class="alarm-list-link link-underline link-underline-opacity-0 link-offset-2 link-underline-opacity-50-hover stretched-link"
              >
                {#if alarm.readAt}
                  <span class="alarm-list-title text-muted d-inline-block">
                    <em>
                      {alarm.title}
                      <Badge color="secondary">{alarm.commentCount}</Badge>
                    </em>
                  </span>
                {:else}
                  <span class="alarm-list-title">
                    {alarm.title}
                    <Badge color="danger" class="bg-opacity-50">{alarm.commentCount}</Badge>
                  </span>
                {/if}
              </a>
            </Col>
            <Col
              xl="1"
              lg="1"
              md="2"
              sm="12"
              xs="4"
              class="alarm-list-meta max-md:pt-1 text-muted text-end"
              >{formatRelativeTime(alarm.updatedAt, {
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

<style>
  .alarm-list-link {
    cursor: pointer;
    color: var(--bs-body-color) !important;
  }

  .alarm-list-link:hover {
    color: var(--bs-link-hover-color) !important;
  }

  .alarm-list-link:visited {
    color: var(--bs-secondary-color) !important;
  }

  /* Bootstrap 전역 16px !important — 목록과 동일 타이포 */
  .alarm-list-title {
    font-size: 1.3rem !important;
    line-height: 1.45 !important;
    font-weight: 500 !important;
  }

  @media (max-width: 767.98px) {
    .alarm-list-title {
      font-size: 1.4rem !important;
    }
  }

  .alarm-list-title :global(em) {
    font-size: inherit !important;
    line-height: inherit !important;
  }

  :global(.alarm-list-meta) {
    font-size: 1.05rem !important;
    line-height: 1.35 !important;
  }
</style>
