# Moderation ACL hardening review proposal

This draft is separate from Moonberry sharing and based directly on main. Publishing or merging this source does not execute the SQL. The proposal lives outside `supabase/migrations`, and no workflow connects to a hosted database or deploys the application. Live permission changes and application deployment require separate approval.

## Exact proposed change

`scripts/sql/moderation-acl-hardening-proposal.sql` proposes only:

- Remove `INSERT` and `UPDATE` on `user_preferences.moderation_status` and `moderation_until` from `anon` and `authenticated`: eight direct grants.
- Remove `TRUNCATE` and `TRIGGER` from those two roles on `user_preferences`, `user_items`, `item_catalog`, `companions`, `companion_journal_entries`, and `world_events`: 24 direct grants.

No ordinary column grant, service-role grant, table-wide write privilege, RLS policy, schema, stored row, consent default, function privilege, default privilege, or migration-history change is proposed. Other overbroad grants are outside this bounded review. Existing triggers keep working after clients lose permission to create new ones.

The transaction requires PostgreSQL 17+, owner/grantor `postgres`, the six expected RLS-enabled tables, and the two protected columns. It rejects broad preference writes, client role memberships, relevant PUBLIC grants, unexpected grantors or grant options, and missing target grants. It uses `RESTRICT`, checks effective denial of every target, and compares non-target explicit ACLs plus effective ordinary preference and table privileges. Service moderation writes must remain allowed. Any failed assertion aborts the whole transaction. Already-hardened or changed baselines deliberately fail instead of silently skipping guards.

## Application compatibility

The previous `getModerationState` attempted to clear expired restrictions using the caller's authenticated client. Its replacement is a pure read:

- Expired mute/suspension, including exactly at the boundary, is effectively active with no expiry.
- Future, missing or invalid temporary expiry remains restricted.
- Bans never expire implicitly.
- Stored moderation decisions are retained unchanged.

Messenger metadata, friend badges, circle member badges and moderator-case sender metadata share the same effective-state helper. Existing moderator checks and privileged moderator action writes are unchanged. No new service credential, privileged client, RPC or cleanup job is introduced.

The backward-compatible application change must be deployed and verified before any separately approved ACL application. This PR does not authorize that deployment.

## Credential-free verification

Run application checks from a clean checkout:

```
npm ci --ignore-scripts
npx svelte-kit sync
node --test scripts/testing/moderation-acl.test.cjs
npm run check
npm run check:core
VITEST=true npm run test -- --run --pool=forks --maxWorkers=1 --minWorkers=1
npm run build
```

The source suite exercises pure expiry semantics, non-mutating reads, enforcement scopes, four display readers and the exact two-REVOKE boundary. Full application checks cover compatibility with the existing project.

For native ACL verification, install official PostgreSQL 17 binaries on an isolated test machine, then run:

```
node scripts/ci/moderation-acl-verify.mjs --self-test
node scripts/ci/moderation-acl-verify.mjs
```

The runner refuses inherited database/PG/Supabase connection variables, creates only a fresh private Unix-socket cluster, disables TCP, and uses synthetic identities and rows. Its simplified fixture recreates the relevant grants and owner RLS, without production identifiers, credentials, exports or user data. It proves preservation in the synthetic schema; it does not claim complete equivalence with the deployed schema. It verifies target denial, ordinary-write and service-role retention, exact ACL preservation, schema/RLS/default/trigger preservation, and complete transaction rollback under unexpected drift. Test artifacts identify the exact source and server versions. Missing binaries or failed assertions fail the job; hosted services are never a fallback.

`.github/workflows/moderation-acl.yml` runs the application and native suites on the exact PR head, with SHA-pinned actions, read-only repository permissions and credential persistence disabled. It produces review artifacts only.

## Rollout gates and limitations

Passing synthetic tests establishes the tested SQL and application semantics, not a live rollout. Before any live change:

1. Obtain explicit application-deployment and exact ACL-change approval.
2. Confirm application compatibility and run separately authorized authenticated acceptance on designated test identities. Specifically verify the actual Supabase/PostgREST preference upsert omits protected moderation columns, ordinary consent changes preserve existing restrictions, and privileged moderator actions persist the expected database state.
3. Save fresh read-only output from `scripts/sql/moderation-acl-capture-before.sql` securely. Compare the approved baseline, including owner RLS denying foreign writes, owner deletion and user-id reassignment. No production capture belongs in this repository.
4. Deploy and verify the no-write effective-status application change first. Apply only the approved guarded transaction as the expected owner during a controlled window.
5. Run `scripts/sql/moderation-acl-acceptance-catalog.sql`; every actual/expected privilege result must match. Rerun the capture and compare all other ACLs, policies, types, defaults and triggers.

A failed guard or timeout is a rollback and investigation signal. Do not remove guards, substitute `REVOKE ALL`, widen privileges, or change RLS to make a test pass.

The capture script emits precise restoration statements for the captured target grants. Never execute them automatically: restoration reopens the original issue and requires a new security-sensitive decision and approval. No blanket rollback grant file is included.

Two existing behaviors remain outside this proposal: moderation reads default to active on read failure, and the moderator action helper does not inspect its upsert error before recording the action. Review those separately; acceptance must inspect persisted state rather than trusting an HTTP response. This is not a complete moderation-security audit.

## References

- [PostgreSQL 17 REVOKE and table/column grant interaction](https://www.postgresql.org/docs/17/sql-revoke.html)
- [PostgreSQL 17 privileges](https://www.postgresql.org/docs/17/ddl-priv.html)
- [Official PostgreSQL Ubuntu packages](https://www.postgresql.org/download/linux/ubuntu/)
