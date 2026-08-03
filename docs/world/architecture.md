# The Wilds Architecture Audit

Status: proposal only. No route, dependency, server, or database behavior is implemented by this document.

## Outcome

Add The Wilds as an optional authenticated surface at `/app/world` inside the existing SvelteKit application, while running simulation in an independently deployed Node.js + Colyseus service. Supabase remains the identity and durable-data authority. The realtime service owns only live room state and submits narrowly defined, idempotent durable commands to Supabase.

The first slice is deliberately a social movement slice: join one room, move, see other players, reconnect, and see the user's canonical active companion follow locally. Rewards, item pickup, combat, chat, trading, building, and durable world mutation are deferred.

## Repository findings

| Area | Finding | Exact references |
|---|---|---|
| Runtime | SvelteKit 2/Svelte 5 uses the Vercel adapter and Node 20; Phaser 3.80 is already a production dependency. Colyseus is absent. | `package.json`; `svelte.config.js`; `.nvmrc` |
| Build/test | `check`, `check:core`, Vitest, Playwright, and Vercel builds are CI gates. Vitest includes a curated subset rather than every `*.spec.ts`. | `package.json`; `vite.config.ts`; `playwright.config.ts`; `.github/workflows/ci.yml`; `.github/workflows/playwright.yml` |
| Protected routes | Authenticated application pages live under `src/routes/app/(protected)`. Its server layout redirects guests, enforces the alpha gate and Bond Genesis, and supplies profile stats, wallet, subscription, and active companion data. | `src/routes/app/(protected)/+layout.server.ts`; `src/routes/app/(protected)/+layout.svelte` |
| Game routes | A separate `src/routes/app/(game)` group only checks `locals.user` and hosts session-based games. The requested `/app/world` should use `(protected)` to retain normal app gates and chrome unless product UX later decides otherwise. | `src/routes/app/(game)/+layout.server.ts`; `src/routes/app/(game)/+layout.svelte` |
| Auth | `hooks.server.ts` populates `locals.supabase` and a verified `locals.user`. SSR uses `@supabase/ssr` cookies and `auth.getUser()`, not unverified session payloads. API auth also supports a bearer access token. | `src/hooks.server.ts`; `src/lib/server/auth.ts`; `src/lib/supabase/server.ts`; `src/lib/supabase/client.ts`; `src/app.d.ts` |
| Profile | `profiles.id` is the auth user ID. Profile identity includes handle/display name/avatar and privacy settings; `player_stats` supplies level, XP, XP-next, energy and caps. | `src/lib/profile/types.ts`; `src/routes/app/(protected)/profile/+page.server.ts`; `src/lib/server/queries/getPlayerStats.ts`; `supabase/migrations/20251106_phase12_1_profile_overview.sql`; `supabase/migrations/20251107_profile_identity.sql` |
| Companion | Durable companions belong to `owner_id`. Canonical selection is `companions.is_active`, protected by a partial unique index and `set_active_companion(uuid)`. Client fallback helpers choose resolved active, then `is_active`, then first. Portable state still mirrors `activeId`, so it must not become a second world authority. | `src/lib/companions/activeCompanion.ts`; `src/routes/api/companions/active/+server.ts`; `src/routes/api/companions/set-active/+server.ts`; `supabase/migrations/20251109_companion_core.sql`; `supabase/migrations/20251112_companion_roster.sql`; `supabase/migrations/20260615120000_active_companion_state_coherence.sql` |
| Items | `item_catalog` describes items/capabilities and `user_items` is ownership/provenance. Feature tables such as `sanctuary_placements` describe use, not another inventory. The current `/api/inventory` route is intentionally disabled. | `docs/item-system-contract.md`; `supabase/migrations/20260612213000_unified_items_and_sanctuary_purpose.sql`; `src/routes/api/inventory/+server.ts` |
| Sanctuary | Placements reference catalog items and validate ownership/placeability with RLS. Shared rest writes companion state, stats, an interaction, care event, journal memory, and emotional state through an application endpoint; those writes are not one database transaction today. | `supabase/migrations/20260612201500_personal_sanctuary_mvp.sql`; `supabase/migrations/20260612223000_sanctuary_shared_rest.sql`; `src/routes/api/sanctuary/placement/+server.ts`; `src/routes/api/sanctuary/interact/+server.ts`; `src/lib/sanctuary.ts` |
| Missions/economy | Mission starts/completions are authenticated, rate-limited, capped and idempotent. `fn_economy_apply` records idempotent XP/energy/Shards grants or spends. Direct `/api/xp` grants are gone. Existing game completion validates nonce/signature/caps before server-side reward persistence. | `src/routes/api/missions/start/+server.ts`; `src/routes/api/missions/complete/+server.ts`; `src/routes/api/xp/+server.ts`; `supabase/migrations/20260212_economy_transactions_and_mission_sessions.sql`; `src/routes/api/games/session/start/+server.ts`; `src/routes/api/games/session/complete/+server.ts`; `docs/games-integration.md` |
| Economy ambiguity | Code reads both `wallets.balance` and `user_wallets.shards`; migrations include `wallet_tx`, `wallet_transactions`, `game_grants`, and `economy_transactions`. World integration must identify the canonical write RPC before enabling rewards. | `src/lib/server/econ/index.ts`; `src/routes/app/(protected)/+layout.server.ts`; `supabase/migrations/20251102_phase10_6_economy.sql`; `supabase/migrations/20251105_wallet_transactions.sql`; `supabase/migrations/20260212_economy_transactions_and_mission_sessions.sql` |
| Phaser | Phaser is dynamically imported client-side. The ARPG contains a local ECS/scene and an explicit multiplayer placeholder, but it is a session game, not a reusable authoritative-world client. | `src/lib/games/arpg/main.ts`; `src/lib/games/arpg/scenes/GameScene.ts`; `src/lib/games/arpg/ecs/components.ts`; `src/lib/games/arpg/ecs/systems.ts`; `src/lib/games/arpg/net/index.ts`; `src/routes/app/(game)/games/arpg/+page.svelte` |
| Flags | A static `FLAGS` object exists, and a Supabase `feature_flags` table is readable by authenticated users. There is no established cohort/percentage evaluator. | `src/lib/config/flags.ts`; `supabase/migrations/20251109_feature_flags.sql` |
| Operations/env | Vercel is the documented frontend target. Public Supabase settings and server-only service-role settings are separated through SvelteKit dynamic env modules. `.env.example` is incomplete relative to the launch runbook. | `.env.example`; `docs/launch-readiness-runbook.md`; `svelte.config.js`; `src/lib/server/supabase.ts` |

