---
name: smoke-test-local-games
description: Run and diagnose DGST browser-game smoke tests locally with the existing mock Auth.js session and no live PostgreSQL dependency. Use when asked to smoke-test routes under /games, bypass Google or Kakao login during local game testing, exercise game UI or APIs as a logged-in user without a database, or investigate the DGST_LOCAL_GAME_SMOKE flow.
---

# Smoke Test Local Games

Exercise protected game flows as `local-game-smoke@dgst.local`. Keep the bypass local, explicit, and unable to reach a real database.

## Start isolated runtime

1. Confirm `src/lib/server/localGameSmokeSession.js` still requires `DGST_LOCAL_GAME_SMOKE`, rejects `NODE_ENV=production`, and accepts only loopback or `.localhost` hosts.
2. Start Vite on loopback with an intentionally unreachable PostgreSQL URL. Do not edit `.env`.

```bash
DGST_LOCAL_GAME_SMOKE=1 \
DATABASE_URL='postgresql://smoke:placeholder@127.0.0.1:1/dgst_smoke' \
AUTH_SECRET='placeholder' \
NEXTAUTH_SECRET='placeholder' \
npm run dev -- --host 127.0.0.1
```

3. Wait for Vite's ready message. Treat a caught PostgreSQL warmup failure as expected; any request failure caused by PostgreSQL is a smoke-bypass defect.
4. Use the actual port printed by Vite. Never switch the host to a LAN address.

## Run smoke coverage

Test only routes backed by `getGameSession()` unless inspecting a new route first. Current supported game pages are:

```text
/games/2048
/games/billiards
/games/breakout
/games/minesweeper
/games/seotda
/games/slot
/games/sudoku
/games/tetris
/games/watermelon
```

For each requested game:

1. Open the page with the available browser-control tool. Fall back to Playwright or `curl` only when visual interaction is unnecessary.
2. Confirm the page does not redirect to `/login` and renders logged-in game controls.
3. Perform one minimal meaningful action: start/reset, make one move, spin/deal, or submit one score as appropriate.
4. Inspect browser console, failed network requests, and server output.
5. Confirm write APIs return their documented mock response and do not attempt a Prisma query. Mock responses commonly include `smoke: true`.
6. Record pass/fail per route and stop the dev server after testing.

## Diagnose failures

- Verify request hostname is `127.0.0.1`, `localhost`, `::1`, `0.0.0.0`, or a `.localhost` name.
- Verify `DGST_LOCAL_GAME_SMOKE=1` reached the server process and `NODE_ENV` is not `production`.
- Check the page server and endpoint use `getGameSession()` instead of calling `event.locals.auth()` directly.
- Check `isLocalGameSmokeSession(session)` branches before every database read or write needed by the smoke flow.
- Distinguish optional stats queries that catch DB errors from blocking gameplay queries.
- Do not change application code unless the user also asks for a fix. Report the first DB-dependent call with file and line evidence.

## Guardrails

- Never enable this flag in production, preview deployment, Docker deployment, CI against shared infrastructure, or any non-loopback host.
- Never use, print, or mutate the real `DATABASE_URL`; override it only for the smoke process.
- Never weaken hostname or production checks to make a test pass.
- Do not claim board, alarm, profile, ranking, or unrelated routes are DB-free.
- Keep mock data ephemeral. A successful smoke run must leave PostgreSQL unchanged.
