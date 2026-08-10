# ThreadForm — Project Schema

## Canonical shape

Implemented in `packages/types/src/project.ts`. Conceptually:

```text
Project
├── schemaVersion
├── metadata          { id, name, createdAt, updatedAt, studioMode }
├── garment           GarmentReference { garmentId, garmentVersion, category }
├── garmentColor       { hex, label? }
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
holds a `migrations` map keyed by *from*-version; `migrateProject` walks a raw
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
not internal plumbing that TypeScript already checks at compile time.

## Non-trivial domain behavior

`packages/project-engine/src/layers.ts` implements artwork-layer operations
that have real logic worth testing (see `*.test.ts` beside each module):

- `addArtworkLayer` — assigns the next `order` within the layer's print zone
  (order sequences are independent per zone).
- `removeArtworkLayer` / `reorderArtworkLayer` — keep `order` a dense `0..n-1`
  sequence within a zone after removal or a move.
- `duplicateArtworkLayer` — appends a copy at the end of the zone's stack.
- `centerArtworkLayer` — resets position without touching rotation/scale.

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
