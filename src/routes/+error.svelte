<script>
    import { Card, CardBody, CardHeader, CardText, Image } from 'sveltestrap';

    import { page } from '$app/stores';

    console.log('page', $page)
</script>

<Card class="m-5 shadow rounded-4" style="max-width: 500px">
    <CardHeader class="text-bg-danger bg-opacity-10"><h3>Ooooops!-{$page.status}</h3></CardHeader>
    <Image src="/logo/twitter_header_photo_2.png" alt="데게실버타운 로고"/>
    <CardBody>
        <CardText class="p-2">
            에러가 발생하였습니다.
            <div class="fs-3">{$page.status}</div>
            <div class="fs-4">{$page.error.message}</div>
            소스 작업 하는 중일 수 있습니다. 새로고침을 해보세요
        </CardText>
    </CardBody>
</Card>
