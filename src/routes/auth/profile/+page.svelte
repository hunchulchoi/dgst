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
    Image,
    Input,
    InputGroup,
    InputGroupText,
    Label,
    Popover,
    Row
  } from 'sveltestrap';

  import { PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY } from '$env/static/public';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import {blobToWebP} from "webp-converter-browser";
  import {signOut} from '@auth/sveltekit/client';

  console.log('$page.data.session', $page.data);

  if (!$page.data.session) {
    if (browser) goto('/', { replaceState: true });
  }

  let token = '';
  function checkRecaptcha() {
    grecaptcha.ready(function () {
      grecaptcha
        .execute(PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY, { action: 'register' })
        .then(function (_token) {
          console.debug('token: ' + _token);
          token = _token;
          //document.querySelector('#grecaptcha')
        });
    });
  }

  /**
   * 파일 업로드시 미리보기
   * @param fileEl {Input} 파일인풋
   */
  function preview(fileEl) {
    console.log(fileEl);

    document.querySelector('#preview').src = window.URL.createObjectURL(fileEl.files[0]);
    document.querySelector('#introduction').focus();
  }

  export let data;

  /**
   * nickname {string} 닉네임
   */
  let nickname = data.profile.nickname;
  /**
   * intro {string} 자기소개
   */
  let introduction = data.profile.introduction;

  const doSubmit = async () => {
    // validation
    doValidate();
    // recaptcha
    checkRecaptcha();

    const formData = new FormData();

    let files = document.querySelector('#photo').files;


    console.log('files:', files)

    if(files && files.length){

      if(files[0].type.endsWith('.gif') || files[0].type.endsWith('.webp')){

        formData.append('photo', files[0]);

      }else{
        const webp = await blobToWebP(files[0], { width: 400 });

        console.debug('webp', webp);
        formData.append('photo', new File([webp], files[0].name));
      }

    }

    formData.append('nickname', nickname);
    formData.append('introduction', introduction);

    fetch('/auth/profile', { method: 'PATCH', body: formData })
      .then((res) => {
        console.log('res', res);

        if (res.ok) {
          alert('변경 되었습니다.\n다시 로그인 해주세요.');
          signOut();
          console.log(res);

          goto('/');
        } else {
          alert(res.message || '저장 중에 오류가 발생하였습니다.');
        }
      })
      .catch((reason) => {
        console.error(reason);
        alert('저장에 실패했습니다.');
      });
  };

  const doValidate = () => {
    document.querySelectorAll('.needs-validation').forEach((el) => changeHandler(el));
  };

  const invalids = { nickname: false, introduction: false };

  const changeHandler = async (target) => {
    switch (target.id) {
      case 'nickname':
        invalids.nickname = !/^.{2,15}$/.test(target.value);

        if (!invalids.nickname) {
          fetch(`/auth/register/${target.value}`).then((res) => {
            if (res.status !== 204) {
              alert('사용중인 아이디 입니다.');
              invalids.nickname = true;
            }
          });
        }

        break;
      case 'introduction':
        invalids.introduction = !target.value;
    }
  };

  $: isInvalid = !(
    nickname &&
    !invalids.nickname &&
    introduction &&
    !invalids.introduction
  );


</script>

<svelte:head>
  <script
    src="https://www.google.com/recaptcha/api.js?render={PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY}"
  ></script>
</svelte:head>

<Row class="d-flex justify-content-center">
  <Card outline class="rounded rounded-4 shadow my-4" style="max-width: 500px">
    <CardHeader class="mt-3 text-center" style="background-color: #fafae4">
      <Image src="/logo/logo_transparent_120.png" alt="데게실버타운 로고" />
    </CardHeader>
    <CardBody>
      <Row>
        <Card class="p-2">
          <Row>
            <Col xs="4" md="3" class="d-flex align-items-center">
              <Image
                id="preview"
                src={data.profile.photo || '/icons/unknown-person-icon-4.jpg'}
                thumbnail
                width="100"
                height="100"
                alt="프로필 사진"
                class="card-img-left rounded-2"
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
          <Input type="hidden" name="token" bind:value={token} />
          <FormGroup floating label="닉네임">
            <Input
              id="nickname"
              on:change={(evt) => changeHandler(evt.target)}
              bind:value={nickname}
              bind:invalid={invalids.nickname}
              feedback="2~15글자 사이 닉네임을 써주세요"
              class="form-control needs-validation"
              autofocus
              maxlength="15"
            />
          </FormGroup>
          <InputGroup class="mb-3">
            <InputGroupText><Icon name="image me-2" />사진</InputGroupText>
            <input
              id="photo"
              type="file"
              on:change={(evt) => preview(evt.target)}
              class="form-control"
              accept="image/*"
            />
          </InputGroup>
          <FormGroup floating label="자기소개">
            <Input
              id="introduction"
              bind:value={introduction}
              on:change={(evt) => changeHandler(evt.target)}
              bind:invalid={invalids.introduction}
              type="textarea"
              feedback="간단히 뜬구름 잡는 얘기 써주세요^^"
              class="needs-validation"
            />
          </FormGroup>
          <hr />
          <div class="text-end">
            <Button size="lg" on:click={doSubmit} color="success" bind:disabled={isInvalid}>
              <Icon name="arrow-through-heart-fill pe-2" />수정
            </Button>
          </div>
        </Form>
      </Row>
    </CardBody>
    <CardFooter class="mb-3">
      <strong>데게실버타운은 개인정보를 수집하고 저장하지 않습니다.</strong>
    </CardFooter>
  </Card>
</Row>
