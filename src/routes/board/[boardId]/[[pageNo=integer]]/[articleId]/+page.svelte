<script>
    import {
        Badge,
        Button,
        Card,
        CardBody,
        CardSubtitle,
        CardText,
        Col,
        Icon,
        Image,
        Input,
        InputGroup,
        InputGroupText,
        Row,
        Spinner
    } from "sveltestrap";
    import {page} from "$app/stores";
    import {goto} from "$app/navigation";

    import { formatDistanceToNowStrict, parseISO, formatISO9075 } from 'date-fns'
    import {ko} from "date-fns/locale";

    import {blobToWebP, srcToWebP} from "webp-converter-browser";

    import Loader from 'svelte-loading-overlay/Loader.svelte';

    function comments() {
        fetch(`/board/${$page.params.boardId}/${$page.params.articleId}/comment`)
            .then((res) => res.json())
            .then((d) => (commentData = d));
    }

    function list() {
        const pageNo = $page.params.pageNo || 1;

        goto(`/board/${$page.params.boardId}/${pageNo}`);
    }

    async function preview(event) {
        previewEl.src = window.URL.createObjectURL(event.target.files[0]);

        console.log(event.target.files[0]);

        previewEl.onload = async (evt) => {

            commentLoading = true;

            if (event.target.files[0].name.toLowerCase().endsWith(".gif")) {
                commentImage = event.target.files[0];
            } else {
                const _width = previewEl.naturalWidth;

                if (_width > 1400) {

                    const webp = await blobToWebP(event.target.files[0], {width: 1000});

                    console.debug("webp", webp);

                    commentImage = new File([webp], event.target.files[0].name);

                    console.log("webpBlob", commentImage);
                } else {
                    commentImage = event.target.files[0];
                }
            }

            previewEl.style.height = "80px";
            previewEl.classList.remove("d-none");

            commentLoading = false;
        };
    }

    let commentDiv;
    let commentContent;
    let commentImage;
    let previewEl;
    let commentImageEl;
    let commentImageElFiles;

    let commentLoading = false;

    function comment() {
        if (!commentContent) {
            alert("내용을 입력하세요");
            return;
        }
        if (commentContent.replace(" ", "").length < 3) {
            alert("코멘트 내용이 너무 짧습니다.");
            return;
        }

        commentLoading = true;

        const formData = new FormData();

        formData.append("content", commentContent);
        if (commentImage) formData.append("image", commentImage);

        fetch(`/board/${$page.params.boardId}/${$page.params.articleId}/comment`, {
            method: "POST",
            body: formData
        })
            .then(async (res) => {
                console.debug("res", res);

                if (res.status !== 201) {
                    const {message} = await res.json();
                    alert(message);
                    return;
                }

                commentContent = "";
                commentImage = "";
                commentImageEl.value = '';
                previewEl.src = "";
                previewEl.classList.add("d-none");

                comments();
            })
            .catch((error) => {
                console.error(error);
                alert(error.message ?? "저장 중 오류가 발생했습니다.");
            }).finally(()=> commentLoading = false);
    }

    function deleteComment(commentId) {
        if (!confirm("삭제 하시겠습니까?")) return false;

        fetch(`/board/${$page.params.boardId}/${$page.params.articleId}/comment`, {
            method: "DELETE",
            body: JSON.stringify({commentId})
        })
            .then(async (res) => {
                if (res.status !== 200) {
                    const {message} = await res.json();
                    alert(message);
                    return;
                }

                comments();
            })
            .catch((err) => {
                console.error(err);
                alert(err.message ?? "삭제 중 오류가 발생했습니다.");
            });
    }

    function remove(articleId) {
        if (!confirm("삭제 하시겠습니까?")) return false;

        fetch(`/board/${$page.params.boardId}/${$page.params.articleId}`, {
            method: "DELETE",
            body: JSON.stringify({articleId})
        })
            .then(async (res) => {
                if (res.status !== 200) {
                    const {message} = await res.json();
                    alert(message);
                    return;
                }

                list();
            })
            .catch((err) => {
                console.error(err);
                alert(err.message ?? "삭제 중 오류가 발생했습니다.");
            });
    }

    function edit(articleId) {
        goto(`/board/${$page.params.boardId}/write/${articleId}`);
    }

    function write() {
        goto(`/board/${$page.params.boardId}/write`);
    }

    export let data;

    $: commentData = data.article.comments;

</script>

<svelte:head>
    <style>
        .image img {
            max-width: 100% !important;
        }
    </style>
</svelte:head>

