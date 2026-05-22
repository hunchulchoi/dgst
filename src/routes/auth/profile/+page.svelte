<script>
  import 'cropperjs/dist/cropper.css';
  import Cropper from 'cropperjs';
  import {
    Button,
    Card,
    CardBody,
    CardFooter,
    CardHeader,
    CardSubtitle,
    CardText,
    Col,
    Form,
    FormGroup,
    Icon,
    Input,
    InputGroup,
    InputGroupText,
    Row,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader
  } from '$lib/components/ui/index.js';

  import { PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY } from '$env/static/public';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import imageCompression from 'browser-image-compression';
  import { swalFire } from '$lib/util/swal.js';
  import { isNicknameAllowed } from '$lib/util/nickname.js';

  // Svelte 5 Runes
  let { data } = $props();

  // 클라이언트에서만 세션 체크 및 리다이렉트
  $effect(() => {
    if (browser && !data.session) {
      goto('/', { replaceState: true });
    }
  });

  /** @returns {Promise<string>} */
  async function getRecaptchaToken() {
    return new Promise((resolve, reject) => {
      grecaptcha.ready(() => {
        grecaptcha
          .execute(PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY, { action: 'register' })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  // Cropper 상태
  let cropperOpen = $state(false);
  let cropperImageSrc = $state('');
  let cropper;
  let originalFile = $state(null);
  let croppedFile = $state(null); // 크롭된 파일
  let serverCropData = $state(null); // 움짤용 크롭 파라미터
  let previewSrc = $state(data.profile.photo || '/icons/unknown-person-icon-4.jpg');

  /**
   * 파일 업로드시 미리보기 및 크롭 모달 띄우기
   * @param fileEl {Input} 파일인풋
   */
  function preview(fileEl) {
    const file = fileEl.files[0];
    if (file) {
      originalFile = file;
      cropperImageSrc = window.URL.createObjectURL(file);
      cropperOpen = true;
    }
  }

  // 모달 켜진 후 크로퍼 초기화
  function initCropper(node) {
    if (cropper) cropper.destroy();
    cropper = new Cropper(node, {
      aspectRatio: 1, // 1:1 비율 고정
      viewMode: 1,
      minCropBoxWidth: 100, // 화면 표기상 최소 크기
      minCropBoxHeight: 100,
      background: false,
      crop(event) {
        // 실제 이미지 데이터 기준으로 최소 100x100을 보장
        const imgData = cropper.getImageData();
        const minW = Math.min(100, Math.round(imgData.naturalWidth));
        const minH = Math.min(100, Math.round(imgData.naturalHeight));
        const { width, height } = event.detail;

        if (Math.round(width) < minW || Math.round(height) < minH) {
          cropper.setData({
            width: Math.max(width, minW),
            height: Math.max(height, minH)
          });
        }
      }
    });
    return {
      destroy() {
        if (cropper) {
          cropper.destroy();
          cropper = null;
        }
      }
    };
  }

  // 크롭 적용
  function applyCrop() {
    if (!cropper || !originalFile) return;

    if (originalFile.type === 'image/gif' || originalFile.type === 'image/webp') {
      // 움짤 및 WebP 애니메이션은 서버에서 sharp로 가공하기 위해 파라미터만 저장
      const cropData = cropper.getData(true); // {x, y, width, height...}
      serverCropData = cropData;
      croppedFile = originalFile; // 원본 파일을 폼에 첨부

      // 미리보기는 단순히 크롭 영역을 나타내는 캔버스로 대체해서 보여줌
      cropper.getCroppedCanvas({ width: 400, height: 400 }).toBlob((blob) => {
        if (blob) {
          previewSrc = window.URL.createObjectURL(blob);
        }
        cropperOpen = false;
        document.querySelector('#introduction').focus();
      });
    } else {
      // 일반 자르기는 브라우저에서 캔버스로 잘라버림
      cropper.getCroppedCanvas({ width: 400, height: 400 }).toBlob((blob) => {
        if (blob) {
          croppedFile = new File([blob], 'profile.png', { type: 'image/png' });
          previewSrc = window.URL.createObjectURL(blob);
          serverCropData = null;
        }
        cropperOpen = false;
        document.querySelector('#introduction').focus();
      }, 'image/png');
    }
  }

  function closeCropModal() {
    cropperOpen = false;
    // 파일 업로드 취소 시 초기화
    document.querySelector('#photo').value = '';
    croppedFile = null;
    serverCropData = null;
    originalFile = null;
    previewSrc = data.profile.photo || '/icons/unknown-person-icon-4.jpg';
  }

  /**
   * nickname {string} 닉네임
   */
  let nickname = data.profile.nickname;
  /**
   * intro {string} 자기소개
   */
  let introduction = data.profile.introduction;

  const doSubmit = async () => {
    doValidate();

    const formData = new FormData();

    if (croppedFile) {
      const fileSizeMB = croppedFile.size / (1024 * 1024);
      // 움짤이나 WebP, 가벼운 파일은 바로 사용
      if (
        croppedFile.type === 'image/gif' ||
        croppedFile.type === 'image/webp' ||
        fileSizeMB <= 1
      ) {
        formData.append('photo', croppedFile);
      } else {
        try {
          const webp = await imageCompression(croppedFile, {
            maxSizeMB: 1,
            maxWidthOrHeight: 400,
            useWebWorker: true,
            fileType: 'image/webp',
            initialQuality: 0.85
          });
          formData.append('photo', webp);
        } catch (error) {
          console.error('[browser-image-compression] 변환 실패:', error);
          formData.append('photo', croppedFile); // 실패 시 그대로
        }
      }

      if (
        serverCropData &&
        (croppedFile.type === 'image/gif' || croppedFile.type === 'image/webp')
      ) {
        formData.append('cropX', serverCropData.x);
        formData.append('cropY', serverCropData.y);
        formData.append('cropW', serverCropData.width);
        formData.append('cropH', serverCropData.height);
      }
    }

    formData.append('nickname', nickname);
    formData.append('introduction', introduction);

    // 타임아웃 설정 (35초 - 서버 타임아웃 30초보다 약간 길게)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      formData.append('recaptchaToken', await getRecaptchaToken());

      const res = await fetch('/auth/profile', {
        method: 'PATCH',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('res', res);

      if (res.ok) {
        const data = await res.json();
        await swalFire({
          icon: 'success',
          title: '변경 완료',
          text: data.message || '프로필이 성공적으로 변경되었습니다.',
          confirmButtonText: '확인'
        }).then(() => {
          goto('/', { invalidateAll: true });
        });
      } else {
        const errorData = await res
          .json()
          .catch(() => ({ message: '저장 중에 오류가 발생하였습니다.' }));
        await swalFire({
          icon: 'error',
          title: '저장 실패',
          text: errorData.message || '저장 중에 오류가 발생하였습니다.',
          confirmButtonText: '확인'
        });
      }
    } catch (reason) {
      clearTimeout(timeoutId);
      console.error('프로필 업데이트 오류:', reason);

      if (reason.name === 'AbortError') {
        await swalFire({
          icon: 'error',
          title: '타임아웃',
          text: '요청 시간이 초과되었습니다. 파일 크기를 확인해주세요.',
          confirmButtonText: '확인'
        });
      } else {
        await swalFire({
          icon: 'error',
          title: '저장 실패',
          text: '저장에 실패했습니다.',
          confirmButtonText: '확인'
        });
      }
    }
  };

  const doValidate = () => {
    document.querySelectorAll('.needs-validation').forEach((el) => changeHandler(el));
  };

  const invalids = { nickname: false, introduction: false };

  const changeHandler = async (target) => {
    switch (target.id) {
      case 'nickname':
        invalids.nickname = !/^.{2,15}$/.test(target.value) || !isNicknameAllowed(target.value);

        if (!invalids.nickname) {
          fetch(`/auth/register/${target.value}`).then(async (res) => {
            if (res.status !== 204) {
              await swalFire({
                icon: 'warning',
                title: '아이디 중복',
                text: '사용중인 아이디 입니다.',
                confirmButtonText: '확인'
              });
              invalids.nickname = true;
            }
          });
        }

        break;
      case 'introduction':
        invalids.introduction = !target.value;
    }
  };

  let isInvalid = $derived(
    !(nickname && !invalids.nickname && introduction && !invalids.introduction)
  );
</script>

<svelte:head>
  <script
    src="https://www.google.com/recaptcha/api.js?render={PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY}"
  ></script>
</svelte:head>

<Row class="d-flex justify-content-center">
  <Card outline class="rounded rounded-4 shadow my-4" style="max-width: 500px">
    <CardHeader class="mt-3 text-center bg-body">
      <img src="/logo/logo_transparent_120.png" alt="dgst.me 로고" />
    </CardHeader>
    <CardBody>
      <Row>
        <Card class="p-2">
          <Row>
            <Col xs="4" md="3" class="d-flex align-items-center">
              <img
                id="preview"
                src={previewSrc}
                width="100"
                height="100"
                alt="프로필 사진"
                class="card-img-left rounded-2"
                style="width: 100px; height: 100px; object-fit: cover;"
              />
            </Col>
            <Col xs="7" md="8">
              <CardBody>
                <CardSubtitle>{nickname}</CardSubtitle>
                <CardText class="text-muted pt-2">
                  {introduction}
                </CardText>
              </CardBody>
            </Col>
          </Row>
        </Card>
      </Row>
      <hr />
      <Row>
        <Form>
          <FormGroup floating label="닉네임" labelFor="nickname">
            <Input
              id="nickname"
              onchange={(evt) => changeHandler(evt.currentTarget)}
              bind:value={nickname}
              bind:invalid={invalids.nickname}
              feedback="2~15글자 사이 닉네임을 써주세요"
              class="form-control needs-validation"
              autofocus
              maxlength="15"
            />
          </FormGroup>
          <InputGroup class="mb-3">
            <InputGroupText><Icon name="image" class="me-2" />사진</InputGroupText>
            <input
              id="photo"
              type="file"
              onchange={(evt) => preview(evt.currentTarget)}
              class="form-control"
              accept="image/*"
            />
          </InputGroup>
          <FormGroup floating label="자기소개" labelFor="introduction">
            <Input
              id="introduction"
              bind:value={introduction}
              onchange={(evt) => changeHandler(evt.currentTarget)}
              bind:invalid={invalids.introduction}
              type="textarea"
              feedback="간단히 뜬구름 잡는 얘기 써주세요^^"
              class="needs-validation"
            />
          </FormGroup>
          <hr />
          <div class="text-end">
            <Button size="lg" onclick={doSubmit} color="success" disabled={isInvalid}>
              <Icon name="arrow-through-heart-fill" class="pe-2" />수정
            </Button>
          </div>
        </Form>
      </Row>
    </CardBody>
    <CardFooter class="mb-3">
      <strong>dgst.me는 개인정보를 수집하고 저장하지 않습니다.</strong>
    </CardFooter>
  </Card>
</Row>

<Modal isOpen={cropperOpen} toggle={closeCropModal} size="lg">
  <ModalHeader toggle={closeCropModal}>프로필 사진 자르기</ModalHeader>
  <ModalBody class="d-flex justify-content-center bg-dark">
    {#if cropperOpen && cropperImageSrc}
      <div style="max-height: 60vh; max-width: 100%;">
        <img
          use:initCropper
          src={cropperImageSrc}
          alt="자르기 원본"
          style="display: block; max-width: 100%; object-fit: contain;"
        />
      </div>
    {/if}
  </ModalBody>
  <ModalFooter>
    <Button color="secondary" onclick={closeCropModal}>취소</Button>
    <Button color="primary" onclick={applyCrop}>적용</Button>
  </ModalFooter>
</Modal>

<style>
  /* 크로퍼 컨테이너 강제 초기화 제거. sveltestrap modal과 호환되게 css 추가 */
  :global(.cropper-container) {
    max-width: 100% !important;
  }
</style>
