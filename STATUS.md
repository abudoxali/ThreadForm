# ThreadForm — Status

**Project:** ThreadForm — browser-based 2D/3D apparel design & mockup studio
**Current milestone:** M05 — Production Image Export
**Milestone state:** PASS
**Overall project completion:** ~52% (foundation, local persistence, a real 3D garment, real artwork import/placement/projection, real fabric + print-process rendering, and real production image export now exist; no animation, no video export, no 3D-file export, no 2D Studio, no auth/billing/cloud/admin/AI — those remain the bulk of the product)
**M05 completion:** ~95%

## What a user can actually do now

Open a project → choose Cotton or Jersey → import artwork onto the front or
back print zone → apply Screen print or Embroidery to a specific layer →
adjust its strength and an embroidery's stitch angle → recolour the garment →
pick a camera → **export a real image file**: PNG, transparent PNG, JPG or
WebP, at 720p/1080p/1440p/4K, square, 4:5, 9:16, 16:9 or a custom size,
framed for that shape rather than cropped from the browser window — and get
it in their downloads folder. The export settings persist with the project.
All of it on a phone.

Nothing in that flow is mocked. The E2E suite proves it by decoding the bytes
the browser actually downloaded: the file's signature, its header dimensions,
its pixels, and its alpha channel.

## Completed work

**`packages/export-engine` (new)** — export decisions as pure functions and
data, with no DOM, no storage and no Three.js. It resolves a resolution tier
plus an aspect ratio into pixel dimensions, validates custom sizes, maps
formats to MIME types and extensions, probes what the browser can genuinely
encode, builds deterministic filenames, and defines the job/result/error
contracts. 52 tests.

**Short-edge resolution semantics.** A tier names the image's _shortest_
side. `1080p` + `9:16` is 1080 × 1920; `1080p` + `16:9` is 1920 × 1080.
`resolveExportDimensions` is the only function that turns a tier into pixels
— there are no pixel constants anywhere else in the codebase.

**Target presets are data, not code paths.** Eight rows in one table, each
naming an aspect ratio and a resolution. Selecting one writes the ordinary
ratio and tier fields, so nothing downstream can distinguish a preset from
the user setting both by hand; editing either field re-derives the target, so
a stored project can never claim a preset that no longer matches its own
settings. They are labelled **ThreadForm export presets** and the panel says
in as many words that they are sensible starting sizes, not a guarantee about
what any external platform accepts. No compliance claim is made anywhere.

**A genuinely off-screen renderer.** `renderGarmentImage` mounts a second
React Three Fiber root into a detached container, sized exactly to the
requested output, renders one frame, and tears it down. It does not
screenshot the viewport, and output size does not depend on the window, the
monitor or `devicePixelRatio`. `preserveDrawingBuffer` is enabled on that
root only — it is not the Studio's default.

**One scene, two roots.** Studio and exporter both render `GarmentScene` —
the same lighting rig, the same `GarmentModel`, the same material and effect
pipeline. This is the structural answer to the real risk: that the renderer
and the exporter slowly become two different visual systems.

**Export-aspect-aware framing.** The camera comes from the _persisted_
`Project.camera.presetId`, resolved through `garment-runtime`'s
`CAMERA_PRESETS`, never from live OrbitControls state — so a file does not
depend on where someone left the mouse. `frameGarment` is then re-solved at
the export's aspect ratio, which is what keeps a 9:16 export framed for 9:16.
Nothing else in `Project.camera` is read by export.

**Real transparency.** `png-transparent` omits the backdrop and clears to a
genuinely transparent colour. Measured on the file: 63.8% of pixels at alpha
0, 36.0% at alpha 255, 0.17% partial, with **zero** dark partial-alpha pixels
— nothing composited against the studio backdrop, so no halo. Every opaque
pixel matches the equivalent opaque export exactly: 0 pixels differing, max
channel delta 0.

**Format capability, probed not assumed.** `canvas.toBlob` silently returns a
PNG for a type it cannot encode. Every non-PNG format is verified with a 1×1
canvas and a `blob.type` comparison before it is offered, and again before a
render is spent on it. ThreadForm will not hand anyone a PNG named `.webp`.

