# ThreadForm — Garment Specification

Garments are data, not code. The Studio must never hardcode a garment's print
zones, materials, or animation compatibility into a UI component — it reads
them from a manifest conforming to this spec (future `garment-runtime`
package). No manifest, model, texture, or animation from VirtualThreads or any
third party is used; every garment ThreadForm ships must be an original
asset.

## Manifest contract

```jsonc
{
  "garmentId": "classic-tee",
  "slug": "classic-tee",
  "version": "1.0.0",
  "category": "t-shirt",
  "displayName": "Classic Tee",

  "model": {
    "reference": "garments/classic-tee/1.0.0/model.glb",
    "scale": 1.0,
    "orientationDegrees": { "x": 0, "y": 0, "z": 0 },
    "meshNaming": {
      "front": "Mesh_Front",
      "back": "Mesh_Back",
      "leftSleeve": "Mesh_Sleeve_L",
      "rightSleeve": "Mesh_Sleeve_R"
    }
  },

  "printZones": [
    { "id": "front", "label": "Front", "maxWidth": 0.8, "maxHeight": 0.9, "uvChannel": 0 },
    { "id": "left-chest", "label": "Left Chest", "maxWidth": 0.2, "maxHeight": 0.2, "uvChannel": 0 }
  ],

  "supportedMaterials": ["cotton", "heavyweight-cotton", "jersey"],
  "supportedEffects": ["screen-print", "embroidery", "puff-print"],
  "compatibleAnimations": ["idle", "slow-rotate", "turntable-360", "wind"],

  "cameraPresets": ["front", "three-quarter", "back"],

  "thumbnails": {
    "preview": "garments/classic-tee/1.0.0/thumb.webp"
  },

  "assetIntegrity": {
    "modelSha256": "…"
  }
}
```

## Field notes

- **`garmentId` / `slug`** — `garmentId` is the stable identifier a `Project`
  references (`GarmentReference.garmentId`); `slug` is the URL/display form
  and may change independently.
- **`version`** — semver. `GarmentReference.garmentVersion` records which
  version a project was authored against so the runtime can detect a
  compatibility gap (e.g. a print zone that no longer exists) rather than
  silently misplacing artwork.
- **`category`** — one of the `GarmentCategory` values in
  `packages/types/src/garment.ts`. Drives which marketing/library filters a
  garment appears under, not its behavior.
- **`printZones`** — must match `PrintZoneId` (`packages/types`). `maxWidth`/
  `maxHeight` are zone-normalized (0–1) bounds an artwork's `Transform2D` must
  respect; enforcement lives in the future `garment-runtime`, not in
  `packages/types` (which only models the shape).
- **`meshNaming`** — the contract between a manifest's 3D asset and the
  renderer's UV/print-zone mapping. A garment cannot declare a print zone that
  doesn't map to a named mesh region.
- **`supportedMaterials` / `supportedEffects` / `compatibleAnimations`** —
  allow-lists. The Studio must not offer a control for a material, effect, or
  animation a garment doesn't support.
- **`assetIntegrity`** — a hash the loader checks before use, so a corrupted
  or tampered asset fails loudly instead of rendering incorrectly.

## Scale & orientation conventions

- 1 model unit = 1 meter.
- Garment origin sits at the floor/hem center, front-facing `+Z`, up `+Y` —
  consistent across garments so camera presets behave predictably without
  per-garment tuning.

## Compatibility checks

When a `Project.garment.garmentVersion` doesn't match the manifest's current
`version`, the runtime (future) must run any garment-specific migration or, at
minimum, surface an explicit "this project was made for an older version of
this garment" state — never silently drop artwork or zones.

## Optimization metadata (future)

Reserved, not implemented in M00: Draco/Meshopt compression flags, KTX2
texture variants, and LOD references. The manifest shape above has room to add
an `optimization` object without a breaking change once these exist.
