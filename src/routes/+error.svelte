<script>
  import { Button, Card, CardBody, CardFooter, CardHeader, Icon } from '$lib/components/ui/index.js';

  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { reportClientPageError } from '$lib/util/reportClientPageError.js';

  // Svelte 5 Runes - page store 필요 (error page는 예외)

  // 404, 502 에러 시 자동으로 /board/free로 리다이렉트
  onMount(() => {
    if ($page.status >= 500) {
      reportClientPageError({
        status: $page.status,
        pathname: $page.url.pathname,
        message: $page.error?.message
      });
    }

    if ($page.status === 404 || $page.status === 502) {
      // 404 에러이고 경로에 admin이 포함된 경우 fmkorea로 리다이렉트
      if ($page.status === 404 && $page.url.pathname.includes('admin')) {
        window.location.href = 'https://www.fmkorea.com/best';
        return;
      }

      // 그 외의 경우 /board/free로 리다이렉트
      goto('/board/free');
    }
  });
</script>

<Card class="m-5 shadow rounded-4" style="max-width: 500px">
  <CardHeader class="text-bg-warning bg-opacity-25"><h3>Ooooops!-{$page.status}</h3></CardHeader>
  <img src="/logo/twitter_header_photo_2.png" alt="dgst.me 로고" />
  <CardBody>
    <div class="p-2">
      {#if $page.status === 500}에러가 발생하였습니다.{/if}
      <div class="fs-3">{$page.status}</div>
      <div class="fs-4">{$page.error?.message || '알 수 없는 오류'}</div>
      {#if $page.status === 500}소스 작업 하는 중일 수 있습니다. 새로고침을 해보세요{/if}
    </div>
  </CardBody>
  <CardFooter class="d-flex justify-content-end p-3">
    {#if $page.status === 500}
      <Button onclick={() => location.reload()} class="me-2"
        ><Icon name="arrow-repeat" class="pe-1" /> 새로고침</Button
      >
    {/if}
    <Button onclick={() => goto('/')} class="me-2"><Icon name="house" class="pe-1" /> Home</Button>
  </CardFooter>
</Card>
