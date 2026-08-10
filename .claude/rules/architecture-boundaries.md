# Architecture boundaries

Full rationale: `docs/ARCHITECTURE.md`.

- Dependency direction is one-way: UI → project state → domain engines →
  garment runtime → renderer/persistence/export adapters. A package never
  imports "upward."
- `packages/types` has zero runtime dependencies. If you find yourself adding
  one, the logic belongs in `project-engine` (or a future domain package)
  instead.
- `packages/project-engine` is pure: no React, no DOM, no storage APIs, no
  fetch. It creates, validates, migrates, and transforms `Project` values.
- `packages/ui` has zero domain knowledge — no `Project`, `GarmentReference`,
  etc. imports. It only knows tokens and generic component props.
- `apps/web` may hold UI-only state (active tool, open panel) in React state.
  Anything that describes the project itself is a `Project` value produced
  through `project-engine`, not a parallel shape hand-rolled in components.
- Do not create the placeholder packages named in `docs/ARCHITECTURE.md`
  (garment-runtime, 3d-engine, 2d-engine, material-engine, effects-engine,
  animation-engine, export-engine, local-storage, entitlements, analytics)
  until there is real logic to put in them.
- Entitlement checks (Free vs. Pro) must go through one boundary when it
  exists. Never scatter `if (user.pro)` through UI or domain code.
