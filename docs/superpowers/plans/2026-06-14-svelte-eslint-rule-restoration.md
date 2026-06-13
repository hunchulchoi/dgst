# Svelte ESLint Rule Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-enable the temporarily relaxed Svelte ESLint rules in `eslint.config.js` without breaking app behavior, while keeping `npm run lint` green after each phase.

**Architecture:** Restore rules in risk order instead of all at once. Each task flips on one rule group, captures the exact failures, then fixes only the affected files before moving to the next group. Keep Svelte 5 reactivity/style migrations isolated from lower-risk navigation/XSS/key fixes so we do not mix semantics-heavy refactors with straightforward lint cleanup.

**Tech Stack:** ESLint 9 flat config, `eslint-plugin-svelte`, SvelteKit, Prettier, npm scripts

---

### Task 1: Baseline Rule Audit

**Files:**

- Modify: `/Users/hunchulchoi/projects/workspace/dgst/eslint.config.js`
- Create: `/private/tmp/svelte-eslint-baseline.txt`

- [ ] **Step 1: Write the failing config change**

Temporarily remove only one disabled rule entry from the Svelte override in `eslint.config.js` to measure its current failure set. Start with:

```js
// remove this line first
'svelte/no-at-html-tags': 'off',
```

- [ ] **Step 2: Run lint to verify failure set appears**

Run: `npx eslint . > /private/tmp/svelte-eslint-baseline.txt 2>&1`
Expected: FAIL with concrete file list for `svelte/no-at-html-tags`

- [ ] **Step 3: Restore baseline before moving on**

Re-add the disabled line so main config stays passing while planning further tasks:

```js
'svelte/no-at-html-tags': 'off',
```

- [ ] **Step 4: Re-run lint to verify baseline is green again**

Run: `npx eslint .`
Expected: PASS

- [ ] **Step 5: Commit planning checkpoint**

```bash
git add eslint.config.js docs/superpowers/plans/2026-06-14-svelte-eslint-rule-restoration.md
git commit -m "docs: add svelte eslint restoration plan"
```

### Task 2: Restore `svelte/no-at-html-tags`

**Files:**

- Modify: `/Users/hunchulchoi/projects/workspace/dgst/eslint.config.js`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/banner.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/OGPreview.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/board_list.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte`
- Test: `npx eslint .`

- [ ] **Step 1: Write the failing config change**

Delete this one rule suppression:

```js
'svelte/no-at-html-tags': 'off',
```

- [ ] **Step 2: Run lint to verify it fails for unsafe HTML sites**

Run: `npx eslint .`
Expected: FAIL with `svelte/no-at-html-tags` in the four known files above

- [ ] **Step 3: Replace raw `{@html}` with explicit safe rendering paths**

Apply one of these patterns per file, using existing sanitizers where possible:

```svelte
<!-- preferred -->
<script>
  import sanitizeHtml from 'sanitize-html';
  let safeHtml = $derived(sanitizeHtml(html, options));
</script>

<div>{@html safeHtml}</div>
```

or

```svelte
<script>
  import { sanitizeArticleContent } from '$lib/server/sanitizeArticleContent.js';
  let safeContent = $derived(sanitizeArticleContent(content));
</script>

<div>{@html safeContent}</div>
```

If content is already sanitized upstream, replace inline usage with a small helper variable plus an inline comment explaining trusted source.

- [ ] **Step 4: Run lint to verify rule now passes**

Run: `npx eslint .`
Expected: PASS for `svelte/no-at-html-tags`; any remaining failures must be unrelated

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js src/lib/components/banner.svelte src/lib/components/OGPreview.svelte src/lib/components/board_list.svelte 'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte'
git commit -m "refactor: restore svelte html safety rule"
```

### Task 3: Restore `svelte/no-navigation-without-resolve`

**Files:**