<main class="container my-5">
    <Row class="mt-4 shadow rounded-4 p-4">
        <h5>{data.article.title}</h5>
        <Row class="border-bottom border-secondary-subtle pt-2">
            <Col md="6"
            >{data.article.nickname}
                <span class="text-muted">{formatISO9075(parseISO(data.article.createdAt))}</span></Col
            >
            <Col class="text-end text-muted" md="6">
                <Icon class="pe-1" name="eye"/>{data.article.read}
                <Icon class="text-success pe-1" name="hand-thumbs-up"/>{data.article.like}</Col
            >
        </Row>
        <Row class="p-3">
            <CardText style="max-width: 100%;">
                {@html data.article.content}
            </CardText>
        </Row>
        <Row class="p-3">
            <!--프로필-->
            <Card class="p-2">
                <Row>
                    <Col class="d-flex align-items-center" xs="auto">
                        <Image
                                alt="프로필 사진"
                                class="card-img-left rounded-2"
                                height="100"
                                src={data.photo}
                                thumbnail
                                width="100"
                        />
                    </Col>
                    <Col md="9" xs="8">
                        <CardBody>
                            <CardSubtitle>{data.article.nickname}</CardSubtitle>
                            <CardText class="text-muted pt-2">
                                {data.introduction}
                            </CardText>
                        </CardBody>
                    </Col>
                </Row>
            </Card>
        </Row>
        <Row>
            <!--버튼-->
            <Col class="text-end pe-3">
                {#if data.article.email === $page.data.session?.user.email}
                <Button color="danger" on:click={() => remove(data.article._id)} outline>
                    <Icon name="trash"/>
                    삭제
                </Button>
                <Button color="success" on:click={() => edit(data.article._id)} outline>
                    <Icon name="pencil"/>
                    수정
                </Button>
                {/if}
                <Button color="primary" on:click={write} outline>
                    <Icon name="pencil-fill"/>
                    글쓰기
                </Button>
                <Button color="secondary" on:click={list} outline>
                    <Icon name="list"/>
                    목록
                </Button>
            </Col>
        </Row>
        <Row class="my-3 bg-warning-subtle p-3 rounded-3 mb-4">
            <!--리플-->
            <Col>
                <Icon name="chat"/>
                의견남기기
                <Badge color="primary">{commentData.length}</Badge>
            </Col>
            <Col class="text-end">
                <Button class="fw-bolder py-0" on:click={comments} outline>
                    <Icon name="arrow-repeat"/>
                </Button>
            </Col>
        </Row>

        <Row class="mb-5">
            {#if $page.data.session?.user.nickname}
                <div class="border p-4 rounded-4 shadow-sm" bind:this={commentDiv}>
                    <Loader
                            bind:active={commentLoading}
                            container={commentDiv}
                            component="Dot"
                            opacity="0.7"
                    />
                    <InputGroup class="mb-2">
                        <InputGroupText class="text-success">
                            <Icon name="card-image" class="pe-2"/>
                            짤 첨부
                        </InputGroupText>
                        <input
                                type="file"
                                bind:this={commentImageEl}
                                on:change={preview}
                                muliple="false"
                                accept="image/*"
                                class="form-control m-2"
                        />
                    </InputGroup>
                    <InputGroup>
                        <img
                                class="img-thumbnail d-none me-2"
                                bind:this={previewEl}
                                alt="리플 이미지 첨부 미리보기"
                        />
                        <Input
                                type="textarea"
                                bind:value={commentContent}
                                class="border border-gray"
                                style="max-width: 600px"
                        />
                        <Button color="primary" outline on:click={comment}>
                            <Icon name="pencil-fill"/>
                            등록
                            <Spinner color="success" size="sm" class="d-none"/>
                        </Button>
                    </InputGroup>
                </div>
            {/if}

            {#each commentData as comment}
                <Row class="p-4 border-bottom border-gray-subtle">
                    <Col xs="auto">
                        <Image thumbnail src={comment.photo} style="height:50px" rounded/>
                    </Col>
                    <Col xs="auto" clsss="border-end">
                        {comment.nickname}<br/>
                        <span class="text-muted" style="font-size: smaller"
                        >{formatDistanceToNowStrict(parseISO(comment.createdAt), {locale: ko, addSuffix: true })}</span
                        >
                    </Col>
                    <Col>
                        <Row>
                            <Col>
                                {#if comment.image}
                                    <Row class="pb-3">
                                        <Col>
                                            <Image src={comment.image} alt="리플 짤" style="max-width: 80%;"/>
                                        </Col>
                                    </Row>
                                {/if}
                                {comment.content}
                            </Col>
                        </Row>

                        {#if comment.email === $page.data.session?.user.email}
                            <Row>
                                <Col class="text-end pe-2">
                                    <Button
                                            on:click={() => deleteComment(comment._id)}
                                            size="sm"
                                            outline
                                            color="danger"
                                    >
                                        <Icon name="trash"/>
                                        삭제
                                    </Button>
                                    <Button size="sm" outline color="primary" class="d-none">
                                        <Icon name="pencil"/>
                                        수정
                                    </Button>
                                </Col>
                            </Row>
                        {/if}
                    </Col>
                </Row>
            {/each}
        </Row>
        <Row>
            <!--버튼-->
            <Col class="text-end pe-3">
                {#if data.article.email === $page.data.session?.user.email}
                    <Button color="danger" on:click={() => remove(data.article._id)} outline>
                        <Icon name="trash"/>
                        삭제
                    </Button>
                    <Button color="success" on:click={() => edit(data.article._id)} outline>
                        <Icon name="pencil"/>
                        수정
                    </Button>
                {/if}
                <Button color="primary" on:click={write} outline>
                    <Icon name="pencil-fill"/>
                    글쓰기
                </Button>
                <Button color="secondary" on:click={list} outline>
                    <Icon name="list"/>
                    목록
                </Button>
            </Col>
        </Row>
    </Row>
</main>

<style>
</style>
