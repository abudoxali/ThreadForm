# ThreadForm — Status

**Project:** ThreadForm — browser-based 2D/3D apparel design & mockup studio
**Current milestone:** M03 — Artwork Upload & Print-Zone Placement
**Milestone state:** PASS
**Overall project completion:** ~34% (foundation, local persistence, a real 3D garment, and a real artwork import/placement/projection pipeline now exist; no materials beyond base colour, no effects, no animation, no export, no auth/billing/cloud/admin/AI — those remain the bulk of the product)
**M03 completion:** ~95%

## What a user can actually do now

Choose a garment → open the Artwork tool → pick a print zone (Front or Back;
selecting one turns the garment to face it) → import a PNG, JPEG, WebP or SVG
from their device → see it printed on the real 3D garment → resize, rotate,
move, and fade it → switch zones and place different artwork on the back →
recolour the shirt without tinting the ink → close the tab, come back, and
find every placement exactly as they left it. Artwork can be replaced or
removed, and a file that isn't really an image is refused with a specific
reason rather than silently doing nothing.

Nothing in that flow is mocked. The E2E suite proves it by screenshotting the
actual WebGL canvas and counting pixels of the artwork's own hue.

## Completed work

**`packages/artwork-engine` (new)** — the artwork trust boundary, with no
React, no storage and no rendering in it. `sniffArtworkFileKind` identifies a
file from its actual bytes (PNG/JPEG/WebP magic numbers, a structural check
for SVG) and never from `File.type` or the filename. `readImageHeaderSize`
parses PNG IHDR, JPEG SOF and all three WebP container variants so the size
limits (12 MB file, 8192 px per axis, 40 megapixels total) can be enforced
_before_ a decode buffer is allocated — a decompression bomb is a few
kilobytes of valid PNG declaring a 30000×30000 canvas, and by the time an
`<img>` reports `naturalWidth` the gigabytes already exist. `sanitizeSvg`
parses with `DOMParser` and re-serializes only what survives, removing
`<script>`, `<foreignObject>`, `<iframe>`, attribute-retargeting animation
elements, every `on*` handler, every non-fragment `href`/`xlink:href`,
`@import` and external `url()` in CSS, and any doctype or processing
instruction outside the root. Parsing rather than pattern-matching is
deliberate: it defeats entity-encoding and attribute-quoting bypasses. 48
tests.

**Real 3D artwork projection (`packages/3d-engine`)** — `ArtworkZoneOverlay`
renders each print zone as a second mesh reusing the garment mesh's own
geometry, with a transparent, UV-mapped canvas texture offset onto that
zone's `uvRect`. Because it _is_ the garment's surface, the print curves with
the body, takes the same lighting, is occluded correctly when rotated away,
and costs nothing per frame. `polygonOffset` keeps the coincident surfaces
from z-fighting; `depthWrite: false` stops the transparent majority punching
a hole in the depth buffer. Screen-space DOM overlays and per-frame decal
regeneration were both rejected for exactly those reasons.

