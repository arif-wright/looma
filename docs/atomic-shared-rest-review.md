# Atomic shared rest: local security-review checkpoint

This patch follows `preserve_sanctuary_item_history`. It is a local implementation and test artifact, **not authorization to apply a migration or deploy**. The new SECURITY DEFINER function/private schema require explicit security review and approval before live application.

## Transaction and ownership

`perform_sanctuary_shared_rest(companion_id, request_id)` accepts only two UUIDs. It derives ownership from `auth.uid()`, rejects unauthenticated/foreign-companion calls, and uses fully qualified table references with an empty pinned search path. The chosen Moss Seat must belong to that owner and have the expected catalog key/interactive capability. The existing snapshot trigger revalidates owned identity and fills provenance.

The RPC locks owner/request identity first, then the owned companion with `FOR NO KEY UPDATE`. Distinct requests for the same companion serialize before cooldown checks; request reuse with another companion returns a mismatch. The weaker row-lock mode remains exclusive for stat updates but is compatible with the FK key-share lock used by placement writes. A shared lock holds the selected placement stable through transaction completion.

Companion gains (+2 affection/+3 trust/+35 energy, capped at 100), rest-related stats timestamps, the interaction, care event, Journal entry, and private receipt all commit together. A failure at any write rolls them back. No absence deduction is applied. Existing care timestamps/streak/bond columns are not overwritten. Recorded care deltas reflect actual capped gains.

## Private replay receipts

`sanctuary_internal.rest_receipts` has RLS enabled with no caller policies. PUBLIC, anon, and authenticated have no schema/table access. Only the tightly scoped definer RPC is granted to authenticated callers; PUBLIC/anon EXECUTE is explicitly revoked. It must be owned by a trusted migration role.

A receipt is keyed by owner/request and binds companion, interaction, and the entire committed response including the exact Journal ID. Replays return that immutable response before considering current placement or cooldown. Caller-writable interaction/Journal rows cannot manufacture a receipt; subsequent Journal edits, current-stat changes, slot replacement, or slot clearing do not change it. Account/companion deletion retains existing cascading lifecycle behavior.

The change does not revoke existing user access to gameplay tables. A sufficiently privileged direct client can still edit/insert its own gameplay evidence according to existing policies; this patch protects RPC receipts, not the application's entire economy/history against tampering.

## Client behavior

The real Sanctuary page generates and preserves one request UUID for an attempted rest. Double activation is guarded while pending. Network/5xx/unrecognized gateway errors and authentication expiry retain that identity. Only a confirmed success or recognized definitive application rejection clears it. A recover button works even after the seat disappears, and mounting the page retries a pending request from tab session storage. A later response uses the recorded companion/Journal identity rather than silently retargeting another active companion. If browser storage is disabled, in-memory retry remains available but cannot survive navigation.

The API no longer performs independent authoritative writes or reports successful rest without a Journal ID. Derived emotional-state synchronization remains a best-effort projection after a newly committed rest; it is skipped on replay. It is outside the atomic gameplay transaction and is not an additional reward.

## Validation and limits

- `scripts/testing/atomic-shared-rest.mjs`: isolated PostgreSQL/WASM tests using original companion/Journal/placement RLS and minimal unrelated schema stubs. Run with `PGLITE_MODULE` pointing to a temporary `@electric-sql/pglite@0.3.14` installation.
- SQL tests inject failures at stats, interaction, care event, Journal, and private receipt writes; verify rollback; replay/Journal identity; cooldown and companion separation; old-stat/zero-energy behavior; private-table read/write denial; no anonymous execution; null auth; owner isolation; caller search-path attacks; replay after Journal edits/stat changes/replacement/removal.
- Route tests cover RPC-only validated inputs, ignored forged fields, error sanitization, missing-memory rejection, cooldown responses, and replay avoiding stale emotional projection. Client-storage tests cover stable retry identity, old-response clearing, companion separation, corrupt/disabled storage.
- `scripts/testing/atomic-shared-rest-ui.mjs` is a prepared real-component Chromium harness with mocked endpoint responses. **Browser execution remains blocked here:** Chromium cannot create its local singleton socket (`Operation not permitted`), including the approved sandbox-escalation attempt. Do not claim this UI/browser harness passed.
- PGlite is single-session. Real two-session contention and a full live Supabase/PostgREST request have not been tested; serialization is reviewed SQL lock reasoning, not an independently observed multi-session result.
- Roll out the reviewed migration before the client/API code; old clients without request UUIDs receive a validation error until refreshed.