**Deterministic filenames.** `threadform-<slug>-<width>x<height>.<ext>`. No
timestamps, so re-exporting the same project at the same settings overwrites
rather than piling up copies.

**A real Export tool** in the ToolRail with its own icon, and an ExportPanel
in the existing Inspector and mobile sheet. It states the exact computed
output size before anything renders. It shows no estimated file size (that
would be a guess presented as a fact), and no video, 3D or Pro controls.

## The boundary M03 broke, and how M05 fixed it

`EXPORT_SPEC.md` predated M03. It said `export-engine` takes a `Project` plus
`ExportPreferences` and produces a file. M03 made that false: artwork bytes
moved into their own IndexedDB store and `Project.artworks[].source` became a
`blobId`, so a `Project` alone can no longer draw itself.

The wrong fix would have been to let `export-engine` read storage. The rule
kept instead is: **`export-engine` must not know where local artwork is
stored.** So the work splits across three layers that already existed —
`export-engine` decides, `apps/web`'s `useImageExport` resolves, `3d-engine`
renders. The renderer receives decoded images, never blob ids. This mirrors
`projectRepository` being the only place domain logic meets persistence.

`docs/EXPORT_SPEC.md` has been rewritten to say this, and
`docs/ARCHITECTURE.md` gained a section explaining why.

## Persistence & backward compatibility

`exportPreferences` was modelled from M00 and inert until now. It is edited
through `packages/project-engine/src/exportPreferences.ts` and saved by the
ordinary `useStudioProject` autosave. `ExportPanel` never edits a `Project`.

**No schema bump, and no manufactured migration.** The persisted shape did
not change incompatibly. The one schema edit was a _widening_:
`customAspectRatio`'s `width`/`height` went from `.positive()` to
`.finite()`. Every document valid before M05 is still valid, and there are
regression tests for exactly that.

That widening is deliberate, not laziness. These are two numbers someone is
typing: en route to "1080" the field holds "1", and clearing it holds "0". A
schema strict enough to reject a mid-keystroke value would make the saved
project fail to _reopen_. Storing it is harmless; the **export** refuses,
with a specific reason, and the project stays intact.

**Job state is not project state.** `idle → preparing → rendering → encoding
→ completed | failed` lives in the hook. "Currently exporting" is a fact
about this tab right now, not about a design, so it is never persisted.

## Refusing rather than lying

An export presented as final output must not silently omit known content. If
any visible artwork layer's bytes are still loading or failed to load, the
export refuses _before_ rendering and names the layers at fault. This is
stricter than interactive rendering on purpose: on screen a broken layer is
visible and fixable, but a finished file gives no such feedback.

Two E2E tests cover the refusal path, including recovery afterwards.

## Architecture changes

- **`packages/export-engine` (new)** — the decision layer described above.
- **`packages/3d-engine`** — gained `GarmentScene` (the shared scene) and
  `renderGarmentImage` (the off-screen render). Both are lazily imported by
  the hook, so three.js stays out of the Studio's initial bundle.
- **`frameGarment`** — `GarmentBounds` gained an optional `halfExtents`, and
  framing now fits the bounding _box_ by solving each of its eight corners
  against the perspective frustum. The sphere path is untouched and still
  tested, so nothing that relied on it changed.
- **`apps/web/src/hooks/useImageExport.ts` (new)** — the application-layer
  boundary; the only place export meets resolved assets.

## Testing

| Package           | Tests   |
| ----------------- | ------- |
| `project-engine`  | 117     |
| `web` (unit)      | 79      |
| `3d-engine`       | 64      |
| `export-engine`   | 52      |
| `artwork-engine`  | 48      |
| `local-storage`   | 23      |
| `garment-runtime` | 22      |
| `material-engine` | 21      |
| `effects-engine`  | 21      |
| `ui`              | 3       |
| **Total**         | **450** |

