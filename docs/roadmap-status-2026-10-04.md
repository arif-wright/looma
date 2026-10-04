# Memvoya roadmap reconciliation

Snapshot: 2026-10-04 UTC. This document records the same bounded overnight scope reconstructed after temporary local files became unavailable. Current checks belong to the new recovery report; historical test results do not certify reconstructed files. Publication and hosted rollout are separate actions.

## Product direction

Keep the established companion → earned object → Sanctuary interaction → remembered history loop. Validate private Sanctuary use before visits/gifts and broader worlds. The companion retains earned affection and trust during absence. Do not introduce emotional profiling, invented history, pressure to return, parallel inventories or paid emotional access.

The existing source of truth remains `companion-experience-contract.md`, `item-system-contract.md`, `sanctuary-roadmap.md`, `home-experience-contract.md`, `product-surface-contract.md` and `launch-phase-1.md`. The Wilds decision log and later ADRs describe separate technical work, not completion of the Sanctuary product roadmap. Historical launch/freeze checklists are not current release evidence.

## Status vocabulary

- Implemented in source: code or a migration exists; this does not prove live availability.
- Published: present in a verified remote commit; not necessarily merged or production-deployed.
- Locally verified: named tests passed within explicitly recorded boundaries.
- Live verified: the exact hosted operation was observed. A READY preview alone is insufficient.
- Planned: future work within the existing roadmap, not part of this release batch.

## Published baseline

Draft [PR #9](https://github.com/arif-wright/looma/pull/9) baseline `178aeb5bafb4d1b499fe07532a5f9320d736cb53` has tree `e44801e40352ce8254e1e7612914f5bfb607a511`. It contains absence preservation, exact owned-item history and atomic shared rest, plus the Node 22 adapter correction. Prior build/CI/preview results establish only that historical revision. The feature migrations and a full authenticated hosted gameplay loop were not verified live by the local review.

## Reconstructed local batch

1. Care qualification requires three persisted feed/play/groom events for the same owner and companion. The exact event evidence, acquisition and unlock Journal entry are saved atomically. Passive, daily bonus, shared rest and milestone rows do not count. Legacy awards are preserved without fabricated backfill.
2. Bond synchronization revalidates the authenticated owner before privileged operations. Reconnect passes the session client into that boundary. Eligibility and amounts come from protected server/database state.
3. Achievement settlement commits the existing claim, points, shards and economy receipt in one service-only transaction. Failure rolls back that writer's changes; retry is a no-op after success. The migration does not infer, rewrite or repair historical payment history.
4. A read-only keepsake story shows arrival, current spaces and bounded persisted Journal moments for an exact owned acquisition. It honors memory consent and the ordinary Journal archive window. Hidden candidate text/IDs and intermediate timestamp evidence remain server-local. Missing placement/history data produces honest unknown/empty states.

These use existing item, Journal and economy structures. No new account, endpoint for client reward claims, data-collection service, monetization behavior or expanded world scope is introduced. Further feature expansion stops at the combined reviewable checkpoint.

## Existing roadmap and remaining acceptance

| Milestone | Established source scope | Remaining acceptance |
| --- | --- | --- |
| Private Sanctuary and five slots | Owner-scoped collection, fixed slots, active companion | Hosted/mobile smoke, owner isolation and schema alignment |
| Owned placement/removal | Exact `user_item_id`, quantity validation, preserved rest snapshots | Hosted grants/RLS and true concurrent capacity checks |
| Moss Seat care award | Three saved direct-care events; atomic acquisition and memory | Hosted RPC deployment and real failure/retry observation; wider care writes remain separate |
| Placement response remembered | Response and memory outcomes remain distinct | Placement and Journal writes still have a partial-failure gap |
| Shared rest | Authenticated request identity, owner-bound transaction, cooldown and immutable replay | Migration/hosted Auth/PostgREST and native multisession proof |
| Read-only keepsake story | Exact owner/acquisition/recorded-companion links, consent and archive filtering | Actual browser layout, keyboard/focus, Back/snapshot restoration and comprehension checks |
| Achievement reward reliability | New writer is transactional and receipt-backed | Coordinated old-writer drain, native concurrent sessions, catalog/table/function permission preflight |
| Additional acquisition/use/gift/equip paths | Some chapter/world acquisitions exist | Verify each source independently; catalog capability alone does not establish an action |
| Selected Journal moment becomes an object | Chapter-derived placeables exist | General user-selected-moment conversion remains planned |
| Visits, gifts and snapshots | Planned for Sanctuary | Private-loop evidence, owner authorization, privacy/moderation and abuse controls |
| Multiple scenes/collaborative worlds | Future product phase | Product validation and separate operational/security gates |

## Preserved limitations

- Care state, statistics and event writes remain separate transactions. Only acquisition plus its unlock memory are made atomic here.
- Placement-to-Journal recovery is not included. An absent persisted memory stays absent; the story never invents it.
- Existing unlocks do not prove historical payment; missing old claims may also follow a partial payment. No automatic replay, backfill or compensation is authorized by this batch.
- First-clear game eligibility still lacks a durable automatic retry after later achievement failure. Transaction safety is not a guarantee of eventual delivery.
- Old split-reward application instances must be drained in a coordinated release; mixed writers do not inherit the new writer's guarantees.
- Historical `fn_add_points` repository PUBLIC-ACL gaps and separately managed live containment must be reconciled before release. This batch does not change live settings or claim those grants are verified.
- The story uses a conservative subset of the Journal browsing window and may omit borderline records. Future Journal composition changes require reviewing that visibility helper.
- Prior local fixture navigation returned `ERR_BLOCKED_BY_CLIENT`. Synthetic fixture builds, SSR checks and Playwright discovery are not browser execution. No alternative path is used to bypass a denied browser action.
- PGlite is single-connection. Queued calls do not prove native competing-session locks, deadlocks or isolation behavior.

## Release gates

- [ ] Verify the exact reconstructed commit, manifest and fresh aggregate test results.
- [ ] Review target migration order and schema/privilege prerequisites before enabling new callers.
- [ ] Keep publication separate from any live SQL or deployment authorization.
- [ ] Drain old split-reward writers during a coordinated approved rollout.
- [ ] Use authorized synthetic/test owners for care → acquisition → collection → placement → rest → Journal over real HTTP.
- [ ] Demonstrate native competing-session reward, cooldown, capacity and replay behavior.
- [ ] Verify browser focus, disclosure, mobile layout, repeated clicks, Close/Back/Forward and active-companion changes in a permitted environment.
- [ ] Keep separate role/history/view risks and first-clear retry limitations explicit; no inferred repairs.

Visits/gifts and broader worlds remain later work. No new dates, retention thresholds, emotional claims, freeform terrain editor, collaborative building or creator marketplace is introduced.
