# Open Graph / 카카오톡 링크 미리보기

## 왜 카카오톡에 OG가 안 보일 수 있나

1. **크롤러는 첫 HTML만 봄**  
   카카오톡·페이스북 등은 링크를 넣었을 때 해당 URL을 GET으로 한 번만 요청하고, **그때 받은 HTML**에서 `og:title`, `og:description`, `og:image`, `og:url`만 파싱합니다.
   - JS로 나중에 넣는 메타는 보이지 않음 → **서버에서 렌더링된 HTML에 OG가 들어가야 함.**
   - 게시글 상세는 `+page.server.js`에서 `ogTitle`, `ogDescription`, `ogUrl`, `ogImage`를 만들어 두고, `+page.svelte`의 `<svelte:head>`에서 이 값만 사용하도록 되어 있음.

2. **캐시**  
   카카오톡은 한 번 가져온 미리보기를 **캐시**합니다.
   - OG를 수정해도 예전 미리보기가 계속 보일 수 있음.
   - 해결: 같은 글이라도 URL에 쿼리 붙여서 새로 공유 (예: `?v=2`) 하거나, [카카오 개발자 도구](https://developers.kakao.com)에서 해당 URL 캐시 초기화.

3. **이미지 요구사항**
   - `og:image`는 **절대 URL** (예: `https://www.dgst.me/logo/...`).
   - 권장: 200×200 이상, 8MB 이하, 로그인 없이 접근 가능.

4. **noindex와의 관계**  
   `app.html`에 `meta name="robots" content="noindex, nofollow"`가 있어도, 카카오/페이스북 등은 **미리보기용**으로 페이지를 가져오는 경우가 많아서, 보통 OG는 그대로 읽습니다. 필요하면 공개 페이지에만 index 허용하도록 라우트별로 메타를 다르게 줄 수 있음.

## 구현 요약

| 페이지      | OG 설정 위치                                                                                                          | 비고                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 루트        | `app.html`                                                                                                            | 고정 OG                            |
| 게시글 상세 | `+page.server.js`에서 `ogTitle`, `ogDescription`, `ogUrl`, `ogImage` 반환 → `+page.svelte`의 `<svelte:head>`에서 사용 | HTML 스트립/길이 제한으로 SSR 안전 |
| 보드 목록   | `+page.svelte`의 `<svelte:head>`                                                                                      | `boardId`/`pageTitle` 기반         |

Twitter 카드용 메타는 `property`가 아니라 **`name="twitter:card"`** 등 `name` 사용 (스펙 권장).

---

## 댓글 및 본문 링크용 OG Fetching (`/api/og`)

우리가 작성한 본문이나 댓글 내부의 타 웹사이트 링크(URL)에 대해 미리보기를 제공하려면, 클라이언트(브라우저)에서 직접 접근 시 CORS 에러가 발생할 수 있어 서버를 우회해야 합니다.

* **동작 원리**: 클라이언트 -> `/api/og?url=...` 호출 -> 서버가 해당 타겟 URL의 HTML 다운로드 및 `og:` 메타태그 파싱 -> 성공 시 JSON 반환
* **내부 캐싱 (Redis)**: 외부 사이트 반복 수집으로 인한 IP 블락 방지 및 브라우저 성능 최적화를 위해 OG 수집 성공 결과는 Redis(`og_cache:{url}`)에 **3시간** 보관됩니다.
* **장애 대응**: 대상 서버 타임아웃/에러 시 `winston` 로거를 통해 `Cache Miss` 및 통신 에러 로그가 파일로 남습니다.
