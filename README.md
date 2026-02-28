# Looma Application

## Landing & Home UX

- Home UX source of truth checklist: `docs/home-experience-contract.md`
- Product surface contract: `docs/product-surface-contract.md`
- Authenticated visits to `/app` now run a resolver that looks at the player’s current mission, companion care needs, saved preference, and recent context before issuing a redirect to the best surface. Direct requests to deeper routes (such as `/app/home`, `/app/u/...`, `/app/companions`) bypass the resolver and render in place.
- Canonical surfaces:
  - Mission carry-over (`/app/missions/{id}`) within the last 12 hours always wins.
  - Companion care due defaults to `/app/companions?focus={id}`.
  - Legacy `creatures` and `dashboard` preferences/context values normalize into canonical companion or home surfaces.
  - Primary app model is `Sanctuary`, `Journal`, `Messages`, `Circles`, `Missions`, `Companions`, `Profile`.
- The resolver can be bypassed with `?forceHome=1` for QA.
- `/app/home` is the mobile-first sanctuary surface built around:
  - active companion presence and check-in/reconnect
  - journal and mission continuity
  - quiet access to messages, circles, play, and companions
- Canonical post/comment URLs now live under `/app/u/{handle}/{slug}` (with `/p/{id}` fallback); legacy `/app/t/*` and `/app/thread/*` endpoints redirect accordingly, preserving `#c-…` anchors.
- Analytics events (`app_landed`, `first_action`, `post_created`, `comment_created`, `pet_interaction`) write to `public.analytics_events` for instrumentation.
- Unit tests covering resolver decisions live at `src/lib/__tests__/landingResolver.spec.ts` (run with `VITEST=true npm run test`).
