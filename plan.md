# Svelte 5 + SvelteKit 2 + CKEditor 최신 버전 업그레이드 계획

## 📋 프로젝트 현황 분석

### 현재 버전

- **Svelte**: 4.2.19
- **SvelteKit**: 1.30.4
- **CKEditor**: 39.0.2
- **Vite**: 4.5.5
- **Node Adapter**: 1.3.1

### 목표 버전

- **Svelte**: 5.x (최신 안정화 버전)
- **SvelteKit**: 2.x (최신 안정화 버전)
- **CKEditor**: 43.x (최신 안정화 버전)
- **Vite**: 5.x
- **Node Adapter**: 7.x

## 🎯 주요 변경 사항

### 1. Svelte 5 주요 변경점

- **Runes 시스템 도입**: `$state`, `$derived`, `$effect` 등 새로운 반응성 API
- **`let` 대신 `$state` 사용**: 컴포넌트 내부 상태 관리
- **`$:` 대신 `$derived` 사용**: 파생 값 계산
- **`$:` 이펙트 대신 `$effect` 사용**: 부수 효과 처리
- **Props 선언 방식 변경**: `export let` 대신 `$props()` 사용 (선택적)
- **이벤트 핸들러**: `on:click` 대신 `onclick` 속성 사용
- **양방향 바인딩**: `bind:` 문법은 유지되지만 일부 제한

### 2. SvelteKit 2 주요 변경점

- **최소 Node.js 버전**: 18.13 이상 필요
- **Vite 5 필수**: Vite 4에서 5로 업그레이드 필요
- **어댑터 업그레이드**: @sveltejs/adapter-node 2.x로 업그레이드
- **경로 처리 변경**: 일부 경로 관련 API 변경
- **타입 안전성 강화**: 타입 시스템 개선

### 3. CKEditor 최신 버전 변경점

- **새로운 플러그인 구조**: 모듈화 개선
- **타입스크립트 지원 강화**: 타입 정의 개선
- **성능 최적화**: 로딩 및 렌더링 성능 개선
- **새로운 기능 추가**: 최신 에디터 기능 사용 가능

## 📝 마이그레이션 단계

### Phase 1: 사전 준비 (1-2일)

#### 1.1 백업 및 브랜치 관리

```bash
# 현재 브랜치 확인 (이미 convert-svelte5-and-sveletekit2 브랜치에 있음)
git status

# 변경사항 커밋
git add .
git commit -m "feat: 업그레이드 전 현재 상태 커밋"

# 백업 브랜치 생성
git branch backup-before-upgrade
```

#### 1.2 의존성 버전 조사

```bash
# 최신 버전 확인
npm view svelte version
npm view @sveltejs/kit version
npm view @ckeditor/ckeditor5-build-decoupled-document version
npm view vite version
```

#### 1.3 현재 프로젝트 상태 점검

- [ ] 모든 기존 기능이 정상 작동하는지 확인
- [ ] 현재 사용 중인 패치 파일 목록 확인
  - `@ckeditor+ckeditor5-build-decoupled-document+39.0.2.patch`
  - `@ckeditor+ckeditor5-engine+39.0.2.patch`
  - `@ckeditor+ckeditor5-image+39.0.2.patch`
  - `ckeditor5+39.0.2.patch`
- [ ] CKEditor 커스터마이징 내용 문서화

### Phase 2: 의존성 업그레이드 (2-3일)

#### 2.1 package.json 업데이트

**devDependencies 업데이트:**

```json
{
  "devDependencies": {
    "@sveltejs/adapter-node": "^7.0.0",
    "@sveltejs/kit": "^2.0.0",
    "svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "vite": "^5.0.0",
    "prettier-plugin-svelte": "^3.0.0",
    "@playwright/test": "^1.40.0",
    "vitest": "^1.0.0"
  }
}
```

**dependencies 업데이트:**