## Proposed directory structure

This is a target structure, not files to create in the audit:

```text
src/
  routes/app/(protected)/world/
    +page.server.ts             # flag gate; returns short-lived join ticket
    +page.svelte                # shell, loading/error/accessibility fallback
  lib/world/
    client/
      boot.ts                   # browser-only Phaser lifecycle
      WorldScene.ts
      input.ts
      interpolation.ts
      connection.ts             # Colyseus adapter only
    protocol/
      messages.ts               # shared wire DTOs/version constants
      validation.ts
    presentation/
      companions.ts             # maps companion snapshot to sprite presentation
    types.ts

services/world-server/          # independent package/deployment, preferably workspace later
  package.json
  tsconfig.json
  src/
    index.ts
    env.ts
    auth/join-ticket.ts
    rooms/WildsRoom.ts
    rooms/schema.ts
    simulation/movement.ts
    simulation/collision.ts
    durable/commands.ts          # calls allowlisted Supabase RPCs only
    observability.ts
  test/

supabase/migrations/             # later timestamped world migrations only
```

Keep world code separate from `src/lib/games/arpg`. Reuse small proven patterns (dynamic Phaser import, cleanup, input ideas), not the ARPG scene or its local-authority combat model.

## Runtime boundaries

| Boundary | Owns | Must not own |
|---|---|---|
| SvelteKit/Vercel | protected route gate, UI shell, feature evaluation, issuing a short-lived world join ticket, browser bundle | simulation ticks, socket room state, durable reward calculation |
| Phaser browser client | rendering, input capture, prediction/interpolation, camera, accessibility/status UI | trusted position, collision outcome, reward eligibility, inventory/economy mutation |
| Colyseus server | room membership, tick, input validation, authoritative position/velocity, collision, disconnect grace, live presence | authentication source of truth, item ledger, wallet, XP ledger, companion memory ledger |
| Supabase | auth, profiles, companions, items, Sanctuary, XP/energy/Shards, durable world records and idempotency | frame-by-frame movement or broadcast fan-out |

Protocol DTOs should be plain TypeScript data with an explicit protocol version. Do not import SvelteKit or Phaser types into server protocol code, and do not expose database row shapes as the wire contract.

## Authentication handshake

