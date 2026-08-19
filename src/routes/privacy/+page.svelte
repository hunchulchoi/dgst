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
    <p class="text-muted mb-1">시행일: 2026년 8월 19일</p>
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
              >OAuth 제공자, 제공자 계정 식별자, 해시 처리한 이메일, 닉네임, 선택 입력한 소개,
              프로필 사진, 계정 상태, 세션 정보</td
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
            <td>IP 주소, 브라우저·운영체제 계열, 접속 일시, 요청 경로, 브라우저 시간대</td>
            <td>세션 보안, 접속 기록 관리, 오류 대응, 이용 현황 집계</td>
          </tr>
          <tr>
            <td>보안 확인</td>
            <td>Cloudflare Turnstile 토큰과 확인 결과</td>
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
      <li>인증 세션: 마지막 이용 후 최대 30일, 최초 발급일로부터 최대 90일</li>
      <li>로그인 기록(회원 내부 식별자, 접속 일시): 생성일로부터 30일</li>
      <li>세션 보안용 서버 캐시(브라우저·운영체제 계열): 마지막 저장 시점부터 최대 30일</li>
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
            <td>OAuth 로그인</td>
            <td>로그인 요청 정보, IP 주소, 브라우저 정보</td>
          </tr>
          <tr>
            <td>Cloudflare</td>
            <td>Turnstile 봇 방지</td>
            <td>IP 주소, User-Agent, Turnstile 이용 정보</td>
          </tr>
          <tr>
            <td>Kakao</td>
            <td>OAuth 로그인</td>
            <td>로그인 요청 정보, IP 주소, 브라우저 정보</td>
          </tr>
          <tr>
            <td>YouTube·Instagram 등 외부 콘텐츠 제공자</td>
            <td>게시물에 포함된 외부 콘텐츠 표시 또는 외부 링크 이동</td>
            <td>IP 주소, User-Agent, 접속 페이지, 해당 사업자의 쿠키 등</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="mb-2">
      업로드 파일은 서비스가 사용하는 Minio 호환 저장 환경에 보관됩니다. 저장 환경 운영을 외부
      사업자에게 맡기는 경우에는 관련 법령에 따라 계약과 보호조치를 적용합니다.
    </p>
    <p>
      게시물에 YouTube iframe 등 외부 삽입 콘텐츠가 있으면 게시물을 보는 즉시 브라우저가 해당 사업자
      서버에 자동으로 연결될 수 있습니다. Instagram 등 외부 링크를 누른 경우에도 해당 사업자가
      정보를 처리합니다. 브라우저의 제3자 요청·쿠키 차단 기능을 사용할 수 있지만 외부 콘텐츠가
      표시되지 않을 수 있습니다.
    </p>
  </section>

  <section>
    <h2>5. 개인정보의 국외 이전</h2>
    <p>
      다음 기능을 이용하면 개인정보가 암호화된 통신망을 통해 국외 사업자에게 전송되어 처리될 수
      있습니다. 사업자의 실제 처리 국가는 글로벌 인프라 운영에 따라 달라질 수 있습니다.
    </p>
    <div class="table-responsive">
      <table class="table table-bordered align-middle overseas-transfer-table">
        <thead>
          <tr>
            <th scope="col">이전받는 자·문의</th>
            <th scope="col">국가</th>
            <th scope="col">항목·목적</th>
            <th scope="col">시기·방법</th>
            <th scope="col">보유기간</th>
            <th scope="col">거부 방법·영향</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              Google LLC<br />
              <a
                href="https://support.google.com/policies/contact/general_privacy_form"
                target="_blank"
                rel="noreferrer">개인정보 문의</a
              >
            </td>
            <td>미국 등 Google 처리시설 소재 국가</td>
            <td>
              로그인 요청 정보, IP 주소, 브라우저 정보 / Google OAuth 로그인 및 YouTube 콘텐츠 제공
            </td>
            <td>Google 로그인 또는 YouTube 삽입 게시물 열람 시 암호화 통신</td>
            <td>
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer"
                >Google 개인정보처리방침</a
              >에 따름
            </td>
            <td>
              Google 로그인을 이용하지 않거나 브라우저에서 제3자 요청을 차단할 수 있습니다. Google
              로그인 또는 YouTube 콘텐츠가 작동하지 않을 수 있습니다.
            </td>
          </tr>
          <tr>
            <td>
              Cloudflare, Inc.<br />
              <a href="mailto:dpo@cloudflare.com">dpo@cloudflare.com</a>
            </td>
            <td>미국 등 Cloudflare 글로벌 네트워크 소재 국가</td>
            <td>
              IP 주소, TLS 지문, User-Agent, Sitekey와 연결된 출처, Turnstile 신호 / 봇 탐지·차단 및
              탐지 성능 개선
            </td>
            <td>가입·프로필 변경 시 Turnstile 확인 과정에서 암호화 통신</td>
            <td>
              <a
                href="https://www.cloudflare.com/turnstile-privacy-policy/"
                target="_blank"
                rel="noreferrer">Turnstile Privacy Addendum</a
              >
              및
              <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer"
                >Cloudflare 개인정보처리방침</a
              >에 따름
            </td>
            <td>
              전송을 거부할 수 있으나 Turnstile 확인이 필요한 가입·프로필 변경 기능을 이용할 수
              없습니다.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>6. 쿠키와 브라우저 저장소</h2>
    <h3>쿠키</h3>
    <ul>
      <li>인증 세션 쿠키: 마지막 이용 후 최대 30일, 최초 발급일로부터 최대 90일</li>
      <li><code>timezone</code>: 이용자 시간대에 맞춘 시각 표시, 최대 365일</li>
    </ul>
    <p>
      브라우저 설정에서 쿠키 저장을 거부하거나 삭제할 수 있습니다. 다만 인증 또는 시간 표시 등 일부
      기능이 정상적으로 작동하지 않을 수 있습니다.
    </p>
    <p>현재 광고·행태 분석 목적의 쿠키는 사용하지 않습니다.</p>
    <h3>로컬 저장소와 세션 저장소</h3>
    <ul>
      <li>
        로컬 저장소: 화면 테마, 게임 저장·진행 상태, 소리 설정, 게시글 임시저장, 이미 본 화면 효과
        등의 설정과 상태
      </li>
      <li>세션 저장소: 새로고침·오류 복구 등 일시적인 화면 상태</li>
    </ul>
    <p>
      로컬 저장소 정보는 기능에서 삭제하거나 이용자가 브라우저 데이터를 지울 때까지 기기에 남을 수
      있습니다. 세션 저장소 정보는 해당 브라우저 탭 세션이 끝나면 삭제됩니다. 저장을 차단하거나
      삭제하면 설정, 임시저장 또는 게임 진행 상태가 사라질 수 있습니다.
    </p>
  </section>

  <section>
    <h2>7. 이용자의 권리와 행사 방법</h2>
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
    <h2>8. 파기 절차와 방법</h2>
    <p>
      보유기간이 끝나거나 처리 목적이 달성된 개인정보는 복구하기 어려운 방법으로 삭제합니다. 전자적
      파일과 데이터베이스 기록은 삭제합니다.
    </p>
  </section>

  <section>
    <h2>9. 안전성 확보 조치</h2>
    <p>
      서비스는 접근 권한 제한, 전송 구간 암호화, 세션 쿠키 보호, 요청 횟수 제한, 업로드 파일 검증,
      보안 기록 점검 등 개인정보 보호를 위한 기술적·관리적 조치를 적용합니다.
    </p>
  </section>

  <section>
    <h2>10. 개인정보 보호 문의</h2>
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
    <h2>11. 방침 변경</h2>
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

  h3 {
    margin-top: 1.25rem;
    font-size: 1.1rem;
  }

  .overseas-transfer-table {
    min-width: 1100px;
  }

  th {
    white-space: nowrap;
  }

  td,
  th {
    min-width: 8rem;
  }
</style>