Up from 422 at M04. New this milestone: 52 in `export-engine` (dimensions,
custom-size validation, presets, filenames, format mapping, the capability
probe's PNG-fallback trap, block reasons), 14 `project-engine` tests for the
export mutators and the pre-M05 compatibility cases, 14 `3d-engine` tests for
the bounding-box fit, and 14 Testing Library tests for the export panel.

**E2E: 23 tests, all passing** — the 13 that existed before M05 are unchanged
and still pass, plus 10 new export tests.

Every export assertion reads the real downloaded file. Asserting that the
panel said "Saved" would pass just as happily against a zero-byte file, a PNG
mislabelled `.webp`, a 512px render upscaled by the encoder, or a
"transparent" export with the backdrop baked in — which are precisely the
failures this milestone had to rule out.

## E2E flows

- **A — PNG 1080 square.** Downloads, checks the filename pattern, sniffs the
  signature, reads the IHDR dimensions, decodes the pixels, and confirms both
  a real garment and real artwork are present.
- **B — portrait social export.** 1080 × 1920; asserts zero fabric pixels on
  any edge (no clipping) and that the garment occupies more than 12% of the
  frame (not lost in it).
- **C — transparent PNG.** Real alpha, not a dark rectangle.
- **D — JPG and WebP.** Each encodes to the format it claims, or the panel
  says it cannot.
- **E — material and effect fidelity.** The exported file reflects the real
  fabric and print treatment.
- **F — persistence.** Export preferences survive a reload and still export.
- **G — mobile.** Export is reachable and works at 390 × 844.
- Plus a real 4K export, a refusal when content is missing, and a refusal for
  an invalid custom size with recovery afterwards.

## Visual QA actually performed

Sixteen exports were produced at 1440 × 900 and **the files themselves were
inspected**, not the viewport. Measurements from decoding them:

| Shape | Output      | Silhouette aspect | Coverage | Edge pixels |
| ----- | ----------- | ----------------- | -------- | ----------- |
| 1:1   | 1080 × 1080 | 1.0472            | 32.7%    | 0           |
| 4:5   | 1080 × 1350 | 1.0468            | 26.7%    | 0           |
| 9:16  | 1080 × 1920 | 1.0477            | 19.3%    | 0           |
| 16:9  | 1920 × 1080 | 1.0465            | 18.9%    | 0           |

**No stretching:** the garment's silhouette aspect varies by 0.2% across four
frame shapes. A render stretched to fit would have varied by a factor of
three. **No clipping:** zero fabric pixels touch any edge in any shape.

Also checked, by decoding each file: transparent PNG (alpha profile above),
JPG and WebP signatures, cotton versus jersey (gradient direction _inverts_ —
cotton 5.63 horizontal / 11.25 vertical, jersey 9.04 / 4.99), screen print
versus embroidery (ink measures 19,008 flat versus 14,240 embroidered, the
documented shading signature of real relief), a black garment, the Back
camera, the Back print zone (26,427 ink pixels from behind and **0** from the
front — no bleed-through), two overlapping layers in correct z-order with no
z-fighting, and a 3840 × 2160 4K export.

**No mirroring.** The artwork was nudged off-centre and its horizontal centre
of mass compared between viewport and file: 0.5398 versus 0.5409. Same side,
same fraction.

No UI, cursor or panel appears in any exported file. Zero console errors
across every run.

## Determinism verified

The same project state exported at 1080p and at 4K:

|                | 1920 × 1080 | 3840 × 2160 |
| -------------- | ----------- | ----------- |
| Ink centroid X | 0.4430      | 0.4431      |
| Ink centroid Y | 0.4542      | 0.4545      |
| Ink fraction   | 0.00945     | 0.00946     |

The same composition at four times the pixels. No timestamps reach the
pixels, nothing is randomised, and nothing reads the viewport.

## Accessibility checks actually performed

The whole export flow was driven **by keyboard only**, in a real browser:

- The Export tool is reachable in 8 tabs from page load; Enter opens it.
- Tab walks all 22 panel controls in reading order: Preset (8) → Format (4) →
  Shape (5) → Size (4) → Export image.
- Enter toggles an option, `aria-pressed` flips to `true`, and the output
  readout updates (selecting 9:16 changed it to "1080 × 1920 px").
- Enter on Export image downloads the file at the keyboard-selected size.
- **Every one of the 22 controls has a visible focus indicator.** None were
  missing.

Also: the computed size is in a live region, job progress uses `role="status"`
and failures `role="alert"`, active options are marked with an icon rather
than colour alone, and every touch target is at least 36px.

**Not tested:** an actual screen reader. No claim is made about one.

## Performance impact

Measured against the production build:

|                                            | M04    | M05                |
| ------------------------------------------ | ------ | ------------------ |
| `/studio` First Load JS                    | 142 kB | **146 kB** (+4 kB) |
| First Load JS shared by all                | 103 kB | **103 kB**         |
| `requestAnimationFrame` calls over 3s idle | 0      | **0**              |
| JS heap after first render                 | ~11 MB | **~10 MB**         |

three.js and the off-screen renderer are lazily imported by the hook, so the
+4 kB is the panel and the pure engine — the ~890 kB of Three.js chunks stay
out of the initial bundle and out of `/studio`'s First Load.

Idle `requestAnimationFrame` was measured by wrapping the real
`requestAnimationFrame` before the app's own scripts could capture it, and
counting only the app's calls. **Zero over three seconds** — after first
render, after an artwork import, after a 1080p export, and after a 4K export.
The off-screen root leaves no render loop behind.

## Memory & resource QA

Eleven consecutive exports in one session, with a forced GC before each
sample:

| After                          | Heap                     | Canvases | Stray off-screen containers |
| ------------------------------ | ------------------------ | -------- | --------------------------- |
| baseline                       | 10.25 MB                 | 2        | 0                           |
| 1080p export ×1 / ×2 / ×3      | 10.35 / 10.58 / 10.74 MB | 2        | 0                           |
| four format switches + exports | 11.47 MB                 | 2        | 0                           |
| four aspect switches + exports | 12.10 MB                 | 2        | 0                           |
| a 4K export                    | 12.19 MB                 | 2        | 0                           |
| a project switch               | **11.34 MB**             | 2        | 0                           |

Growth settles rather than compounds — three identical exports cost 0.49 MB
in total, and a full 3840 × 2160 render added 0.09 MB. The canvas count never
moves off 2 and no off-screen container ever survives an export, so each
export's root and its WebGL context are genuinely torn down. The drop after a
project switch is the point: memory is released, not retained.

Export durations: 1080p 747–972 ms, 4K 1590 ms.

## Defects discovered and fixed

- **The garment was far too small in a 9:16 export.** Found by looking at the
  file, not the viewport. `frameGarment` fitted the bounding _sphere_, and
  for a garment measuring 0.954 × 0.756 × 0.412 that sphere is a very loose
  bound on the tight axis — so on a tall frame, where the horizontal field of
  view is the constraint, the camera pulled back to fit a sphere far wider
  than the garment is. Fixed by fitting the bounding box.
- **The first box fit was wrong.** It used the flat orthographic projected
  extent, which ignores perspective: a corner nearer the camera subtends a
  larger angle than the centre-plane extent implies. A corner test at aspect
  0.8 and a 35° azimuth caught it (1.0201 > 1). Fixed by solving each of the
  eight corners against the frustum.
- **A test premise of mine was wrong.** I asserted portrait gains most from
  the box fit. It does gain — but landscape gains more, because this
  garment's sphere over-states its height by 1.64× and its width by only
  1.30×, so the biggest gain is where the _vertical_ field of view is tight.
  The test now asserts the true relationship and says why.
- **Two controls were both labelled "Custom".** The target preset and the
  aspect ratio each had one, in the same panel. An export test could not tell
  them apart and neither could a screen-reader user hearing "Custom, pressed"
  twice. The aspect-ratio option is now "Custom size".
- **`react-dom/client` had no types in `3d-engine`**; **TypeScript narrowed
  `root` to `never`** when it was assigned inside a promise executor; **an
  `import * as THREE` used only for a type cast** tripped
  `consistent-type-imports`. All three fixed properly rather than suppressed.

## Unresolved defects

None known in M05's scope. Two observed characteristics, documented rather
than "fixed" because they are correct behaviour:

- **A transparent export has no contact shadow.** The backdrop carries the
  grounding, and omitting the backdrop necessarily omits it. That is what
  transparency means here; compositing a shadow onto transparency would be
  inventing content.
- **The Back view of a black garment is very dark.** Correct — a black tee
  with no back artwork, lit as a black tee. The artwork itself is fully
  legible on black (measured at 18,679 ink pixels).

## Deliberate scope decisions

- **No JPG/WebP quality slider.** One central constant (0.92). A number most
  people cannot evaluate, attached to an artifact they cannot preview, is a
  worse experience than one good default. The brief's "don't create
  meaningless knobs" applies.
- **No estimated file size.** It would be a guess presented as a fact. The
  panel shows the exact pixel dimensions, which are knowable.
- **No `isPro` anywhere in `export-engine`, and no billing or auth
  infrastructure invented.** Every implemented format and resolution is
  available to everyone. `EXPORT_SPEC.md` still documents where an
  entitlement check would go when one exists.
- **Video and 3D export remain modelled and unexposed.**
  `ExportPreferences.video` is preserved through image-only edits and there is
  a test for that, but no control opens onto it.
- **`preserveDrawingBuffer` is scoped to the export root**, not made the
  Studio's default.
- **The E2E `custom size` test drove a UI rename rather than a tighter
  locator.** The ambiguity the test hit was real product ambiguity.

## Carried backlog (unchanged, not folded into M05)

- The ~600 ms tab-close autosave data-loss window (M01).
- Keyboard testing of delete/confirm and "New Project" specifically (M01);
  screen-reader testing generally (M00–M05).
- `packages/config` still has no `lint`/`typecheck` scripts of its own.
- `Project.camera`'s persisted `distance`/`target`/`fieldOfViewDegrees` are
  still ignored by both the renderer and export (export uses `presetId` only,
  which is now documented in `EXPORT_SPEC.md`).
- Layer reordering has no UI control (M03).
- Garment version-mismatch UX (`GARMENT_SPEC.md`'s "surface an explicit
  older-version state" rule) is still unimplemented.
- `meshNaming` has no key for a hood or a trouser leg.
- The Essential Tee remains `readiness: "development"` — a procedurally
  generated placeholder garment, honestly labelled.
- No animation, no video export, no 3D-file export, no 2D Studio, no
  background or lighting editor, no auth/billing/cloud/admin/AI.

**Playwright's 120s timeout is unchanged.** M04 raised it for good measured
reasons and nothing measured in M05 justifies lowering it — the full 23-test
suite runs in about 1.1 minutes across 10 workers, but individual WebGL
journeys under parallel load still need the headroom.

## Git

- **Branch:** `main`
- **Remote:** `https://github.com/3bud-ZC/ThreadForm.git`
- **M05 implementation commit:** recorded in the documentation commit that
  follows it — see "Current HEAD" below. This is the commit containing all
  M05 code, tests and documentation.
- **Current HEAD:** the documentation-only commit that carries this section,
  which sits directly on top of the implementation commit and changes nothing
  but these lines. A commit cannot state its own hash; `git log -1` gives it.
  The distinction matters only so "the M05 commit" is never ambiguous.
- No history was rewritten, nothing was force-pushed, and no QA screenshots,
  downloaded exports or Playwright traces were committed — the QA scripts and
  their output live outside the repository.

## Next milestone

**M06 — Animation, or the 2D Studio.** Export was the milestone that turned
the Studio from something you look at into something you ship, and it is now
real for images. Animation is the natural follow-on because a video export
shares most of the machinery M05 built — the off-screen root, the shared
scene, the deterministic framing — and `animation-engine` is already scoped
in `ARCHITECTURE.md` as the place presets resolve without a GPU. The
alternative, `2d-engine`, is lower risk and unlocks flat print mockups from
the same `Project`. Animation is the more valuable of the two and the more
likely to expose real problems, so it is the recommendation.

---

_Last updated: 2026-08-23 (M05 — export-engine, off-screen deterministic rendering, PNG/transparent PNG/JPG/WebP, 720p–4K, aspect-aware framing, persistent export preferences, file-level visual QA, keyboard QA, memory QA, fixes)._
