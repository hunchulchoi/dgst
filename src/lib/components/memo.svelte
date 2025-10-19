<script>
  import {
    Button, Col,
    Input,
    InputGroup,
    InputGroupText,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader, Row,
    Tooltip
  } from '@sveltestrap/sveltestrap';

  let memoModalOpen = false;
  const memoModalToggle = (evt) => {
    (memoModalOpen = !memoModalOpen);
  }
</script>

<div>
  <Button color="danger" on:click={memoModalToggle}>Open Modal</Button>
  <Modal isOpen={memoModalOpen} toggle={memoModalToggle}>
    <ModalHeader toggle={memoModalToggle}>메모</ModalHeader>
    <ModalBody>
      <Row>
        <InputGroup>
          <InputGroupText>
            <Input type="color" id="memoColor" placeholder="메모의 색상을 선택하세요"/>
            <Tooltip target="memoColor">메모를 표시할 색상을 선택하세요</Tooltip>
          </InputGroupText>
          <Input id="memoContent" placeholder="메모를 입력하세요" autofocus/>
        </InputGroup>
      </Row>
      <Row class="mt-3">
        <Col class="d-flex justify-content-center">
          <Input type="switch" label="이 회원을 차단" bsSize="lg"/>
        </Col>
      </Row>
    </ModalBody>
    <ModalFooter>
      <Button color="secondary" on:click={memoModalToggle}>닫기</Button>
      <Button color="primary" on:click={memoModalToggle}>저장</Button>
    </ModalFooter>
  </Modal>
</div>
