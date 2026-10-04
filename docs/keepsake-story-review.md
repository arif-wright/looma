# Your keepsake’s story — local implementation review

## Scope

A read-only, inline story on the existing Keepsakes route. Cards link to an exact acquired `user_items.id`; Sanctuary adds separate read links beside selection/placed-item controls. The feature reuses SanctuaryPageFrame, GlassCard, EmotionalChip and existing object icons. No new schema, service, reward, AI generation, data-writing endpoint, account, or dependency is introduced.

The panel has three sections: factual arrival, all current spaces for this acquisition, and up to six recent supported recorded moments. Qualified Moss Seat evidence expands into three direct-care actions/dates. Legacy or malformed evidence gets neutral wording. Acquisition never creates a synthetic Journal memory. Chapter acquisition copy avoids interpreting a reward theme as evidence of bond strength.

## Identity and privacy

- Every new database read is explicitly owner/user scoped and uses the existing authenticated client with RLS. No admin client or private rest receipts are read.
- Story selection resolves only within the current owner's fetched inventory and requires an owned-row UUID. Foreign/missing/malformed IDs get the same quiet state without looking up their history.
- Current placement joins only by `user_item_id`, never catalog ID. All current placements for quantity-two acquisitions are shown.
- Supported moments require exact `meta_json.userItemId`, expected system/category/action metadata, valid stored moment/companion IDs, authored text and dates. Shared-rest source IDs remain interaction IDs; they are never treated as acquisition IDs.
- Historical slot labels come from the stored Journal snapshot and survive current placement removal/replacement. Each Journal link uses the stored record's companion and moment, independent of today’s active companion.
- Memory consent false prevents history reads. A failed preference or visibility lookup fails closed. Individual read failures do not hide successfully loaded owned items; placement failure is shown as unknown rather than unplaced. No database error details are exposed.
- Arbitrary provenance/body/reason values are not used to assert how the item was earned. Text is escaped normally by Svelte; no raw HTML.

## Journal archive boundary

The Journal’s normal timeline combines 24 care/checkin/mission/game inputs, 60 Journal rows, a summary and up to two generated rows, with a 30/90 free/subscriber visible limit. Its exact-moment deep-link exception is not used to discover older archive contents here.

The story loader retrieves at most six owner-and-item-filtered candidates, then a timestamp-only projection of the same input windows for each recorded companion. It returns only candidates within a conservative current Journal browsing window. Two slots are reserved for Journal-generated pattern/digest rows, ties count against the limit, and the ambiguous 60-row Journal boundary is excluded. Missing companions or visibility failures suppress history. Hidden candidate text/IDs and intermediate timestamp evidence are never serialized to the client.

This intentionally may omit a borderline moment that Journal can show. No pagination, archive counts, new paywall, or entitlement upgrade is added. The visibility helper must be kept in sync if Journal’s composition/window changes. It is not an authorization change to Journal itself.

## Navigation and accessibility

- Ordinary URLs support selection and deep-link reload: `/app/inventory?item=<owned-id>#keepsake-story`.
- Route data is reactive, story components are keyed by acquisition, and opening focuses the labelled inline region. There is no modal or focus trap.
- Close returns to the matching collection card or the previous owned Sanctuary selection. Sanctuary also exports a SvelteKit page snapshot for browser Back/Forward restoration of selection made through cards.
- Read links are separate anchors, never nested in placement/removal buttons. No mutation runs when reading.
- Disclosure and links use visible focus styles, semantic headings/lists, labelled close, and 44px targets. The layout changes from two fact columns to one below 540px. Dates explicitly use UTC for stable server/client rendering.

## Verification

New unit/route coverage includes direct-care validation (including malformed array/object actions), owner isolation, invalid/foreign selection, distinct same-catalog acquisitions, multiple slots, removal/replacement snapshots, stored companion Journal links, stable chronology, unsupported metadata, missing memories, consent/failure handling, archive/subscription/tie boundaries, repeated loads and changed/back-like selected URLs. Tests mock database reads and use only invented data.

A standalone fixture under `scripts/testing/keepsake-story-preview` imports the actual components with synthetic items and moments. It includes mobile/desktop preview entry points and three prepared Playwright tests. The production SSR harness is `scripts/testing/keepsake-story-ssr.mjs` and runs after a build.

In the original overnight run, the documented cloud-browser navigation to the running localhost fixture returned `net::ERR_BLOCKED_BY_CLIENT`. No alternate network path, denied standalone Chromium retry, authenticated account or live database was used. Screenshots, actual browser layout/focus interaction, and real SvelteKit Back/snapshot restoration were not verified. The preview README includes the required permitted-environment checks. Compilation and mocked tests must not be presented as browser verification.

## Recovery and publication boundary

The original 19-file feature was built atop local integrated checkpoint `cef5f04d9b291e56b1cb8efa304b8ba810ca5c72`; its original local feature commit was `a3df9407e0d30d7ea1cc51268b500d940599ef92`. Those local files disappeared before publication. On 2026-10-04 this feature was reconstructed from retained implementation context onto the verified published PR9 baseline `178aeb5bafb4d1b499fe07532a5f9320d736cb53`. Historical commit IDs are provenance, not proof that old Git objects or verification logs survive.

The recovered feature's 53 focused tests passed freshly. Its broader source/type checks and the final combined batch validation are recorded separately by the integrator; no historical aggregate result is treated as a fresh validation. Recovery does not establish byte-for-byte identity to the original commit. The previously reviewed integration-only privacy tests and unknown-placement refinements are applied separately by the integrator before final combined review.

No push, deployment, new database migration or live database access is part of this feature reconstruction. The existing placement-to-Journal partial-failure gap and live authenticated/concurrency release proofs remain separately scoped. This view accurately omits an absent memory rather than covering that gap with invented history.

Reference: [SvelteKit page snapshots](https://svelte.dev/docs/kit/snapshots) (the installed SvelteKit 2.x uses the supported exported snapshot form); [Supabase JSON containment filter](https://supabase.com/docs/reference/javascript/contains).
