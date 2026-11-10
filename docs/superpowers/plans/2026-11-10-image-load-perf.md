# Image load perf Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eager-load above-fold article/list images; persist MinIO thumbnail derivatives to cut cold sharp cost.

**Architecture:** Sanitize transform for article imgs; index-based avatar loading attrs; image route checks/writes `{key}.thumb{size}.webp`.

**Tech Stack:** Svelte 5, sanitize-html, sharp, MinIO, Vitest

### Task 1: Article first-2 priority

**Files:**
- Modify: `src/routes/board/.../[articleId]/+page.svelte`
- Test: `tests/comment-avatar-thumbnail.test.js` (source asserts)

### Task 2: Board list top avatars eager

**Files:**
- Modify: `src/lib/components/board_list.svelte`
- Test: `tests/comment-avatar-thumbnail.test.js`

### Task 3: MinIO thumbnail cache

**Files:**
- Modify: `src/routes/images/[...filepath]/+server.js`
- Modify: `src/lib/server/minioStorage.js` only if helpers needed
- Test: `tests/images-minio-route.test.js`

### Task 4: Verify + commit

- Run targeted vitest
- Commit
