<script>
  import { Button, Card, CardBody, CardFooter, CardHeader, CardText, Icon, Image } from '@sveltestrap/sveltestrap';

  import { goto } from '$app/navigation';
  
  // Svelte 5 Runes
  let { status, error } = $props();
</script>

<Card class="m-5 shadow rounded-4" style="max-width: 500px">
    <CardHeader class="text-bg-warning bg-opacity-25"><h3>Ooooops!-{status}</h3></CardHeader>
    <Image src="/logo/twitter_header_photo_2.png" alt="데게실버타운 로고"/>
    <CardBody>
        <CardText class="p-2">
          {#if status===500}에러가 발생하였습니다.{/if}
            <div class="fs-3">{status}</div>
            <div class="fs-4">{error.message}</div>
          {#if status===500}소스 작업 하는 중일 수 있습니다. 새로고침을 해보세요{/if}
        </CardText>
    </CardBody>
    <CardFooter class="d-flex justify-content-end p-3">
      {#if status===500}
      <Button onclick={()=>location.reload()} class="me-2"><Icon name="arrow-repeat" class="pe-1"/> 새로고침</Button>
      {/if}
      <Button onclick={()=>goto('/')} class="me-2"><Icon name="house" class="pe-1"/> Home</Button>
    </CardFooter>
</Card>
