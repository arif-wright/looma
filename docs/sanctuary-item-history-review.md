# Sanctuary item-history hardening (local review)

## Scope

This patch connects an acquired `user_items` record to its placement and subsequent shared-rest/Journal history. It does not add new items, worlds, purchases, gifting, or relationship rewards.

- Inventory placement badges and deep links use owned-row identity rather than claiming every acquisition of a catalog item is the same placed object. Legacy unassigned slots are not attributed to a specific inventory row.
- Sanctuary selection uses the owned-row ID. The placement endpoint scopes that lookup to the current owner. A legacy catalog-only request remains accepted only when exactly one acquisition matches; multiple acquisitions require explicit selection.
- Placements retain `user_item_id`. A security-invoker trigger checks owned/catalog identity, placeability, companion ownership, and available quantity. An owner/catalog advisory transaction lock serializes capacity checks. The unchanged-slot check compares owned identities, not catalog identity.
- Existing RLS and grants are unchanged. Companion-only updates remain governed by existing RLS; the placement trigger intentionally does not intercept FK-driven companion nulling on deletion.
- Clearing a slot sets a rest's live placement reference to null instead of deleting the rest. Rest cooldown history consequently survives removing and replacing the seat.
- New rests snapshot the owned-row ID, original placement ID/slot, and acquisition source/provenance inside an insert trigger. Client-provided snapshot fields are overwritten. The snapshot intentionally has no inventory FK so subsequent inventory cleanup cannot erase it.
- Placement and rest Journal metadata include the owned identity and acquisition source. Existing Journal rendering is unchanged.

## Legacy data

No historical identity/provenance is backfilled. A catalog ID cannot establish which acquired object was used; a reused slot also cannot establish what was there during an old rest. Existing placement IDs remain nullable for identity, and old rest snapshots stay null. Already cascaded-away history cannot be recovered by this migration.

Unattributed legacy placements conservatively reserve capacity against matching inventory. If this blocks a new placement, the user can clear/reselect those legacy slots. This is deliberately safer than guessing provenance or granting duplicate copies. New rests on an untouched legacy placement can retain its current slot/catalog context but keep acquisition identity unknown.

## Verification

- Unit suite and core TypeScript check are run locally; see implementation handoff for exact results.
- `scripts/testing/sanctuary-item-history.mjs` runs an isolated PostgreSQL/WASM database with the three original Sanctuary/item migrations, pre-migration fixture data, this forward migration, and SQL regression assertions.
- To reproduce without changing app dependencies:
  - Install `@electric-sql/pglite@0.3.14` into a temporary directory using npm's `--prefix` option.
  - Set `PGLITE_MODULE` to that install's `node_modules/@electric-sql/pglite/dist/index.js` and run `node scripts/testing/sanctuary-item-history.mjs` from the repository root.
- SQL coverage includes real authenticated-role RLS, owner/companion mismatches, duplicate acquisition ambiguity, invalid owned/catalog pairs, quantity one/two, unchanged slot upserts, moves, legacy preservation, forged snapshot rejection, slot replacement/removal, inventory cleanup, and companion/account deletion.
- The harness is single-session and uses minimal related-table fixtures, not a full Supabase stack. Production migration replay and multi-session contention are not claimed as tested.

## Review and rollout limits

The migration is local only. It must be reviewed and applied before this application code is deployed because the code selects/writes the new columns. The forward SQL adds no policies or grants and uses no security-definer functions. The harness's role grants are test fixtures only.

Remaining pre-existing risks outside this patch:

- Shared rest still updates companion stats, records the interaction, and writes care/Journal entries in separate requests. Partial failures and simultaneous requests can create incomplete memories or duplicate effects; the cooldown check is not atomic. A separate transactional rest operation is needed before treating the whole loop as exactly-once.
- Placement and its Journal reaction are also separate writes; a placement may succeed with `memory: null` (the UI already says so).
- Privileged inventory mutation could reduce quantity below deployed usage or reassign identity. Ordinary authenticated users currently have read-only inventory policies; this patch does not redesign admin inventory lifecycle.
- Existing quantity over-allocation is not silently rewritten. Legacy objects can be cleared and explicitly reselected.
- Account and companion deletion retain their existing cascading-history semantics; this patch protects history from slot/inventory cleanup, not deliberate account deletion.
