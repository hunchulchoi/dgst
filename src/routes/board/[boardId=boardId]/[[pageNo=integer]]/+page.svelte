<script>
  import { Button, Col, Icon, Row } from '@sveltestrap/sveltestrap';
  import { page } from '$app/stores';

  import BoardList from '$lib/components/board_list.svelte';

  import { alarmCount } from '$lib/util/store.js';
  import { goto } from '$app/navigation';

  import { onMount } from 'svelte';

  // 도메인 변경 안내
  onMount(() => {
    const host = window.location.hostname;

    if (host === 'dgst.site' || host === 'www.dgst.site') {
      Swal.fire({
        title: '도메인 변경 안내',
        html: `dgst.site에서 <mark>dgst.me</mark>로 변경 되었습니다.
<div class="m-2"><strong class="text-danger">dgst.me</strong>로 이동합니다.</div>`,
        icon: 'info',
        confirmButtonText: '확인',
      }).then(() => {
        goto('https://www.dgst.me');
      });
    }
  });


  function write() {
    goto(`/board/${$page.params.boardId}/write`);
  }

  /**
   * page 이동
   * @param pageNo {number}
   */
  function gopage(pageNo){
    goto(`/board/${$page.params.boardId}/${pageNo}?v=${new Date().getSeconds()}`
      , {invalidateAll: true});
  }

  export let data;

  alarmCount.update(alarmCount =>$page.data.alarmCount);
</script>


<main class="container my-md-2" style="min-height: 50vh">


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

    <BoardList {data} {gopage} {write}/>

  </Row>
</main>
