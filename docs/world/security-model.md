# The Wilds Security Model

## Stage 6 gathering controls

- The gather message permits exactly a UUID operation ID and `moonberry-bush`; extra reward fields make the message malformed.
- The room validates rate, authenticated account, authoritative proximity, and completed landmark discovery before persistence.
- The database repeats active map/version, radius, discovery, item allowlist, cooldown, and holding-cap checks.
- A transaction advisory lock plus unique `(user_id, event_type, idempotency_key)` prevents concurrent-room, double-click, reconnect, and retry duplication.
- Active companion ownership is derived from `companions.owner_id` and `is_active`; a client companion claim is never used.
- Audit logs contain ephemeral player/session ID, fixed node key, status, and replay flag—not token, auth UUID, profile, inventory, or journal text.
- The service role remains the largest residual risk. The command is narrow and service-guarded, but a dedicated constrained backend role remains recommended.

## Stage 5 durable-state controls

- Browser roles have no insert/update/delete grants on world state or discoveries; owner RLS allows readback only.
- The service credential is confined to the realtime process and tokens/keys are not logged. The adapter uses narrow RPCs, although compromise of the service-role secret still has database-wide blast radius.
- The room derives `user_id` from the verified Stage 3 ticket and never accepts it in movement or discovery messages.
- Saved coordinates originate from authoritative simulation, are checked against server geometry, and are independently checked against active database map bounds/version.
- Optimistic state versions reject stale room writes. Database uniqueness on `(user_id, landmark_id)` and `(user_id, idempotency_key)` prevents duplicate discovery records.
- Discovery currently has no reward side effect, so retries cannot duplicate inventory or currency. Any future reward requires a single transactional idempotent command and a more constrained backend credential.

## Security objectives

- Only authenticated, flagged users enter The Wilds.
- A player can control only their admitted avatar and cannot select another user's profile, companion, inventory, rewards, or room identity.
- The Colyseus process is authoritative for live gameplay; Supabase is authoritative for identity and durable state.
- Compromise or cheating in the browser cannot mint items, XP, Spark/energy, Shards, or memories.
- Service credentials, auth tokens, join tickets, private profile fields, and companion memories do not leak through clients, room state, URLs, or logs.
- Disabling the feature stops new admission without changing the rest of Memvoya.

Repository security conventions already support this direction: SSR calls `auth.getUser()` in `src/lib/server/auth.ts` and `src/lib/supabase/server.ts`; owner-scoped policies use `auth.uid()` in companion/item/Sanctuary migrations; privileged RPCs use `security definer` plus `set search_path = public` in `supabase/migrations/20260615120000_active_companion_state_coherence.sql` and `supabase/migrations/20260212_economy_transactions_and_mission_sessions.sql`; rate/cap/audit patterns exist in game and mission endpoints.

## Trust zones

| Zone | Trust level | Credentials/data |
|---|---|---|
| Browser/Phaser | hostile | short-lived join ticket, public presentation, live snapshots |
| SvelteKit/Vercel | trusted issuer | SSR cookies, dedicated join signing secret, user-scoped Supabase client |
| Realtime service | privileged but constrained | ticket verification secret; ideally a dedicated DB role/RPC access, initially possibly service role |
| Supabase Auth/Postgres | durable authority | auth identities, RLS data, command functions and ledgers |

The browser must never receive `SUPABASE_SERVICE_ROLE_KEY`, `WORLD_JOIN_SECRET`, another user's bearer token, or private memory/state. Public `PUBLIC_WORLD_WS_URL` is expected to be visible.

## Authentication and authorization

Stage 3 implements the short-lived-ticket design in `src/routes/api/world/ticket/+server.ts`, `src/lib/server/worldTicket.ts`, and `services/world-server/src/auth/ticket.ts`:

