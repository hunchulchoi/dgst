<script>

import { page } from "$app/stores";
import { Col, Pagination, PaginationItem, PaginationLink, Row } from "sveltestrap";

const total = 260;
const pageUnit = 30;

let pageNo = 8;


const maxPage = parseInt(total / pageUnit + ((total % pageUnit)?1:0));

//
if (maxPage < pageNo) {
  pageNo = maxPage;
}

let startNo = 1;
let endNo = maxPage>7?7:maxPage;

console.log(1, 'maxPage', maxPage, 'pageNo', pageNo, 'startNo', startNo, 'endNo', endNo)

if(maxPage > 7) {
  if((pageNo - 3) > 0){
    startNo = pageNo - 3;
    endNo = startNo + 6;
  }

  console.log(2, 'maxPage', maxPage, 'pageNo', pageNo, 'startNo', startNo, 'endNo', endNo)

  if((pageNo +3) > maxPage){
    endNo = maxPage;
    startNo = endNo - 6;
  }

  console.log(3, 'maxPage', maxPage, 'pageNo', pageNo, 'startNo', startNo, 'endNo', endNo)

}

console.log(4, 'maxPage', maxPage, 'pageNo', pageNo, 'startNo', startNo, 'endNo', endNo)

const  data = {maxPage, pageNo, startNo, endNo}
</script>

<Row class="mt-3 mx-0">
  <div class="text-center my-5 fs-3">
    maxPage:{data.maxPage}, pageNo:{data.pageNo}, startNo:{data.startNo}, endNo:{data.endNo}
  </div>

	<Col xs="12">
		<Pagination size="md" arialabel="페이지 네이션" class="d-flex justify-content-center">
			<PaginationItem
			><PaginationLink first href={`/board/${$page.params.boardId}`} /></PaginationItem
			>
			{#each Array((data.endNo - data.startNo +1)) as _, i}
				<PaginationItem
					active={(!data.pageNo && (data.startNo -i) === 1) || (i + data.startNo) == data.pageNo}
				>
					<PaginationLink href={`/board/${$page.params.boardId}/${i + data.startNo}`}>
            {i}, {i + data.startNo}
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
