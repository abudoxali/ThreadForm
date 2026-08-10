# ThreadForm — Garment Specification

Garments are data, not code. The Studio must never hardcode a garment's print
zones, materials, or animation compatibility into a UI component — it reads
them from a manifest conforming to this spec, fetched and validated by
`packages/garment-runtime`. No manifest, model, texture, or animation from
VirtualThreads or any third party is used; every garment ThreadForm ships
must be an original asset with its provenance documented (see
`assets/garments/<id>/PROVENANCE.md`).

This spec was revised in M02 against the actual implemented schema
(`packages/garment-runtime/src/schema.ts`) — a few M00-drafted fields
(`displayName`, `uvChannel`, `thumbnails`, `assetIntegrity`) were renamed or
deferred; see "Deferred fields" below.

## Manifest contract

This is the real shape served today at
`/garments/threadform-essential-tee/manifest.json` (abbreviated):

```jsonc
{
  "garmentId": "threadform-essential-tee",
  "slug": "threadform-essential-tee",
  "version": "1.0.0",
  "name": "ThreadForm Essential Tee",
  "category": "t-shirt",
  "readiness": "development",

  "model": {
    "reference": "/garments/threadform-essential-tee/model.glb",
    "format": "glb",
    "scale": 1,
    "orientationDegrees": { "x": 0, "y": 0, "z": 0 },
    "meshNaming": {
      "front": "Mesh_Torso",
      "back": "Mesh_Torso",
      "leftSleeve": "Mesh_Sleeve_L",
      "rightSleeve": "Mesh_Sleeve_R",
    },
  },

  "defaultColor": "#f5f5f0",

  "printZones": [
    { "id": "front", "label": "Front", "maxWidth": 0.5, "maxHeight": 0.55 },
    { "id": "back", "label": "Back", "maxWidth": 0.5, "maxHeight": 0.55 },
  ],

  "supportedMaterials": ["cotton", "jersey"],
  "supportedEffects": ["screen-print", "embroidery"],
  "compatibleAnimations": ["idle", "slow-rotate", "turntable-360"],
  "cameraPresets": ["front", "back", "three-quarter"],

  "provenance": {
    "source": "threadform-original",
    "createdBy": "ThreadForm",
    "license": "Original asset. All rights reserved to ThreadForm.",
    "notes": "Procedurally generated development-grade mesh — see PROVENANCE.md.",
  },
}
```

## Field notes

- **`garmentId` / `slug`** — `garmentId` is the stable identifier a `Project`
  references (`GarmentReference.garmentId`); `slug` is the URL/display form
  and may change independently. `garment-runtime`'s catalog is keyed by
  `garmentId`, and `loadManifest` checks the fetched manifest's own
  `garmentId` matches what was requested before trusting it.
- **`version`** — semver. `GarmentReference.garmentVersion` records which
  version a project was authored against so the runtime can detect a
  compatibility gap (e.g. a print zone that no longer exists) rather than
  silently misplacing artwork. Not yet enforced beyond the M01-placeholder
  compatibility check (`resolveGarmentReference`) — a real version-mismatch
  migration path is still ahead.
- **`name`** — display name (the M00 draft called this `displayName`; the
  implemented schema uses `name` to match `GarmentCatalogEntry.label`
  conventions elsewhere in `garment-runtime`).
- **`readiness`** — `'development'` or `'production'`. A `'development'`
  garment (like the Essential Tee) is honestly labeled as such wherever it's
  surfaced — see `PROVENANCE.md` — never presented as a finished asset.
- **`category`** — one of the `GarmentCategory` values in
  `packages/types/src/garment.ts`. Drives which marketing/library filters a
  garment appears under, and is also the field `resolveGarmentReference`
  matches on for M01-placeholder compatibility (see `ARCHITECTURE.md`'s
  "Garment resolution & rendering" section).
- **`defaultColor`** — the hex color a newly created project's
  `garmentColor` is seeded with (`chooseGarment` in `useStudioProject`).
- **`printZones`** — must match `PrintZoneId` (`packages/types`). `maxWidth`/
  `maxHeight` are zone-normalized (0–1) bounds an artwork's `Transform2D`
  must respect; enforcement is still ahead (artwork placement is out of
  scope through M02).
- **`meshNaming`** — the contract between a manifest's 3D asset and the
  renderer's UV/print-zone mapping. A garment cannot declare a print zone
  that doesn't map to a named mesh region. The Essential Tee's `front` and
  `back` currently both map to the same `Mesh_Torso` — a known limitation
  of its single-sided procedural mesh, documented in its `PROVENANCE.md`.
- **`supportedMaterials` / `supportedEffects` / `compatibleAnimations`** —
  allow-lists. The Studio must not offer a control for a material, effect,
  or animation a garment doesn't support (not yet enforced in UI — no
  material/effect/animation controls exist yet to enforce it against).
- **`cameraPresets`** — must be non-empty and only reference ids
  `packages/garment-runtime`'s `CAMERA_PRESETS` actually defines (`front`,
  `back`, `three-quarter`, `side`, `top`, `custom`).
- **`provenance`** — required on every manifest. `source` is
  `'threadform-original'` only for a genuinely original asset;
  `'third-party-licensed'` requires real license terms in `license`, never
  just a source name.

## Scale & orientation conventions

- 1 model unit = 1 meter.
- Garment origin sits near the floor/hem center, front-facing `+Z`, up `+Y`
  — consistent across garments so camera presets behave predictably without
  per-garment tuning. `model.orientationDegrees` lets a manifest correct a
  specific asset's export orientation without changing this convention.

## Compatibility checks

When a `Project.garment.garmentVersion` doesn't match the manifest's current
`version`, the runtime should run any garment-specific migration or, at
minimum, surface an explicit "this project was made for an older version of
this garment" state — never silently drop artwork or zones. Not yet
implemented (no garment has shipped a second version yet); the one
compatibility path that _is_ implemented is `resolveGarmentReference`'s
handling of M01's pre-manifest placeholder reference — see
`ARCHITECTURE.md`.

## Deferred fields (not in the implemented schema)

Reserved for a future milestone, not validated or consumed by
`garment-runtime` today:

- **`uvChannel`** per print zone — not needed while a garment has a single
  UV set; will matter once a garment needs multiple UV channels.
- **`thumbnails`** — no garment library/browsing UI exists yet to display
  one.
- **`assetIntegrity`** (e.g. a model hash the loader checks before use) —
  worth adding once garments are fetched from anywhere less trusted than the
  app's own static assets.
- **`optimization`** (Draco/Meshopt compression flags, KTX2 texture
  variants, LOD references) — not needed at the Essential Tee's current
  polycount (336 triangles, 31.5 KB).
