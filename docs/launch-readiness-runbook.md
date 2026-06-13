# Memvoya Launch Readiness Runbook

Use this runbook for the final production release candidate and launch-day checks. Memvoya is launch-ready only when every **Launch gate** item below passes.

Product scope and behavior are defined by:

- `docs/launch-phase-1.md`
- `docs/home-experience-contract.md`
- `docs/product-surface-contract.md`
- `docs/companion-experience-contract.md`
- `docs/economy-contract.md`
- `docs/sanctuary-roadmap.md`

Automated launch smoke coverage lives in:

- `tests/e2e/bond_genesis.spec.ts`
- `tests/e2e/launch-readiness-smoke.spec.ts`
- `tests/e2e/mobile-core-journey.spec.ts`
- `src/lib/__tests__/launchProofIntegrity.spec.ts`
- `src/lib/__tests__/relationshipState.spec.ts`

## 1. Deployment Prerequisites

### Release candidate

- [ ] Release commit is on `main`.
- [ ] Worktree is clean: `git status --short --branch`.
- [ ] `npm run check` passes with zero errors.
- [ ] `npm run check:core` passes.
- [ ] `VITEST=true npm run test -- --run` passes.
- [ ] `npm run build` passes with the Vercel adapter.
- [ ] Database backup or point-in-time recovery is confirmed before migrations.
- [ ] A production test account with no companion is available.
- [ ] A production test account with an existing companion and remembered check-in is available.
- [ ] An admin account listed in `ADMIN_EMAILS` is available.
- [ ] Vercel logs, Supabase logs/table editor, Stripe dashboard, and DNS controls are accessible to the launch operator.

### Launch gate

Do not open launch traffic if any of these are true:

- Home or onboarding returns HTTP `500`.
- A successful first check-in does not create a durable Journal entry.
- Home claims a moment was remembered without a persisted Journal entry.
- An existing user is incorrectly forced through Bond Genesis.
- Home and Companion present bond closeness as if it were current mood.
- Protected primary navigation foregrounds Games, Missions, Market, Friends, Circles, or Messages.
- Stripe webhook delivery or subscription synchronization is failing while premium checkout is enabled.
- Launch analytics are not writing to `analytics_events`.

## 2. Required Migrations And Config

### Migration order

Apply the complete migration history to the target environment before deploying app code. For the launch-focused work, verify these dependencies and recent migrations specifically:

1. `supabase/migrations/20260214120000_home_daily_checkins.sql`
2. `supabase/migrations/20260228_companion_journal_entries.sql`
3. `supabase/migrations/20260301_subscription_entitlements.sql`
4. `supabase/migrations/20260612201500_personal_sanctuary_mvp.sql`
5. `supabase/migrations/20260612213000_unified_items_and_sanctuary_purpose.sql`
6. `supabase/migrations/20260612223000_sanctuary_shared_rest.sql`
7. `supabase/migrations/20260613190000_companion_first_bond_state.sql`
8. `supabase/migrations/20260613201500_fix_companion_journal_upsert_conflict.sql`

Also confirm the analytics and billing foundations from:

- `supabase/migrations/20251103_phase10_7_analytics.sql`
- `supabase/migrations/20251105_wallet_transactions.sql`

Apply migrations using the team's normal Supabase deployment process. Do not deploy app code that reads `companions.first_bond_completed_at` before migration `20260613190000_companion_first_bond_state.sql` is applied.

### Post-migration verification

Run these checks in the production Supabase SQL editor:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'companions'
  and column_name = 'first_bond_completed_at';

select to_regclass('public.user_daily_checkins') as daily_checkins,
       to_regclass('public.companion_journal_entries') as journal_entries,
       to_regclass('public.analytics_events') as analytics_events,
       to_regclass('public.user_subscriptions') as subscriptions,
       to_regclass('public.item_catalog') as item_catalog,
       to_regclass('public.user_items') as user_items,
       to_regclass('public.sanctuary_placements') as sanctuary_placements,
       to_regclass('public.sanctuary_interactions') as sanctuary_interactions;
