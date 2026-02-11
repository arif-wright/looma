# Alpha Readiness

## Feature Freeze
- Freeze starts: **February 11, 2026**
- Branch target: `main`
- Rule: only bug fixes, security fixes, performance fixes, and release-blocking polish are allowed after this point.
- Rule: no net-new product features unless explicitly approved as a release blocker.

## Known Limitations
- In-memory rate limiting is used in some API paths, so limits are per runtime instance and not globally distributed.
- Analytics is intentionally lightweight and event-scoped; it is not a full behavioral analytics pipeline.
- Some anti-abuse controls are currently heuristic and may require tuning under real user load.
- Feedback submission currently stores to DB only (no email/webhook fanout yet).
- Companion/game progression balancing values are subject to tuning during alpha.
- Offline or poor-network behavior is best-effort; no full offline mode.

## Supported Browsers / Devices (Alpha)
- Desktop browsers:
  - Chrome (latest stable)
  - Edge (latest stable)
  - Safari 17+
  - Firefox (latest stable)
- Mobile browsers:
  - iOS Safari 17+
  - Chrome on Android (latest stable)
- Device scope:
  - Modern phones (iOS/Android) and desktop/laptop screens.
  - Not optimized for tablets, smart TVs, or legacy browsers.

## Intentionally Missing (Out of Scope for Alpha)
- No proactive popup nudges asking for feedback.
- No per-keystroke telemetry or surveillance-style tracking.
- No advanced admin analytics dashboards beyond current event reporting.
- No multi-region/global distributed rate-limit backend.
- No broad notification center redesign.
- No large UI/theme overhaul during alpha window.
- No extensive new game modes beyond current set.
- No major schema refactors unrelated to release blockers.

## Alpha Scope Guardrails
- New requests are triaged into one of:
  - `release-blocker`
  - `post-alpha`
  - `rejected-for-alpha`
- A change is `release-blocker` only if it:
  - prevents core flows from working,
  - introduces data-loss/security risk, or
  - causes severe trust/safety issues.
- Anything else is deferred to post-alpha backlog.

## Readiness Checklist
- [ ] Core auth and protected routes work end-to-end.
- [ ] Home feed, profile, companion, missions, and games core loops are stable.
- [ ] Mission start/complete rules and consent boundaries are enforced server-side.
- [ ] Overuse protections (rate limits/caps) are active with friendly failure messages.
- [ ] Feedback flow is user-initiated and persists successfully.
- [ ] Consent flags suppress memory/adaptation writes where required.
- [ ] Critical error logging and audit paths are present.
- [ ] Basic smoke tests run clean before each release candidate.
- [ ] Post-alpha backlog captures all deferred feature requests.

## Change Control During Freeze
- Every PR must state:
  - classification (`release-blocker` or `post-alpha`),
  - user impact,
  - rollback plan.
- PRs without classification are not merged during freeze.