- Ticket lifetime is 45 seconds and `jti` is consumed once per realtime process.
- Claims are fixed to issuer `memvoya-web`, audience `memvoya-world`, room `wilds`, and protocol `1`.
- The signing secret is required in both trusted runtimes, at least 32 characters, and never browser-visible.
- Join metadata permits exactly `{ ticket }`; extra `userId`, profile, handle, companion, or role fields make admission fail.
- Safe identity is limited to a normalized 40-character display name and optional 30-character handle loaded through the authenticated user's RLS-scoped Supabase client; private accounts are presented as `Explorer` without a handle.
- Auth rejection logs contain only bounded reason codes. Tickets and SDK error objects are not logged.

- The SvelteKit issuer relies on verified `locals.user` populated by `src/hooks.server.ts`; it does not decode a cookie/JWT without verification.
- Ticket TTL is 30–60 seconds, one use, audience/issuer/room/protocol bound, and transmitted in Colyseus auth metadata over TLS rather than a URL.
- Realtime admission verifies ticket and current kill switch, consumes `jti`, binds `sub` to the client session, and loads authoritative rows itself.
- Reconnect uses a separate short-lived reconnect token tied to room/client/user and invalidated after grace expiry. Do not reuse the admission ticket indefinitely.
- Origin is an additional browser defense, not authentication. Configure an exact allowlist for production and explicit preview hosts; reject missing/unexpected origins where compatible.
- Room messages never accept `userId`, `companionId`, `ownerId`, reward amount, or role as authoritative client fields.

## Durable authorization

RLS is necessary but insufficient when a service-role key bypasses it. Durable world commands must therefore:

- be an allowlist of database functions, not arbitrary table writes;
- take the authenticated `user_id` from the verified server session, never from a client payload;
- independently validate companion/item ownership, event type, caps, cooldown, and allowed transition;
- use `security definer`, a fixed `search_path`, fully qualified tables, least-privilege execute grants, and revoked public/anon execution;
- use an idempotency uniqueness constraint and transactionally record result/failure;
- avoid dynamic SQL and unbounded JSON payloads.

Preferred production evolution: give the realtime service a dedicated Postgres/Supabase role that can execute only world command RPCs and read a narrow admission snapshot. If infrastructure forces use of the service role initially, isolate it to the realtime runtime, rotate it, block egress where feasible, and keep all calls inside a minimal data-access module.

## Threat model

| Threat | Example | Required mitigation |
|---|---|---|
| Client authority/teleport | Modified client sends coordinates or impossible speed | Accept sequenced intent only; server tick/collision/speed; reconcile client |
| Message abuse | Flood, oversized JSON, NaN/infinity, sequence spam | Schema validation, byte/rate limits, numeric guards, bounded queues, disconnect/ban telemetry |
| Ticket theft/replay | Token copied from logs/devtools | TLS, metadata not URL, 30–60s TTL, one-time `jti`, redact logs, room/audience binding |
| Identity substitution | Client requests victim profile/companion | Derive `sub`; server-side ownership query; omit identity fields from commands |
| Reward replay/double spend | Reconnect/retry delivers event twice | Server event ID, unique idempotency key, atomic command and stored result |
| Service privilege escalation | RCE leaks service-role key | Dedicated role/RPC, secret manager, dependency patching, non-root container, egress/rotation, no secrets in client |
| Cross-site websocket use | Malicious origin opens authenticated connection | Explicit Origin allowlist plus ticket verification; SameSite assumptions are not sufficient |
| Private-data exposure | Room schema broadcasts email/memory/mood inference | Explicit presentation DTO allowlist; no raw DB rows; privacy tests/log review |
| Enumeration/stalking | Stable room/player data reveals presence | Pseudonymous room session IDs, capacity/visibility policy, block/privacy enforcement before social discovery |
| Denial of service | Connection storm or expensive room action | edge/load-balancer limits, admission quotas, room caps, idle timeout, bounded simulation, load tests |
| Dependency/supply chain | Malicious websocket/game package | lockfile, review, audit/scanning, pinned runtime, minimal dependencies, separate deployment |
| Stale authorization | Flag/account disabled after join | very short ticket; admission recheck; moderation disconnect channel later; max session duration if needed |
| Server desync/restart | Duplicate actors or lost live position | unique live user admission policy, reconnect grace, safe spawn fallback; no durable reward from volatile state alone |
| Injection/prototype pollution | Crafted protocol payload/meta | strict schemas stripping unknown fields, plain DTOs, bounded JSON, no dynamic property execution/SQL |

