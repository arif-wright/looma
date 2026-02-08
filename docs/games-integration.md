# Games Integration Guide

This is the standard path for integrating a new game with sessions, rewards, and companion reactions.

## 1) Required `gameId` registration

Before wiring the UI, register the game in backend + catalog:

1. Add `game_titles` row (slug/name/min_version/max_score/is_active) in a Supabase migration.
2. Add `game_config` row for caps:
   - `max_duration_ms`
   - `min_duration_ms`
   - `max_score_per_min`
   - `min_client_ver`
3. Add game card metadata in `src/lib/data/games.ts`.
4. Add route page under `src/routes/app/(game)/games/...` (or reuse `GameWrapper`).

`gameId` must match the backend slug used by `fn_game_start`.

## 2) Session lifecycle wiring (SDK)

Use `src/lib/games/sdk.ts`.

### Start

```ts
const session = await startSession(gameId, 'standard', {
  clientVersion: '1.0.0',
  source: 'your_game_page'
});
```

### Complete

```ts
const server = await completeSession(session.sessionId, {
  score,
  durationMs,
  success: true,
  stats: {
    mode: 'standard',
    // add game-specific metrics here
  }
});
```

## 3) Required result fields

At completion, always send:

- `score` (number, integer, non-negative)
- `durationMs` (number, integer, positive)
- `success` (boolean)
- `stats` (object for game-specific fields)

All game-specific metrics must go under `stats`.

## 4) Reward handling

Rewards are server-authoritative. Use response values from `/api/games/session/complete`:

- `xpDelta`
- `currencyDelta` (shards)

Do not display client-computed XP/shards as final rewards.

## 5) Event mapping

The integration contract emits:

- `startSession(...)` -> `game.session.start`
- `completeSession(...)` -> `game.complete`

Both route through `/api/events/ingest` (SDK + server-side dispatch).

## 6) Dev simulate completion

`GameWrapper` includes a dev-only **Simulate Complete** button.

- Visible only in development.
- Requires an active session.
- Triggers `completeSession` with a synthetic result so you can test:
  - reward grants
  - post-run companion reactions
  - result UI

## 7) Testing checklist

1. Start a session and verify `sessionId` is returned.
2. Complete a session and verify response includes `xpDelta` and `currencyDelta`.
3. Verify rewards shown in UI match server response.
4. Verify `game.session.start` and `game.complete` appear in event ingestion traces/logs.
5. Verify companion reaction behavior:
   - no mid-game chatter
   - pre-run line only when allowed/rate-limited
   - post-run line includes reward summary
6. Use dev simulate button to validate rewards + reactions without full gameplay.
7. Verify mobile flow (fullscreen + orientation) still works.

## 8) Fast template

Use `src/lib/games/GameIntegrationTemplate.ts` for a minimal copy/paste wiring baseline.
