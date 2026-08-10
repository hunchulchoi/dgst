<script>
  import { resolve } from '$app/paths';

  let { data } = $props();
</script>

<svelte:head>
  <title>개인정보처리방침 | dgst.me</title>
  <meta
    name="description"
    content="dgst.me가 처리하는 개인정보의 항목, 목적, 보유기간과 이용자 권리를 안내합니다."
  />
</svelte:head>

<main class="container privacy-policy px-3 px-md-4 py-4 py-md-5">
  <header class="mb-5">
    <h1 class="mb-3">개인정보처리방침</h1>
    <p class="text-muted mb-1">시행일: 2026년 8월 10일</p>
    <p class="mb-0">
      dgst.me(이하 “서비스”)는 서비스 제공에 필요한 범위에서 개인정보를 처리하며, 개인정보 보호 관련
      법령을 준수하기 위해 노력합니다.
    </p>
  </header>

  <section>
    <h2>1. 처리하는 개인정보와 이용 목적</h2>
    <div class="table-responsive">
      <table class="table table-bordered align-middle">
        <thead>
          <tr>
            <th scope="col">구분</th>
            <th scope="col">처리 항목</th>
            <th scope="col">목적</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>회원 및 인증</td>
            <td
              >OAuth 제공자, 제공자 계정 식별자, 해시 처리한 이메일, 닉네임, 소개, 프로필 사진, 계정
              상태, 세션 정보</td
            >
            <td>본인 식별, 로그인, 회원 관리, 부정 이용 방지</td>
          </tr>
          <tr>
            <td>서비스 이용</td>
            <td>게시글, 댓글, 첨부파일, 메모, 알림, 읽기·추천 기록, 게임 점수·진행 및 재화 기록</td>
            <td>커뮤니티와 게임 기능 제공, 이용자 요청 처리</td>
          </tr>
          <tr>
            <td>자동 생성 정보</td>
            <td
              >IP 주소, 기기 식별용 UUID, 브라우저·운영체제 계열, 접속 일시, 요청 경로, 브라우저
              시간대</td
            >
            <td>세션 보안, 접속 기록 관리, 오류 대응, 이용 현황 집계</td>
          </tr>
          <tr>
            <td>보안 확인</td>
            <td>Google reCAPTCHA 토큰과 평가 결과</td>
            <td>자동화된 가입 및 악성 요청 방지</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="small text-muted">
      이메일은 단방향 해시로 변환해 저장하지만, 동일 이용자의 기록을 연결하는 식별자로 사용되므로
      개인정보로 보호합니다. 프로필, 게시글, 댓글, 게임 순위 등 일부 정보는 서비스 이용 과정에서
      다른 이용자에게 공개될 수 있습니다.
    </p>
  </section>

  <section>
    <h2>2. 보유 및 이용 기간</h2>
    <ul>
      <li>회원·프로필 정보: 회원 삭제 요청 처리 완료 시까지</li>
      <li>인증 세션: 생성일로부터 최대 30일</li>
      <li>로그인 기록(회원 내부 식별자, 접속 일시): 생성일로부터 30일</li>
      <li>
        기기 확인용 서버 캐시(기기 식별자, 브라우저·운영체제 계열): 마지막 저장 시점부터 최대 30일
      </li>
      <li>게시글·댓글·첨부파일: 이용자가 삭제하거나 삭제 요청이 처리될 때까지</li>
      <li>게임·알림·메모 등 이용 기록: 회원 삭제 또는 해당 기록의 삭제 요청 처리 시까지</li>
    </ul>
    <p>
      관계 법령에 따라 보존할 의무가 있거나 분쟁 해결을 위해 필요한 경우에는 해당 목적에 필요한 최소
      범위에서 별도로 보관한 뒤 파기합니다.
    </p>
  </section>

  <section>
    <h2>3. 개인정보의 제3자 제공</h2>
    <p>
      서비스는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다. 법령에 근거가 있거나
      이용자가 별도로 동의한 경우에는 예외로 합니다.
    </p>
  </section>

  <section>
    <h2>4. 외부 서비스와 처리위탁</h2>
    <div class="table-responsive">
      <table class="table table-bordered align-middle">
        <thead>
          <tr>
            <th scope="col">수탁자 또는 외부 서비스</th>
            <th scope="col">이용 목적</th>
            <th scope="col">전달·처리될 수 있는 정보</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Google</td>
            <td>OAuth 로그인, reCAPTCHA</td>
            <td>로그인 요청 정보, IP 주소, User-Agent, reCAPTCHA 이용 정보</td>
          </tr>
          <tr>
            <td>Kakao</td>
            <td>OAuth 로그인</td>
            <td>로그인 요청 및 계정 연동 정보</td>
          </tr>
          <tr>
            <td>스토리지 운영 환경(Minio 호환 저장소)</td>
            <td>프로필·게시물 첨부파일 저장</td>
            <td>업로드 파일, 원본 파일명, 업로더 식별자, 업로드 일시</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      Google 서비스 이용 과정에서는 정보가 국외에서 처리될 수 있습니다. 자세한 내용은
      <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer"
        >Google 개인정보처리방침</a
      >에서 확인할 수 있습니다. 게시물에 포함된 YouTube·Instagram 등의 외부 콘텐츠를 열면 해당
      사업자가 접속 정보를 처리할 수 있습니다.
    </p>
  </section>

  <section>
    <h2>5. 쿠키와 유사 기술</h2>
    <ul>
      <li>인증 세션 쿠키: 로그인 유지, 최대 30일</li>
      <li><code>dgst_device</code>: 기기 식별과 세션 보안, 최대 365일</li>
      <li><code>timezone</code>: 이용자 시간대에 맞춘 시각 표시, 최대 365일</li>
    </ul>
    <p>
      브라우저 설정에서 쿠키 저장을 거부하거나 삭제할 수 있습니다. 다만 인증 또는 시간 표시 등 일부
      기능이 정상적으로 작동하지 않을 수 있습니다.
    </p>
  </section>

  <section>
    <h2>6. 이용자의 권리와 행사 방법</h2>
    <p>
      이용자는 자신의 개인정보 열람, 정정, 삭제 및 처리정지를 요청할 수 있습니다. 프로필 정보는
      프로필 화면에서 직접 정정할 수 있습니다. 그 밖의 요청은
      {#if data.contactEmail}
        <a href={`mailto:${data.contactEmail}`}>{data.contactEmail}</a>
      {:else}
        <a href={resolve('/board/free/write')}>자유게시판에서 운영자에게 문의</a>
      {/if}를 통해 접수할 수 있습니다. 공개 게시판에는 이메일, IP 주소 등 개인정보를 작성하지
      마세요. 본인 확인과 다른 이용자의 권리 보호를 위해 필요한 정보를 요청할 수 있습니다.
    </p>
    <p>
      게시글·댓글처럼 다른 이용자와 공유된 기록은 해당 콘텐츠를 먼저 삭제하거나 별도로 삭제를
      요청해야 합니다. 법령상 보존 의무가 있는 정보는 보존기간이 끝난 뒤 삭제합니다.
    </p>
  </section>

  <section>
    <h2>7. 파기 절차와 방법</h2>
    <p>
      보유기간이 끝나거나 처리 목적이 달성된 개인정보는 복구하기 어려운 방법으로 삭제합니다. 전자적
      파일과 데이터베이스 기록은 삭제합니다.
    </p>
  </section>

  <section>
    <h2>8. 안전성 확보 조치</h2>
    <p>
      서비스는 접근 권한 제한, 전송 구간 암호화, 세션 쿠키 보호, 요청 횟수 제한, 업로드 파일 검증,
      보안 기록 점검 등 개인정보 보호를 위한 기술적·관리적 조치를 적용합니다.
    </p>
  </section>

  <section>
    <h2>9. 개인정보 보호 문의</h2>
    <p>
      개인정보 보호책임자: {data.operatorName}<br />
      문의 방법:
      {#if data.contactEmail}
        <a href={`mailto:${data.contactEmail}`}>{data.contactEmail}</a>
      {:else}
        <a href={resolve('/board/free/write')}>자유게시판에서 운영자에게 문의</a>
      {/if}
    </p>
  </section>

  <section>
    <h2>10. 방침 변경</h2>
    <p>
      이 방침의 내용이 변경되면 시행 전에 서비스 화면을 통해 알립니다. 이용자 권리에 중요한 변경은
      합리적인 기간을 두고 안내합니다.
    </p>
  </section>
</main>

<style>
  .privacy-policy {
    max-width: 960px;
  }

  section {
    margin-top: 2.5rem;
  }

  h2 {
    margin-bottom: 1rem;
    font-size: 1.35rem;
  }

  th {
    white-space: nowrap;
  }

  td,
  th {
    min-width: 8rem;
  }
</style>
