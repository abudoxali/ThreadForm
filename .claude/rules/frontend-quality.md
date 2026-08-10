# Frontend quality

Full design rationale: `docs/DESIGN_SYSTEM.md`.

- Use `packages/ui` primitives (`Button`, `Panel`, `IconButton`,
  `VisuallyHidden`, `buttonStyles`) and `--tf-*` tokens (via the Tailwind
  theme mapping in `apps/web/src/app/globals.css`). Don't hand-roll one-off
  colors, spacing, or radii.
- A `<button>` cannot contain an `<a>` (or any other interactive element) —
  use `buttonStyles(variant, size)` on the `<Link>`/`<a>` itself instead of
  wrapping it in `<Button>`.
- Every icon-only control needs an explicit `aria-label`. Every disabled
  control that still needs to communicate *why* keeps `aria-disabled` + a
  `title`, rather than silently vanishing from the tab order.
- No color-only affordances — pair color with an icon, label, or text change.
- Respect `prefers-reduced-motion` (the `--tf-duration-*` tokens already
  collapse to `0ms`; don't add motion that bypasses them).
- No fake garment/3D functionality: a control that depends on a garment/asset
  engine that doesn't exist yet must say so (disabled + explanatory copy),
  never simulate output.
- No fake social proof, fake stats, fake testimonials, or stock content
  presented as real ThreadForm output.
- Test responsively at minimum: ~1440px and ~1280px desktop, ~1024px and
  768px tablet, ~390px and ~360px mobile. Check for horizontal overflow,
  toolbar collisions, and touch target size (≥36px).
