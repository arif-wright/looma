# Memvoya Launch Phase 1

Phase 1 narrows the launch experience around one companion and one remembered relationship.

## Launch Path

1. Users without a companion always enter Bond Genesis.
2. Companion creation sends the user to Home for a guided first shared moment.
3. Home uses the existing reconnect endpoint as its single primary relational action.
4. Home shows one concise remembered-continuity moment and quiet links to Companion and Journal.
5. Normal visits to `/app` return to Home. Direct deep links continue to work.

## Visible Launch Navigation

- Home
- Companion
- Journal
- Profile

Messages remains directly reachable as a supporting human and group communication surface, but is intentionally absent from primary launch navigation until a trustworthy companion-specific messaging model exists. Sanctuary remains reachable contextually when the companion needs rest. Games, missions, social, market, and other stable routes remain implemented but are intentionally quiet during launch validation.

## Deferred

- Journal information-architecture simplification
- New premium entitlements beyond the benefits already implemented
- Broader Sanctuary building, world-building, and social visits

## Phase 1.5: Proof Integrity And Journey Polish

- Home check-in reflections are only described as remembered after an idempotent companion Journal entry is persisted.
- Returning continuity prioritizes that persisted reflection rather than generating an optimistic client-only memory.
- Launch analytics distinguish completion, persistence, and actual visible presentation.
- Companion-count lookup failures fail open instead of forcing an existing user through Bond Genesis.
- Home search is limited to launch surfaces and does not foreground the wallet.
- Sanctuary appears from Home only when the companion needs rest, an interactive Moss Seat is placed, and shared rest is off cooldown.
- Companion spawning fails closed when existing-companion status cannot be confirmed.
- First-bond status remains pending until a Home reconnect reflection is durably persisted.
- Messages is demoted from primary launch navigation and clearly represents human and group communication.
- Protected-route search defaults to launch-primary destinations only.

## Reduced Phase 2: Relational Polish

- Fallback companion responses acknowledge a specific part of the user's reflection and emotional state.
- First-bond responses explicitly frame the check-in as the beginning of a remembered relationship.
- Home distinguishes a newly persisted moment from continuity carried into a return visit.
- Home explains that visible continuity is backed by the Journal.
- Sanctuary+ is presented through concrete existing benefits while explicitly keeping the core bond free.
- Shared rest explains its relational purpose, only offers an action when available, and links to its Journal memory when persistence succeeds.
- A focused launch-readiness smoke suite covers Home restraint, continuity truth, premium clarity, and conditional shared rest.

Launch proof events:

- `home_viewed`
- `first_checkin_completed` / `return_checkin_completed`
- `first_response_shown` / `return_response_shown`
- `first_memory_persisted` / `return_memory_persisted`
- `first_memory_shown` / `return_memory_shown`
- `premium_offer_viewed`
- `premium_upgrade_clicked`
- `premium_checkout_started`
- `premium_subscription_converted`
