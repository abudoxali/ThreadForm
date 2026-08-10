# ThreadForm — Architecture

## Dependency direction

```
UI (apps/web, packages/ui)
        ↓
Application / Project State (a Project value — see PROJECT_SCHEMA.md)
        ↓
Domain Engines (project-engine, and future material/effects/animation/export engines)
        ↓
Garment Runtime (garment-runtime — resolves a GarmentReference against a manifest)
        ↓
Renderer / Persistence / Export adapters (3d-engine, local-storage implemented; 2d-engine, export-engine future)
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
- **Persistence** belongs to `local-storage` (IndexedDB) and is reached only
  through `apps/web/src/lib/projectRepository.ts` — never `indexedDB` calls
  scattered through components. `local-storage` itself calls back into
  `project-engine`'s `validateProject`/`migrateProject` on every read, so
  untrusted stored data can't reach the UI without passing that boundary.
- **Entitlement checks** belong to `entitlements` (future) as a single
  `can(user, capability)`-shaped boundary — never `if (user.pro)` scattered
  through UI or domain code.
- **Domain mutation** belongs to `project-engine` (see `addArtworkLayer`,
  `reorderArtworkLayer`, etc.) — components call these functions and re-render
  from the result; they do not hand-edit a `Project` object's fields.

## Current physical packages (M00–M02)

| Package                    | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types`           | Strict TypeScript contracts for the project domain model. Zero runtime _dependencies_ — its only runtime code is the `CURRENT_PROJECT_SCHEMA_VERSION` constant.                                                                                                                                                                                                                                                                  |
| `packages/project-engine`  | Creates, validates, migrates and mutates `Project` values. Pure functions; no React, no storage, no rendering.                                                                                                                                                                                                                                                                                                                   |
| `packages/local-storage`   | IndexedDB persistence adapter (via `idb`): save/load/list/delete a `Project`, plus a small "last opened project" pointer. Depends on `project-engine` for `validateProject`/`migrateProject` on every read; no React.                                                                                                                                                                                                            |
| `packages/garment-runtime` | Fetches and zod-validates a garment manifest (`GARMENT_SPEC.md`), the small catalog of garments with a real manifest, camera preset definitions, and `resolveGarmentReference` (maps a `Project`'s `GarmentReference` — including M01's placeholder shape — to a real, loadable garment). No React, no Three.js.                                                                                                                 |
| `packages/3d-engine`       | React Three Fiber rendering: `StudioGarmentCanvas` (Canvas + error boundary + Suspense loading state), `GarmentModel` (GLB load via drei's `useGLTF`, per-instance material clone, color), `CameraRig` (orbit controls + preset framing), `StudioLighting` (3-point rig), `frameGarment` (pure bounding-sphere/aspect-ratio framing math, unit-tested without a GPU).                                                            |
| `packages/ui`              | Design-token CSS and presentational React primitives (`Button`, `Panel`, `IconButton`, ...). No domain knowledge.                                                                                                                                                                                                                                                                                                                |
| `packages/config`          | Shared `tsconfig` and ESLint flat configs consumed by every package.                                                                                                                                                                                                                                                                                                                                                             |
| `apps/web`                 | The Next.js application: marketing site (`/`) and Studio (`/studio`). `src/lib/projectRepository.ts` is the only module that combines `project-engine` + `local-storage`; `src/hooks/useStudioProject.ts` is the only place that wires it into React state; `src/hooks/useResolvedGarment.ts` is the only place that resolves a `Project`'s garment against `garment-runtime`. Components hold only UI-only state (active tool). |

## Documented future boundaries (not yet implemented)

These are named and scoped now so the first real implementation has an
obvious home, not because empty packages should exist yet:

- **`2d-engine`** — the flat/print-mockup rendering adapter, alongside
  `3d-engine`. Different technology needs (canvas/DOM vs. WebGL) but consumes
  the same `Project`.
- **`material-engine`**, **`effects-engine`**, **`animation-engine`** —
  resolve `MaterialConfiguration` / `EffectConfiguration` /
  `AnimationConfiguration` into renderer-specific parameters. Kept separate
  from the renderers so presets can be authored/tested without a GPU context.
- **`export-engine`** — turns a `Project` + `ExportPreferences` into an image,
  video, or 3D file. See `EXPORT_SPEC.md` for its boundary.
- **`entitlements`** — the single place capability checks (`canExportPro`,
  `canUsePremiumGarment`, ...) are decided, so Pro/Free logic never leaks into
  UI conditionals.
- **`analytics`** — event emission boundary, kept separate so instrumentation
  can be added or swapped without touching feature code.

## State ownership

React component state in `apps/web` is limited to _UI-only_ concerns (which
panel is open, which tool is active). Anything that describes the project
itself — garment, artwork, materials, camera, etc. — is a `Project` value
produced and mutated through `project-engine`, never ad hoc `useState` shape
that mirrors the domain model.

As of M01, `useStudioProject` (`apps/web/src/hooks`) owns the real `Project`
and drives the Studio from it: `StudioShell` keeps only `activeTool` as local
UI state; garment selection, the project's name, and everything else visible
in the Inspector/topbar come from the hook's `project` value, which is backed
by `packages/local-storage`. Mutating the project always goes through the
hook's `updateProject`-based actions (e.g. `renameProject`), which apply a
`project-engine`-shaped update, optimistically update React state, and
debounce a write to `local-storage` — never a direct `setState` on a
hand-edited copy of the `Project` object.

## Project repository & autosave (M01)

`apps/web/src/lib/projectRepository.ts` is a plain (non-React) module that is
the _only_ place `project-engine` and `local-storage` are used together:
`createAndPersistProject`, `openProject`, `saveProjectChanges`,
`deleteProjectById`, `listRecentProjects`, `restoreLastOpenedProject`. It has
no knowledge of React; `useStudioProject` is the only caller.

The hook's autosave is debounced (600ms) and guards against two failure
modes that matter once writes are asynchronous and user-triggered:

- **Stale writes** — each scheduled save carries a monotonic "epoch"; only
  the most recently scheduled save's completion is allowed to update
  `saveStatus`, so a slow, superseded write can't flip the indicator back to
  "Saved" after a newer edit already failed or is still pending.
- **Cross-project bleed** — switching projects (`chooseGarment`,
  `openExistingProject`, or a project being deleted out from under the
  current view) cancels any pending/in-flight save's ability to update
  `saveStatus`, so a write for the _previous_ project can't affect the save
  indicator shown for the next one. `startNewProject` is the one exception:
  it flushes the pending write immediately (rather than cancelling it) so
  the last edit isn't lost before leaving the project.

See `packages/local-storage`'s own module docs (`src/db.ts`) for the
IndexedDB schema itself.

## Garment resolution & rendering (M02)

`useResolvedGarment` (`apps/web/src/hooks`) is the only place a `Project`'s
`GarmentReference` is turned into a loadable garment. It calls
`garment-runtime`'s `resolveGarmentReference` (catalog lookup, plus M01
placeholder-reference compatibility — see below), then `loadManifest`
(fetches and zod-validates `/garments/<id>/manifest.json`, the same
untrusted-until-validated boundary pattern as `local-storage`'s
`validateProject`). `StudioShell` renders `3d-engine`'s
`StudioGarmentCanvas` from the resolved manifest plus the `Project`'s
`garmentColor`/`camera` fields — never inline Three.js/`@react-three/fiber`
in a Studio panel component.

