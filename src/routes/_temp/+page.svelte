<script>
  import {Button, Modal, ModalBody, ModalFooter, ModalHeader} from "@sveltestrap/sveltestrap";

  let open11 = true;
  const toggle11 = () => (open11 = !open11);
</script>
<div style="height: 70vh">
  <Button color="danger" on:click={toggle11}>Open Modal</Button>
  <Modal isOpen={open11} toggle={toggle11} zIndex="20000" centered backdrop="static">
    <ModalHeader toggle={toggle11} >Modal title</ModalHeader>
    <ModalBody>
      Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod
      tempor incididunt ut labore et dolore magna aliqua.
    </ModalBody>
    <ModalFooter>
      <Button color="primary" on:click={toggle11}>Do Something</Button>
      <Button color="secondary" on:click={toggle11}>Cancel</Button>
    </ModalFooter>
  </Modal>
</div>
