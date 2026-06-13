# Product Surface Contract

Purpose: define what Memvoya is now, which surfaces are canonical, and which older routes remain only for compatibility. Looma remains the internal project name.

## Product Truth

- Memvoya is a mobile-first modern virtual companion product.
- The core of the product is the relationship between the user and their companion.
- Social, missions, play, economy, and memory exist to deepen that relationship, not compete with it.
- The category anchor is closer to Tamagotchi and Neopets than to therapy, journaling, or chat utility apps.
- Memory is the differentiator, not the category.

## Canonical Protected Surfaces

- `Home` at `/app/home`
  - Primary daily surface.
  - Owns check-in, reconnect, companion presence, and the first action of the session.
- `Personal Sanctuary` at `/app/sanctuary`
  - Owns persistent space customization and companion reactions to placed objects.
  - Starts as one small private space, not a general-purpose world editor.
  - During launch validation, remains contextual until the user can complete a meaningful object interaction.
- `Journal` at `/app/memory`
  - Owns memory summaries, event history, and the visible record of what Memvoya remembers.
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
- `Messages` at `/app/messages`
  - Owns human and group conversation flow.
  - Remains directly reachable but outside primary launch navigation until companion messaging has a trustworthy explicit model.

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

- `/app` resolves launch users to Home so every return begins with companion presence and remembered continuity.
- Active mission and care context remain available through direct links and quiet Home context rather than bypassing the relationship return.
- Sanctuary should only be promoted when its intended relationship interaction is currently usable.
- Legacy route values may be read for compatibility, but should normalize into canonical surfaces.

## Design Strategy

- The current `/app/home` layout is the visual source of truth for protected routes.
- Desktop protected routes use the dark Home sidebar; mobile protected routes use the shared mobile dock.
- Full-width legacy top navigation must not be introduced on protected routes.
- The global companion dock and companion pop-up modal are disabled until their purpose and interaction model are rebuilt.
- Dark violet, cyan, and restrained glass surfaces replace older warm, blue, or dashboard-specific shells.
- Emotional framing should stay clear and human, not vague or ornamental.

## Shipping Rule

When a new surface is introduced, it should be classified immediately as one of:

- canonical
- supporting
- compatibility-only

If that classification is unclear, the surface should not ship yet.
