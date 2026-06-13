# 댓글 및 본문 마크다운 포맷팅 (Markdown & Sanitization)

경로: 
- `src/lib/util/embeder.js`
- `src/routes/board/[boardId]/[[pageNo]]/[articleId]/+page.svelte`
- `src/lib/components/QuillEditor.svelte`

## 1. 개요
dgst 서비스 내 게시물 댓글과 본문 입력(`QuillEditor` 복붙 기능) 시 편의를 위해 **마크다운(Markdown)** 문법을 자동 인지하여 HTML 파싱 결과를 제공합니다.
사용자가 코드를 쉽게 공유하거나, 구조적으로 깔끔한 문서를 렌더링하기 위해 사용됩니다.

## 2. 보안 정책 (Security First)
사용자가 직접 입력하는 마크다운 문법은 `XSS`를 포함한 여러 보안 위협을 제공할 수 있습니다 (예: 브라우저 JS 실행). 
이러한 위험 요소를 차단하기 위해 **마크다운을 HTML로 파싱한 후 매우 강력한 Sanitization(DOMPurify 계열의 `sanitize-html` 모듈)을 거칩니다**.

### 2.1 혀용되는 태그 및 프로토콜 (Whitelist)
1. **허용 URL 스키마 (Scheme)**
   - 철저히 `http`, `https`, `ftp`, `mailto`, `tel` 만 허용.
   - `javascript:` 등 악성 스크립트 실행 요소(XSS 페이로드)가 들어올 수 있는 프로토콜은 차단됩니다.
2. **이미지 태그 검열**
   - `<img src="...">` 에서 허용되는 프로토콜은 `http`, `https`, `data` (base64 이미지 등) 로만 제한됩니다.
3. **허용 태그 조합 확장**
   - 마크다운이 생산하는 기본 블록들: `h1~h6`, `ul`, `ol`, `li`, `code`, `pre`, `hr`, `blockquote`, `img`, `a`

## 3. 마크다운 식별 프로세스 (isMarkdownContent)
주어진 댓글이나 입력 문자열 중 명시적인 Markdown Syntax(목록, 인용문, 코드 블록 등)가 사용되었는지 1차적으로 확인합니다. 
> 참고: `[1] 참고사이트` 방식의 평문 텍스트 내 단일 레퍼런스 형식 역시 마크다운으로 간주하여 파싱을 시도합니다.

### 특징 및 예외 규칙 (OG 도배 방지 기능)
URL이 평문에 복수로 나열되었을 때 발생하는 시각적 혼란 및 브라우저 성능 하락 방지(`OG Spam Rule`):
- **마크다운 모드 진입 시**: 
  - `[클릭](http...)` 등 명시적 앵커 태그에 덮어씌워지는 OG 링크 동작을 철저히 배제합니다.
  - 마크다운 링크 문법 `<a>` 렌더링이 그대로 보존됩니다.
- **일반 모드 진입 시 (isMarkdown == false)**:
  - 댓글에 타 사이트 출처 링크가 여럿 존재하더라도 과도한 OG 카드 생성 폭탄을 막기 위해 **단일 카드로 제한(Slice: 1)**되어 첫 번째 URL만 OG가 보여집니다.
  - OG로 승격된 URL은 평문 본문에서 시각적으로 제거(`replace`)되어 깔끔하게 카드형 링크로 제공됩니다.

## 4. 라이브러리 스펙
- 파서 (Parser): `marked.parse` (동기식 변환 지원)
- 살균 (Sanitizer): `sanitize-html`