- Modify: `/Users/hunchulchoi/projects/workspace/dgst/eslint.config.js`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/board_index_view.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/board_list.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/header.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/ui/nav-link.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/ui/navbar-brand.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/ui/pagination-link.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/+error.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/auth/profile/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/auth/register/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/auth/signin/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/board/[boardId=boardId]/write/[[articleId]]/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/board/alarm/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/games/2048/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/games/minesweeper/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/games/watermelon/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/login/+page.svelte`
- Test: `npx eslint .`

- [ ] **Step 1: Write the failing config change**

Delete this suppression:

```js
'svelte/no-navigation-without-resolve': 'off',
```

- [ ] **Step 2: Run lint to verify navigation failures**

Run: `npx eslint .`
Expected: FAIL with `svelte/no-navigation-without-resolve` on internal `<a href>` and `goto(...)` sites

- [ ] **Step 3: Standardize internal navigation on `resolve(...)`**

Use one shared pattern everywhere:

```svelte
<script>
  import { goto, resolve } from '$app/navigation';
</script>

<a href={resolve('/login')}>...</a>
<button onclick={() => goto(resolve('/login'))}>...</button>
```

For parameterized routes:

```js
const articleHref = resolve(`/board/${boardId}/${pageNo}/${articleId}`);
await goto(articleHref);
```

Do not touch external URLs or asset paths.

- [ ] **Step 4: Run lint to verify navigation rule passes**

Run: `npx eslint .`
Expected: PASS for navigation rule

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js src/lib/components/board_index_view.svelte src/lib/components/board_list.svelte src/lib/components/header.svelte src/lib/components/ui/nav-link.svelte src/lib/components/ui/navbar-brand.svelte src/lib/components/ui/pagination-link.svelte src/routes/+error.svelte src/routes/auth/profile/+page.svelte src/routes/auth/register/+page.svelte src/routes/auth/signin/+page.svelte 'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte' 'src/routes/board/[boardId=boardId]/write/[[articleId]]/+page.svelte' src/routes/board/alarm/+page.svelte src/routes/games/minesweeper/+page.svelte src/routes/games/watermelon/+page.svelte src/routes/login/+page.svelte
git commit -m "refactor: restore svelte navigation resolve rule"
```

### Task 4: Restore `svelte/require-each-key`

**Files:**

