# The Wilds Implementation Roadmap

This roadmap is sequencing guidance only. The audit adds no implementation, dependency, route, or migration.

## Principles

- Preserve the existing SvelteKit/Vercel application and put every new behavior behind a fail-closed flag.
- Establish authentication, protocol, authority, and observability before content.
- Keep the first slice free of durable rewards so realtime correctness can be validated independently from economy correctness.
- Add durable integrations one at a time through existing ledgers and idempotent database commands.

## Phase 0: resolve contracts and operational ownership

Deliverables:

- Decide the canonical Shards read/write contract after reconciling `src/lib/server/econ/index.ts`, `src/routes/app/(protected)/+layout.server.ts`, `supabase/migrations/20251102_phase10_6_economy.sql`, `supabase/migrations/20251105_wallet_transactions.sql`, and `supabase/migrations/20260212_economy_transactions_and_mission_sessions.sql`.
- Decide flag administration and audit ownership for `feature_flags` from `supabase/migrations/20251109_feature_flags.sql`.
- Select the websocket host/region, preview isolation policy, allowed origins, room concurrency target, and basic cost ceiling.
- Decide whether the route retains protected app chrome. Keep it under `src/routes/app/(protected)` regardless so `src/routes/app/(protected)/+layout.server.ts` remains the gate.
- Write versioned protocol and privacy field lists before code.

Exit: decisions are recorded in `decision-log.md`; no unresolved choice can create a duplicate ledger or expose private companion/memory data.

## Phase 1: inert shell and flag gate

Future changes:

- Add a server-evaluated `/app/world` page under `(protected)`.
- Add the two-layer `WORLD_ENABLED` plus `world.enabled` evaluation, absent/false by default.
- Do not import Phaser when disabled. Do not add primary navigation until the rollout decision.
- Add route tests for guest redirect, alpha/Bond Genesis inheritance, disabled access, allowlist, and safe failure when flag lookup is unavailable.

Exit: production behavior is identical with flags off and Vercel CI passes.

## Phase 2: standalone realtime foundation

Future changes:

- Create `services/world-server` with its own package, lockfile/workspace decision, build, health endpoint, config validation, structured logging, graceful shutdown, and deploy pipeline.
- Add shared protocol versioning and schema validation.
- Implement short-lived join-ticket issuance and verification with one-time replay protection.
- Add origin allowlist, connection/message limits, maximum room capacity, idle timeout and rejection telemetry.

Exit: unauthenticated, expired, replayed, wrong-audience, wrong-room and wrong-protocol joins are rejected in automated tests. The server deploys without coupling to Vercel.

## Phase 3: authoritative movement slice

Future changes:

- Add one fixed map with server-owned spawn bounds/collisions.
- Accept sequenced input intent; simulate movement at a fixed tick; broadcast snapshots.
- Add Phaser rendering, local prediction/reconciliation, remote interpolation, lifecycle cleanup and reconnect UX. The dynamic import/cleanup pattern in `src/lib/games/arpg/main.ts` is reusable, but `GameScene.ts` local combat authority is not.
- Add keyboard and mobile/pointer controls, reduced-motion behavior, connection status, and a non-canvas leave/error path.
- Load safe profile presentation and canonical active companion; render the companion as a follower without gameplay authority.

Exit: satisfy the definition of done in `architecture.md`, including a two-client test and zero durable gameplay writes.

## Phase 4: hardening and limited rollout

- Load test tick latency, bandwidth, reconnect storms and room caps at 2x the planned cohort.
- Add abuse thresholds, deploy drain behavior, instance/room health, alerting and runbooks.
- Run an allowlisted preview/staging cohort, then production allowlist. Preserve the instant kill switch.
- Perform privacy/security review against `security-model.md` and verify logs contain neither join tickets nor Supabase tokens.

Exit: measured p95 movement latency/tick lag meets the agreed target, failure drills pass, and rollback disables both route admission and realtime admission.

## Phase 5: first durable world event (after vertical slice)