1. An authenticated browser requests `/app/world`. The normal protected layout performs guest, alpha, and Bond Genesis checks.
2. `+page.server.ts` evaluates `world.enabled` and cohort access server-side. When denied it returns a disabled/not-found presentation without loading Phaser or contacting the realtime service.
3. When allowed, SvelteKit obtains the already verified `locals.user` and creates a single-use, audience-bound join ticket. Recommended claims: `sub` (Supabase user UUID), `aud=memvoya-world`, `room`, `jti`, `iat`, `exp` (30–60 seconds), `protocolVersion`; optional display snapshot identifiers only.
4. The ticket is signed with a dedicated `WORLD_JOIN_SECRET` shared only by Vercel server functions and the realtime deployment. It is returned in page data or by a same-origin POST and never stored in local storage.
5. The client connects to `PUBLIC_WORLD_WS_URL` over `wss` and passes the ticket as Colyseus join metadata. Do not place it in a query string because URLs are commonly logged.
6. The realtime server verifies signature, issuer/audience, expiry, protocol, room allowlist, and one-time `jti`; it then loads current profile and canonical `companions.is_active` data from Supabase server-side.
7. Room admission binds the socket session to `sub`. The client cannot choose another user/companion ID.

Alternative for phase one: pass the Supabase access token and call `auth.getUser(token)` from the realtime server. That avoids custom signing but exposes a longer-lived bearer to another service and adds an auth-network call to every join. The short-lived exchange ticket is preferred. Ticket revocation is bounded by its short TTL; disconnect active sockets on account moderation events when that integration exists.

## Authoritative server rules

- Accept input intent (`sequence`, direction/buttons, client timestamp), never client coordinates, velocity, elapsed rewards, pickup success, or balance deltas.
- Simulate at a fixed tick and broadcast snapshots at a lower rate. Clamp input rate and magnitude; reject stale, duplicate, future-skewed, malformed, or out-of-order sequences.
- The server owns spawn selection, map bounds, collisions, speed, room capacity, interaction range, cooldowns, and despawn timing.
- Client prediction may move the local avatar immediately, but it must reconcile to acknowledged authoritative snapshots. Remote entities interpolate only.
- Companion follow behavior in the first slice is presentation derived from the player's authoritative transform. It has no independent collision, reward, or durable state.
- Never trust room ownership for durable writes. Re-check user/companion/item ownership in a security-definer database command with a fixed `search_path`.
- Every durable command has a server-generated idempotency key based on a durable event ID, a uniqueness constraint, bounds/caps, and an auditable result. No durable reward occurs merely because a socket reports an event.
- Backpressure: bound message size/frequency and room entity counts; disconnect abusive clients. Do not queue unbounded inputs.
- A server restart may lose ephemeral room positions in the first slice. Durable account state must remain correct.

## Minimal database entities (later migrations)

The first playable slice needs no durable position table. Add only what operational needs prove necessary:

1. `world_join_receipts` (optional but recommended before external testing): `id/jti`, `user_id`, `room_key`, `issued_at`, `expires_at`, `consumed_at`, `server_instance`, `disconnect_reason`. Used for replay prevention/audit; no gameplay state.
2. `world_events` (only when durable rewards/interactions begin): `id`, `user_id`, optional `companion_id`, `room_key`, `event_type`, `idempotency_key`, bounded `payload`, `occurred_at`, `processed_at`, `status`, `result`. Unique `(user_id, event_type, idempotency_key)`.

Do not add `world_inventory`, `world_wallet`, `world_xp`, duplicated companion rows, or per-frame position history. If future reconnect-to-position is valuable, add one sparse `world_player_checkpoints` row per user/zone after validating privacy and operational need.

## Integration approach

### Inventory and Sanctuary

World rewards must insert/grant ownership into existing `user_items`, referencing existing/new `item_catalog` rows. `source_type='world'`, a stable `source_key`, and provenance such as world event/zone are sufficient. A database function should atomically validate the event, upsert the existing ownership row according to stackability rules, and mark the event processed. The Colyseus service never caches a durable inventory as truth.

World-placeable objects are later represented by `sanctuary_placements` after the user explicitly places an owned `item_catalog` item. A world discovery does not create a Sanctuary-specific item. Meaningful first discovery/use can create a `companion_journal_entries` memory in the same durable command, not as an uncoordinated follow-up.

### Companion

On admission, load the canonical active row ordered/selected through `is_active`, matching `set_active_companion`. Treat `user_preferences.portable_state.companions.activeId` as compatibility presentation data only. If the active companion changes elsewhere, the initial slice applies it on the next room join; live swapping is deferred. The follower sprite receives only safe presentation fields (ID, name, species/archetype, avatar/visual key, cosmetics/evolution stage if standardized). Private memory text and emotional summaries never enter shared room state.

### XP, Spark/energy, Shards, and missions

Do not call `/api/xp`; it intentionally returns `410`. Later world rewards should use one allowlisted, idempotent database command that delegates to the repository's canonical economy functions (`fn_economy_apply` is the strongest current candidate). Before implementation, reconcile `wallets.balance` versus `user_wallets.shards` and document one read/write source. World activity may emit a validated mission event, but it must not directly mark `mission_sessions` complete or bypass existing cadence/cap validation.

