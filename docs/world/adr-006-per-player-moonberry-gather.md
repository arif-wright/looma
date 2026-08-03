# ADR-006: Per-player Moonberry Gathering Through Unified Items

- Status: accepted for Stage 6
- Date: 2026-08-03

## Decision

The Moonberry bush is a shared visual node with per-player eligibility, cooldown, and holding cap. One player gathering does not despawn it for others. This avoids early-world griefing and global timer coordination while retaining shared co-presence.

The browser sends only the fixed node key and a UUID operation ID. Colyseus derives the authenticated account, uses its authoritative transform, validates proximity and recorded discovery, and calls one service-only database command. The command derives the active node configuration, allowlisted `world-moonberry` catalog item, active owned companion, and authored archetype reaction. The client cannot select the item, quantity, companion, cooldown, coordinates, or reward value.

`fn_world_gather_moonberry` serializes attempts per account/node with a transaction advisory lock. A unique world-event idempotency key makes retries stable; the latest successful event enforces the per-player cooldown across reconnects, rooms, and processes. The item is inserted or incremented only in `user_items`. The configurable defaults are one item, five minutes, and at most twenty owned Moonberries.

The successful command also writes the audit event and, when an active companion exists, one `system` `companion_journal_entries` row keyed by the same world-event UUID. This is the repository-approved Journal table and uniqueness contract. It is intentionally inside the same transaction so item and memory cannot diverge. No LLM, summary rebuild, currency, XP, Sanctuary, mission, or economy mutation occurs.

The existing inventory has no slot-capacity model. Therefore “inventory full” means the node's conservative per-item holding cap, aggregated across canonical `user_items` rows. This is not a new inventory or balance ledger.

## Rollback

Disable world admission or mark the node inactive first. Roll back server/client handling next. Preserve `world_events` for audit and reconciliation. A separately reviewed destructive migration may then drop `fn_world_gather_moonberry`, `world_events`, and `world_gather_nodes`; the Moonberry catalog row must not be removed while referenced by `user_items`. Granted Moonberries and journal entries are durable player history and are not automatically deleted.
