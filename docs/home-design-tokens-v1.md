# Home Design Tokens (V1)

Applies to `/app/home` companion-first UI.

## Typography

- `--home-font-display`: `'Sora', 'Avenir Next', 'Segoe UI', sans-serif`
- `--home-font-body`: `'Manrope', 'Avenir Next', 'Segoe UI', sans-serif`

## Core Colors

- `--home-bg-base`: `rgba(6, 11, 27, 0.98)`
- `--home-bg-deep`: `rgba(4, 7, 19, 1)`
- `--home-bg-glass`: `rgba(10, 17, 37, 0.82)`
- `--home-surface-soft`: `rgba(9, 15, 34, 0.56)`

- `--home-text-primary`: `rgba(245, 250, 255, 0.98)`
- `--home-text-secondary`: `rgba(189, 208, 232, 0.88)`
- `--home-text-tertiary`: `rgba(186, 210, 237, 0.84)`

- `--home-accent-cyan`: `rgba(96, 222, 255, 0.16)`
- `--home-accent-warm`: `rgba(246, 184, 114, 0.12)`

## CTA

- `--home-cta-start`: `rgba(86, 232, 220, 0.96)`
- `--home-cta-end`: `rgba(119, 175, 255, 0.95)`
- `--home-cta-text`: `rgba(6, 16, 35, 0.96)`

## State Pill Colors

- Distant:
  - `--home-state-distant-fg`: `rgba(201, 229, 252, 0.98)`
  - `--home-state-distant-border`: `rgba(131, 201, 245, 0.56)`
  - `--home-state-distant-bg`: `rgba(12, 37, 57, 0.66)`
- Near:
  - `--home-state-near-fg`: `rgba(255, 233, 196, 0.97)`
  - `--home-state-near-border`: `rgba(255, 199, 125, 0.6)`
  - `--home-state-near-bg`: `rgba(67, 42, 11, 0.62)`
- Resonant:
  - `--home-state-resonant-fg`: `rgba(206, 255, 228, 0.98)`
  - `--home-state-resonant-border`: `rgba(109, 233, 179, 0.56)`
  - `--home-state-resonant-bg`: `rgba(11, 48, 32, 0.62)`

## Shape + Elevation

- `--home-radius-sm`: `0.56rem`
- `--home-radius-md`: `0.78rem`
- `--home-radius-lg`: `0.95rem`
- `--home-radius-xl`: `1.2rem`

- `--home-shadow-soft`: `0 14px 28px rgba(20, 184, 166, 0.3)`
- `--home-shadow-cta`: `0 16px 30px rgba(44, 153, 255, 0.28)`
- `--home-shadow-cta-hover`: `0 20px 34px rgba(44, 153, 255, 0.35)`

## Spacing

- `--home-space-1`: `0.5rem`
- `--home-space-2`: `0.7rem`
- `--home-space-3`: `1rem`

## Motion

- `--home-dur-fast`: `180ms`
- `--home-dur-med`: `280ms`
- `--home-dur-slow`: `420ms`
- `--home-ease-out`: `cubic-bezier(0.16, 0.84, 0.32, 1)`

## Usage Notes

- Keep one dominant primary CTA.
- Keep secondary nav low-emphasis.
- Avoid introducing additional color accents without updating this doc.