- Add `world_events` and one security-definer, fixed-`search_path`, service-only command.
- Choose one bounded, non-tradable item reward from `item_catalog`; grant it into `user_items` with world provenance and an idempotency constraint.
- Do not create a world inventory. Verify the existing Inventory/Sanctuary query surfaces see the same ownership.
- If a Journal memory is warranted, write it atomically with the event/item grant or use a transactional outbox with explicit retry state.
- Add replay/concurrency tests and audit visibility.

Exit: repeated delivery produces one ownership result and one auditable event, with no currency/XP effect.

## Phase 6: economy, missions, and companion memory (separate releases)

Only after Phase 5:

1. XP/Spark/Shards: delegate to the selected canonical economy RPC with caps and idempotency; never use client results or `/api/xp` (`src/routes/api/xp/+server.ts`).
2. Missions: emit a server-validated world event consumed by existing mission validation; never directly complete a session.
3. Companion memory: create only meaningful, user-visible memories in `companion_journal_entries`, with consent/privacy rules aligned to the existing memory contract. Do not send private memory content to other players.
4. Sanctuary: world-acquired placeables remain normal `user_items`; placement stays in `sanctuary_placements`.

Each integration gets its own feature flag, cap, audit event, rollback plan and reconciliation query.

## Testing strategy

Follow current conventions from `vite.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`, `tests/fixtures/auth.ts`, and existing `src/lib/__tests__`/`tests/e2e` suites.

- Pure unit tests: input normalization, movement/collision, reconciliation, companion-follow presentation, protocol encoders, flag evaluator.
- Property/fuzz tests: malformed messages, numeric extremes/NaN, sequence wrap/replay, collision invariants, bounded state size.
- Realtime integration: room admission, two/many clients, late packets, reconnect grace, duplicate joins, server drain, capacity and rate limits.
- Auth/security: expired/replayed/wrong-audience tickets, user/companion substitution, origin checks, service-role isolation, RLS tests using anon/authenticated/service contexts.
- Database integration (when added): concurrent identical event delivery, transaction rollback, item upsert semantics, ownership rejection, economy cap and idempotency.
- Browser E2E: flag off, guest redirect, allowed join, two-browser visibility, mobile controls, connection loss/recovery, accessible exit/status.
- Regression: `npm run check`, `npm run check:core`, `VITEST=true npm run test -- --run`, relevant Playwright smoke, and `npm run build`.
- Performance: deterministic headless simulation benchmark plus websocket load test outside the normal unit suite.

Vitest's current include list is curated (`vite.config.ts`), so world test globs must be explicitly added or given a dedicated server test command when implementation begins.

## Rollout and rollback

1. Local only, deployment switch off.
2. Preview environment with isolated realtime/Supabase data.
3. Production allowlist with no rewards.
4. Small cohort after load/security review.
5. Wider rollout only after capacity evidence.

Rollback order: disable realtime admission, disable server-side route flag, drain rooms, then deploy rollback. Durable command consumers must be independently disableable once they exist. Never delete event records as rollback.

## First playable definition of done

The complete acceptance list is in `architecture.md`. In roadmap terms, Phases 0–4 must be complete: flagged protected route, secure one-time admission, independent deploy, authoritative movement, follower presentation, reconnect/failure UX, tests/observability/load evidence, and no durable rewards.

## Deferred backlog

Combat/PvP, chat/voice, trading, loot, economy rewards, quests, persistent position, world building, Sanctuary editing, companion autonomous state, live companion swaps, multi-zone/multi-region, parties/guilds, seasons and leaderboards are not part of the first slice.

## Dependencies and uncertainties

- Colyseus/version and hosting selection requires a later current-version spike; it is intentionally not added now.
- Horizontal scaling design depends on host capabilities and measured room size.
- Canonical wallet and item stack/non-stack grant semantics must be resolved before durable rewards.
- The active companion database rule is clear, but the canonical cosmetics snapshot is not.
- Product must define expected concurrency, age/audience policy, moderation scope, and acceptable reconnect position behavior.
