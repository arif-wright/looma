# Home Experience Contract (V1)

Purpose: keep `/app/home` focused on Looma's core loop (relationship with companion), and prevent future UI drift.

## Product Truths

- Looma is a companion-first emotional platform.
- Home is not feed-first, game-first, or mechanics-first.
- Clarity beats novelty.

## Non-Negotiable Home IA

1. Companion Presence (primary visual focus)
- Companion model/avatar is the dominant element above the fold.
- User should immediately understand: "This is my companion."

2. Relational Status (human language)
- One short status line (for example: "Mirae feels distant.").
- One short reason line (for example: "She hasn't heard from you today.").
- One compact state indicator with only 3 states: `Distant`, `Near`, `Resonant`.

3. Primary Relational Action (single CTA)
- Exactly one primary CTA on Home: reconnect/check-in action.
- CTA copy should be clear and emotionally supportive.
- No hidden gesture required to use the primary action.

4. Secondary Navigation (visible but quiet)
- Clear labeled actions to:
  - Circles
  - Messages
  - Games
  - Companion details
- Secondary actions must not compete with the primary CTA.

## UX Principles

- First-time comprehension target: under 3 seconds.
- No confusing floating interactive artifacts.
- No mandatory hidden interactions.
- Mobile-first layout and thumb-friendly hit targets.
- Minimal cognitive load: simple hierarchy, high contrast, clear affordances.

## Visual + Motion Principles

- Premium but restrained visual style.
- Subtle depth and atmosphere are allowed.
- Motion must support comprehension, not decoration.
- Avoid dashboard clutter and experimental "mystery UI" patterns on Home.

## One-Time Onboarding Hint

- Allowed: one dismissible, non-blocking hint for first visit.
- Must persist dismissal in local storage.

## Implementation Guardrails

- `/app/home` should render the companion-first home composition.
- Experimental components (Living Field / Gate / Constellation artifacts) must not be rendered on Home.
- Companion interaction flows (details sheet, reconnect flow) should remain accessible via explicit controls.

## PR Checklist For Home Changes

- [ ] Companion is still the visual focal point above the fold.
- [ ] Exactly one primary relational CTA is present and obvious.
- [ ] Relational status + reason are visible in plain language.
- [ ] Secondary nav includes Circles, Messages, Games, Companion.
- [ ] No hidden gesture is required for core usage.
- [ ] No confusing floating interactive elements are introduced.
- [ ] Mobile layout is clear and thumb-friendly.
- [ ] `npm run check` passes.

## Versioning

- This document is the source of truth for Home V1.
- If strategy changes, update this file in the same PR as UI changes.

## Design Tokens

- Visual token reference for Home V1: `docs/home-design-tokens-v1.md`