**Legacy reference compatibility.** M01 persisted a placeholder
`GarmentReference` (`{ garmentId: category, garmentVersion: '0.0.0',
category }`) before any manifest system existed. `resolveGarmentReference`
recognizes that exact placeholder shape and maps it to a real catalog
garment **only when the category matches** — it never maps an unrelated
category to whatever garment happens to exist, and never touches a
reference that isn't provably the M01 placeholder shape. A category with no
real garment yet resolves to `'unavailable'`, which the Studio surfaces as
an honest "not available in this build" state, leaving the stored project
untouched.

**Color and camera stay `Project` state, not manifest mutation.**
`setGarmentColor`/`setCameraPreset` (`useStudioProject`) write to
`Project.garmentColor`/`Project.camera` through the same `updateProject` →
debounced-autosave path as every other edit; the garment manifest itself is
never mutated. `GarmentModel` clones the GLB's material per mesh instance
before applying color, so one project's color change can never leak into
drei's shared `useGLTF` cache or another open instance of the same garment.

**Frame loop.** The canvas runs `frameloop="demand"` (no continuous
render loop while idle). Anything that mutates the scene outside of a JSX
prop change (a material color, an imperative camera move) must call R3F's
`invalidate()` itself — drei's `OrbitControls` does this internally for
user-driven orbiting, but `GarmentModel`'s color effect and `CameraRig`'s
preset-framing effect call it explicitly, since a demand frame loop does not
infer that a `useEffect` mutated something it should redraw.
