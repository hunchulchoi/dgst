<script>
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
    FormCheck,
    FormGroup,
    Icon,
    Input,
    InputGroup,
    InputGroupText,
    Label,
    Row
  } from '$lib/components/ui/index.js';

  import { PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY } from '$env/static/public';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import imageCompression from 'browser-image-compression';
  import { swalFire } from '$lib/util/swal.js';
  import { isNicknameAllowed } from '$lib/util/nickname.js';

  /** @typedef {{ ready: (callback: () => void) => void; execute: (siteKey: string, options: { action: string }) => Promise<string> }} Grecaptcha */
  /** @type {Grecaptcha | undefined} */
  const grecaptcha = browser
    ? /** @type {Window & { grecaptcha?: Grecaptcha }} */ (window).grecaptcha
    : undefined;

  // Svelte 5 Runes
  let { data } = $props();

  $effect(() => {
    if (!data.session || data.session.user?.nickname) {
      if (browser) goto('/', { replaceState: true });
    }
  });

  /** @returns {Promise<string>} */
  async function getRecaptchaToken() {
    return new Promise((resolve, reject) => {
      if (!grecaptcha) {
        reject(new Error('reCAPTCHA not loaded'));
        return;
      }
      grecaptcha.ready(() => {
        grecaptcha
          .execute(PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY, { action: 'register' })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  /**
   * 파일 업로드시 미리보기
   * @param fileEl {Input} 파일인풋
   */
  /** @param {HTMLInputElement} fileEl */
  function preview(fileEl) {
    console.log(fileEl);
    const file = fileEl.files?.[0];
    const previewImage = /** @type {HTMLImageElement | null} */ (
      document.querySelector('#preview')
    );
    const introInput = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (
      document.querySelector('#introduction')
    );
    if (file && previewImage) {
      previewImage.src = window.URL.createObjectURL(file);
    }
    introInput?.focus();
  }

  let nickname = $state('');
  /**
   * intro {string} 자기소개
   */
  let introduction = $state('');

  let fight = $state(false);

  const doSubmit = async () => {
    doValidate();

    const formData = new FormData();

    const files = /** @type {HTMLInputElement | null} */ (document.querySelector('#photo'))?.files;

    if (files) {
      // 움짤(GIF)·WebP는 압축 없이 원본 전송 (프로필 움짤 지원)
      if (files[0].type === 'image/gif' || files[0].type === 'image/webp') {
        formData.append('photo', files[0]);
      } else {
        const fileSizeMB = files[0].size / (1024 * 1024);
        // 1MB 이하는 변환하지 않고 원본 유지
        if (fileSizeMB > 1) {
          try {
            const webp = await imageCompression(files[0], {
              maxSizeMB: 10,
              maxWidthOrHeight: 400,
              useWebWorker: true,
              fileType: 'image/webp',
              initialQuality: 0.85
            });
            formData.append('photo', webp);
          } catch (error) {
            console.error('[browser-image-compression] 이미지 변환 실패:', error);
            formData.append('photo', files[0]); // 변환 실패 시 원본 사용
          }
        } else {
          console.log(
            '[browser-image-compression] 1MB 이하 이미지는 원본 유지:',
            fileSizeMB.toFixed(2),
            'MB'
          );
          formData.append('photo', files[0]);
        }
      }
    }

    formData.append('nickname', nickname);
    formData.append('introduction', introduction);

    try {
      formData.append('recaptchaToken', await getRecaptchaToken());
      const res = await fetch('/auth/register', { method: 'PATCH', body: formData });
      console.log('res', res);

      if (res.ok) {
        await swalFire({
          icon: 'success',
          title: '등록 완료',
          text: '등록 되었습니다.\n다시 로그인 해주세요.',
          confirmButtonText: '확인'
        });
        goto('/');
      } else {
        await swalFire({
          icon: 'error',
          title: '저장 실패',
          text: '저장 중에 오류가 발생하였습니다.',
          confirmButtonText: '확인'
        });
      }
    } catch (reason) {
      console.error(reason);
      await swalFire({
        icon: 'error',
        title: '저장 실패',
        text: '저장에 실패했습니다.',
        confirmButtonText: '확인'
      });
    }
  };

  const doValidate = () => {
    document
      .querySelectorAll('.needs-validation')
      .forEach((el) => changeHandler(/** @type {HTMLInputElement | HTMLTextAreaElement} */ (el)));
  };

  const invalids = { nickname: false, introduction: false };

  /** @param {HTMLInputElement | HTMLTextAreaElement} target */
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
        break;
      case 'fight':
        if (/** @type {HTMLInputElement} */ (target).checked) doValidate();
    }
  };

  let isInvalid = $derived(
    !(nickname && !invalids.nickname && introduction && !invalids.introduction && fight)
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
                src="/icons/unknown-person-icon-4.jpg"
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
              onchange={(/** @type {Event & { currentTarget: HTMLInputElement }} */ evt) =>
                changeHandler(evt.currentTarget)}
              oninput={(/** @type {Event & { currentTarget: HTMLInputElement }} */ evt) =>
                changeHandler(evt.currentTarget)}
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
              onchange={(/** @type {Event & { currentTarget: HTMLTextAreaElement }} */ evt) =>
                changeHandler(evt.currentTarget)}
              oninput={(/** @type {Event & { currentTarget: HTMLTextAreaElement }} */ evt) =>
                changeHandler(evt.currentTarget)}
              bind:invalid={invalids.introduction}
              type="textarea"
              feedback="간단히 뜬구름 잡는 얘기 써주세요^^"
              class="needs-validation"
            />
          </FormGroup>
          <FormGroup>
            <Label>싸우지 않고 사이좋게 지내실 거쥬?</Label>
            <FormCheck
              id="fight"
              type="switch"
              label="네"
              bind:checked={fight}
              onchange={(/** @type {Event & { currentTarget: HTMLInputElement }} */ evt) =>
                changeHandler(evt.currentTarget)}
              feedback="체크해 주세요^^"
              size="lg"
              class="needs-validation"
            />
          </FormGroup>
          <hr />
          <div class="text-end">
            <Button size="lg" onclick={doSubmit} color="success" disabled={isInvalid}>
              <Icon name="arrow-through-heart-fill" class="pe-2" />가입
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
