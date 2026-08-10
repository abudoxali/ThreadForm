# ThreadForm — Architecture

## Dependency direction

```
UI (apps/web, packages/ui)
        ↓
Application / Project State (a Project value — see PROJECT_SCHEMA.md)
        ↓
Domain Engines (project-engine, and future material/effects/animation/export engines)
        ↓
Garment Runtime (future — resolves a GarmentReference against a manifest)
        ↓
Renderer / Persistence / Export adapters (future 3d-engine, 2d-engine, local-storage)
```

Dependencies point downward only. A package never imports something above it
in this diagram. `packages/types` has no dependencies and sits underneath
everything — it is the shared vocabulary every layer speaks.

## The anti-pattern this prevents

A React component that simultaneously renders a garment, persists project
state, checks entitlements, and mutates domain objects is what this
architecture exists to prevent. Concretely:

- **Rendering** belongs to `3d-engine` / `2d-engine` (future), invoked by a
  thin adapter component — never inline Three.js/canvas calls in a Studio
  panel component.
- **Persistence** belongs to `local-storage` (future) and is called through
  `project-engine`'s load/save boundary, never `localStorage`/`indexedDB`
  calls scattered through components.
- **Entitlement checks** belong to `entitlements` (future) as a single
  `can(user, capability)`-shaped boundary — never `if (user.pro)` scattered
  through UI or domain code.
- **Domain mutation** belongs to `project-engine` (see `addArtworkLayer`,
  `reorderArtworkLayer`, etc.) — components call these functions and re-render
  from the result; they do not hand-edit a `Project` object's fields.

## Current physical packages (M00)

| Package | Responsibility |
|---|---|
| `packages/types` | Strict TypeScript contracts for the project domain model. Zero runtime *dependencies* — its only runtime code is the `CURRENT_PROJECT_SCHEMA_VERSION` constant. |
| `packages/project-engine` | Creates, validates, migrates and mutates `Project` values. Pure functions; no React, no storage, no rendering. |
| `packages/ui` | Design-token CSS and presentational React primitives (`Button`, `Panel`, `IconButton`, ...). No domain knowledge. |
| `packages/config` | Shared `tsconfig` and ESLint flat configs consumed by every package. |
| `apps/web` | The Next.js application: marketing site (`/`) and Studio shell (`/studio`). Composes the packages above; contains no domain logic of its own beyond UI state (which tool/panel is active). |

## Documented future boundaries (not yet implemented)

These are named and scoped now so the first real implementation has an
obvious home, not because empty packages should exist yet:

- **`garment-runtime`** — resolves a `GarmentReference` + manifest into
  whatever the 3D/2D engines need (geometry reference, UV expectations,
  available print zones). See `GARMENT_SPEC.md`.
- **`3d-engine`** / **`2d-engine`** — rendering adapters. Distinct packages
  because they have different technology needs (WebGL/WebGPU vs. canvas/DOM)
  but consume the same `Project`.
- **`material-engine`**, **`effects-engine`**, **`animation-engine`** —
  resolve `MaterialConfiguration` / `EffectConfiguration` /
  `AnimationConfiguration` into renderer-specific parameters. Kept separate
  from the renderers so presets can be authored/tested without a GPU context.
- **`export-engine`** — turns a `Project` + `ExportPreferences` into an image,
  video, or 3D file. See `EXPORT_SPEC.md` for its boundary.
- **`local-storage`** — the IndexedDB-backed persistence adapter for guest
  projects. `project-engine`'s `validateProject` is the trust boundary this
  package's reads must pass through.
- **`entitlements`** — the single place capability checks (`canExportPro`,
  `canUsePremiumGarment`, ...) are decided, so Pro/Free logic never leaks into
  UI conditionals.
- **`analytics`** — event emission boundary, kept separate so instrumentation
  can be added or swapped without touching feature code.

## State ownership

React component state in `apps/web` is limited to *UI-only* concerns (which
panel is open, which tool is active). Anything that describes the project
itself — garment, artwork, materials, camera, etc. — is a `Project` value
produced and mutated through `project-engine`, never ad hoc `useState` shape
that mirrors the domain model. The Studio shell built in M00 deliberately
keeps `selectedCategory`/`activeTool` as local UI state because no `Project`
exists yet to back them; once garment selection creates a real project via
`createProject`, that becomes the source of truth instead.
