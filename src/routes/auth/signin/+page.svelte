<script>
  import { signIn } from '@auth/sveltekit/client';
  import { resolve } from '$app/paths';

  let { data } = $props();
</script>

<svelte:head>
  <title>로그인 | dgst.me</title>
</svelte:head>

<div class="container py-5">
  <div class="row justify-content-center">
    <div class="col-12 col-md-6 col-lg-4">
      <div class="text-center mb-4">
        <a href={resolve('/')} class="d-inline-block">
          <img
            alt="dgst 로고"
            src="/logo/logo_transparent_120.png"
            style="height: auto; width: auto; max-height: 80px;"
          />
        </a>
      </div>
      <div class="card shadow rounded-4">
        <div class="card-body text-center py-5">
          <h4 class="mb-4">로그인</h4>
          <p class="text-muted small mb-4">계정을 선택해 로그인하세요.</p>
          <div class="d-flex flex-column gap-3 align-items-center">
            <button
              type="button"
              class="btn btn-outline-secondary rounded px-4 py-2 fw-medium"
              style="min-width: 220px;"
              onclick={() => signIn('google', { callbackUrl: '/' })}
            >
              구글 로그인
            </button>
            <button
              type="button"
              class="btn border-0 rounded px-4 py-2 fw-medium"
              style="background: #FEE500; color: #191919; min-width: 220px;"
              onclick={() => signIn('kakao', { callbackUrl: '/' })}
            >
              카카오 로그인
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
