# Mobile Billiards Design

## Goal

Add a mobile-first billiards game to the SvelteKit app. The first playable rule set is four-ball billiards, with the code shaped so three-cushion billiards can be added later without rewriting the table physics or persistence layer.

## Route

The game lives at `/games/billiards`.

The visible first version is four-ball mode. Internally the game mode is represented as a string such as `four-ball` or `three-cushion`, so ranking and rules can be split by mode later.

## Gameplay

Four-ball mode starts with one cue ball and two red object balls.

The player drags from the cue ball to aim. Drag distance controls shot power. Releasing the pointer fires the cue ball. While any ball is moving, input is locked.

A shot scores when the cue ball contacts both red balls before all balls stop. A scored shot adds one point and preserves the remaining chance count. A failed shot consumes one chance. The game ends when the player runs out of chances.

The player can start a new game at any time. Ball positions reset to a fixed, readable opening layout for now.

## Architecture

`src/routes/games/billiards/+page.svelte` owns the Matter.js engine, canvas rendering, pointer input, page layout, and calls to the score API.

`src/routes/games/billiards/gameUtils.ts` owns shared billiards constants and pure helpers:

- table dimensions and ball sizes
- ball role definitions
- mode identifiers
- shot speed threshold checks
- shot contact evaluation for four-ball
- ranking payload helpers where useful

The initial implementation can keep Matter.js setup in the Svelte page, but rule evaluation must stay separate from rendering. This keeps the path open for `rules/threeCushion.ts` or equivalent later.

## Three-Cushion Extension

The shared ball model includes role-based balls, not hard-coded red-only logic. Four-ball uses `cue` plus two `red` balls. Three-cushion can add `opponent` or second cue-ball roles and evaluate:

- cushion contact count
- object ball contact order
- legal scoring conditions
- mode-specific ranking

The persistence model includes `mode`, so four-ball and future three-cushion scores can be queried separately.

## Persistence

Add a `GameScoreBilliards` Prisma model mapped to `game_score_billiards`.

Fields:

- `id`
- `email`
- `nickname`
- `mode`
- `score`
- `createdAt`
- `updatedAt`

Indexes should support recent score queries and per-user best score by mode.

`GET /games/billiards?rank=1&mode=four-ball` returns:

- top 10 best scores per user for that mode
- current user's best score

`POST /games/billiards` stores a score for the logged-in user with mode validation. Anonymous users cannot submit scores. The first version accepts `four-ball` submissions only. `three-cushion` is reserved in types and storage shape but is not playable or submittable yet.

## Navigation

Add a logged-in game menu item in the existing header near the other games. Use compact mobile text, for example an icon or emoji plus `당구`.

## UI

The page is mobile-first. The table is the primary surface and should fit within narrow screens without horizontal scroll. Controls stay compact:

- score
- remaining chances
- best score
- new game button
- simple status text such as aiming, rolling, scored, miss, game over

The table should look like a billiards table, not a generic physics canvas: green cloth, rails, pockets omitted because four-ball/three-cushion use a pocketless table.

## Testing

Use TDD for the shared helpers before page implementation.

Initial unit tests cover:

- four-ball shot scores only after cue contacts both red balls
- shot does not score after one red contact
- stopped detection returns true only when every tracked ball is under the speed threshold
- mode validation accepts `four-ball` submissions and rejects inactive modes such as `three-cushion`

After implementation, run Svelte checks and the focused unit tests.

## Out of Scope

The first version does not include multiplayer, formal opponent turns, three-cushion scoring, spin, exact real-world table physics, sound effects, or custom asset generation.
