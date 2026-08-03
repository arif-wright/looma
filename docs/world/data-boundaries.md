# The Wilds Data Boundaries

## Stage 6 Moonberry command

`gather { requestId, nodeKey }` crosses the browser/socket boundary. Neither reward data nor identity is accepted. Colyseus adds the ticket-derived account and authoritative position. The database resolves node configuration, the fixed `item_catalog` row, canonical active companion, existing discovery, cooldown, and current `user_items` quantity. A successful transaction produces one `world_events` audit row, one canonical item increment, and at most one private Journal row. Only the bounded result and authored reaction return to that player's socket; they are not synchronized to the room.

## Stage 5 persistence flow

The browser sends normalized movement intent only. `WorldRoom` simulates and validates movement, then submits its own position snapshot to `WorldPersistence`. The Supabase adapter may invoke only `fn_world_load_state`, `fn_world_save_state`, and `fn_world_record_landmark`; it never exposes its credential or accepts a browser user ID. Database functions revalidate active map/version, bounds, optimistic state version, discovery radius, and idempotency before mutation.

Durable Stage 5 data is limited to map metadata, one state row per `auth.users` account, landmark metadata, and one discovery row per account/landmark. Live inputs, presence, reconnect state, companion follower buffers, and room coordinates remain ephemeral. Inventory, XP, Shards, missions, memories, and Sanctuary remain outside this boundary.

## Authority matrix

| Data | Source of truth | Read path | Write path | Realtime cache |
|---|---|---|---|---|
| Authentication identity | Supabase Auth | verified SSR `auth.getUser()`; ticket exchange | Supabase Auth only | user UUID bound to connection |
| Profile presentation | `profiles` | server-side admission projection | existing profile flows | safe snapshot only |
| Active companion | `companions.is_active` | owner query ordered by active/slot | `set_active_companion(uuid)` | safe follower snapshot |
| Companion state/memory | `companions`, `companion_stats`, emotional/journal tables | existing app/server contracts | existing RPC/endpoints; later narrow world command | never private contents; no live authority |
| Item definition | `item_catalog` | authenticated/server query | migrations/admin catalog flow | immutable presentation subset if needed |
| Item ownership | `user_items` | owner-scoped query | later idempotent grant command | never a durable ledger |
| Sanctuary placement/use | `sanctuary_placements`, `sanctuary_interactions` | existing Sanctuary route | existing endpoints/RLS; later transactional commands | none |
| XP/Spark | `profiles`/`player_stats` and economy functions | `getPlayerStats`/balance snapshot | canonical economy RPC | display snapshot only |
| Shards | unresolved compatibility contracts | protected layout/wallet queries | wallet/economy RPC | display snapshot only, never authoritative |
| Mission lifecycle | `missions`, `mission_sessions`, assignments/progress | existing mission services | mission start/complete validation | optional objective hint only |
| Live transform/presence | Colyseus room | snapshots | fixed-tick simulation from intent | authoritative during room lifetime |
| World audit/reward event | future `world_events` | server/admin/reconciliation | idempotent world command | pending event ID only |

## Repository-grounded model notes

- Profiles are keyed to `auth.users` and protected by visibility/owner RLS (`supabase/migrations/20251106_phase12_1_profile_overview.sql`, `supabase/migrations/20251107_profile_identity.sql`). Do not serialize a complete `ProfileRow` from `src/routes/app/(protected)/profile/+page.server.ts`.
- Companion ownership and stats are owner-scoped (`supabase/migrations/20251109_companion_core.sql`). Exactly one canonical active companion is enforced by `supabase/migrations/20260615120000_active_companion_state_coherence.sql`. `src/lib/companions/activeCompanion.ts` defines fallback behavior; portable `activeId` mirrored by `src/routes/api/companions/set-active/+server.ts` is not a second source.
- The item contract explicitly says capabilities do not create inventories (`docs/item-system-contract.md`). `item_catalog` and `user_items` implement that boundary (`supabase/migrations/20260612213000_unified_items_and_sanctuary_purpose.sql`).
- Sanctuary placement is a usage record referencing owned items. Shared rest spans multiple durable records today (`src/routes/api/sanctuary/interact/+server.ts`); the world should not copy its non-atomic orchestration for reward grants.
- Mission/economy flows already use idempotency, caps and server validation (`supabase/migrations/20260212_economy_transactions_and_mission_sessions.sql`, `src/routes/api/missions/start/+server.ts`, `src/routes/api/missions/complete/+server.ts`).
- Game sessions provide useful anti-abuse patterns, but their client-reported score plus HMAC flow is weaker/different than a fully authoritative world. The world server should produce the durable event itself (`src/routes/api/games/session/complete/+server.ts`).

## Data flows

### Admission (first slice)

1. SvelteKit verifies the SSR user and flag.
2. SvelteKit issues an opaque/short-lived signed ticket containing only identity and admission claims.
3. Colyseus verifies it, then reads an admission projection from Supabase:
   - user ID internally;
   - approved display/handle/avatar projection;
   - canonical active companion ID and approved sprite presentation.
