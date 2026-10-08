# Moonberry Share: integration and release gates

Prepared 2026-10-06. This is a local review plan, not authorization to publish,
merge, deploy, change permissions, create accounts, or apply SQL.

## Candidate integration

- Published Share: [PR #11](https://github.com/arif-wright/looma/pull/11),
  head `e35586da730c01af57c8edfc0a6bbc4b7a7448d5`, remains draft. GitHub reported
  `mergeable=false`, `mergeable_state=dirty` when checked after security merged.
- Current main: `7d5ad2590c6dc9aed57cc65ed511ede530c5e63f`, the merge of
  [security PR #12](https://github.com/arif-wright/looma/pull/12).
- The only overlapping changed file is
  `tests/sql/helpers/game-postgrest-bootstrap.mjs`. Each branch updated its
  strict reviewed whole-src pin; choosing either old hash is incorrect.
- The local reconciliation preserves all six security source files and all
  eleven Share source files byte-for-byte. Combined src tree:
  `a38d1942026b1bd9bfde15d374c5308db2efa744`. Supabase remains
  `0a420e027ca5ff8038408d43072ece95c6333c8c`. The pin/comment correction retains
  strict equality, fixture SQL, HTTP assertions and all isolation guards.
- The standalone Share SQL is unchanged, SHA-256
  `84732dbc9f0bbd328f400d6c6d5a3f1786df7fb69ef0b9330c7890bfd7aa621f`.
  The security hardening SQL remains a manual historical proposal outside
  automatic migrations; do not rerun it as part of this feature.

## Hardened fixture correction

The previous Share test fixture gave authenticated users table-wide preference
INSERT/UPDATE. That shortcut no longer models the hardened baseline. The local
revision grants only ordinary fixture columns (`user_id`, `start_on`,
`consent_memory`, `consent_reactions`), keeps client role/moderation writes denied,
and never adds client TRUNCATE/TRIGGER. Existing service authority is retained.
These are disposable-test prerequisites, not proposed production GRANTs.

The synthetic consent columns now reproduce the observed live shape:
`consent_memory boolean DEFAULT true` (nullable), and
`consent_reactions boolean NOT NULL DEFAULT true`. The original nullable-memory
case remains, using false for reactions; reaction-null rejection is explicit.
No live preference values, defaults, nullability or grants are changed.

The 29 original native scenario paths and nine lock waits remain. Three new
scenarios check protected/table-administration ACL denial, ordinary preference
upsert plus service moderation compatibility, and stored-true defaults. The
report gate requires the exact 32-name scenario set, correct fixture
metadata, nine independently observed waits and complete private-cluster cleanup.
The fixture is a targeted least-privilege subset, not a full hosted ACL mirror.

## Consent decision

Share currently means: save the optional factual Journal moment only when an
existing stored `consent_memory` value is true; show its optional response only
when stored `consent_reactions` is true. Missing preference rows and null memory
values stay off. Both live defaults are true, so a true value does **not** prove
that the person explicitly opted in.

Before release, the product owner must confirm that this existing stored-true
preference contract is intended. If explicit human opt-in is required, stop and
design a separate consent change. Do not backfill, infer consent, change defaults,
or relabel defaults as explicit opt-in.

## Catalog and gather readiness

The source seed expects:
- catalog key `world-moonberry`, kind `consumable`, capabilities including
  `consumable` and `giftable`, and no `placeable` capability;
- active `wilds-exploration` map version 1;
- active `moonberry-bush` node on version 1 at (800,120), radius 58, reward linked
  to that catalog item, quantity 1, cooldown 300 seconds, maximum stock 20;
- active `moonberry-grove` landmark on version 1 at (800,120), radius 72.

After explicit approval, the narrow live read at 17:01 UTC confirmed exactly one
matching record in each of those four configuration groups, with every value
above matching the repository seed. No player records, identities, inventory,
Journal content or secrets were read. This verifies current configuration only;
recheck for drift before an approved migration.

The prior catalog-only schema review established that the live gather function
matches the repository implementation and shares the required advisory lock.
Do not replace gather or reseed configuration merely to enable Share. Refill
must preserve the original acquisition ID/story/provenance. Privileged edits to
Moonberry key/kind/capabilities can invalidate an existing zero stack; freeze
those fields for the rollout, or separately review a catalog-edit guard.

## Minimum staged rollout, after explicit approvals

1. **Review-only publication and isolated CI.** Review the local reconciliation,
   then publish an approved update to PR #11 without merging. Require final-head
   application/core/build checks, all 32 native scenarios and nine waits, all 40
   synthetic browser cases with zero skips/retries, the moderation regression
   suite, and the existing strict-pinned PostgREST suite. Prior green results on
   `e35586da` do not validate this revised fixture or merged source tree.
2. **Prepare the exact migration and secure preflight.** Once the plan is
   accepted, generate a versioned migration with the supported migration tool;
   do not invent its identifier or silently move candidate SQL into automatic
   migrations. Review one atomic transaction, appropriate bounded lock/statement
   timeouts, current ownership/default ACLs, the exact positive quantity
   constraint, absence of the new names, existing consent shape and public
   configuration. Table-lock duration has not been measured. Abort on drift.
3. **Apply only the approved feature transaction.** Preserve consent schema and
   every stored value. Replace only `user_items_quantity_check` with quantity
   >= 0 and add the Moonberry-only zero trigger. Create private
   `item_use_internal.moonberry_receipts` with RLS and no client schema/table
   access. Create the authenticated-only share/history RPCs with empty
   search_path and the reviewed owner/request/target checks. Keep every new
   object and its ACL in the same transaction. A possible extra EXECUTE revoke
   on the trigger helper is a separate, testable migration revision; it is not
   silently included in the unchanged candidate.
4. **Verify database postflight before enabling the UI.** Compare fresh catalog
   snapshots: only the approved feature objects and quantity constraint differ;
   the 32 previously removed security grants remain absent; ordinary preference
   columns and service authority remain unchanged. Both new RPCs must deny
   PUBLIC/anon/service_role execution and permit authenticated execution;
   receipts must remain private with RLS. Read back exact function definitions.
5. **Release and authenticated acceptance.** Separately approve application
   merge/production deployment and a designated test account plus bounded test
   data/actions. Prefer an isolated release environment or existing approved
   operator-controlled identity. Test login, real authenticated RPC transport,
   owner and foreign targets, 1-to-0 consumption, same-key retry/lost-response
   recovery, refill into the same acquisition, memory/reaction on/off, story
   and archive visibility, and unchanged stats/bond/XP/care/wallet state.
   No such account or hosted acceptance is authorized or performed here.

No change to progression, stats, bond, XP, care, economy, existing consent policy,
world-server credentials, or unrelated ACLs belongs in this release.

## Safe rollback boundary

Before commit, roll back the transaction on any failed assertion. After Share
has been used, do not restore quantity > 0, remove zero stacks, regenerate their
IDs, drop receipts, fabricate inventory, or change consent. Disable new sharing
only under approved incident scope while retaining zero-aware inventory/history
and the security fixes; preserve receipts for retry safety and prefer a forward
fix. Restoring unsafe moderation/TRUNCATE/TRIGGER grants is never a feature
rollback step.

## Verification status

The published pre-integration Share head had 847 unit tests, 29 native scenarios,
nine lock waits, 40 synthetic browser cases and ten green workflows. Security
PR #12 had its separately reviewed isolated verification and subsequently landed.
Those are historical exact-head results, not results for this combined candidate.

The revised local native suite is NOT_RUN: PostgreSQL 17 binaries are unavailable
in this workspace, and earlier attempts documented a denied private-socket path.
No alternate listener, hosted database, package installation or access workaround
was used. Actual browser interactions and hosted/authenticated feature acceptance
have not been rerun. Consult the accompanying exact-source local test report for
application, static and independent-review results; a static pass is not native
SQL execution.
