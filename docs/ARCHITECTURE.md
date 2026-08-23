# ThreadForm — Architecture

## Dependency direction

```
UI (apps/web, packages/ui)
        ↓
Application / Project State (a Project value — see PROJECT_SCHEMA.md)
        ↓
Domain Engines (project-engine, material-engine, effects-engine, export-engine; animation engine future)
        ↓
Garment Runtime (garment-runtime — resolves a GarmentReference against a manifest)
        ↓
Renderer / Persistence / Export adapters (3d-engine, local-storage, artwork-engine implemented; 2d-engine future)
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

## Current physical packages (M00–M04)

| Package                    | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types`           | Strict TypeScript contracts for the project domain model. Zero runtime _dependencies_ — its only runtime code is the `CURRENT_PROJECT_SCHEMA_VERSION` constant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `packages/project-engine`  | Creates, validates, migrates and mutates `Project` values. Pure functions; no React, no storage, no rendering.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `packages/local-storage`   | IndexedDB persistence adapter (via `idb`): save/load/list/delete a `Project`, plus a small "last opened project" pointer. Depends on `project-engine` for `validateProject`/`migrateProject` on every read; no React.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `packages/garment-runtime` | Fetches and zod-validates a garment manifest (`GARMENT_SPEC.md`), the small catalog of garments with a real manifest, camera preset definitions, and `resolveGarmentReference` (maps a `Project`'s `GarmentReference` — including M01's placeholder shape — to a real, loadable garment). No React, no Three.js.                                                                                                                                                                                                                                                                                                                |
| `packages/3d-engine`       | React Three Fiber rendering: `GarmentScene` (the scene Studio and exporter share), `StudioGarmentCanvas` (Canvas + error boundary + Suspense loading state), `GarmentModel` (GLB load via drei's `useGLTF`, per-instance material clone, color), `CameraRig` (orbit controls + preset framing), `StudioLighting` (3-point rig), `frameGarment` (pure bounding-box/aspect-ratio framing math, unit-tested without a GPU), `renderGarmentImage` (off-screen deterministic single-frame render for export).                                                                                                                        |
| `packages/artwork-engine`  | The artwork trust boundary: file-signature sniffing, size/dimension limits, SVG sanitization, and decoding a blob into a drawable image with an owned object-URL lifetime. No React, no storage, no rendering — it turns untrusted bytes into either a rejection or a safe, decoded image.                                                                                                                                                                                                                                                                                                                                      |
| `packages/material-engine` | Fabric presets and resolution: turns a `MaterialConfiguration` plus a garment's declared `supportedMaterials` into clamped, renderer-ready surface parameters. Pure; no React, no Three.js, no GPU. Three.js is deliberately not the source of truth for what a fabric _is_.                                                                                                                                                                                                                                                                                                                                                    |
| `packages/effects-engine`  | Print-process presets and resolution: turns an `EffectConfiguration` into clamped print parameters, with a strict per-kind allow-list for `parameters`. Pure, same constraints as above.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/export-engine`   | Export decisions as pure data and functions: resolution/aspect-ratio → pixel dimensions, target presets, format capability and MIME/extension mapping, deterministic filenames, custom-dimension limits, and the job/result contracts. No DOM, no storage, no Three.js — it decides _what_ to produce, never _how_ or _from where_.                                                                                                                                                                                                                                                                                             |
| `packages/ui`              | Design-token CSS and presentational React primitives (`Button`, `Panel`, `IconButton`, ...). No domain knowledge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `packages/config`          | Shared `tsconfig` and ESLint flat configs consumed by every package.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `apps/web`                 | The Next.js application: marketing site (`/`) and Studio (`/studio`). `src/lib/projectRepository.ts` is the only module that combines `project-engine` + `local-storage`; `src/hooks/useStudioProject.ts` is the only place that wires it into React state; `src/hooks/useResolvedGarment.ts` is the only place that resolves a `Project`'s garment against `garment-runtime`; `src/hooks/useArtworkAssets.ts` is the only place that turns a stored `blobId` back into a decoded image and the only place that releases its object URL. Components hold only UI-only state (active tool, selected print zone, selected layer). |

## Documented future boundaries (not yet implemented)

These are named and scoped now so the first real implementation has an
obvious home, not because empty packages should exist yet:

- **`2d-engine`** — the flat/print-mockup rendering adapter, alongside
  `3d-engine`. Different technology needs (canvas/DOM vs. WebGL) but consumes
  the same `Project`.
- **`animation-engine`** — resolves an `AnimationConfiguration` into
  renderer-specific parameters. Kept separate from the renderers so presets
  can be authored and tested without a GPU context, exactly as
  `material-engine` and `effects-engine` (both implemented in M04) are.
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

## Artwork import, placement & projection (M03)

Artwork crosses four boundaries on its way from a file picker to a garment,
and each one is owned by exactly one module:

1. **Trust** — `packages/artwork-engine`. A selected file is identified by
   its _actual signature_ (never its MIME type or extension), size- and
   dimension-limited before anything is decoded, and — for SVG — parsed and
   rebuilt with scripts, event handlers, embedded HTML and external
   references removed. What it returns is the bytes that should be stored,
   which for SVG are the sanitized document rather than the upload.
2. **Persistence** — `packages/local-storage`'s `artworks` object store
   (IndexedDB v2), reached only through `apps/web/src/lib/projectRepository.ts`.
   A `Project` references artwork by `blobId` alone; the bytes never enter
   the project document, so autosave stays cheap regardless of image size.
   Deleting a project deletes the blobs only it referenced.
3. **Domain** — `packages/project-engine`'s `artwork.ts`. Position, scale and
   rotation are pure `Project` transformations in zone-normalized units,
   clamped against a `PrintZoneDefinition` the caller supplies. No component
   hand-edits an `ArtworkLayer`.
4. **Rendering** — `packages/3d-engine`'s `ArtworkZoneOverlay`, driven by
   `apps/web/src/hooks/useArtworkAssets.ts`, which is the only place that
   turns stored blob ids back into decoded images and the only place that
   releases their object URLs.

**Why print zones are UV rectangles.** A garment's manifest declares each
print zone's `uvRect` (`GARMENT_SPEC.md`), and the renderer maps a
zone-sized texture onto exactly that rectangle of the garment's own UVs.
This is what lets two zones share one mesh: the Essential Tee's front and
back are both on `Mesh_Torso`, separated only by disjoint UV rectangles. It
also means the print is part of the garment's surface — it curves with the
body, takes the same lighting, is occluded when rotated away, and costs
nothing per frame. Screen-space overlays and per-frame decal regeneration
were both rejected for exactly those reasons.

**Why the garment's base colour and its artwork are separate materials.**
The artwork overlay is a second mesh reusing the garment mesh's geometry,
with its own transparent, UV-mapped material. Colour lives on the garment's
material, so recolouring a shirt never tints the ink printed on it.
`polygonOffset` keeps the two coincident surfaces from z-fighting and
`depthWrite: false` keeps the overlay's transparent majority from punching a
hole in the depth buffer.

## Material & print-effect rendering (M04)

Two more resolution boundaries, built to the same rule as the rest: the
engines own _what a thing is_, the renderer owns _GPU resources_.

`material-engine` turns a `MaterialConfiguration` plus the garment's declared
`supportedMaterials` into a `ResolvedMaterial`; `effects-engine` turns an
`EffectConfiguration` into a `ResolvedEffect`. Both are pure, both clamp, and
both refuse rather than guess — an unsupported fabric resolves to a
substitute flagged `substituted: true`, an unimplemented effect resolves to
`null` and renders as the plain print it was before.

**Why Three.js is not the source of truth.** A fabric is a set of surface
properties, not a `MeshStandardMaterial`. Keeping the presets as plain data
means a fabric can be authored, diffed and unit-tested without a GPU
context, and that adding one later is a row in a table rather than another
conditional in a component. The renderer receives numbers it applies; it
never decides what cotton is.

**Capability enforcement happens three times, on purpose.** The garment
manifest declares what a garment supports; `availableMaterials` /
`availableEffects` intersect that with what this build implements so the UI
can only offer something real; `project-engine`'s mutators refuse anything
outside the allow-list they are handed; and the resolvers substitute rather
than render an unsupported choice. Hiding an option in the UI does nothing
about a persisted project that already names a fabric the garment never
offered, which is the case the last two layers exist for.

**Procedural surfaces.** ThreadForm ships no fabric photographs or scans.
Every surface is generated from `surfaceHeightField.ts` — a plain-weave, a
knit and a satin stitch, each a seamlessly-tiling height field converted to
a tangent-space normal map. Height first, normals second, because a height
field is something you can reason about ("a woven thread is a rounded ridge
that passes over and under its neighbour") and can unit-test. There is no
randomness: the same parameters always produce the same surface, which is
what makes the renderer's cache safe to key on them.

**Texture ownership.** `surfaceTextures.ts` caches the generated _pixels_
module-wide (a few hundred kilobytes, bounded by the number of distinct
fabrics) and hands each material its own cheap `DataTexture` wrapper, which
that material owns and disposes. The split exists because `repeat` and
`rotation` live on the texture, not the material: the garment's weave and a
screen print's ink conforming to that same weave need different tiling of
identical pixels.

**Why effects group into runs.** A print zone is drawn as an overlay mesh
whose material carries the treatment, and one material cannot be two
treatments at once. `groupLayersIntoEffectRuns` splits a zone's layers into
_consecutive_ runs of identical treatment — consecutive, not bucketed by
effect, because bucketing would silently reorder a stack where a screen
print sits above an embroidery that sits above another screen print.

**Alpha clipping is free.** The overlay material is transparent and the
artwork texture's alpha is zero outside the print, so those texels are never
shaded at all. A raised stitch surface cannot appear on bare fabric however
strong the relief is, which is why the stitch surface is a small tiling
texture rather than a normal map derived per-artwork — the mask already
exists.

## Image export (M05)

The boundary written in `EXPORT_SPEC.md` before M03 said `export-engine`
takes a `Project` plus `ExportPreferences` and produces a file. M03 made
that false: `Project.artworks[].source` holds a `blobId`, and the bytes live
in IndexedDB. A `Project` alone can no longer render anything.

The wrong fix would be to let `export-engine` reach into `local-storage`.
That would put a storage dependency inside a domain package, break the
one-way dependency rule, and make export untestable without a database. The
rule instead is:

> `export-engine` must not know where local artwork is stored.

So export splits across three layers that already existed:

- **`export-engine` decides.** Pure functions and data tables: short-edge
  resolution semantics, aspect-ratio and target-preset resolution, format
  capability and MIME/extension mapping, custom-dimension limits,
  deterministic filenames, and the job/result/error contracts. No DOM, no
  storage, no Three.js.
- **`apps/web` resolves.** `useImageExport` is the only place a `blobId`
  becomes a decoded image for export, reusing `useArtworkAssets` rather than
  loading anything itself. It also owns the readiness check: if a visible
  layer's bytes are still loading or failed, the export refuses _before_
  rendering and says which. An export presented as final output must not
  silently omit known content.
- **`3d-engine` renders.** `renderGarmentImage` receives already-resolved
  artwork — never a `blobId` — and produces a `Blob`.

This mirrors the existing rule that `projectRepository` is the only place
domain logic meets persistence. Export gets the same treatment because it
has the same shape of problem.

**Why the exporter is a second React root, not a screenshot.** Screenshotting
the visible canvas would make output resolution a function of the user's
window and `devicePixelRatio` — a 4K export on a small laptop would be an
upscale. `renderGarmentImage` instead mounts a detached R3F root sized
exactly to the requested output, renders one frame, and unmounts it.

**Why they share `GarmentScene`.** The real risk of a separate export path is
that the Studio renderer and the exporter slowly become two different visual
systems — a lighting tweak lands in one and not the other, and exports stop
looking like the product. `GarmentScene` holds the lighting rig, the garment
model, and the material/effect pipeline, and both roots render it. Only what
must differ differs: the export root uses `frameloop="never"`, `dpr={1}`, an
explicit pixel size, and `preserveDrawingBuffer: true` — scoped to that root,
because making it the Studio's default would cost memory and bandwidth every
frame for a canvas nobody reads back.

**Why framing is re-solved per export.** The camera comes from
`Project.camera.presetId` resolved through `garment-runtime`, never from live
OrbitControls state, so a file does not depend on where someone left the
mouse. `frameGarment` is then re-run at the _export's_ aspect ratio, which is
what keeps a 9:16 export framed for 9:16 rather than cropped from the
viewport's shape. That work also replaced the bounding-_sphere_ fit with a
bounding-_box_ fit solved per corner against the perspective frustum: a
sphere around a t-shirt is more than twice the garment's depth in every
direction, which left the product at about a third of a 9:16 frame.

**Job state is not project state.** `idle → preparing → rendering → encoding
→ completed | failed` lives in the hook. "Exporting" is not a fact about a
design, so it is never persisted into a `Project`. What _is_ persisted —
format, resolution, aspect ratio, target, custom size — goes through
`project-engine` mutators and the ordinary `useStudioProject` autosave, the
same as every other project edit. `ExportPanel` never edits a `Project`.
