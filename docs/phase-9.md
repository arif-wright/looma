# Phase 9a – Dashboard Shell

# Phase 9 Notes

Historical note: this document describes an older dashboard-first phase. The current canonical product model is defined in `docs/product-surface-contract.md`, where `/app/home` is the primary surface and `/app/dashboard` is secondary.

The `/app/dashboard` route now renders the Phase 9a shell. The page is composed of:

- a fixed background stack (video → color overlay → particles → scrim)
- a collapsible navigation sidebar (focusable toggle, client auth guard)
- a header breadcrumb row with action buttons
- a responsive panels grid populated with placeholder components

Shared UI building blocks live in `src/lib/app/components/` (PanelFrame, ProgressBar, StatBadge).
Dashboard panel placeholders live in `src/lib/app/dashboard/` and will be filled in during later phases.
