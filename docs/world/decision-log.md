# The Wilds Decision Log

## 2026-08-03 — Stage 6 per-player Moonberry loop

Accepted ADR-006. The shared visual bush has per-player cooldown and eligibility. One service-only transaction derives the fixed reward and active companion, updates canonical `user_items`, records an idempotent audit event, and optionally writes one authored Journal entry. The configured MVP defaults are one Moonberry, five minutes, and a twenty-Moonberry holding cap.

## 2026-08-02 — Stage 5 authoritative persistence boundary

Accepted ADR-005. Colyseus checkpoints only server-validated positions through service-only, fixed-search-path RPCs; owner RLS is read-only. Optimistic versions protect against stale-room writes, deterministic discovery keys make discovery idempotent, and no inventory or economy mutation occurs. A dedicated constrained database role remains a pre-reward hardening item.

## 2026-08-02 — Stage 4 active companion followers

Accepted ADR-004. The authenticated ticket issuer resolves `companions.is_active` through the owner's RLS-scoped query and projects only bounded name/species availability. Colyseus verifies refreshed signed projections and derives follower states; Phaser renders a buffered, non-colliding placeholder with reduced-motion support.

## 2026-08-02 — Stage 3 authenticated admission

Accepted ADR-003. SvelteKit issues 45-second, one-use, room/protocol-bound tickets from the verified SSR user and an owner-scoped safe profile projection. Colyseus validates the ticket and derives identity without receiving Supabase access tokens or a service-role key. Replay and duplicate-account controls are process-local pending the deferred distributed-presence stage.

## 2026-08-02 — Stage 2 anonymous realtime boundary

Accepted ADR-002. Colyseus lives in an independently runnable package under `services/world-server`; clients send normalized input intent and the room owns synchronized position/presence. The web client uses prediction, correction, remote interpolation, and local fallback. Anonymous access is local-development-only and cannot be promoted to production before the planned authenticated ticket handshake.

Decisions are architecture proposals from the repository audit. “Accepted for planning” does not authorize implementation.

## D-001: Keep the world inside the primary SvelteKit app

- Status: accepted for planning
- Decision: expose `/app/world` through `src/routes/app/(protected)/world`, with browser-only Phaser rendering.
- Why: the protected layout already enforces authentication, alpha access, Bond Genesis and supplies account context (`src/routes/app/(protected)/+layout.server.ts`). SvelteKit remains Vercel-deployable (`svelte.config.js`).
- Consequence: the realtime loop cannot run in Vercel functions and is a separate service.

## D-002: Deploy Colyseus independently

- Status: accepted for planning
- Decision: put the future Node.js/Colyseus runtime under `services/world-server` with its own build/deploy lifecycle.
- Why: persistent websocket rooms and fixed simulation ticks do not fit the frontend's stateless Vercel topology.
- Consequence: separate health, scaling, secrets, logs, rollback and preview isolation are required. Colyseus is not added during this audit.

## D-003: Use server-authoritative intent simulation

- Status: accepted for planning
- Decision: clients send input intent; Colyseus owns transforms, collision, rates, room state and interaction eligibility.
- Why: the ARPG scene (`src/lib/games/arpg/scenes/GameScene.ts`) is locally simulated and cannot be the authority for a persistent multiplayer world. Existing server-validated games (`src/routes/api/games/session/complete/+server.ts`) show the repository's anti-cheat direction.
- Consequence: prediction/reconciliation is presentation, never truth.

## D-004: Exchange SSR auth for a short-lived join ticket

- Status: accepted for planning
- Decision: verified SvelteKit auth issues a 30–60 second, single-use, audience/room/protocol-bound ticket to Colyseus.
- Why: SSR already verifies users via `auth.getUser()` (`src/hooks.server.ts`, `src/lib/server/auth.ts`). A short ticket limits exposure compared with handing a longer-lived Supabase access token to the world service.
- Consequence: dedicated signing secret, replay store, rotation, redaction and reconnect-token design are required.

## D-005: Supabase owns durable state; Colyseus owns ephemeral state

- Status: accepted for planning
- Decision: live transforms/presence live in rooms; account, companion, items, economy, missions, Sanctuary and memory remain in Supabase.
- Why: these durable contracts already exist and are protected by RLS/RPC conventions.
- Consequence: first slice safely respawns after restart and has no persistent exact position.

## D-006: Do not create a world inventory

- Status: accepted for planning
- Decision: later world items use `item_catalog` and `user_items` with world provenance; `sanctuary_placements` remains a use record.
- Why: `docs/item-system-contract.md` explicitly prohibits capability-specific inventories, implemented by `supabase/migrations/20260612213000_unified_items_and_sanctuary_purpose.sql`.
- Consequence: world pickup UI cannot declare success until the normal ownership command confirms it.

## D-007: Canonical companion is `companions.is_active`

- Status: accepted for planning
- Decision: load the follower from the canonical active companion enforced by `set_active_companion`; portable `activeId` is not authoritative.
- Why: `supabase/migrations/20260615120000_active_companion_state_coherence.sql` enforces one active row, while `src/routes/api/companions/set-active/+server.ts` mirrors portable state after the canonical RPC.
- Consequence: initial slice refreshes on join; live swapping is deferred. Companion has visual follow behavior only.

