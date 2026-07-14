# Project instructions

@/Users/hunchulchoi/.codex/SUPERPOWERS.md
@/Users/hunchulchoi/.codex/CAVEMAN.md
@/Users/hunchulchoi/.codex/HEADROOM.md
@/Users/hunchulchoi/.codex/RTK.md

## Local game smoke tests

Use `$smoke-test-local-games` from `.agents/skills/smoke-test-local-games/SKILL.md` whenever a task asks to run or diagnose a local game smoke test, bypass OAuth for a game locally, or test a game without PostgreSQL.

## Browser dialogs

- Never use native `alert()`, `window.alert()`, `confirm()`, or `window.confirm()`.
- Use `swalFire` from `$lib/util/swal.js` for alerts and confirmation dialogs.
- Confirmation flows must be asynchronous and continue only when `result.isConfirmed` is true.
