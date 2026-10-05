# Moonberry arrival story and safe companion fallback

Local candidate, 2026-10-05. Based on `b804421646f915fc8dc48f8c4f0b31e1b7ea82d3` in a separate worktree. This is a narrow source/test checkpoint, not a completed Wilds game or a hosted-release claim.

## Scope

The smallest existing grove loop is already present in source: the authoritative Colyseus room validates a fixed Moonberry node interaction, the service-only gather command grants into the existing `user_items` collection, and its transaction can save a companion Journal reaction. This candidate joins the existing acquisition evidence to the read-only Keepsake Story. It does not introduce a new world feature, writer, inventory, migration, profiling, or service.

The current renderer default stays Phaser. The optional Three renderer remains separately gated and under evaluation. Approved Muse and Echo artwork remains unchanged.

## Two bounded repairs

1. **Exact recorded Moonberry arrival.** A selected owned Moonberry stack qualifies only when its catalog key, source type, node key, recorded companion UUID, and stored `worldEventId` all match the existing gather contract. The authenticated inventory loader reads at most one exact owner/companion/system/event Journal record with matching world-gather metadata. It passes candidates through the existing memory-consent and conservative ordinary Journal browsing window. The presenter displays persisted title/body/date and an exact Journal link. Existing care and Sanctuary history rules remain unchanged.
2. **Missing companion art.** The optional Three renderer no longer supplies the male-player atlas as a companion fallback. Failed metadata, initial texture, or later texture requests retain the existing neutral safe-color placeholder and failed diagnostics. Failed contracts/pages are detached; late and superseded pages release their leases; destroyed sprites do not start more work; a failed atlas is not retried every frame. This placeholder is a plain temporary color tile, not new production art.

## Facts that remain unknown

- The Moonberry writer stores an event UUID when it first creates a stack. Later grants increment quantity without replacing that provenance. Only that original stored event can be linked; this is not the stack's complete gather history.
- Companion-less acquisitions have no linked companion moment. Missing/malformed legacy provenance cannot prove whether a Journal row once existed. No current companion, date, item name, reaction text, or nearby event is used to fill gaps.
- Disabled, archived, deleted, inaccessible, or missing Journal history stays hidden or absent. The event UUID already present in owned provenance is separate from a hidden Journal record's UUID.
- Persisted Journal text is not presented as an immutable audit log. Existing owner-scoped Journal writes and the gather writer's own consent behavior are unchanged.

## Local verification

Required commands are the repository's `npm run check`, `npm run check:core`, `VITEST=true npm run test -- --run --maxWorkers=2 --minWorkers=1`, and `npm run build`. Exact final counts and results are stored with the candidate evidence archive.

New tests use synthetic owners and fake database queries, canvas, image loading and resource leases. They cover exact event linking; same-catalog and cross-owner/companion rejection; unknown provenance; consent failures and opt-out; free/subscriber archive windows; timestamp ties; hidden payload text/IDs; selection changes and reloads; duplicate candidate queries; manifest/texture failures; late resources; direction changes; and idempotent teardown. They perform no live database or network requests.

Independent source review found no blocking issue in the two changes. The review corrected a sentence that could incorrectly equate an unavailable link with an unrecorded memory.

## Remaining acceptance

No permitted authenticated browser or live world-service loop was executed. Browser/GPU appearance, touch controls, navigation/reconnect, real gathering, native concurrent settlement, hosted permissions, and operational rollout remain unverified by this candidate. Existing world-server integration suites were not run because this slice changes no server authority or writer and does not start local sockets. Do not call Wilds or any other game finished on this evidence.

The next permitted end-to-end acceptance remains one bounded visit: enter the flagged world, reach the existing grove, gather once, verify the same owned Moonberry in Keepsakes and its recorded Journal link when eligible, then verify cooldown/retry and missing-art recovery. This requires an explicitly permitted test environment and synthetic/test owner; it is not a live operation authorized by this local candidate.
