# Tiles Run Nebula placeholder: stop-offer proposal

Prepared locally on 2026-10-04. No live SQL, publication or deployment has occurred.

## Approved direction and evidence

The user clarified that the single ownership record is their own testing and that no actual Nebula skin was implemented. Keep Tiles Run archived; do not add a playable legacy route. Preserve that test entitlement, all history, product identity and existing cover assets.

A prior bounded live read at 2026-10-04 22:50:57.977677 UTC found `tiles-run-skin-nebula` active/featured, priced 120 shards, cosmetic/epic and stackable, with exactly one aggregate `shop_inventory` record. No owner IDs, inventory rows, orders, purchases, payment data or secrets were fetched. The user supplied the test-ownership context afterward; the aggregate count alone did not establish purchase or grant origin.

## Minimal proposed change

`docs/sql/tiles-nebula-delist.sql` is an unapplied, transaction-wrapped update proposal, deliberately outside automatic migrations. It:

1. Briefly locks `shop_items` exclusively to drain already-running legacy purchase reads, and locks `shop_inventory` against writes. Five-second lock and fifteen-second statement timeouts fail safely rather than wait indefinitely.
2. Requires exactly the known product slug with the observed active/featured flags, 120-shard price, cosmetic type and stackable status. The unique slug plus `INTO STRICT` requires one product; aggregate ownership must still equal one.
3. Adds one authenticated SELECT policy for this inactive product's existing owner. No write permission or gameplay access is added.
4. Sets only this item's `active` and `featured` flags false, requiring one updated row.

No inventory, order, wallet, game, achievement, image, price, title, slug, UUID or historical migration is modified. A mismatched precondition or existing policy name aborts the complete transaction. Do not relax the guards if live state has changed.

`docs/sql/tiles-nebula-restore.sql` is the guarded inverse proposal. It restores the known active/featured flags and removes only the tagged policy after validating the expected state and a fingerprint of its command, permissiveness, roles and predicates. It refuses later policy edits rather than silently dropping them. Restoring an offer needs separate approval too.

## Why the read exception is necessary

This storefront uses legacy `shop_items.active`, not the separate `shop_products.is_active` / variants catalog. Both current catalog and featured queries explicitly require `active=true`; the featured query also requires `featured=true`. The legacy `purchase_item` RPC rejects inactive products before wallet/order/inventory writes.

The owned collection reads `shop_inventory` with a direct `shop_items` relation. Existing item SELECT policy permits only active rows. Merely setting active=false would therefore make its joined metadata null; the inventory component dereferences `row.item.title` without a null guard. The proposed owner-only exception preserves that exact relation, title and cover while new purchases remain rejected.

The owned legacy card only displays metadata and acquisition time. No Nebula-specific equip, consume, game skin hook or use action was found. No new use or play capability is created.

The old `shop_items_view` is a default owner-security view without a WHERE clause. Direct view queries may still expose inactive catalog metadata. This proposal does not broaden or repair that pre-existing view; current storefront filters and purchase rejection remain the stop-offer controls. Do not claim universal catalog secrecy.

## Release ordering

Keep this proposal and the archive local until publication/live-write approvals are explicit. At a separately approved release, verify current schema/policy/trigger definitions and the guarded state, apply the delist transaction before making the non-playable archive live, then check the public catalog flags and aggregate entitlement count read-only. Do not place a live test purchase. Publish the archive only after the approved delist and isolated browser/regression checks succeed. This prevents the shop from offering a game cosmetic after gameplay is archived.

## Verification and limits

Nine isolated SQL/RLS checks passed with PGlite 0.3.14:

- Normal and featured storefront predicates exclude the item.
- The owner still resolves title/slug/image/acquisition metadata.
- Direct table reads do not expose that inactive row or ownership to another user or anonymous caller.
- The actual source purchase RPC rejects buys for owner and non-owner without wallet/order/inventory changes.
- Unrelated products and all synthetic historical records remain byte-for-byte unchanged.
- Rollback restores the exact original catalog row and removes its policy.
- Extra ownership or changed price aborts atomically.
- A changed policy role/predicate blocks rollback before any restore or policy drop.
- Bounded lock statements are present.

The fixture uses the selected legacy shop migrations with explicit synthetic auth, grants and records. It is not a full historical migration replay: the repository also contains a different older marketplace/order schema. No live schema/function/policy drift, native competing-session lock scheduling, PostgREST embedding or browser behavior was tested. Those remain verification requirements before a separately approved application. No historical migration was rewritten, no CLI migration was generated, and no source/Supabase tree pin needs refresh because all additions are documentation/standalone tests.

Run the offline fixture with an installed PGlite module:

`PGLITE_MODULE=file:///path/to/@electric-sql/pglite/dist/index.js node tests/sql/tiles-nebula-delist.mjs`

The existing archive candidate's 628 unit tests, type checks, build and source-preservation evidence remain applicable: its application source has not changed in this follow-up.

## Sources

- Current repository: `src/routes/app/(protected)/shop/+page.server.ts`, `src/routes/app/(protected)/inventory/+page.server.ts`, `src/routes/app/(protected)/inventory/+page.svelte`
- Legacy schema/purchase/RLS: `20251104_shop_items.sql`, `20251105_shop_purchases.sql`, `20251105_shop_nonstackable.sql`, `20251105_shop_featured.sql`
- [Supabase row-level security and view behavior](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Current Supabase changelog](https://supabase.com/changelog), checked for relevant breaking changes; no API/CLI upgrade is part of this proposal.