```json
{
  "dependencies": {
    "@ckeditor/ckeditor5-build-decoupled-document": "^43.0.0",
    "@auth/sveltekit": "^1.0.0",
    "@sveltestrap/sveltestrap": "^7.0.0"
  }
}
```

#### 2.2 설치 및 초기 확인

```bash
# node_modules 및 lock 파일 삭제
rm -rf node_modules package-lock.json

# 새로운 의존성 설치
npm install

# 빌드 테스트
npm run build
```

### Phase 3: SvelteKit 2 마이그레이션 (3-4일)

#### 3.1 svelte.config.js 업데이트

```javascript
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    paths: {
      assets: '',
      relative: true
    },
    prerender: {
      entries: ['/index']
    }
  }
};

export default config;
```

#### 3.2 vite.config.js 업데이트

```javascript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  ssr: {
    external: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  },
  optimizeDeps: {
    exclude: ['@ckeditor/ckeditor5-build-decoupled-document']
  }
});
```

#### 3.3 hooks.server.js 점검

- [ ] SvelteKit 2의 새로운 훅 시그니처 확인
- [ ] 인증 관련 코드 호환성 확인 (@auth/sveltekit)

### Phase 4: Svelte 5 마이그레이션 (5-7일)

#### 4.1 컴포넌트 마이그레이션 우선순위

**1단계: 레이아웃 및 공통 컴포넌트**

- [ ] `src/routes/+layout.svelte`
- [ ] `src/routes/+error.svelte`
- [ ] `src/lib/components/` 내 모든 컴포넌트

**2단계: 페이지 컴포넌트**

- [ ] `src/routes/+page.svelte`
- [ ] `src/routes/auth/` 내 페이지들
- [ ] `src/routes/board/` 내 페이지들
- [ ] `src/routes/game/` 내 페이지들

#### 4.2 Svelte 5 마이그레이션 패턴

**기존 (Svelte 4):**

```svelte
<script>
  export let name = 'world';
  let count = 0;

  $: doubled = count * 2;

  $: {
    console.log('count changed:', count);
  }

  function increment() {
    count += 1;
  }
</script>

<button on:click={increment}>
  {name}: {count} (doubled: {doubled})
</button>
```

**마이그레이션 (Svelte 5 - Runes 사용):**

```svelte
<script>
  let { name = 'world' } = $props();
  let count = $state(0);

  let doubled = $derived(count * 2);

  $effect(() => {
    console.log('count changed:', count);
  });

  function increment() {
    count += 1;
  }
</script>

<button onclick={increment}>
  {name}: {count} (doubled: {doubled})
</button>
```

**또는 하위 호환 모드 (Svelte 5 - 기존 문법 유지):**

```svelte
<script>
  export let name = 'world';
  let count = 0;

  $: doubled = count * 2;

  $: {
    console.log('count changed:', count);
  }

  function increment() {
    count += 1;
  }
</script>

<button onclick={increment}>
  {name}: {count} (doubled: {doubled})
</button>
```

#### 4.3 주요 변경 포인트

**이벤트 핸들러:**

- `on:click` → `onclick`
- `on:input` → `oninput`
- `on:submit` → `onsubmit`
- 커스텀 이벤트는 계속 `on:` 사용

**bind 디렉티브:**

- 대부분의 `bind:` 문법은 유지됨
- `bind:this`, `bind:value` 등은 동일하게 사용

**생애주기 함수:**

- `onMount`, `onDestroy` 등은 여전히 사용 가능
- `$effect`로 대체 가능 (선택적)

### Phase 5: CKEditor 최신 버전 마이그레이션 (4-5일)

#### 5.1 CKEditor 업그레이드 전략

**문제점 파악:**

- 현재 사용 중인 패치 파일들이 새 버전에서 작동하지 않을 가능성
- ckeditor5-svelte 라이브러리가 Svelte 5와 호환되지 않을 수 있음

**해결 방안:**

1. **공식 CKEditor 통합 방식 사용**: React/Vue처럼 직접 통합
2. **Svelte 5 호환 래퍼 작성**: 직접 Svelte 5용 래퍼 컴포넌트 작성
3. **CDN 방식 고려**: 빌드 이슈가 있을 경우 CDN 사용

