MEMVOYA: SHARE ONE MOONBERRY — LOCAL REVIEW CANDIDATE

This replacement-file bundle targets main base 160b0a15a59befd2fa085b2a5384954f1efcaba5. Review and overlay it only on a clean local branch from that base. It is not a complete repository or a published release. No repository push, merge, deployment, live database change, production-data access or added-cost service occurred.

What is implemented
Explicitly choose an owned companion and confirm sharing one owned Moonberry. The candidate transaction binds a private UUID receipt to the exact item and companion, consumes one unit, and retains zero-quantity acquisition identity for refill and story. Journal writing requires explicit memory consent; optional response is neutral. No care/stat/bond/XP/wallet reward is added.

Recovery protections
Cancel makes no request. Uncertain/reloaded requests require an explicit same-key check. Account changes cannot clear another account's unresolved request. Missing stacks remain recoverable. Failed local-storage cleanup does not start another share. Stock is labelled last-refreshed while uncertain.

Verified here
847 unit tests in 81 files, full app Svelte check (0 errors/warnings), core TypeScript check and production build passed. The real-component synthetic fixture typecheck and build passed; 40 browser cases were discovered. Reviewed source hashes are included.

NOT VERIFIED / RELEASE BLOCKERS
No native SQL transaction assertion ran: the private PostgreSQL Unix socket is blocked, including after normal escalation. All 29 scenarios and 9 independent lock-wait checks remain prepared only; cleanup is verified.
No browser assertion ran and no screenshot exists: Chromium IPC is blocked, and the supported cloud browser blocked localhost. The fixture's 40 cases are prepared only.
Production consent-schema reconciliation, schema/ACL review and authenticated acceptance require separate authorization. Catalog stability for depleted stacks is required. See RESULTS.json and the review documents for exact boundaries.

Do not apply scripts/sql/moonberry-use-candidate.sql to a hosted database from this archive. It intentionally lives outside applied migrations. The archive does not authorize publishing or deployment.

Rerun guide
Use the base repository's Node/dependency setup. Run npm run check, npm run check:core, VITEST=true npm run test -- --run --pool=forks --maxWorkers=1 --minWorkers=1, and npm run build.
Read scripts/testing/moonberry-use-preview/README.md for the isolated browser fixture. Read docs/moonberry-use-sql-review.md for the guarded disposable native cluster. Current native runtime paths are workspace-specific; preserve the environment allowlist, private Unix-only listener, synthetic data and cleanup contract in any separately permitted environment. Never point the test harness at a hosted database.

Integrity
SOURCE-SHA256.txt hashes the replacement files. RESULTS.json includes the source-manifest hash and evidence hashes. All evidence distinguishes PASS from NOT_RUN; a compilation pass is not browser or database acceptance.