## Feature flag

Use a defense-in-depth flag:

- Deployment kill switch: private `WORLD_ENABLED=false` defaults off on Vercel and realtime server.
- Database rollout flag: `feature_flags.key='world.enabled'`, default absent/false. Evaluate server-side with a short cache and fail closed.
- Optional allowlist for early slices: `WORLD_ALLOWLIST_USER_IDS` or a future normalized cohort table. Do not put user IDs in a public client flag.
- Client receives only `{ enabled, wsUrl, protocolVersion, ticket }` after authorization. Navigation should remain absent while disabled.
- Realtime admission independently checks its kill switch and ticket room/protocol, so a copied client bundle cannot enable access.

No existing production behavior changes while both defaults are false.

## Local development topology

```text
browser http://localhost:3000/app/world
  -> SvelteKit/Vite :3000
  -> Supabase local or configured dev project
  -> Colyseus ws://localhost:2567
```

Use distinct `.env.local` settings for the web app and `services/world-server/.env`. Suggested future variables:

- Web public: `PUBLIC_WORLD_WS_URL` (safe to expose).
- Web private: `WORLD_ENABLED`, `WORLD_JOIN_SECRET`, optional `WORLD_ALLOWLIST_USER_IDS`.
- World private: `WORLD_ENABLED`, `WORLD_JOIN_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORLD_ALLOWED_ORIGINS`, `PORT`.

Never prefix secrets with `PUBLIC_` or `VITE_`. The current HMAC fallback to `'dev-secret'` in `src/lib/server/games/hmac.ts` must not be copied; the world service should refuse startup without a non-development secret.

## Production topology

```text
Browser
  HTTPS -> Vercel (SvelteKit, /app/world, ticket issuer)
  WSS   -> independent world service/load balancer
               -> Colyseus room process(es)
               -> Supabase Auth/Postgres via server credentials
Vercel --------> Supabase via SSR user-scoped client
```

Use a websocket-capable host with health checks, TLS, deploy rollback, metrics, logs, and sticky room routing or Colyseus presence/matchmaking when horizontally scaled. Keep Vercel stateless. Initially deploy one region near Supabase, one room process, capped concurrency, and no automatic multi-region split. The service origin must allow only production and preview origins intentionally; preview builds should use a non-production world environment.

## Definition of done: first playable vertical slice

- `/app/world` exists under `(protected)` but is invisible/inaccessible when flags are false.
- An allowed authenticated user receives a short-lived, one-use ticket; guests and disallowed users cannot join by calling the websocket directly.
- Two supported browsers can join the same capped room and see authoritative spawn/movement/disconnect state.
- Keyboard plus one mobile/pointer control path sends intents; clients reconcile without trusting local coordinates.
- Reconnect within a bounded grace period works, and a service restart fails safely without corrupting durable data.
- Each user sees their canonical active companion following as a non-authoritative visual; other clients receive only approved public presentation data.
- No rewards or durable account mutations occur in this slice.
- Unit, protocol, room simulation, auth rejection, rate-limit, Playwright flag/auth, and two-client smoke tests pass.
- Vercel build remains successful; realtime service builds and deploys independently.
- Dashboards expose connections, joins/rejections, room count, tick lag, message rate, disconnect reasons and errors without tokens or private memory.
- Existing application routes and documented launch smoke tests remain unchanged and passing.

## Explicitly deferred

- Combat, PvP, NPC AI, quests, loot, item pickup, XP/Spark/Shards rewards.
- World chat, voice, emotes with user content, parties, guilds and trading.
- Persistent exact position, housing/building, Sanctuary editing from the world.
- Companion live swap, autonomous companion simulation, memory generation, mood mutation.
- Multiple zones, portals, instancing, global scale, multi-region migration.
- Offline progress, seasons, leaderboards, moderation tooling beyond admission/rate controls.

## Open questions and assumptions

- Which economy representation is canonical: `wallets.balance`, `user_wallets.shards`, or a compatibility view? Resolve before rewards.
- Should `/app/world` use normal protected chrome or a focused full-screen shell nested under protected gates? This proposal assumes normal gates and allows presentation to go full-screen within the page.
- Is `feature_flags` managed operationally today, and who may update it? The migration only defines authenticated read policy.
- Are companion cosmetics represented canonically in durable companion rows or only portable state? Standardize a safe presentation snapshot before exposing it to rooms.
- Does the chosen realtime host provide sticky routing/managed Redis, and what is the latency budget to the current Supabase region?
- Assumption: the first slice can restart players at a safe spawn and does not need persistent coordinates.
- Assumption: only authenticated adults/current allowed audience enter the initial room; chat and user-generated content are excluded.