#### 5.2 CKEditor5.svelte 리팩토링

**새로운 접근 방식:**

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  import DgstUploadAdapter from '$lib/util/DgstUploadAdapter.js';

  let { uploadPlus, uploadMinus, editorData = $bindable('') } = $props();

  let editorElement = $state(null);
  let editorInstance = $state(null);
  let DecoupledEditor = $state(null);

  onMount(async () => {
    // 동적 import
    DecoupledEditor = (await import('@ckeditor/ckeditor5-build-decoupled-document')).default;

    // 에디터 초기화
    const editor = await DecoupledEditor.create(editorElement, {
      // ... 설정
    });

    editorInstance = editor;

    // 툴바 삽입
    editorElement.parentElement.insertBefore(editor.ui.view.toolbar.element, editorElement);

    // 데이터 동기화
    editor.model.document.on('change:data', () => {
      editorData = editor.getData();
    });
  });

  onDestroy(() => {
    editorInstance?.destroy();
  });
</script>

<div>
  <div bind:this={editorElement}>{editorData}</div>
</div>
```

#### 5.3 패치 파일 재작성

- [ ] 새 CKEditor 버전에서 필요한 패치 확인
- [ ] 기존 패치 내용 분석 및 문서화
- [ ] 새 버전용 패치 파일 생성
- [ ] 패치 없이 해결 가능한지 확인

#### 5.4 커스텀 플러그인 업데이트

**DgstUploadAdapter.js:**

- [ ] 새 CKEditor API 호환성 확인
- [ ] 필요시 코드 수정

**미디어 임베드 설정:**

- [ ] YouTube Shorts, Instagram, TikTok, Naver TV 임베드 테스트
- [ ] 새 버전에서의 동작 확인

### Phase 6: 테스트 및 디버깅 (3-4일)

#### 6.1 기능 테스트 체크리스트

**인증 기능:**

- [ ] 로그인/로그아웃
- [ ] OAuth 연동 (Google 등)
- [ ] 세션 관리

**게시판 기능:**

- [ ] 게시글 목록 조회
- [ ] 게시글 작성 (CKEditor 사용)
- [ ] 게시글 수정
- [ ] 게시글 삭제
- [ ] 이미지/비디오 업로드
- [ ] 미디어 임베드 (YouTube, Instagram 등)
- [ ] 페이지네이션

**알람 기능:**

- [ ] 알람 목록
- [ ] 알람 읽음 처리

**메모 기능:**

- [ ] 메모 CRUD 동작

#### 6.2 브라우저 호환성 테스트

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] 모바일 브라우저

#### 6.3 성능 테스트

- [ ] 페이지 로딩 속도
- [ ] CKEditor 초기화 시간
- [ ] 이미지 업로드 속도
- [ ] 빌드 사이즈 확인

### Phase 7: 최적화 및 정리 (2-3일)

#### 7.1 코드 정리

- [ ] 미사용 import 제거
- [ ] 콘솔 로그 제거
- [ ] 주석 정리 및 업데이트

#### 7.2 타입 안전성 강화

```javascript
// jsconfig.json 또는 tsconfig.json 점검
{
  "compilerOptions": {
    "strict": true,
    "checkJs": true
  }
}
```

#### 7.3 린트 및 포맷

```bash
npm run lint
npm run format
```

#### 7.4 빌드 최적화

- [ ] Vite 번들 사이즈 분석
- [ ] 코드 스플리팅 확인
- [ ] Tree-shaking 확인

### Phase 8: 배포 준비 (1-2일)

#### 8.1 환경 설정 확인

- [ ] Dockerfile 업데이트 (필요시)
- [ ] docker-compose.yml 점검
- [ ] 환경 변수 확인

#### 8.2 프로덕션 빌드 테스트

```bash
npm run build
npm run preview
```

#### 8.3 문서 업데이트

- [ ] README.md 업데이트
- [ ] CHANGELOG.md 작성
- [ ] 마이그레이션 노트 작성

## ⚠️ 주의사항 및 리스크

### 1. Breaking Changes

- Svelte 5의 Runes는 옵션이지만, 일부 기능은 새 문법 필요
- SvelteKit 2는 Node.js 18.13+ 필수
- CKEditor 패치가 새 버전에서 적용 안 될 수 있음

### 2. 호환성 문제

- `ckeditor5-svelte` 라이브러리가 Svelte 5 미지원 가능성
- `@sveltestrap/sveltestrap`가 Svelte 5 미지원 가능성
- 서드파티 라이브러리 호환성 확인 필요

### 3. 데이터 마이그레이션

- MongoDB 스키마는 변경 불필요 (프로젝트 규칙)
- 기존 게시글 데이터는 영향 없음

### 4. 롤백 계획

```bash
# 문제 발생 시 이전 버전으로 복구
git checkout backup-before-upgrade