4. Colyseus creates an ephemeral room entity. Other clients receive a public projection with an ephemeral entity ID, not raw database rows.

No inventory, wallet, Journal, emotional summary, email, admin/subscription flag, private profile field, or portable state blob is loaded into room schema.

### Stage 4 companion projection

`src/routes/api/world/ticket/+server.ts` queries only `id`, `owner_id`, `name`, `species`, `is_active`, and `slot_index` from the authenticated owner's companion rows. `src/lib/server/worldCompanion.ts` filters ownership before using the repository's canonical active resolver. The durable ID is used only during trusted resolution and is omitted from the ticket's public companion projection and from room state.

Synchronized fields are limited to presence, bounded name, bounded species/kind, server-derived follower status, and a revision counter. A changed active selection is delivered by a fresh signed ticket bound to the already authenticated account. A query failure or absent roster produces `present=false`/`unavailable` and never blocks movement.

### Movement

```text
client input intent -> Colyseus validation -> fixed tick/collision
                    -> authoritative snapshot -> prediction reconciliation/render
```

Transforms live only in memory for the first slice. Disconnect/restart returns the player to a safe spawn. Analytics may aggregate operational metrics, but no frame-by-frame location history is retained.

### Later item reward

```text
authoritative condition
  -> server creates world event/idempotency key
  -> one database command validates user/event/cap
  -> upsert existing user_items ownership + mark event processed
  -> return stored result
  -> clients refresh normal account data
```

Use `source_type='world'`, stable `source_key`, and bounded provenance. Stackability semantics must use the existing catalog/shop contract; do not assume every duplicate increments `quantity`. Sanctuary sees the item only through normal owned-item queries.

### Later economy reward

```text
validated world event -> world command -> canonical fn_economy_apply/wallet function
                      -> economy transaction/ledger -> balance projection
```

The command owns reward values/caps. The client cannot submit amounts. A websocket acknowledgement is presentation only. Before this flow ships, resolve `wallets.balance` versus `user_wallets.shards` and related ledgers.

### Later companion memory/mission integration

The world emits a typed, bounded, durable event. A domain command decides whether it qualifies for mission progress or a meaningful Journal memory. It references the canonical companion and uses a stable source ID so retries cannot duplicate memory. Do not stream journal prose or emotional inference into public room state.

## Proposed minimal entities

### `world_join_receipts`

Operational/replay entity, not gameplay history:

- `jti uuid primary key`
- `user_id uuid not null references auth.users`
- `room_key text not null`
- `issued_at`, `expires_at`, optional `consumed_at`, `disconnected_at`
- optional bounded `server_instance`, `disconnect_reason`

RLS: no client access. Execution/read only by ticket issuer/realtime operational role. Retention should be short and defined.

### `world_events` (not needed for first slice)

- `id uuid primary key`
- `user_id`, optional `companion_id`
- `room_key`, `event_type`, `idempotency_key`
- bounded `payload jsonb`
- `status` (`pending`, `applied`, `rejected`), `result jsonb`
- `occurred_at`, `processed_at`, `created_at`
- unique `(user_id, event_type, idempotency_key)`

RLS: owner may eventually read a safe projection if product needs history; clients cannot insert/update. Dedicated service role/function writes only. Foreign keys and command checks verify companion ownership.

Not proposed: world copies of account, companion, inventory, wallet, mission, memory, Sanctuary, or per-tick location tables.

## Consistency and failure rules

- Ephemeral room state is allowed to be lost; durable account state is not.
- Database command returns are the only final reward outcome. Socket/UI messages remain pending until confirmed.
- At-least-once delivery is assumed; idempotency turns it into one durable effect.
- A multi-ledger effect must be one transaction or a transactional outbox with explicit recoverable state. Do not repeat the application-level partial-write pattern visible in the current shared-rest endpoint.
- Never roll back by deleting ledger entries. Use compensating transactions/events if a granted durable value must be corrected.
- Cache immutable catalog/presentation briefly; do not cache balances/ownership as authoritative. Invalidate companion snapshot on rejoin initially.

## Data classification and retention

| Class | Examples | Room exposure | Retention |
|---|---|---|---|
| Public-safe presentation | approved display name/avatar/companion visual | allowlisted fields | connection lifetime/cache TTL |
| Account-private | auth UUID, balances, inventory, stats | local user only or none | existing durable policy |
| Sensitive relationship | journal, memory, emotional profile, trust/affection | never | existing consent/deletion policy |
| Security | ticket, Supabase token, IP/device data | never | secrets ephemeral; audit minimized |
| Operational | room ID, tick lag, rejection code | aggregate/pseudonymous | short defined observability retention |

## Open data questions

- Canonical Shards store and compatibility/migration direction.
- Existing item stackability source (catalog capabilities do not itself encode stackability consistently across older shop tables).
- Whether safe companion cosmetics can be derived from durable rows rather than `portable_state`.
- Retention/deletion/export requirements for join receipts and world events, including CloudWeave portability.
- Whether block/privacy settings prohibit co-presence and therefore must be part of admission/matchmaking.