- Modify: `/Users/hunchulchoi/projects/workspace/dgst/eslint.config.js`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/board_list.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/board/alarm/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/games/2048/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/games/minesweeper/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/games/slot/+page.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/games/watermelon/+page.svelte`
- Test: `npx eslint .`

- [ ] **Step 1: Write the failing config change**

Delete this suppression:

```js
'svelte/require-each-key': 'off',
```

- [ ] **Step 2: Run lint to verify missing key failures**

Run: `npx eslint .`
Expected: FAIL with `svelte/require-each-key` on repeated blocks

- [ ] **Step 3: Add stable keys, never index-only unless data is static**

Preferred patterns:

```svelte
{#each comments as comment (comment.id)}
```

```svelte
{#each rankList as row (`${row.nickname}:${row.score}`)}
```

```svelte
{#each staticGrid as cell, i (`cell-${i}`)}
```

Use index keys only for immutable generated placeholder arrays.

- [ ] **Step 4: Run lint to verify keyed each blocks pass**

Run: `npx eslint .`
Expected: PASS for key rule

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js src/lib/components/board_list.svelte 'src/routes/board/[boardId=boardId]/[[pageNo=integer]]/[articleId]/+page.svelte' src/routes/board/alarm/+page.svelte src/routes/games/2048/+page.svelte src/routes/games/minesweeper/+page.svelte src/routes/games/slot/+page.svelte src/routes/games/watermelon/+page.svelte
git commit -m "refactor: restore keyed each blocks"
```

### Task 5: Restore low-risk Svelte cleanup rules

**Files:**

- Modify: `/Users/hunchulchoi/projects/workspace/dgst/eslint.config.js`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/LexicalEditor.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/ui/modal.svelte`
- Modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/ui/offcanvas.svelte`
- Test: `npx eslint .`

- [ ] **Step 1: Write the failing config change**

Delete these suppressions:

```js
'svelte/no-unused-svelte-ignore': 'off',
'svelte/no-useless-mustaches': 'off',
```

- [ ] **Step 2: Run lint to verify exact failures**

Run: `npx eslint .`
Expected: FAIL with only unused ignore comments and useless mustache warnings

- [ ] **Step 3: Remove stale ignores and useless interpolation**

Use direct literals and remove dead comments:

```svelte
<!-- before -->
class={'btn'}

<!-- after -->
class="btn"
```

Delete `<!-- svelte-ignore ... -->` only when no active warning remains below it.

- [ ] **Step 4: Run lint to verify cleanup rules pass**

Run: `npx eslint .`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js src/lib/components/LexicalEditor.svelte src/lib/components/ui/modal.svelte src/lib/components/ui/offcanvas.svelte
git commit -m "style: restore low-risk svelte lint rules"
```

### Task 6: Evaluate generic JS rules inside `.svelte`

**Files:**

- Modify: `/Users/hunchulchoi/projects/workspace/dgst/eslint.config.js`
- Modify: affected `.svelte` files only if noise is acceptable
- Test: `npx eslint .`

- [ ] **Step 1: Write the failing config change**

Delete one suppression at a time:

```js
'no-unused-vars': 'off',
'no-empty': 'off',
'no-useless-escape': 'off',
```

- [ ] **Step 2: Run lint to measure signal vs noise**

Run: `npx eslint .`
Expected: Either a small actionable set, or widespread template-noise

- [ ] **Step 3: Keep only rules with good signal**

If a rule is mostly noise in `.svelte`, replace blanket `off` with narrower config, for example:

```js
'no-unused-vars': [
  'error',
  {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_'
  }
]
```

or leave it disabled with a code comment:

```js
// Kept off in .svelte files because template bindings create high false-positive noise.
'no-unused-vars': 'off',
```

- [ ] **Step 4: Run lint to verify final config choice**

Run: `npx eslint .`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js
git commit -m "chore: tune generic lint rules for svelte files"
```

### Task 7: Isolate Svelte 5 reactivity/style migration decision

**Files:**

- Modify: `/Users/hunchulchoi/projects/workspace/dgst/eslint.config.js`
- Optionally modify: `/Users/hunchulchoi/projects/workspace/dgst/src/lib/components/LexicalEditor.svelte`
- Optionally modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/auth/profile/+page.svelte`
- Optionally modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/games/minesweeper/+page.svelte`
- Optionally modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/games/slot/+page.svelte`
- Optionally modify: `/Users/hunchulchoi/projects/workspace/dgst/src/routes/games/watermelon/+page.svelte`
- Test: `npx eslint .`

- [ ] **Step 1: Write the failing config change**

Delete these suppressions:

```js
'svelte/prefer-svelte-reactivity': 'off',
'svelte/prefer-writable-derived': 'off',
```

- [ ] **Step 2: Run lint to verify impact scope**

Run: `npx eslint .`
Expected: FAIL in state-heavy Svelte 5 files only

- [ ] **Step 3: Decide path before coding**

Choose one path and document it in code comments or PR description:

```text
Path A: Full migration now if failures are small and semantics obvious.
Path B: Keep rules off temporarily and open a dedicated follow-up for state model refactor.
```

Do not mix this with unrelated lint cleanup.

- [ ] **Step 4: If migrating now, do minimal semantic refactor**

Use Svelte-approved state helpers only where lint points:

```js
// example shape only
let derivedValue = $derived(source.map(...));
```

Prefer smallest local refactor that preserves behavior.

- [ ] **Step 5: Run full lint suite and commit chosen outcome**

Run: `npm run lint`
Expected: PASS

```bash
git add eslint.config.js src/lib/components/LexicalEditor.svelte src/routes/auth/profile/+page.svelte src/routes/games/minesweeper/+page.svelte src/routes/games/slot/+page.svelte src/routes/games/watermelon/+page.svelte
git commit -m "refactor: evaluate svelte 5 reactivity lint rules"
```

### Task 8: Final verification

**Files:**

- Modify: none
- Test: `/Users/hunchulchoi/projects/workspace/dgst/package.json`

- [ ] **Step 1: Run full lint verification**

Run: `npm run lint`
Expected: PASS with `All matched files use Prettier code style!`

- [ ] **Step 2: Run targeted smoke tests for touched route-heavy areas**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 3: Run optional browser/integration checks if navigation code changed broadly**

Run: `npm run test:integration`
Expected: PASS, or document any unrelated existing failures

- [ ] **Step 4: Inspect final git diff**

Run: `git diff --stat origin/main...HEAD`
Expected: Only intended Svelte lint/config changes

- [ ] **Step 5: Final commit if verification changes were needed**

```bash
git add .
git commit -m "test: verify svelte lint rule restoration"
```
