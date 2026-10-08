# Moonberry snack: local candidate and verification contract

**Integration update (2026-10-06):** see [the release plan](moonberry-use-release-plan.md) for reconciliation with security main, 32 required native scenarios, observed consent semantics, and current approval gates. The original blocked-run sections below are historical.

Original base: main `160b0a15a59befd2fa085b2a5384954f1efcaba5` (2026-10-06).
This is a review candidate. Publication and credential-free GitHub verification are separate from rollout; no hosted migration, production data access, merge, or deployment is part of this candidate.

## Minimal slice

From Keepsakes, explicitly choose an owned companion and confirm sharing one owned Moonberry. An authenticated transaction validates the exact acquisition and companion, decrements one unit, and records a private minimal receipt. It may save the factual Journal moment “You shared one Moonberry with {name}.” The immediate optional response reuses the existing neutral “{name} receives it gently.” No gift preference calculation, personality lookup, stat, bond, XP, wallet, care event, milestone, or automatic action is involved.

The final unit leaves quantity zero in the same user_items row. Zero is valid only for the Moonberry consumable; all other items retain their positive-quantity requirement. The original acquisition ID, timestamp, source companion and provenance remain unchanged. The existing gather writer already increments this row on refill. All zero stacks remain inspectable as collection history and are not counted as available stock. Existing placeable items remain positive, avoiding a broad placement contract change.

The RPC shares the existing fixed grove gather lock. A per-owner request UUID binds the exact item and chosen companion and persists both successful and depleted terminal results. A receipt replay never decrements again or recreates a removed/disabled Journal entry. Receipt quantity describes that event; the UI reloads current collection state rather than treating it as a current balance.

Memory is saved only when an existing authoritative preferences row has a stored consent_memory=true value (which may be defaulted and does not prove explicit human opt-in). A row lock serializes an existing preference update. An absent preference means no memory for this action, avoiding a first-preference opt-out race. Missing consent schema is a rollout blocker; no permissive fallback is supplied. Reaction-off suppresses expressive response. The private receipt stores no journal text or memory ID and does not expose old memory on replay. The ordinary story read retains consent and archive-window controls.

## Required tests

- One unit becomes zero without deleting or changing acquisition identity; negative quantities and non-Moonberry zero fail.
- Two different requests for one remaining unit yield exactly one shared result; same-key retries commit once.
- A receipt cannot be reused for a different owned stack or companion, including after target deletion.
- Foreign item/companion, unsupported catalog/source/capabilities, malformed inputs and signed-out callers do not consume.
- Native independent PostgreSQL sessions prove gather/use ordering in both directions and limit/refill correctness; latest stock wins after lock wait.
- Injected receipt/Journal failures roll back the decrement and all evidence.
- Enabled, disabled, absent and concurrently updated consent; reaction-off; deleted Journal followed by retry; disabled history stays hidden.
- Confirmation cancel makes no request. Double activation stays single-flight. Timeout/lost response stays uncertain. Retry reuses one UUID; target changes cannot reuse it. Reload does not automatically repeat a mutation.
- Current quantity reload, empty stack visibility, refill, exact item story and interrupted navigation are verified through isolated UI fixtures.

## Release boundary

Standalone candidate SQL is under scripts/sql, not an applied/generated migration. The production consent columns were verified by a separate catalog review; no addition or backfill is needed there. The checkout still lacks their complete authoritative migration history, so other environments must fail closed unless their schema is independently reconciled. Existing gather/rest writers' consent behavior is outside this slice. This candidate must not be called production verified without separately authorized hosted schema/ACL review and authenticated end-to-end acceptance.

## Review refinements

- The API requires an expected-owner UUID header solely as a stale-page guard. It compares that guard with the authenticated session before calling the RPC; the header never supplies database authority. Changing accounts while an old page is open therefore leaves the old account's request unresolved instead of clearing it on another account's rejection.
- Accepted stored UUIDs are normalized. Unresolved intents retain their original exact targets. A collection-level recovery control remains available if the original stack vanishes or becomes ineligible; it never substitutes the currently displayed stack.
- A terminal result whose browser-storage cleanup fails has a local-only “Clear saved request” action. It does not send another share. Newer saved requests that arrive during refresh remain explicitly recoverable afterward.
- Inventory quantities are marked “at last refresh” while a share is pending, uncertain, or current-state refresh has failed. Historical receipt quantity is never presented as current stock.

## Verification limits for this candidate

Independent source review found no remaining blocking client/API/story defect after these refinements. This is a code-review result, not actual browser acceptance.

The disposable PostgreSQL cluster cannot create its private Unix socket in the current cloud environment, including after normal escalation. All 29 native transaction scenarios and nine independent lock-wait observations remain NOT_RUN. Its failure and verified cleanup are retained, and no hosted database or alternate listener was substituted. See `moonberry-use-sql-review.md`.

Installed Chromium likewise cannot create its required IPC socket, including after escalation; the supported cloud browser separately blocked the local fixture URL. Actual browser interactions and screenshots remain NOT_RUN. The isolated synthetic fixture uses the real inventory, story and sharing components with deterministic transport fault injection. Its runnable regression cases are prepared for an environment that supports the browser. No image is presented as a screenshot of a run that did not occur.

Release is blocked until the native transaction suite, actual browser flows, consent-schema reconciliation, and separately authorized hosted schema/ACL/authenticated acceptance are complete. Catalog identity/capabilities must remain stable for depleted stacks; privileged catalog reclassification needs a separately reviewed guard if it is to be supported.

## Credential-free GitHub verification route

`.github/workflows/moonberry-share.yml` runs on scoped pull-request changes and checks out the exact head SHA with read-only repository permissions and no persisted checkout credentials. It runs the full unit suite, application/core checks and build, plus independent native PostgreSQL and synthetic-browser jobs. The native job installs official PostgreSQL 17 binaries without creating a default system cluster, then invokes the same private-socket, peer-authenticated, TCP-disabled disposable-cluster launcher. The browser job installs Playwright-managed Chromium and serves only the guarded loopback fixture.

New run evidence is written under `test-results/moonberry-share/` and uploaded even after a failed job. A report gate requires all 29 native scenarios, nine independently observed lock waits and verified cleanup; the browser gate requires all 40 desktop/narrow cases with no skip, retry or discovery-only result. The original `artifacts/moonberry-use/` evidence is preserved unchanged and continues to document the blocked local attempts. Preparing or publishing this workflow is not a passing CI result: use only artifacts/checks tied to the published candidate SHA when reporting subsequent execution.

Passing these credential-free checks would resolve the local execution gaps only. Consent-schema reconciliation, hosted schema/ACL review and authenticated acceptance remain separately authorized release blockers. The SQL remains a standalone candidate under `scripts/sql`, with no new production migration.
