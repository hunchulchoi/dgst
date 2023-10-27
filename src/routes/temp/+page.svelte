<script>

import { page } from "$app/stores";
import { Col, Pagination, PaginationItem, PaginationLink, Row } from "sveltestrap";
import { Article } from "$lib/models/article.js";

const total = 260;
const pageUnit = 30;

const pageNo = 2;


const maxPage = parseInt(total / pageUnit + ((total % pageUnit)?1:0));

//
if (maxPage < pageNo) {
  pageNo = maxPage;
}

let startNo = 1;
let endNo = maxPage>7?7:maxPage;

if(maxPage > 7) {
  if((pageNo - 3) > 0){
    startNo = pageNo - 3;
    endNo = startNo + 6;
  }

  if((pageNo +3) > maxPage){
    endNo = maxPage;
    startNo = endNo - 6;
  }

}
</script>

<Row class="mt-3 mx-0">
	<Col xs="12">
		<Pagination size="md" arialabel="페이지 네이션" class="d-flex justify-content-center">
			<PaginationItem
			><PaginationLink first href={`/board/${$page.params.boardId}`} /></PaginationItem
			>
			{#each Array((data.endNo - data.startNo +1)) as _, i}
				<PaginationItem
					active={(!$page.params.pageNo && (data.startNo -i) === 1) || (i + data.startNo) == $page.params.pageNo}
				>
					<PaginationLink href={`/board/${$page.params.boardId}/${i + data.startNo}`}>
						{i + data.startNo}
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
</Row>