# ADR-005: Authoritative World Persistence Through Narrow RPCs

- Status: accepted for Stage 5
- Date: 2026-08-02

## Context

The Colyseus room owns live position and discovery eligibility, while Supabase owns durable account state. Existing migrations use owner-scoped RLS, fixed-`search_path` security-definer functions, explicit execute grants, and unique idempotency constraints. Relevant examples are `supabase/migrations/20260212_economy_transactions_and_mission_sessions.sql`, `supabase/migrations/20260615120000_active_companion_state_coherence.sql`, and `supabase/migrations/20260612213000_unified_items_and_sanctuary_purpose.sql`.

Giving browsers a position mutation policy would let them submit arbitrary coordinates. Letting the realtime process write tables directly would give persistence code a broader contract than it needs.

## Decision

The independently deployed world server uses its server-only Supabase service credential exclusively to invoke three allowlisted RPCs: load state, save an authoritative checkpoint, and record an authoritative landmark discovery. Each function rejects non-service calls, has a fixed search path, validates active map/version and coordinates, and exposes no inventory or economy mutation. Direct client writes are revoked and owner RLS permits users to read only their own state and discoveries.

The room checkpoints dirty state at a bounded interval and on graceful leave, reconnect drop, and shutdown. Coordinates are copied from server-owned player state and checked against the server collision map before submission. Optimistic `state_version` prevents stale rooms from overwriting newer state. A version-zero create-if-absent path allows recovery after a temporary database outage without overwriting an existing row.

Discoveries use a deterministic per-map-version landmark key plus database uniqueness. Only the database insert result can report a new discovery. Stage 5 does not grant a reward, mutate inventory, or call the economy.

For this stage, the existing service role is accepted because the repository has no provisioned constrained Postgres backend role and Supabase JS requires a deployable credential. The narrow RPC surface limits application behavior, but the credential still has broad database power if compromised. A dedicated `world_backend` role should replace it before expanding durable mutations.

## Restore and map evolution

The database accepts saved coordinates only inside active map bounds. The server additionally applies collision geometry. A missing, inactive, version-mismatched, non-finite, out-of-bounds, or obstructed saved position restores to the configured canonical spawn. Each seeded map has one spawn, so that spawn is the nearest valid spawn in the Stage 5 model. Multiple spawn candidates and map transitions are deferred.

## Rollback

First remove `WORLD_SUPABASE_URL` and `WORLD_SUPABASE_SERVICE_ROLE_KEY` from the realtime deployment (or roll back the server) so rooms safely use spawn-only ephemeral state. Preserve/export player state if needed. Then revoke execute on and drop the three `fn_world_*` functions, followed by `world_landmark_discoveries`, `player_world_state`, `world_landmarks`, and `world_maps` in dependency order. Dropping is data-destructive and must be a separately reviewed migration. No inventory/economy rollback is needed because this stage never mutates those systems.
