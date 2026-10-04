# Care keepsake qualification: local review

## Delta

- A new server-admin RPC, `unlock_care_moss_seat`, replaces the separate count, acquisition, and unchecked Journal calls.
- Eligibility is the earliest three persisted `feed`, `play`, or `groom` events, in any mix, for exactly the same owner and companion. Ordering is `created_at, id`; passive, daily bonus, Sanctuary rest, and milestone records do not qualify.
- Both the route and RPC require a successfully persisted direct-care event before evaluation. The RPC derives the name, catalog item, evidence, and Journal text from database records.
- The new ownership row and unlock Journal entry commit together. Any Journal error aborts the function statement, rolling back the new ownership row. The route reports no unlock on RPC error.
- The existing ownership unique key remains unchanged. The Journal uses `source_type=system`, `source_id=<owned item ID>` and its existing unique key.
- Evidence records only three event IDs, actions, and timestamps plus `direct-care-3-v1`. Existing companion name/reason provenance is retained; no new emotional or personal fields are collected.
- Existing awards, including those without evidence or an unlock Journal entry, are left untouched. No retrospective qualification or memory backfill is attempted.

## Security matrix

| Caller/path | Result |
| --- | --- |
| PUBLIC, anon, authenticated | No function EXECUTE permission; anon/authenticated denial tested |
| Existing server service role | May call; SECURITY INVOKER uses only its existing table privileges |
| Wrong owner/companion pair | No award |
| Event from another owner or companion | No award |
| Missing or non-direct-care triggering event | No award |
| Existing owned award | No mutation, no new Journal, no new unlock announcement |
| Newly qualified award | Atomic ownership + Journal, server-derived evidence |

Empty function search path and fully qualified relations prevent name-resolution substitution. No gameplay table grants, RLS changes, credentials, or new service-role access are introduced. Local SQL tests compare table ACL/RLS before and after the migration. This retains the existing server-admin trust boundary: the helper is intentionally not a caller-facing owner RPC. Existing authenticated event-insert policies and the care route's broader integrity model are outside this change.

## Verification

Run `scripts/testing/care-keepsake-qualification.mjs` with `PGLITE_MODULE` pointing at a temporary PGlite 0.5.8 installation. Actual prerequisite migration definitions and the function execute in an isolated PostgreSQL/WASM database. Fixture-only service-role table grants model existing access; they are not migration changes. The fresh recovery report records current execution, separately from historical results.

Route tests execute the actual POST handler with local network mocks for failed/missing care insertion, persisted event identity, returned RPC errors and rejected RPC requests. The reconstructed harness covers qualifying versus unrelated events, exact ownership, ordering, legacy preservation, rollback and retry, invoker-only privileges and unchanged table ACL/RLS.

## Remaining limits

- PGlite runs one connection; it does not establish real multi-session lock scheduling. The companion `FOR NO KEY UPDATE` lock serializes helper calls; ownership uniqueness is also enforced with `ON CONFLICT DO NOTHING`. Separate PostgreSQL concurrency validation remains necessary before production use.
- Care stat updates, event creation, and reward evaluation are still separate requests/transactions. This patch makes only acquisition + unlock memory atomic. Care request idempotency, cooldown races, duplicate direct-care writes, bond formulas, and milestone-event schema inconsistencies are unchanged.
- If award evaluation fails after a care event persisted, no item is announced. A later successful care action can retry qualification from the stored earliest three events. Lost HTTP responses do not replay an unlock announcement for an already-owned item.
- Concurrent backdated inserts or administrative edits to care history are not frozen globally; evidence captures the earliest three visible at qualification time and is never rewritten.
- No hosted database, live grant, migration application, push, deployment, or credentials are used by these tests. A deployed server must have this migration before enabling the updated RPC path.
