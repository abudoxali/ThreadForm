# ThreadForm — Project Schema

## Canonical shape

Implemented in `packages/types/src/project.ts`. Conceptually:

```text
Project
├── schemaVersion
├── metadata          { id, name, createdAt, updatedAt, studioMode }
├── garment           GarmentReference { garmentId, garmentVersion, category }
├── garmentColor       { hex, label? }   ← the single source of garment colour
├── material          MaterialConfiguration
├── artworks[]         ArtworkLayer[]
├── printZones[]       PrintZoneState[]
├── effects[]          EffectConfiguration[]
├── animation          AnimationConfiguration
├── camera             CameraConfiguration
├── lighting           LightingConfiguration
├── background         BackgroundConfiguration (discriminated union)
└── exportPreferences  ExportPreferences
```

Every field is modeled as its own type in `packages/types/src` (`garment.ts`,
`material.ts`, `artwork.ts`, `effects.ts`, `animation.ts`, `camera.ts`,
`lighting.ts`, `background.ts`, `export.ts`) rather than one flat file, so
each concept can grow independently.

## Why a `Project`, not React state

A `Project` is a plain, serializable value with no framework dependency. The
Studio's React state should hold a `Project` (or reference one), not
duplicate its shape into component state — see `ARCHITECTURE.md`. This is
what makes local persistence, undo/redo, and a future 2D/3D engine split
possible without three different sources of truth.

## Discriminated unions

Used wherever a field has fundamentally different shapes depending on a kind:

- `ArtworkSource` — `local-blob` vs. `remote` (different fields per kind).
- `BackgroundConfiguration` — `solid-color` / `gradient` / `image` /
  `studio-scene` / `hdri-environment`.

This lets TypeScript narrow correctly on `.kind`/`.source.kind` instead of
relying on optional fields that can be inconsistently combined.

## Schema versioning

`schemaVersion` (currently `1`, see `CURRENT_PROJECT_SCHEMA_VERSION` in
`packages/types/src/schema-version.ts`) is bumped whenever a change would
break an older persisted `Project`. `packages/project-engine/src/migrate.ts`
holds a `migrations` map keyed by _from_-version; `migrateProject` walks a raw
payload forward to the current version before validation. There are no prior
versions yet, so the map is empty — but the mechanism exists so the first
breaking change has a concrete, tested place to land instead of being
invented under deadline pressure.

## Runtime validation

`packages/project-engine/src/schema.ts` defines a `zod` schema mirroring the
TypeScript types, used by `validateProject` at trust boundaries — loading a
project from browser storage, an imported file, or (later) a cloud sync
response. Code that already holds a `Project` it produced itself (e.g. via
`createProject`) does not need to re-validate; `zod` guards untrusted input,
not internal plumbing that TypeScript already checks at compile time. Every
enum in that schema is pinned to its `packages/types` union with
`as const satisfies readonly X[]`, so adding a category/zone/etc. to the type
without updating the schema is a compile error rather than a runtime rejection
of an otherwise-valid saved project.

## Local persistence (M01)

`packages/local-storage` is the IndexedDB-backed adapter guest projects are
saved to. Read path: `stored record → migrateProject → validateProject →
Project`. A record that fails either step throws `InvalidProjectDataError`
and is left exactly as stored — a failed load is never treated as licence to
delete or silently rewrite data. See `packages/local-storage/src/db.ts` for
the database name/version/store layout, and `docs/ARCHITECTURE.md`'s
"Project repository & autosave" section for how `apps/web` debounces writes
and restores the last-opened project on mount.

## Garment rendering (M02)

`garment`, `garmentColor`, and `camera` are no longer inert fields — as of
M02 they drive a real 3D render. `useResolvedGarment`
(`apps/web/src/hooks`) resolves `garment` (a `GarmentReference`) against
`packages/garment-runtime`'s catalog/manifest; `packages/3d-engine`'s
`StudioGarmentCanvas` renders the result using `garmentColor.hex` and the
camera preset in `camera.presetId`. See `GARMENT_SPEC.md` for the manifest
shape and `ARCHITECTURE.md`'s "Garment resolution & rendering" section for
the M01-placeholder compatibility path.

As of M03, `artworks` is real too. Each `ArtworkLayer` references its image
by `ArtworkSource.blobId` only; the bytes live in `local-storage`'s separate
`artworks` object store, which is what keeps a project document small enough
to re-serialize on every debounced autosave. `local-blob` sources also carry
`pixelWidth`/`pixelHeight`/`byteSize`, recorded at import time by
`@threadform/artwork-engine` — the renderer divides by those dimensions to
aspect-correct a layer, and the Studio uses them to restore a placement
before the image has finished decoding.

`transform` is stored as given and clamped at the point of use rather than
at validation time: the limits belong to the _garment's_ print zone, which
`projectSchema` cannot see. A manifest that tightens a zone's limits
therefore brings existing artwork back into range instead of failing the
whole project's validation.

As of M04, `material` and `effects` are real as well.

**Garment colour has one source.** `MaterialConfiguration` carried a `color`
of its own through M03 that nothing ever read — the renderer, the colour
control and a manifest's `defaultColor` all used `Project.garmentColor`. M04
removed it rather than keeping two fields in sync. No migration was needed:
zod's default object mode strips unknown keys, so an M03 document validates
unchanged and simply sheds the duplicate on its next save.

