# Connected Wilds: local review candidate

Prepared 2026-10-05. Local source/art/test work only. No hosted deployment, publication, paid service, credential, production account or live database was changed.

## What is implemented

Two connected areas total: the existing exploration map becomes Moonberry Grove, and the existing town map becomes the newly illustrated Lantern Hollow. Each area is 960 × 540 with its own public authoritative traversal manifest. This is a bounded two-area slice, not a completed open world.

- An ivy-and-lantern portal connects Grove `(880,270)` to Hollow `(160,270)`. The return portal at Hollow `(80,270)` lands at Grove `(804,270)`. Both arrivals are walkable and outside the 54-unit return-trigger radius.
- Rowan walks a short route in the Grove; Wren wanders around the Hollow. Both are explicitly labeled residents, kept separate from real players, and simulated by the server with authored paths and pauses. No chat, generated dialogue, account impersonation, rewards or new services.
- The default Phaser renderer now uses existing production chibi player/companion sequences and illustrated environment artwork. Generated transparent portal and cottage art has source copies, prompts and hash provenance. The optional Three renderer also switches area scenery and filters its actor roster correctly.
- Keyboard E and an accessible native button enter the nearby portal. Authoritative snapshots decide proximity. Map changes snap actors/camera/companion trails; disconnect, pause, blur and held-key repeats cannot silently continue travel input. Touch controls, area announcements and reduced-motion behavior are retained.
- Existing Moonberry exact-acquisition Journal/consent and safe companion-art fallback changes are integrated. The gathering writer, economy, inventory capacity/cooldown, profile ownership and consent contracts are unchanged.

## Source preservation

Published base: `b9e073cdb76ff8bf9e80acdafae4673bc09e1c82` (Lanternway). Its Git tree is `45d59445f82bf5b7d633b0a26b9560355e01657e`, verified against the remote Git object. Reconstructing the local Lanternway baseline reproduced that exact tree before integrating Moonberry and Connected Wilds. The deliverable patch applies to this tree; reconstruction is checked before saving.

## Authority and persistence

World protocol and ticket version are 2. Both initial and refreshed ticket requests require the matching client protocol header. Missing/mismatched versions receive a reload-required response and no ticket, and the world server rejects old protocol-one tickets. This prevents stale renderer bundles from obtaining fresh protocol-two credentials and mixing area positions.

The room accepts only a UUID request ID and one of two fixed portal IDs. It checks live session presence, source area, authoritative position, interaction range, cooldown and bounded rate/replay state. It waits for an older checkpoint, resets movement, and commits a destination only after the service-only compare-and-swap succeeds. Drop/leave wait for an in-flight transition. Checkpoint/travel version conflicts or ambiguous travel outcomes close with code 4004 and obtain a fresh authorization; the old session does not receive a reconnect reservation. Portal intents are never silently replayed into a replacement room.

The new migration `20261005052000_connected_wilds_portals.sql` is a proposal, not an applied live change. It adds only a service-executable fixed-destination travel RPC and updates the existing load RPC to preserve supported saved areas. User-scoped transaction advisory locking covers initially absent checkpoint rows; row locking and expected state versions protect existing checkpoints. No client execute grant, table, reward, inventory or account-permission expansion is added.

## Verification and limits

The evidence archive records exact final commands/results. This authoring executor runs Node 24.19.0; the world-service package declares Node 22, and the prepared CI uses Node 22. Target-runtime verification remains part of that unrun CI gate. Local checks include Svelte/TypeScript, core checks, the web unit suite, world-server type/build and all socket-free server tests, asset-contract/provenance checks, diff validation, and a complete web production build. An initial unrestricted-heap build was killed during adapter packaging; the bounded Node heap retry completed. This is an execution-resource result, not a production deployment.

Actual candidate SQL was executed in disposable in-memory PostgreSQL (PGlite 0.3.14), including forward/return travel, stale/source/version/range rejection, disabled destinations, NaN/Infinity/null, saved-area restoration, invalid/obsolete checkpoint fallback and service-only function privileges. This establishes sequential SQL semantics only; it does not establish native concurrency or hosted-role behavior.

The local Chromium launch failed with socket `Operation not permitted`; the supported cloud browser refused fixture localhost with `ERR_BLOCKED_BY_CLIENT`. No alternate browser flags/listener/protocol were used to bypass either restriction. Consequently there are no verified browser screenshots, GPU frame-rate measurements, touch-device acceptance, real WebSocket round-trip results, or native concurrency results in this candidate. Generated asset pixels were inspected directly.

Prepared release gates, currently unrun:

1. `.github/workflows/connected-wilds.yml`: native Colyseus/socket integration, disposable native PostgreSQL and synthetic Phaser browser checks.
2. `tests/sql/connected-wilds-concurrency.mjs`: independent native backends must show three actual lock waits: two first joins, travel versus an old checkpoint, and simultaneous portal requests.
3. `scripts/testing/connected-wilds-preview/`: actual Phaser scene with explicitly synthetic snapshots, asset loading, two areas, resident motion/labels, E priority, held-input suppression, 320/390/844/1280 widths, reduced motion and repeated cleanup. It does not connect an account, grant rewards, or establish server authority.
4. Representative device/GPU and authenticated test-environment acceptance of both renderers, both portal directions, reconnects, touch controls and existing Moonberry loop.

Phaser has a soft 16 MiB idle sprite-cache target, not a total GPU cap. Full-resolution scenery is approximately 35.50 MiB decoded by itself, and actively displayed/requested sprite pages are pinned. The older 32 MiB prototype scene target is therefore not met by these full-resolution assets. Physical mobile memory/frame-rate acceptance and any lossless presentation-preserving derivative pipeline remain release work; no performance pass is claimed.

## Later publication and rollback

Publication requires separate approval. Before enabling this slice, review the migration, pass the prepared native/browser gates, apply the approved migration in the intended environment, and coordinate protocol-two web ticket issuer and world-server rollout. Do not point a preview at a production world service without explicit authorization.

For rollback, drain protocol-two rooms and stop new portal entry before restoring the prior web/server versions. Restore the previous `fn_world_load_state` definition and remove only the new travel RPC after confirming no running process calls it. The old single-map loader may reset a saved Hollow position to its configured spawn; this does not revert inventory, Journal or rewards. No rollback SQL is automatically executed by this candidate.