## D-008: First playable slice has no durable rewards

- Status: accepted for planning
- Decision: scope to secure admission, authoritative movement, co-presence, reconnect and companion follower.
- Why: it isolates networking/authority risk from unresolved economy and multi-write consistency risk.
- Consequence: no item, XP, Spark, Shards, mission, memory or Sanctuary mutation in the first slice.

## D-009: Later durable effects use idempotent database commands

- Status: accepted for planning
- Decision: Colyseus submits allowlisted server-generated events to transactional, fixed-`search_path` functions; it does not write tables ad hoc.
- Why: `fn_economy_apply` demonstrates idempotency (`supabase/migrations/20260212_economy_transactions_and_mission_sessions.sql`), while shared rest currently demonstrates the partial-write risk of application orchestration (`src/routes/api/sanctuary/interact/+server.ts`).
- Consequence: a minimal `world_events` ledger is justified only when the first durable event ships.

## D-010: Layered feature flag, fail closed

- Status: accepted for planning
- Decision: private deployment kill switch plus database `world.enabled`, both false/absent by default; optional server-only allowlist.
- Why: a static flag exists (`src/lib/config/flags.ts`) and a database flag table exists (`supabase/migrations/20251109_feature_flags.sql`), but neither alone protects the independent websocket endpoint.
- Consequence: web route and realtime admission independently reject when disabled; existing navigation/behavior remains unchanged.

## D-011: Keep world code separate from ARPG code

- Status: accepted for planning
- Decision: create `src/lib/world` rather than implement in `src/lib/games/arpg/net/index.ts`.
- Why: the existing file is explicitly a multiplayer placeholder, but the surrounding ARPG is a time-bounded session game with local combat and reward completion (`src/routes/app/(game)/games/arpg/+page.svelte`).
- Consequence: reuse dynamic Phaser lifecycle and small utilities only when dependencies remain clean.

## D-012: Minimal durable entities

- Status: accepted for planning
- Decision: no database entity is necessary for position in the first slice. A short-retention `world_join_receipts` may support replay/audit; `world_events` arrives only with durable effects.
- Why: frame state does not belong in Postgres, and speculative tables create unwanted secondary sources of truth.
- Consequence: safe-spawn reconnect after hard restart is accepted initially.

## D-013: Defer horizontal/multi-region sophistication

- Status: accepted for planning
- Decision: begin with one region near Supabase, bounded rooms and one independently deployable service; choose presence/Redis only after measured need.
- Why: no concurrency/latency targets or hosting provider are yet established.
- Consequence: deployment must still expose metrics and graceful draining so scaling evidence can be collected.

## D-014: Existing protected app must remain unaffected

- Status: accepted for planning
- Decision: no existing route rewrite, dependency replacement or architecture migration is required. World additions are isolated and default-off.
- Why: explicit product constraint and existing launch gates in `docs/launch-readiness-runbook.md`.
- Consequence: regression checks include the normal SvelteKit check/build/unit and launch smoke suites.

## Risks recorded

1. Economy fragmentation: `wallets.balance`, `user_wallets.shards`, several transaction/grant tables, and `fn_economy_apply` coexist. Rewards are blocked until one canonical contract is confirmed.
2. Multi-write consistency: Sanctuary shared rest mutates several tables outside one transaction, so its application orchestration is not a safe template for world events.
3. Dual companion selection representation: canonical `companions.is_active` and portable `activeId` can diverge on partial failure; the world must use the former.
4. Service-role blast radius: current server helpers commonly use the Supabase service role. An independently exposed websocket server should move toward an allowlisted role/RPC boundary.
5. Flag operations: the table has authenticated read RLS but no repository-grounded cohort evaluator or documented update workflow.
6. Test discovery: Vitest's include list is curated, so new server/protocol tests will not run automatically unless configured.
7. Environment documentation drift: `.env.example` lists fewer variables than `docs/launch-readiness-runbook.md` and code usage. Separate service env documentation must be explicit.
8. Placeholder confusion: `src/lib/games/arpg/net/index.ts` says Colyseus wiring is reserved, but its parent feature is not the proposed persistent world.

## Decisions still required

| Question | Owner needed | Blocks |
|---|---|---|
| Canonical Shards/XP/Spark command and read model | backend/data | any rewards |
| Realtime host, region, connection/cost targets | platform/product | deployment and load plan |
| Protected chrome versus focused world presentation | product/design | page shell, not core authority |
| Flag/cohort administration and audit | platform/product | external rollout |
| Public player and companion presentation fields | privacy/product | shared room schema |
| Block/privacy semantics for random co-presence | safety/product | matchmaking beyond controlled cohort |
| Join/event retention and deletion/export policy | privacy/data | production audit tables |
| Durable companion cosmetics source | companion/backend | follower fidelity, not basic follower |

## Explicit non-decisions

No Colyseus version/provider, tick/snapshot rate, physics library, map format, Redis provider, exact schema migration, reward amounts, chat system, combat model or multi-region architecture is selected here. Those require implementation spikes, current dependency review, product targets, or later feature scope.
