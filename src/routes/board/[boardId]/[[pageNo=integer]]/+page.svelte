<script>
    import {Badge, Button, Col, Icon, Pagination, PaginationItem, PaginationLink, Row, Table} from 'sveltestrap';
    import {page} from '$app/stores';
    import {goto} from '$app/navigation';

    import { formatDistanceToNowStrict, parseISO } from 'date-fns'
    import {ko} from "date-fns/locale";

    function write() {
		goto(`/board/${$page.params.boardId}/write`);
	}

	function read(articleId) {
		const pageNo = $page.params.pageNo || 1;
		goto(`/board/${$page.params.boardId}/${pageNo}/${articleId}`);
	}

	export let data;
</script>

<main class="container p-4 my-4">
	<Row class="p-3 shadow rounded-4">
		<Table hover striped>
			<caption class="d-none sr-only caption-top">게시판 목록</caption>
			<colgroup>
				<col style="width:60%" />
				<col />
				<col />
				<col />
				<col />
			</colgroup>
			<thead>
				<tr class="table-warning rounded-4">
					<th scope="col" class="text-center">제목</th>
					<th scope="col">작성자</th>
					<th scope="col">조회</th>
					<th scope="col">추천</th>
					<th scope="col">작성시각</th>
				</tr>
			</thead>
			<tbody>
				{#if !data.articles.length}
					<tr>
						<td colspan="5" style="height: 300px" class="fs-2 text-center align-middle">
							🤦🏻‍♀🤦🏾‍♂ 게시물이 없습니다. 뻘글 하나 쓰고 가세여 ㅜㅜ
						</td>
					</tr>
				{:else}
					{#each data.articles as article}
						<tr>
							<th
								scope="row"
								style="cursor:pointer"
								on:click={() => read(article._id)}
								class="text-break"
							>
								{article.title}
								{@html article.content}
								{#if article.comments?.length}
									<Badge color="primary" class="bg-opacity-50">{article.comments.length}</Badge>
								{/if}
							</th>
							<td class="text-muted">{article.nickname}</td>
							<td class="text-muted text-end">{article.read}</td>
							<td class="text-muted text-end"
								><Icon name="hand-thumbs-up" class="text-success pe-1" />{article.like}</td
							>
							<td class="text-muted">{formatDistanceToNowStrict(parseISO(article.createdAt), {locale: ko, addSuffix: true })}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</Table>
		<Row class="mt-3">
			<Col md="10">
				<Pagination size="md" arialabel="페이지 네이션" class="d-flex justify-content-center">
					<PaginationItem
						><PaginationLink first href={`/board/${$page.params.boardId}`} /></PaginationItem
					>
					{#each Array(data.maxPage) as _, i}
						<PaginationItem
							active={(!$page.params.pageNo && i === 0) || i + 1 == $page.params.pageNo}
						>
							<PaginationLink href={`/board/${$page.params.boardId}/${i + 1}`}>
								{i + 1}
							</PaginationLink>
						</PaginationItem>
					{/each}
					<PaginationItem
						><PaginationLink
							last
							href={`/board/${$page.params.boardId}/${data.maxPage}`}
						/></PaginationItem
					>
				</Pagination>
			</Col>
			{#if $page.data.session?.user.nickname}
				<Col md="2" class="text-end">
					<Button color="primary" on:click={write}
						><Icon name="pencil-fill" class="pe-2" />글쓰기</Button
					>
				</Col>
			{/if}
		</Row>
	</Row>
</main>
