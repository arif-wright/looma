# Product Surface Contract

Purpose: define what Looma is now, which surfaces are canonical, and which older routes remain only for compatibility.

## Product Truth

- Looma is a mobile-first modern virtual companion product.
- The core of the product is the relationship between the user and their companion.
- Social, missions, play, economy, and memory exist to deepen that relationship, not compete with it.
- The category anchor is closer to Tamagotchi and Neopets than to therapy, journaling, or chat utility apps.
- Memory is the differentiator, not the category.

## Canonical Protected Surfaces

- `Sanctuary` at `/app/home`
  - Primary daily surface.
  - Owns check-in, reconnect, companion presence, and the first action of the session.
- `Journal` at `/app/memory`
  - Owns memory summaries, event history, and the visible record of what Looma remembers.
- `Messages` at `/app/messages`
  - Owns one-to-one conversation flow.
- `Circles` at `/app/circles`
  - Owns intimate group connection and shared support.
- `Missions` at `/app/missions`
  - Owns directed tasks, continuity, and guided momentum.
- `Companions` at `/app/companions`
  - Owns roster management, care, rituals, and active companion switching.
- `Profile` at `/app/profile`
  - Owns identity, featured companion, and player-facing self expression.

## Supporting Surfaces

- `Journey` at `/app/dashboard`
  - Secondary summary surface.
  - Useful as a snapshot, but not a canonical landing destination.
- `Play` at `/app/games`
  - Supports momentum, energy, and progression.
- `Wallet`, `Shop`, `Inventory`, `Notifications`, `Preferences`
  - Utility surfaces that should inherit sanctuary language and mobile hierarchy.

## Compatibility-Only Surfaces

- `/app/creatures`
  - Legacy compatibility route.
  - Should redirect or hand off to `/app/companions`.
- legacy `dashboard` start preferences or context values
  - Must resolve to `/app/home`.
- legacy `creature` context values
  - Must resolve to `/app/companions`.

## Mobile-First Rules

- Every canonical surface must work as a one-thumb flow on a phone.
- Primary action must be visible without requiring hidden gestures.
- Secondary navigation should be clear, labeled, and quiet.
- Dense desktop-only dashboards should not be the default mental model.

## Route Strategy

- `/app` should resolve users into the best canonical surface.
- Active mission continuity wins over everything else.
- If no mission is active, companion care and recent relationship context should pull users toward Sanctuary or Companions.
- Legacy route values may be read for compatibility, but should normalize into canonical surfaces.

## Design Strategy

- Sanctuary styling is the default visual system for protected routes.
- Warm, restrained, readable interfaces beat novelty or dashboard density.
- Emotional framing should stay clear and human, not vague or ornamental.

## Shipping Rule

When a new surface is introduced, it should be classified immediately as one of:

- canonical
- supporting
- compatibility-only

If that classification is unclear, the surface should not ship yet.
