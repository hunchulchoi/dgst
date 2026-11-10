# Image load perf design

## Goal

Reduce perceived image delay on article body and board list without hurting below-fold bandwidth.

## Decisions

1. Article body: first 2 `<img>` get `loading=eager` + `fetchpriority=high`; remaining body imgs stay non-lazy (default). iframes stay lazy.
2. Board list avatars: `index < 8` eager, else lazy. Thumbnail URL size 40 unchanged.
3. Thumbnail cold path: cache sharp output in MinIO as `{objectKey}.thumb{size}.webp` with `source-etag` metadata. On hit matching etag, stream cache; else regenerate + put.

## Non-goals

- Comment body lazy policy
- Redis/pg binary image cache
- Changing DB models
