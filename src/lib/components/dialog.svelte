<script>
  import {Button, Col, Icon, Row} from '@sveltestrap/sveltestrap';

  export let dialog
</script>
<dialog bind:this={dialog} class="p-4 pb-3 px-5 rounded-3 shadow border-secondary" on:close>
  <Row>
    <Col>
      <slot/>
    </Col>
  </Row>
  <Row class="mt-3">
    <Col>
      <Button color="success" class="me-2" on:click={()=>dialog.close(true)}><Icon name="check-circle" class="pe-1"/> 예
      </Button>
      <Button color="secondary" on:click={()=>dialog.close(false)}><Icon name="x-circle" class="pe-1"/> 아니오</Button>
    </Col>
  </Row>
</dialog>
