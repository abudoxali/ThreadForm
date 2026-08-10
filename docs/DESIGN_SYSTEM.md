# ThreadForm — Design System

## Principles

- **The garment is the product.** Chrome stays quiet; nothing in the Studio
  should compete visually with the artwork/garment once real rendering
  exists.
- **Dark, neutral foundation.** A near-black canvas reduces eye strain during
  long editing sessions and makes garment colors read accurately (a white
  canvas biases color perception).
- **Restrained geometry.** Small, consistent border radii; no giant rounded
  rectangles, no pill-shaped panels. Corners exist to soften edges, not to
  decorate.
- **One accent, used deliberately.** A warm copper accent (evoking thread and
  stitching, not a generic SaaS purple) marks the single primary action or
  active state per view — it does not flood the interface.
- **No gimmicks.** No glassmorphism, no neon glows, no decorative gradients.
  Motion is short and purposeful (state changes), never ambient.

## Color tokens

Defined as CSS custom properties in `packages/ui/src/tokens.css`, prefixed
`--tf-`. Consumers (currently `apps/web`) map these into their own theme layer
(a Tailwind v4 `@theme` block) rather than reading `--tf-*` directly, so the
token _names_ are stable even if the mapping technology changes.

| Token                                        | Dark (default)                    | Purpose                               |
| -------------------------------------------- | --------------------------------- | ------------------------------------- |
| `--tf-color-bg-canvas`                       | `#0b0b0c`                         | App background / 3D viewport backdrop |
| `--tf-color-bg-surface`                      | `#131315`                         | Panels, cards                         |
| `--tf-color-bg-surface-raised`               | `#1b1b1e`                         | Popovers, raised panels               |
| `--tf-color-border` / `-strong`              | `#2a2a2e` / `#3a3a40`             | Hairlines / emphasized borders        |
| `--tf-color-text-primary/secondary/tertiary` | `#f2f1ee` / `#a8a7a3` / `#6f6e6b` | Text hierarchy                        |
| `--tf-color-accent` / `-strong`              | `#d98a4a` / `#f0a25f`             | Primary actions, active state         |
| `--tf-color-danger/success/warning`          | —                                 | Feedback states                       |

A light theme is defined under `:root[data-theme='light']` so a future theme
switch requires no new token names — only a value swap.

## Typography

System font stack (`-apple-system, ... sans-serif`) — no web font loading
dependency, keeps the app fast and works offline once cached. A monospace
stack is reserved for future numeric/technical read-outs (transform values,
export dimensions).

## Spacing, radius, motion

- Spacing: 4px-based scale (`--tf-space-1` = 4px … `--tf-space-16` = 64px).
- Radius: `sm` 4px, `md` 8px, `lg` 12px, `full` for genuinely circular
  controls only (e.g. a color swatch), never for buttons or panels.
- Motion: `fast` 120ms / `base` 200ms / `slow` 320ms with a single standard
  easing curve. All three collapse to `0ms` under
  `prefers-reduced-motion: reduce`.

## States

Every interactive primitive in `packages/ui` implements: default, hover,
active, `focus-visible` (a visible ring, never suppressed), `disabled`
(reduced opacity + `pointer-events: none`, and `aria-disabled` where the
element must remain focusable for context, e.g. a tooltip explaining why it's
disabled). Loading states are not yet needed (no async operations exist in
M00) and will be added when the first one does, not speculatively.

## Density and responsive behavior

The Studio shell targets three layout classes:

- **Desktop (≥768px, `md:`)** — tool rail (icon column) + canvas + inspector,
  side by side.
- **Mobile (<768px)** — canvas on top, a collapsible inspector (native
  `<details>`, no JS state machine needed), and a horizontal tool bar pinned
  to the bottom for thumb reach.

Touch targets are ≥36px (icon buttons are 36×36px); tap targets never rely on
hover-only affordances.

## Accessibility baseline

Semantic HTML first (`<button>`, `<nav aria-label>`, real headings) — ARIA
only where native semantics run out (e.g. `aria-pressed` on a toggle-style
icon button). Every icon-only control has an explicit `aria-label`. Disabled
controls that still need to communicate _why_ keep `aria-disabled` + a
`title` rather than removing the element from the tab order silently.
