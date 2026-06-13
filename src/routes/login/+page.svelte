<script>
  import { signIn } from '@auth/sveltekit/client';
  import { resolve } from '$app/paths';
  import { swalFire } from '$lib/util/swal.js';

  let { data } = $props();

  const googleBtnSrc = '/oauth/btn_google_signin_light_normal_web.png';

  /** @param {string} errorCode */
  async function showErrorAlert(errorCode) {
    let errorMessage = '로그인 중 오류가 발생했습니다.';

    switch (errorCode) {
      case 'OAuthSignin':
      case 'OAuthCallback':
      case 'OAuthCreateAccount':
      case 'EmailCreateAccount':
      case 'Callback':
        errorMessage = '소셜 로그인 연동 중 오류가 발생했습니다.';
        break;
      case 'OAuthAccountNotLinked':
        errorMessage = '이미 다른 연동 방식으로 가입된 이메일입니다.';
        break;
      case 'EmailSignin':
        errorMessage = '이메일 인증 링크 전송에 실패했습니다.';
        break;
      case 'CredentialsSignin':
        errorMessage = '이메일 또는 비밀번호가 올바르지 않습니다.';
        break;
      case 'SessionRequired':
        errorMessage = '로그인이 필요한 페이지입니다.';
        break;
      default:
        errorMessage = `로그인 실패: ${errorCode}`;
    }

    await swalFire({
      icon: 'error',
      title: '로그인 실패',
      text: errorMessage,
      confirmButtonColor: '#212529',
      confirmButtonText: '확인'
    });
  }

  $effect(() => {
    // OAuth 등으로 리다이렉트되어 파라미터로 에러가 넘어온 경우 보여줌
    if (data.error) {
      showErrorAlert(data.error);
    }
  });
</script>

<svelte:head>
  <title>로그인 | dgst.me</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Roboto:wght@500&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="container py-5">
  <div class="row justify-content-center">
    <div class="col-12 col-md-6 col-lg-4">
      <div class="card shadow rounded-4">
        <div class="card-body py-5">
          <div class="text-center mb-4">
            <a href={resolve('/')} class="d-inline-block">
              <img alt="dgst 로고" src="/logo/logo_transparent_120.png" class="login-logo" />
            </a>
          </div>

          <div class="text-center">
            <div class="d-flex flex-column gap-3 align-items-center">
              <!-- 카카오: 공식 규격 - 컨테이너 #FEE500, radius 12px, 심볼(말풍선) #000, 레이블 "카카오 로그인" #000 85% -->
              <button
                type="button"
                class="login-btn-kakao"
                onclick={() => signIn('kakao', { callbackUrl: '/' })}
                title="카카오 계정으로 로그인"
              >
                <span class="login-btn-kakao-symbol" aria-hidden="true">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 3C6.477 3 2 6.463 2 10.5c0 2.75 1.75 5.17 4.39 6.61-.19.69-.69 2.45-.79 2.83-.12.47.18.46.38.34.15-.09 2.41-1.65 3.38-2.28.94.13 1.92.2 2.93.2 5.523 0 10-3.463 10-7.5S17.523 3 12 3z"
                      fill="#000000"
                    />
                  </svg>
                </span>
                <span class="login-btn-kakao-label">카카오 로그인</span>
              </button>

              <!-- 구글: 공식 규격 - Light Fill #FFFFFF, Stroke #747775, 텍스트 "Sign in with Google" / 구글 G 로고 -->
              <button
                type="button"
                class="login-btn-google"
                onclick={() => signIn('google', { callbackUrl: '/' })}
                title="구글 계정으로 로그인"
              >
                <img src={googleBtnSrc} alt="구글 로그인" width="220" height="44" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .login-logo {
    height: auto;
    width: auto;
    max-height: 56px;
    display: block;
  }

  /* 구글: 공식 이미지 버튼, 비율 유지 */
  .login-btn-google {
    display: inline-block;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    line-height: 0;
  }
  .login-btn-google img {
    display: block;
    height: auto;
    width: 220px;
    max-width: 100%;
    object-fit: contain;
  }

  /* 카카오: 공식 규격 - 컨테이너 #FEE500, radius 12px, 레이블 #000 85% */
  .login-btn-kakao {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-width: 220px;
    height: 44px;
    padding: 0 20px;
    background: #fee500;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 500;
    color: rgba(0, 0, 0, 0.85);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .login-btn-kakao:hover {
    background: #f5dc00;
  }
  .login-btn-kakao-symbol {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .login-btn-kakao-label {
    flex-shrink: 0;
  }
</style>
