# Looma Application

## Landing & Home UX

- Home UX source of truth checklist: `docs/home-experience-contract.md`
- Authenticated visits to `/app` now run a resolver that looks at the player’s current mission, creature care needs, saved “Start on” preference, recent context, and A/B variant before issuing a redirect to the best surface. Direct requests to deeper routes (such as `/app/home`, `/app/u/...`, `/app/creatures`) bypass the resolver and render in place.
- Canonical surfaces:
  - Mission carry-over (`/app/missions/{id}`) within the last 12 hours always wins.
  - Creature care due defaults to `/app/creatures?focus={id}`.
  - Start-on preferences and last-context fallbacks route to `/app/home`, `/app/creatures`, or `/app/dashboard`.
  - New users are bucketed into variants A (dashboard), B (creatures), or C (hybrid home) for experimentation.
- The resolver can be bypassed with `?forceHome=1` for QA.
- `/app/home` introduces the Hybrid Home experience composed of:
  - `TodayCard` (daily bond claim, energy, streak, mission + creature quick actions)
  - `ComposerChip` (one-tap expand to full composer)
  - `FeedList` (mix of follows + rising posts)
  - `MissionRow`, `CreatureMoments`, and an `EndcapCard` quick win.
- Canonical post/comment URLs now live under `/app/u/{handle}/{slug}` (with `/p/{id}` fallback); legacy `/app/t/*` and `/app/thread/*` endpoints redirect accordingly, preserving `#c-…` anchors.
- Analytics events (`app_landed`, `first_action`, `post_created`, `comment_created`, `pet_interaction`) write to `public.analytics_events` for instrumentation.
- Unit tests covering resolver decisions live at `src/lib/__tests__/landingResolver.spec.ts` (run with `VITEST=true npm run test`).
