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
  "version": "1.1.0",
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
    {
      "id": "front",
      "label": "Front",
      "maxWidth": 1,
      "maxHeight": 1,
      "uvRect": { "x": 0.17, "y": 0.4, "width": 0.16, "height": 0.42 },
      "aspectRatio": 1,
    },
    {
      "id": "back",
      "label": "Back",
      "maxWidth": 1,
      "maxHeight": 1,
      "uvRect": { "x": 0.67, "y": 0.4, "width": 0.16, "height": 0.42 },
      "aspectRatio": 1,
    },
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
- **`printZones`** — must match `PrintZoneId` (`packages/types`).
  - `maxWidth`/`maxHeight` are the largest extent an artwork may occupy
    _within the zone_, in zone-normalized (0–1) units. Enforced as of M03 by
    `project-engine`'s `clampArtworkTransform`, which every placement change
    goes through. `1` means artwork may fill the declared print area.
  - `uvRect` (M03) is where the zone lives in the model's UV layout, in
    0–1 on both axes, and must fit inside that square. This is what makes a
    print zone a region of the actual mesh rather than a screen-space guess,
    and it is what lets two zones share one mesh — see `meshNaming` below.
  - `aspectRatio` (M03) is the zone's real-world width ÷ height. UV space is
    not physically uniform (a cylindrical torso's `u` is an angle around the
    body while its `v` is a height), so without this the renderer would
    stretch every print to the proportions of the UV rectangle instead of
    preserving the artwork's own.
- **`meshNaming`** — the contract between a manifest's 3D asset and the
  renderer's UV/print-zone mapping. A garment cannot declare a print zone
  that doesn't map to a named mesh region; `printZoneMeshName`
  (`garment-runtime`) resolves the mapping and returns `undefined` — meaning
  "render nothing" — for a zone whose surface this schema cannot yet name
  (a hood, a trouser leg). Several zones sharing a mesh is normal, not a
  limitation: the Essential Tee's `front` and `back` are both on
  `Mesh_Torso` and are kept independent by their disjoint `uvRect`s.

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

## UV layout convention

A garment's texture layout is part of its contract, because `uvRect` is
meaningless without one. Two properties are required of any ThreadForm
garment:

- **The UV seam falls outside every print zone.** A texture wraps at `u = 0`
  / `u = 1`; a zone straddling that seam would have its artwork torn in half.
  The Essential Tee's lathe starts its revolution at `-π/2` so the seam runs
  down the garment's left side, putting the front centreline at `u = 0.25`
  and the back centreline at `u = 0.75`.
- **`v` is linear in height.** Three's `LatheGeometry` derives `v` from the
  _index_ of a profile point rather than its height, which compresses
  densely-sampled regions; the generator re-derives `v` from each vertex's
  own Y so a zone rectangle corresponds to a fixed distance up the garment
  and can be authored as a real measurement.

`scripts/verify-essential-tee.mjs` asserts both against the built GLB: it
probes the vertices nearest the garment's front and back centrelines and
fails if their UVs don't fall where `manifest.json` says the zones are, or if
two zones overlap in UV space. A print zone pointing at the wrong part of the
texture is invisible to a schema check and very visible to a user.

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
  UV set; will matter once a garment needs multiple UV channels. (M03's
  `uvRect` deliberately does not imply one: it is a rectangle within the
  garment's single existing UV set.)
- **`thumbnails`** — no garment library/browsing UI exists yet to display
  one.
- **`assetIntegrity`** (e.g. a model hash the loader checks before use) —
  worth adding once garments are fetched from anywhere less trusted than the
  app's own static assets.
- **`optimization`** (Draco/Meshopt compression flags, KTX2 texture
  variants, LOD references) — not needed at the Essential Tee's current
  polycount (336 triangles, 31.5 KB).