**Print zones became real garment data** — `PrintZoneDefinition` gained
`uvRect` (where the zone lives in the model's UV layout) and `aspectRatio`
(the zone's real width ÷ height, which is what keeps a square logo square
given that UV space is not physically uniform). Both are zod-validated at the
manifest boundary, including a refinement that a `uvRect` must fit inside the
0–1 square. `printZoneMeshName` resolves a zone to its surface and returns
`undefined` — "render nothing" — for a zone the schema cannot yet name,
rather than guessing.

**Artwork placement in `project-engine`** (`src/artwork.ts`, pure, no React) —
`clampArtworkTransform` is the single clamp every placement change passes
through: scale bounded to the zone's allowance, rotation normalised to
`(-180, 180]`, and the artwork's _rotated_ bounding box held inside the zone
(a 45° square needs ~1.41× the room an unrotated one does). Plus
`setArtworkTransform`, `moveArtworkLayerToZone`, `replaceArtworkSource`,
`setArtworkOpacity`, `setArtworkVisibility`, `artworkHeightFraction` /
`fitArtworkScale`. No component hand-edits an `ArtworkLayer`.

**Artwork persistence (`packages/local-storage`)** — IndexedDB v2 adds an
`artworks` object store, upgraded stepwise and additively so an existing v1
database keeps its projects. A `Project` references artwork by `blobId`
alone, so a debounced autosave stays cheap regardless of image size. Bytes
are stored as an `ArrayBuffer` plus MIME type rather than as a `Blob` — both
are valid IndexedDB values, but `ArrayBuffer` is a plain structured-cloneable
value that survives every storage and test environment unchanged.

**Object-URL lifecycle** — every decode carries its own `release()`, and
`apps/web/src/hooks/useArtworkAssets.ts` is the single owner of when it is
called. It reconciles the blob ids a project references against those it
holds, releasing anything unreferenced. Deleting a layer, replacing artwork,
switching projects and unmounting the Studio therefore all clean up through
one path instead of each remembering its own; failure paths release before
returning. Assets are keyed by blob id, so a duplicated layer costs no extra
decode.

**Studio UI** — the Artwork tool rejoined the tool rail (it was removed
earlier precisely because it had nothing real behind it). The panel carries a
zone selector with per-zone artwork counts, a layer list, an import button, a
placement section (size / rotation / horizontal / vertical / opacity sliders
with live numeric readouts, plus Center), and Replace / Remove. Empty,
loading, success and error states are all real. Deleting a project now also
deletes the artwork blobs only it referenced, so removing a project can't
strand megabytes in the user's quota.

## Architecture changes

- **One new package**, `@threadform/artwork-engine`, added to
  `docs/ARCHITECTURE.md`'s package table and to the dependency diagram. It
  depends only on `@threadform/types`.
- **One new app-level hook**, `useArtworkAssets`, now named in
  `ARCHITECTURE.md` alongside `useResolvedGarment` as the only place a stored
  `blobId` becomes a decoded image.
- `docs/ARCHITECTURE.md` gained an "Artwork import, placement & projection"
  section describing the four boundaries artwork crosses and why the
  projection is a UV-mapped overlay rather than a screen-space one.
- `docs/GARMENT_SPEC.md` gained a "UV layout convention" section — the seam
  must fall outside every print zone, and `v` must be linear in height —
  because `uvRect` is meaningless without one.
- Dependency direction is unchanged and still one-way. `artwork-engine` sits
  at the domain-engine layer and imports nothing above it.

## Garment change (minimum justified)

M02 documented "front and back print zones both map to `Mesh_Torso`" as a
limitation blocking independent front/back artwork. It did **not** need a
mesh split. The fix was the UV layout:

- The torso lathe now starts its revolution at `-π/2`, putting the UV seam on
  the garment's left side — away from every print zone — and the front
  centreline at exactly `u = 0.25`, the back at `u = 0.75`. With the default
  `phiStart = 0` the seam ran down the middle of the chest, so any front
  print would have been torn in half across the texture wrap.
- Vertical UVs are re-derived from each vertex's own Y. `LatheGeometry`
  derives `v` from a profile point's _index_, which compresses
  densely-sampled regions; making `v` linear in height is what lets a zone
  rectangle mean a fixed distance up the garment.
- `manifest.json` declares the two zones as disjoint rectangles in that space
  (a ~32 cm printable panel each) and is bumped to `1.1.0`.

The silhouette itself is untouched: 4 meshes, 800 triangles, 27.8 KB.
`scripts/verify-essential-tee.mjs` now asserts the built GLB's UV anchors
against the manifest and fails if a zone points at the wrong part of the
texture or two zones overlap — a defect a schema check cannot see and a user
certainly can. `PROVENANCE.md` records the layout and marks both M02
limitations (the shared-mesh zones and the shoulder seam gap) as resolved.

## Artwork formats and security behaviour

| Concern           | Behaviour                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted formats  | PNG, JPEG, WebP, SVG — decided by file signature, never MIME type or extension                                                                 |
| Size ceiling      | 12 MB per file, rejected before the bytes are read                                                                                             |
| Dimension ceiling | 8192 px per axis and 40 megapixels total, read from the header **before** any decode                                                           |
| SVG               | Parsed and rebuilt; scripts, event handlers, embedded HTML, external references and CSS imports removed. Sanitized bytes are what get stored   |
| Rendering context | Drawn via `<img>` into a canvas and uploaded as a WebGL texture. Never in the DOM, never `dangerouslySetInnerHTML`, never a same-origin iframe |
| Persisted bytes   | Re-sniffed and re-sanitized on every read; a blob whose signature contradicts the project is refused, not rendered                             |
| Network           | Zero requests on the import path. Artwork never leaves the device                                                                              |
| Failure           | A specific user-facing message beside the control used; nothing written to storage; retrying the same file works                               |

Verified end-to-end in the browser: an SVG carrying both a `<script>` and an
`onload` handler sets no global, triggers no off-origin request, and still
renders the drawing content that survived sanitization.

## Persistence behaviour

A reload restores artwork identity (blob id + file kind), print zone,
position, scale, rotation, opacity, layer name, stacking order, the recorded
pixel dimensions and byte size, and the existing garment colour / camera /
project data. Verified in the browser by comparing slider values _and_ the
magenta pixel count before and after reload (within ±20 %), not merely by
checking that "some artwork is present".

Stale data is handled honestly: a layer whose blob has been evicted opens the
project normally, is listed with a visible "File missing" note, and can be
replaced or removed. A blob whose real signature contradicts the project is
refused with "Could not load" rather than rendered.

## Testing

Exact commands, run from a clean state after every fix below:

- `pnpm format:check` — **passed.**
- `pnpm typecheck` — **9/9 packages passed.**
- `pnpm lint` — **9/9 packages passed, 0 errors, 0 warnings.**
- `pnpm test` — **223/223 passed**: `artwork-engine` 48, `project-engine` 60,
  `local-storage` 23, `garment-runtime` 22, `3d-engine` 17, `web` 50, `ui` 3.
  (M02 total was 92; **131 tests are new this milestone.**)
- `pnpm build` — **succeeded.**
- `pnpm --filter @threadform/web test:e2e` — **9/9 passed**, run repeatedly
  across this milestone's fixes with no flakiness in the final build.

Security-sensitive coverage is deliberately heavy, since this is the first
milestone that accepts a user file: 18 SVG-sanitizer regression tests
asserting on what is _absent_ from the rebuilt document, 7 signature-sniffing
tests (including a text file named `logo.png` served as `image/png`, and HTML
that also opens with `<`), 8 header-parsing tests (including an absurd
declared size reported truthfully so the limits can reject it), and 15
validation tests.

## E2E flows

Nine tests across `apps/web/e2e/smoke.spec.ts` (5, carried over from M02) and
`apps/web/e2e/artwork.spec.ts` (4, new). Every artwork assertion screenshots
the real WebGL canvas and counts pixels of the fixture's hue — a test that
only checked component state would pass just as happily with the 3D
projection completely broken, which is the failure this milestone most needed
to rule out. Matchers test channel _relationships_ rather than exact values,
so lighting and tone mapping don't make a correct render look like a failure.
`apps/web/e2e/pixels.ts` is a dependency-free PNG reader written for this
(Playwright screenshots are the only honest way to read an R3F canvas, since
`preserveDrawingBuffer` is correctly off).

1. **Artwork lifecycle** (8 steps) — the fixture hue is confirmed absent
   first, then: import → printed on the garment; size slider down → measurably
   fewer ink pixels, back up → more; rotate and move; switch to Back → the
   front print is gone (garment turned) and the back zone is empty; import a
   second artwork → cyan present, magenta absent (no bleed between zones);
   return to Front → magenta back, cyan gone; wait for "Saved", reload →
   sliders and ink coverage both match within tolerance, and the back zone's
   artwork returned too; recolour the shirt black → the ink is untinted;
   replace with the SVG fixture → green present, magenta gone; remove → gone,
   and still gone after another reload; orbit the camera → the print stays
   attached to the garment.
2. **Rejecting non-images** — a text file named `not-an-image.png` is refused
   with "supported image", nothing is added, and a valid file immediately
   afterwards works.
3. **SVG sanitization** — the hostile fixture sets no global, makes no
   off-origin request, and still renders its surviving drawing content.
4. **Mobile at 390×844** — import and placement work, the size slider is
   ≥36 px tall, no horizontal overflow.

Console errors are asserted empty in every flow.

## Visual QA actually performed

Rendered via Playwright + Chromium against the **production build** (Claude-in-Chrome
MCP unavailable in this environment, as in M00–M02) at 1440×900, 1280×720,
1024×768, 768×1024, 390×844 and 360×800 — seven states at each: artwork empty
state, front artwork, transformed artwork (scaled, rotated −24°, repositioned),
back artwork (SVG), dark garment + artwork, import error, and touch-target
measurement. 42 screenshots, inspected individually. **Four real defects
found and fixed:**

- **Prints were too small to be believable.** The manifest capped artwork at
  50 % of the print zone, making the largest possible front print ~16 cm on a
  66 cm garment. Fixed by letting artwork fill the declared print area
  (`maxWidth`/`maxHeight` → 1) and sizing a newly imported artwork to 70 % of
  it — confident, and with room to move in both directions.
- **The garment shrank into a corner on mobile.** Opening the Inspector sheet
  shortens the canvas, and M02's resize handling deliberately left the camera
  alone to preserve the user's orbit — which also left the distance fitted to
  a taller canvas. Fixed by re-fitting the camera's _distance_ on resize
  while preserving the orbit angle: how far away the garment must be to fill
  the canvas is a property of the canvas, not of the user's viewpoint.
- **Import errors were invisible on a phone.** The rejection message landed
  below the fold of the short Inspector sheet, so picking a bad file appeared
  to do nothing. (Screen-reader users already had it via `role="alert"`.)
  Fixed by scrolling the alert into view.
- **Panel polish:** the empty state repeated the accepted-format list twice at
  narrow widths, and "Add artwork" used the accent colour even once a zone had
  artwork. Fixed — accent is now reserved for the action the panel is asking
  for.

Re-ran the full sweep after the fixes: no automated issues, and the
before/after screenshots confirm each fix.

## Accessibility checks actually performed

A real keyboard-driven pass against the production build, driving Tab / Enter
/ arrow keys and asserting **actual DOM and project-state changes**, not
markup inspection. 17/17 checks passed:

- Tab reaches the Artwork tool; Enter opens the panel.
- Tab reaches the print-zone buttons; Enter flips `aria-pressed` and the
  camera preset actually changes in the persisted project.
- The file input is genuinely in the tab order (visually hidden, not
  `display: none`) and shows a visible accent focus ring on its button when
  reached by Tab. (Confirmed that a programmatic `.focus()` correctly does
  _not_ trigger `:focus-visible` — the initial probe reporting otherwise was
  the probe's bug, not the app's.)
- Every placement slider is focusable, responds to arrow keys, and carries an
  `aria-valuetext` matching its visible readout.
- Enter on "Center" recenters the artwork; Enter on "Remove" deletes the
  layer; both show a visible focus ring.
- The active print zone is marked with a check icon, not colour alone; the
  same is true of the selected layer and of the error state (icon + text).

**Not tested:** screen reader (not run — not claimed).

## Performance impact

Measured against the production build, before and after:

- `/studio` First Load JS: **139 kB**, up from **131 kB** in M02 (+8 kB for
  the artwork panel and engine). three.js/drei/GLTF remain behind the
  `next/dynamic({ssr:false})` boundary — 5 chunks are still fetched only once
  a garment is chosen, and never on the picker/recents start screen.
- **0 `requestAnimationFrame` calls over 3 seconds while idle with artwork on
  the garment.** The demand frame loop is intact; the artwork projection is a
  static texture, not per-frame work.
- A placement change settles immediately (one canvas repaint plus one texture
  upload; each zone owns one canvas and one texture for its lifetime rather
  than allocating per change).
- JS heap after importing a 256×256 PNG: ~11 MB.
- Project payloads did **not** grow: artwork bytes live in a separate
  IndexedDB store and a `Project` carries only a `blobId`, so autosave cost is
  independent of image size. Asserted by a test that the project document
  never contains the artwork bytes.

## Defects discovered and fixed

Beyond the four visual-QA defects above:

- **`vector2`/`vector3` schemas accepted `Infinity`.** `z.number()` rejects
  `NaN` but not infinities, and an infinite scale or position reaches the
  renderer as a NaN transform matrix that silently blanks the whole canvas.
  Fixed with `.finite()`; `clampArtworkTransform` also replaces non-finite
  values defensively, with tests for both.
- **A double-decode race could leak an object URL.** A freshly imported
  artwork can be adopted (already decoded) while a storage read of the same
  blob is still in flight. Fixed by having the later read release its
  duplicate rather than overwrite the adopted one.
- **`GarmentModel` would have re-uploaded every zone texture on every
  render.** Grouping layers by zone inline created a new array identity each
  time; memoised, so a full-resolution canvas repaint happens only when the
  artwork actually changes.
- **`Blob` did not survive IndexedDB in every environment.** Switched the
  artwork store to `ArrayBuffer` + MIME type — a plain structured-cloneable
  value, and the more portable of the two IndexedDB options anyway.

## Deliberate scope decisions

- **Multiple artwork layers per zone are supported and work** — the domain
  model always allowed them, the panel lists them all with per-layer select /
  replace / remove, and both render on the garment with correct stacking
  (verified visually). What is _not_ exposed is drag-to-reorder: the
  `reorderArtworkLayer` domain function exists and is tested, but no control
  drives it yet. This follows the brief's "don't overbuild a Photoshop-style
  layer manager"; adding the control later needs no architectural change.
- **Placement is slider-driven, not drag-on-canvas.** Sliders are keyboard
  accessible for free, work identically on touch and mouse, and gave the
  milestone a correct, clamped, testable placement model. Direct manipulation
  on the 3D surface is a genuinely separate piece of work (ray-casting
  screen-space drags back into zone-normalized UV space).

## Housekeeping

Three uncommitted profiling/QA scratch scripts left in `apps/web/` by an
earlier session (`profile.mjs`, `profile-bundle.mjs`, `visual-qa-full.mjs`)
were moved out of the repository into scratch storage. They were the only
source of `pnpm lint` warnings, hardcoded an absent temp path, and were never
committed. No committed work was removed.

## Git

- **Branch:** `main`
- **Remote:** `https://github.com/3bud-ZC/ThreadForm.git`
- **Commit:** `6630b99` — Milestone 03: artwork import, print-zone placement
  and real 3D projection.
- **Push:** succeeded (`da05577..6630b99  main -> main`).

## Remaining known issues

**Carried over, deliberately not folded into this milestone** (none of them
blocked M03):

- The ~600 ms tab-close autosave data-loss window (M01). The E2E suite waits
  for "Saved" before reloading rather than racing it.
- Keyboard testing of the delete/confirm and "New Project" flows specifically
  (M01), and screen-reader testing generally (M00–M03).
- `packages/config` still has no `lint`/`typecheck` scripts of its own.
- `Project.camera`'s persisted `distance`/`target`/`fieldOfViewDegrees` are
  still ignored by the renderer. **Partially touched this milestone:** the
  camera now re-fits its distance on canvas resize (see Visual QA), which
  makes the stored `distance` even less meaningful. Whether user zoom should
  persist at all remains the product question it was in M02.
- The default framing leaves the garment somewhat small on very tall, narrow
  canvases — `frameGarment` fits a bounding _sphere_, which is conservative
  for a wide, flat garment. Unchanged from M02 and judged acceptable; fixing
  it properly means fitting projected bounding-box extents, which risks the
  mobile-clipping regression M02 fixed.

**New this milestone, documented rather than fixed:**

- Layer reordering has no UI control (see Deliberate scope decisions).
- The garment manifest's `version` bumped to `1.1.0`, and there is still no
  version-mismatch migration path — `resolveGarmentReference` matches on
  `garmentId`, so existing `1.0.0` projects resolve and render normally, but
  `GARMENT_SPEC.md`'s "surface an explicit older-version state" rule remains
  unimplemented. No garment has yet shipped a change that would need it.
- `meshNaming` has no key for a hood or a trouser leg, so a garment declaring
  those zones would render nothing there until the schema is extended.
  `printZoneMeshName` returns `undefined` honestly rather than guessing.
- No materials beyond base colour, no effects, no animation, no export — all
  explicitly out of scope for M03.

## Next milestone

**M04 — Material & Print-Effect Rendering.** `MaterialConfiguration` and
`EffectConfiguration` have been modelled in `packages/types` since M00 and are
still inert. The manifest's `supportedMaterials` / `supportedEffects`
allow-lists exist but nothing enforces them, because there is nothing to
enforce them against. M04 should build `material-engine` and `effects-engine`
as the documented boundaries describe — resolving those configurations into
renderer parameters without a GPU context, so presets stay authorable and
testable — and wire them into the existing `3d-engine` surface. The artwork
overlay is the natural place for the first print effects (screen-print,
puff, embroidery) to land, since it already owns a per-zone material.

---

_Last updated: 2026-08-22 (M03 — artwork import, print-zone UV layout, placement, real 3D projection, persistence, security boundary, visual + keyboard QA, fixes)._
