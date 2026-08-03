# ADR-004: Active companion follower projection

- Status: Accepted
- Date: 2026-08-02

## Decision

Use `companions.is_active` as the durable source of truth, consistent with `src/lib/companions/activeCompanion.ts` and the ownership-checking `set_active_companion(uuid)` RPC introduced by `supabase/migrations/20260615120000_active_companion_state_coherence.sql`.

During ticket issuance, SvelteKit queries companion rows through the authenticated user's RLS-scoped Supabase client, explicitly filters `owner_id` to `locals.user.id`, and applies the existing canonical active/fallback resolver. The signed ticket carries only `{ present, name, kind, availability }`; it does not expose the durable companion UUID. Colyseus verifies the signed result and synchronizes bounded presentation plus a derived status/revision. Clients cannot submit a companion ID.

While connected, the browser requests a fresh signed projection every 30 seconds and after transport reconnection. A rate-limited `companion-refresh` message is accepted only if its ticket verifies, is unused, and has the same authenticated `sub` as the connection. This lets an active selection change appear without trusting client state.

## Follower behavior

Each client renders one non-physics placeholder follower per owner. It keeps at most eight authoritative owner positions and follows the delayed oldest point with inexpensive linear interpolation. Followers never collide or affect simulation. Reduced-motion clients snap to delayed targets and omit interpolation. Companion status is server-derived as `idle`, `moving`, `reconnecting`, or `unavailable`.

## Privacy boundary

The room never receives or synchronizes companion memories, Journal entries, prompts, personality or hidden traits, affection/trust, mood, energy, levels, inventory, cosmetics blobs, avatar URLs, owner UUIDs, or portable state. Final artwork, autonomous navigation, and LLM behavior remain deferred.