## Privacy and moderation boundaries

The first slice exposes only a public-safe projection: ephemeral entity ID, approved display name/handle policy, avatar visual, coarse companion presentation, transform and connection state. Never broadcast email, auth UUID when avoidable, subscription/admin status, Shard balance, inventory, journal text, memory summary, emotional profile, trust/affection metrics, precise presence history, IP, or device hash.

Stage 4's companion projection is specifically limited to `present`, bounded `name`, bounded species/kind, status, and revision. Ownership is resolved by an authenticated RLS-scoped query before signing and re-verified through the ticket signature and matching account subject during refresh. Durable companion IDs and all relationship/private fields remain outside the realtime schema.

Before adding discovery, chat, trading, friend teleport, or visits, integrate existing privacy/block/moderation systems represented under `src/routes/api/privacy`, `src/routes/api/safety`, `src/routes/api/messenger`, and related migrations. Those are deferred, so the first room should be a controlled cohort with no user-generated communication.

## Availability and operational controls

- Separate liveness (process responds) from readiness (can verify tickets/load dependencies).
- Cap tick work, entities, connections per IP/account, messages, and room size.
- Graceful deploy drain: stop matchmaking, allow short reconnect/drain window, then close with a safe reason.
- Metrics: joins accepted/rejected by reason, ticket replay, active rooms/clients, tick p50/p95/p99, event-loop lag, bytes/messages, reconciliation error, disconnects, durable command outcomes.
- Alerts must not contain token/payload dumps. Logs use request/event IDs and pseudonymous user correlation.
- Feature switch must fail closed. Database/auth outages reject new joins without impacting unrelated SvelteKit routes.

## Security tests and release gates

- Unit/fuzz every protocol parser and ticket claim boundary.
- Integration-test expiry, replay, wrong issuer/audience/room/protocol, invalid signature, origin, disabled flag, duplicate session and reconnect takeover.
- Simulate teleport, high-rate, NaN, future timestamp, stale/out-of-order input and oversized payload attacks.
- Test database commands under anon, authenticated owner, authenticated non-owner, and service contexts; verify public/anon cannot execute privileged functions.
- Concurrency-test identical reward commands and forced transaction failures before any rewards ship.
- Verify built browser assets and logs contain no server secret/service key/token.
- Run dependency/license/security scanning and container non-root/config checks for the standalone service.
- Conduct a manual two-account privacy inspection before each field is added to room state.

## Incident response

1. Set realtime `WORLD_ENABLED=false` to reject joins and drain/terminate affected rooms.
2. Set the web issuer/DB flag off so no new tickets are issued.
3. Preserve structured logs and `world_events`/join receipts; do not delete evidence.
4. Rotate join secret for ticket exposure; rotate service credentials and redeploy for privilege exposure.
5. Reconcile durable events against `user_items`, economy ledgers, and Journal entries before re-enable.
6. Notify affected users/operators according to the existing incident/privacy process.

## Deferred security work

Chat moderation, child-safety design, trades/escrow, PvP anti-cheat, user-generated maps/assets, friend visibility, multi-region token handoff and reward fraud models are deferred with their features. Their absence is a requirement of the first slice, not an accepted unsecured implementation.

Distributed ticket replay prevention and cross-instance duplicate-account exclusion are also deferred until shared presence is added. Stage 3 controls both within one process. Supabase revocation prevents new ticket issuance, while a previously issued unconsumed ticket has a bounded maximum 45-second stale-authorization window.

## Open questions

- Can Supabase expose a dedicated least-privilege role or Edge Function boundary for world commands in the chosen deployment model?
- What account blocks/privacy settings must suppress co-presence even in an allowlisted room?
- What are retention and deletion requirements for join receipts and world event audits?
- Is the initial audience subject to child-directed service or regional privacy obligations?
- Who owns incident response and realtime secret rotation?
