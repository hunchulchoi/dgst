<script>
  import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@sveltestrap/sveltestrap';
  import { blobToWebP } from 'webp-converter-browser';

  let commentImage;
  let previewEl;

  async function preview(event, el) {
    if (event.type == 'paste') {
      console.log('event', event);
      console.log('event.clipboardData', event.clipboardData);
      console.log('event.clipboardData.files', event.clipboardData.files);
      console.log('event.clipboardData.files[0]', event.clipboardData.files[0]);
      console.log('event.clipboardData.files[0].type', event.clipboardData.files[0].type);

      if (
        event.clipboardData.files?.length &&
        event.clipboardData.files[0].type.startsWith('image')
      ) {
        commentImage = event.clipboardData.files[0];

        event.preventDefault();
      } else return;
    } else commentImage = event.target.files[0];

    el.src = window.URL.createObjectURL(commentImage);

    el.onload = async (evt) => {
      //console.log('commentImage.type', commentImage.type)

      if (!commentImage.type.endsWith('gif') && !commentImage.type.endsWith('webp')) {
        const webp = await blobToWebP(commentImage, { width: 1400 });
        commentImage = new File([webp], commentImage.name);
      }

      el.style.maxHeight = '50vh';
      el.classList.remove('d-none');
    };
  }

  let open11 = true;
  const toggle11 = () => (open11 = !open11);
</script>

<div style="height: 70vh">
  <!-- <Button color="danger" onclick={toggle11}>Open Modal</Button> -->
  <Modal isOpen={open11} toggle={toggle11} zIndex="20000" centered backdrop="static">
    <ModalHeader toggle={toggle11}>Modal title</ModalHeader>
    <ModalBody>
      Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut
      labore et dolore magna aliqua.
    </ModalBody>
    <ModalFooter>
      <Button color="primary" onclick={toggle11}>Do Something</Button>
      <Button color="secondary" onclick={toggle11}>Cancel</Button>
    </ModalFooter>
  </Modal>

  <div>
    <img
      src=""
      class="d-none"
      bind:this={previewEl}
      alt="리플 이미지 첨부 미리보기"
      style="max-width: 100%"
    />
  </div>

  <textarea
    on:paste={(evt) => preview(evt, previewEl)}
    class="form-control border border-gray rounded-start-3"
    rows="3"
  />
</div>