```

Expected: `first_bond_completed_at` exists and every `to_regclass` value is non-null.

Confirm Journal retries have a conflict-compatible unique index:

```sql
select indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'companion_journal_entries_source_unique_idx';
```

Expected: the unique index covers `owner_id`, `companion_id`, `source_type`, and `source_id` without a `where` clause.

### Required production configuration

Core application:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_APP_URL`
- `PUBLIC_SITE_URL`
- `PUBLIC_AUTH_CALLBACK`
- `ADMIN_EMAILS`

Companion response quality:

- `LOOMA_LLM_ENABLED`
- `OPENAI_API_KEY` when LLM responses are enabled
- `LOOMA_LLM_LIGHT_MODEL`
- `LOOMA_LLM_PEAK_MODEL`
- `LOOMA_LLM_PEAK_DAILY_CAP`

Fallback companion responses remain available if LLM generation fails, but production logs must be monitored for persistent LLM failures.

Premium checkout, if enabled at launch:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_SANCTUARY_PLUS`
- Stripe webhook endpoint: `https://<production-domain>/api/billing/stripe-webhook`
- Required Stripe events include `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

Optional shard packs require `STRIPE_PRICE_500`, `STRIPE_PRICE_1200`, and `STRIPE_PRICE_2600`. They are not a launch gate for the companion-first experience.

Authenticated Playwright smoke tests require:

- `BASE_URL` or `PLAYWRIGHT_BASE_URL`
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 3. Manual Authenticated Smoke Test

Perform this test on the production deployment before opening traffic. Use a mobile viewport and a desktop browser at least once.

### A. New user and Bond Genesis

1. Sign up with the clean test account.
2. Enter the protected app.
3. Complete Bond Genesis and create one companion.
4. Confirm the app lands on `/app/home`.

Expected:

- A user with confirmed zero companions enters Bond Genesis.
- The companion spawn action is unavailable if companion-count eligibility cannot be confirmed.
- The user lands on Home without relying on a `firstBond` URL flag.
- Home presents one dominant companion and one primary relational action.
- Primary launch navigation is limited to Home, Companion, Journal, and Profile.

### B. First bond

1. On Home, choose an arrival mood.
2. Enter a distinctive reflection, for example: `I am nervous about launching, but I want to meet this moment honestly.`
3. Select **Share your first moment**.

Expected:

- The companion response acknowledges a specific part of the reflection and emotional tone.
- The response is shown as the first moment together.
- A link appears to the moment the companion remembered.
- The continuity card says the moment was remembered from this visit.
- The reflection exists in Journal.
- `companions.first_bond_completed_at` is non-null for this companion.

Verify in Supabase:

```sql
select id, name, first_bond_completed_at
from public.companions
where owner_id = '<TEST_USER_ID>'
order by created_at desc;