**Effects belong to artwork layers.** `docs/PRODUCT.md` has always described
effects as applying to individual artwork layers, but nothing connected the
two. `ArtworkLayer.effectId` now references an `EffectConfiguration.id` in
`Project.effects`. It is a stable id rather than an array index because
layers get reordered and removed, and an index would silently repoint at a
different effect the first time either happened. Each layer owns its own
configuration, so tuning one print's stitch relief cannot reach through a
shared record and move another's.

The field is optional, so every project saved before M04 validates unchanged
and renders as the plain untreated print it always was. A _dangling_
`effectId` — the effect it names is gone — is not a validation failure
either: it resolves to "no effect", which is the same plain print.

`printZones`, `animation` and `background` remain unconsumed — the schema
models them ahead of the milestones that will read them, per this doc's
original design intent.

## Non-trivial domain behavior

`packages/project-engine/src/layers.ts` implements artwork-layer operations
that have real logic worth testing (see `*.test.ts` beside each module):

- `addArtworkLayer` — assigns the next `order` within the layer's print zone
  (order sequences are independent per zone).
- `removeArtworkLayer` / `reorderArtworkLayer` — keep `order` a dense `0..n-1`
  sequence within a zone after removal or a move.
- `duplicateArtworkLayer` — appends a copy at the end of the zone's stack.
- `centerArtworkLayer` — resets position without touching rotation/scale.

`packages/project-engine/src/artwork.ts` (M03) adds placement, all of it
working in zone-normalized units and clamped against a `PrintZoneDefinition`
supplied by the caller — the domain layer never guesses a garment's limits:

- `clampArtworkTransform` — the single clamp every placement change goes
  through. Bounds scale to the zone's allowance, normalizes rotation to
  `(-180, 180]`, and holds the artwork's _rotated_ bounding box inside the
  zone (a 45-degree square needs ~1.41x the room an unrotated one does).
- `artworkHeightFraction` / `fitArtworkScale` — aspect correction. A zone's
  UV space is not physically uniform, so the manifest's `aspectRatio` is what
  keeps a square logo square instead of stretching it to the zone's shape.
- `setArtworkTransform` — applies a partial change and re-clamps; returns the
  same project reference when the clamped result is unchanged, so a slider
  dragged against its limit doesn't churn autosave.
- `moveArtworkLayerToZone` — re-clamps against the destination's limits and
  renumbers the source zone's remaining layers.
- `replaceArtworkSource` — swaps the image, keeping the layer's identity,
  zone and stacking order, and re-fitting placement to the new aspect ratio.

`packages/project-engine/src/material.ts` and `src/effects.ts` (M04) add the
fabric and print-process mutations. Both take their allow-list as an
argument rather than looking one up: which fabrics a garment offers is a
manifest fact and which are implemented is a renderer fact, and this package
depends on neither — the same reason `setCameraPreset` is handed a resolved
preset instead of a preset id.

- `setGarmentMaterial` — refuses a fabric outside the allow-list, and resets
  `propertyOverrides`, which were authored against a different fabric's
  defaults.
- `reconcileGarmentMaterial` — brings a stored fabric back into range when a
  garment stops offering it. Returns the project unchanged when nothing
  needs correcting, so merely opening a valid project never marks it dirty.
- `applyArtworkEffect` / `clearArtworkEffect` — link and unlink, garbage
  collecting the configuration when the last layer stops referencing it.
  Re-selecting the effect a layer already has is a no-op, so the control
  cannot reset an intensity the user tuned.
- `setArtworkEffectIntensity` / `setArtworkEffectParameter` — clamped, and
  no-ops when the value would not change, so a slider dragged against its
  limit does not churn autosave.

## Export preferences (M05)

`exportPreferences` was modeled from M00 but inert until M05, when image
export shipped. It is now a real, persisted part of the document, edited
through `packages/project-engine/src/exportPreferences.ts` like any other
field — `ExportPanel` never writes a `Project` directly.

- `setExportTarget` — writes the ordinary aspect-ratio and resolution
  fields the preset stands for, so nothing downstream can tell a preset apart
  from the user setting both by hand. `custom` leaves them alone.
- `setExportImageFormat` — image only; `exportPreferences.video` is left
  untouched, since video is modeled but unimplemented.
- `setExportResolution` / `setExportAspectRatio` — take the re-derived
  target as an argument (the caller matches settings against the preset table,
  which lives in `export-engine`), so a stored project can never claim a
  preset that no longer matches its own settings. Same reason
  `setGarmentMaterial` is handed its allow-list rather than looking one up.
- `setExportCustomDimensions` — rounds to whole pixels and refuses only
  non-finite input.

**No schema bump.** The persisted shape did not change incompatibly, so
`schemaVersion` stayed put and no migration was written. The one schema
edit was a _widening_: `customAspectRatio`'s `width`/`height` went from
`.positive()` to `.finite()`. Every document valid before M05 is still
valid.

That widening is deliberate. These are two numbers someone is typing: on the
way to "1080" the field holds "1", and clearing it holds "0". Storing that is
harmless; _refusing_ it is not, because the stricter schema would make the
saved project fail to reopen. The refusal belongs to the export, which
declines with a specific reason and leaves the project intact.

## Future migration example

```ts
// packages/project-engine/src/migrate.ts
const migrations = {
  1: (raw) => ({
    ...raw,
    schemaVersion: 2,
    // e.g. split a single `garmentColor` into per-zone colors
  }),
};
```