# 또는
npm install svelte@4.2.19 @sveltejs/kit@1.30.4
```

## 📅 예상 일정

| Phase | 작업 내용                | 예상 기간 | 우선순위 |
| ----- | ------------------------ | --------- | -------- |
| 1     | 사전 준비                | 1-2일     | 높음     |
| 2     | 의존성 업그레이드        | 2-3일     | 높음     |
| 3     | SvelteKit 2 마이그레이션 | 3-4일     | 높음     |
| 4     | Svelte 5 마이그레이션    | 5-7일     | 높음     |
| 5     | CKEditor 업그레이드      | 4-5일     | 높음     |
| 6     | 테스트 및 디버깅         | 3-4일     | 높음     |
| 7     | 최적화 및 정리           | 2-3일     | 중간     |
| 8     | 배포 준비                | 1-2일     | 중간     |

**총 예상 기간: 21-30일 (약 4-6주)**

## 🔗 참고 자료

### 공식 문서

- [Svelte 5 마이그레이션 가이드](https://svelte.dev/docs/svelte/v5-migration-guide)
- [SvelteKit 2 마이그레이션 가이드](https://kit.svelte.dev/docs/migrating-to-sveltekit-2)
- [CKEditor 5 문서](https://ckeditor.com/docs/ckeditor5/latest/)
- [Vite 5 마이그레이션](https://vitejs.dev/guide/migration.html)

### 커뮤니티 리소스

- [Svelte Discord](https://discord.gg/svelte)
- [CKEditor GitHub](https://github.com/ckeditor/ckeditor5)

## ✅ 완료 체크리스트

### 사전 준비

- [ ] 백업 완료
- [ ] 의존성 버전 조사 완료
- [ ] 마이그레이션 계획 검토 완료

### 업그레이드

- [ ] package.json 업데이트 완료
- [ ] npm install 성공
- [ ] SvelteKit 2 설정 완료
- [ ] Svelte 5 컴포넌트 마이그레이션 완료
- [ ] CKEditor 최신 버전 통합 완료

### 테스트

- [ ] 모든 기능 테스트 통과
- [ ] 브라우저 호환성 확인 완료
- [ ] 성능 테스트 완료

### 배포

- [ ] 프로덕션 빌드 성공
- [ ] 문서 업데이트 완료
- [ ] 배포 완료

## 💡 추가 권장 사항

1. **점진적 마이그레이션**: 한 번에 모든 것을 변경하지 말고 단계적으로 진행
2. **기존 문법 유지**: Svelte 5는 하위 호환성이 있으므로 급하게 Runes로 전환할 필요 없음
3. **테스트 자동화**: 가능하면 E2E 테스트 추가
4. **모니터링**: 프로덕션 배포 후 에러 모니터링 강화

## 📌 다음 단계

1. ✅ 이 계획서 검토 및 승인
2. ⬜ Phase 1 시작: 사전 준비
3. ⬜ 주간 진행 상황 리뷰 미팅