select id, title, body, meta_json, created_at
from public.companion_journal_entries
where owner_id = '<TEST_USER_ID>'
order by created_at desc
limit 5;
```

### C. First-bond recovery safety

Do not intentionally break production persistence. Validate this in staging or with the Playwright route interception in `tests/e2e/launch-readiness-smoke.spec.ts`.

Expected under a recoverable Journal persistence failure:

- Home retries the persistence request once automatically.
- The user's reflection remains visible.
- The UI says the moment is still waiting safely on the screen.
- The user receives **Try saving this moment again**.
- The UI does not claim the moment was remembered.
- First-bond completion remains pending.

### D. Remembered return

1. Sign out or close the session.
2. Start a new authenticated session with the same account.
3. Navigate to `/app` and then Home.

Expected:

- The user returns to Home.
- Home presents the persisted reflection as carried-forward continuity.
- The card states that the moment is persisted in Journal.
- **Revisit in Journal** opens the same remembered content.
- The user is not forced through Bond Genesis again.

### E. State-language coherence

1. Observe the status language on Home.
2. Open Companion and inspect the active companion detail panel.

Expected:

- Home describes `Bond closeness` as `Distant`, `Near`, or `Resonant`.
- Home separately labels `Current mood`.
- Companion separately labels `Current mood` and `Bond closeness`.
- A bond may be `Distant` while current mood is `Steady`; this is presented as two dimensions, not a contradiction.

### F. Navigation and scope control

Inspect desktop sidebar, mobile dock, and protected topbar search.

Expected:

- Primary navigation emphasizes Home, Companion, Journal, and Profile.
- Games, Missions, Market, Friends, Circles, and Messages are not promoted as primary launch destinations.
- Messages remains reachable only through a direct link if needed.
- Search defaults to launch-primary destinations.
- No global companion modal opens unexpectedly.

### G. Sanctuary

1. Use an account that owns and has placed an interactive Moss Seat.
2. Visit Sanctuary while shared rest is available.
3. Select **Rest Together**.

Expected:

- Home promotes Sanctuary only when shared rest can currently be completed and the companion needs rest.
- Shared rest restores Spark and records a Journal memory.
- Sanctuary links to the persisted rest memory.
- During cooldown, the rest action is hidden and the UI explains that the last quiet moment is still being carried.
- Sanctuary remains contextual and does not compete with Home.

### H. Premium

1. Open `/app/wallet`.
2. Review the Sanctuary+ offer.
3. In Stripe test mode or a production-safe test customer, start checkout and complete it.

Expected:

- Copy clearly states that the companion bond stays free.
- Benefits are concrete: deeper Journal chapter readings, richer Home atmosphere, and optional Spark capacity.
- Checkout redirects to Stripe successfully.
- Successful checkout returns to the wallet.
- `user_subscriptions` reflects the active Sanctuary+ entitlement.
- Core Home, check-in, Journal, and care remain usable without a subscription.

## 4. Expected User-Visible Outcomes

Use this summary as the go/no-go acceptance sheet:

| Step | Required visible outcome |
| --- | --- |
| New account enters app | Bond Genesis appears only after zero-companion eligibility is confirmed. |
| Companion is created | User lands on Home with one companion and one primary check-in action. |
| First moment succeeds | Response references the user's reflection; Journal link and persisted continuity appear. |
| First moment persistence is temporarily unavailable | Reflection remains on screen; calm pending copy and retry action appear; no remembered claim appears. |
| User returns in a new session | Home shows Journal-backed continuity and does not repeat onboarding. |
| Home and Companion are compared | Both label `Current mood` and `Bond closeness` separately and consistently. |
| Protected navigation is inspected | Only launch-primary relationship surfaces are emphasized. |
| Shared rest is available | Sanctuary explains the ritual, completes it, and links to its Journal memory. |
| Shared rest is unavailable | The action is hidden and cooldown/unlock context is explained. |
| Sanctuary+ is viewed | Benefits are concrete and the free core bond is stated plainly. |
| Sanctuary+ checkout succeeds | Wallet returns successfully and active entitlement is visible. |

Any mismatch in the first-bond, remembered-return, or truthfulness rows is a launch blocker.

## 5. Analytics Verification

Canonical funnel events are defined in `src/lib/launch/funnels.ts`.

Launch proof funnel:

1. `home_viewed`
2. `first_checkin_completed`
3. `first_response_shown`
4. `first_memory_persisted`
5. `first_memory_shown`
6. `return_checkin_completed`
7. `return_response_shown`
8. `return_memory_persisted`
9. `return_memory_shown`

Premium conversion funnel:

1. `premium_offer_viewed`
2. `premium_upgrade_clicked`
3. `premium_checkout_started`
4. `premium_subscription_converted`

After manual smoke testing:

- [ ] Open `/app/admin/analytics` as an email listed in `ADMIN_EMAILS`.
- [ ] Confirm the launch proof and premium funnel cards load without HTTP `500`.
- [ ] Confirm the expected events increased.
- [ ] Confirm browser-originated events have a non-null `session_id`.
- [ ] Confirm each event's `surface` and payload are plausible.

SQL verification:

```sql
select inserted_at, user_id, kind, session_id, surface, payload
from public.analytics_events
where kind in (
  'home_viewed',
  'first_checkin_completed',
  'first_response_shown',
  'first_memory_persisted',
  'first_memory_shown',
  'return_checkin_completed',
  'return_response_shown',
  'return_memory_persisted',
  'return_memory_shown',
  'premium_offer_viewed',
  'premium_upgrade_clicked',
  'premium_checkout_started',
  'premium_subscription_converted'
)
order by inserted_at desc
limit 100;
```

Launch-day proof questions:

- What percentage of new companions reach `first_checkin_completed`?
- What percentage reach `first_memory_persisted`?
- What percentage actually see `first_memory_shown`?
- Do returning sessions produce `return_memory_shown`?
- Where does the premium funnel lose users?

Treat a meaningful gap between `first_checkin_completed` and `first_memory_persisted` as a launch incident.

## 6. Launch-Day Monitoring Checklist

Check at deployment, after the first real users, hourly for the first six hours, and again at 24 hours.

Application and Vercel:

- [ ] HTTP `500` rate on `/app/home`, onboarding, `/api/home/reconnect`, `/app/companions`, `/app/memory`, and `/app/sanctuary`.
- [ ] SSR errors such as `document is not defined`.
- [ ] Latency and timeout rate for `/api/home/reconnect`.
- [ ] Logs containing `[home/reconnect]`, `[companion-journal]`, `[analytics]`, `[sanctuary interaction]`, `[billing]`, or `[stripe-webhook]`.

Supabase:

- [ ] Journal insert failures or RLS errors.
- [ ] Daily check-in upsert failures.
- [ ] Companion update failures.
- [ ] Analytics insert failures, especially null-required-field errors.
- [ ] Elevated connection, CPU, or database latency.
- [ ] Newly created companions with a null `first_bond_completed_at` for longer than expected.

Stripe, if enabled:

- [ ] Webhook delivery success.
- [ ] No repeated webhook `4xx` or `5xx`.
- [ ] Checkout completions match `user_subscriptions`.
- [ ] `premium_subscription_converted` appears after successful subscription checkout.

Product trust:

- [ ] No reports of memory being claimed without appearing in Journal.
- [ ] No reports of lost first reflections.
- [ ] No reports of existing users being forced through onboarding.
- [ ] No confusing Home-versus-Companion state contradictions.
- [ ] No primary-navigation scope leakage.

## 7. Rollback And Safety Checks

### Before deployment

- [ ] Record the prior known-good Vercel deployment and Git commit.
- [ ] Confirm Supabase backup/PITR availability.
- [ ] Confirm an operator can enable the `maintenance` table flag if traffic must be paused.
- [ ] Confirm Stripe checkout can be disabled by removing or invalidating launch-facing Stripe price configuration if necessary.

### Rollback policy

- Prefer rolling back app deployment to the prior known-good commit.
- Do not attempt destructive schema rollback during a live incident.
- The recent launch migrations are additive or expand existing constraints; leave them in place during an app rollback unless a separate reviewed database recovery plan exists.
- If first-bond persistence is failing, pause acquisition or enable maintenance rather than allowing users into a broken first session.
- If premium checkout or webhooks fail, disable premium checkout while keeping the free bond loop available.
- If analytics fails but the relationship loop remains trustworthy, continue only with explicit approval and restore measurement immediately.

### Post-rollback smoke

- [ ] Auth works.
- [ ] Existing users reach Home.
- [ ] Home loads without HTTP `500`.
- [ ] Check-in does not falsely claim memory persistence.
- [ ] Journal remains readable.
- [ ] Premium checkout is disabled or working.

## 8. Explicit Launch Scope Freeze

The following are frozen until post-launch evidence justifies changing them:

- Do not add primary navigation destinations.
- Do not promote Games, Missions, Market, Friends, Circles, or Messages into the primary launch journey.
- Do not expand Sanctuary into a world builder, social visitation system, or broad decorating economy.
- Do not add new companion slots, broad roster mechanics, or novelty-first companion discovery to session one.
- Do not introduce new premium entitlements or paywall core check-ins, Journal, care, memory continuity, or relationship access.
- Do not redesign Home hierarchy or add competing above-the-fold actions.
- Do not replace durable Journal-backed memory with optimistic or generated-only continuity.
- Do not change bond-closeness or mood language without updating both Home and Companion surfaces and their shared tests.
- Do not begin broad schema rewrites.
- Do not perform unrelated visual-system rewrites.
- Do not add new analytics events unless they answer a launch-proof or incident-response question.

Allowed during launch freeze:

- Release-blocking bug fixes
- Security and privacy fixes
- Data-loss and memory-integrity fixes
- Reliability, accessibility, and severe performance fixes
- Copy corrections that improve truthfulness without changing product scope
