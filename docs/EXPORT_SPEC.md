# ThreadForm — Export Specification

Image export is implemented as of M05 (`packages/export-engine` plus the
off-screen renderer in `packages/3d-engine`). Video and 3D export are
**modeled but not implemented** — the sections describing them below define
a boundary a future milestone must honor, and no control for them exists in
the Studio.

## Boundary

An earlier version of this document said `export-engine` takes a `Project` +
`ExportPreferences` and produces a file. That was written before M03 and is
no longer true. Since M03, `Project.artworks[].source` holds a `blobId` and
the actual image bytes live in IndexedDB via `packages/local-storage`. A
`Project` alone is therefore not enough to render anything.

The fix is **not** to let `export-engine` read storage. The invariant is:

> `export-engine` must not know where local artwork is stored.

So the work splits in three:

| Layer   | Package                            | Knows about                                                                                                                                        |
| ------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decide  | `export-engine`                    | Preferences, dimensions, formats, filenames, job contracts. Pure; no DOM, no storage, no Three.js.                                                 |
| Resolve | `apps/web` (`useImageExport`)      | That a `blobId` becomes a decoded image, that assets can still be loading or failed, and that an export must refuse rather than silently omit one. |
| Render  | `3d-engine` (`renderGarmentImage`) | Three.js, WebGL, canvas encoding. Receives already-resolved artwork; never a `blobId`.                                                             |

`useImageExport` is the only place these meet, the same way
`projectRepository` is the only place domain logic meets persistence.

## Resolution semantics

A resolution tier names the image's **shortest side**, not its width or its
height. `resolveExportDimensions` in `export-engine/src/dimensions.ts` is the
single function that turns a tier plus an aspect ratio into pixels; no other
module carries pixel constants.

| Tier    | Short edge |
| ------- | ---------- |
| `720p`  | 720        |
| `1080p` | 1080       |
| `1440p` | 1440       |
| `4k`    | 2160       |

So `1080p` + `9:16` is 1080 × 1920, and `1080p` + `16:9` is 1920 × 1080 —
both have a 1080px short edge.

## Custom dimensions

`custom` carries explicit final output dimensions, not a ratio to be scaled
by a tier: with `custom` selected the tier is deliberately not consulted.
Rejected, with a specific message: zero, negative, `NaN`, `Infinity`, and
anything past `MAX_EXPORT_DIMENSION_PX` (3840) on a side or
`MAX_EXPORT_PIXELS` (3840 × 2160) in total. Fractional input is rounded to
whole pixels rather than refused.

The _stored_ value is deliberately more permissive than the _export_: on the
way to typing "1080" the field holds "1", and clearing it holds "0".
`setExportCustomDimensions` stores those (refusing only non-finite values,
which can never become valid by typing more digits) and the export itself
refuses with a reason. A schema strict enough to reject a mid-keystroke
value would make a saved project refuse to reopen.

## Formats

| Format            | MIME         | Extension | Alpha                   |
| ----------------- | ------------ | --------- | ----------------------- |
| `png`             | `image/png`  | `.png`    | Opaque, studio backdrop |
| `png-transparent` | `image/png`  | `.png`    | Real alpha, no backdrop |
| `jpg`             | `image/jpeg` | `.jpg`    | Opaque                  |
| `webp`            | `image/webp` | `.webp`   | Opaque                  |

JPG and WebP share one central quality constant (`LOSSY_QUALITY = 0.92`).
There is no quality slider: a number most people cannot evaluate, attached
to an artifact they cannot preview, is a worse experience than one good
default.

`canvas.toBlob` silently produces a **PNG** when asked for a type the
browser cannot encode, so a format is offered only after
`canEncodeImageFormat` has probed it with a 1×1 canvas and confirmed
`blob.type` matches. Capability lives inside the export boundary; the panel
renders whatever it is told is available. This is what stops ThreadForm
handing someone a PNG named `.webp`.

## Aspect ratios & presets

`1:1`, `4:5`, `9:16`, `16:9`, and `custom`. Target presets are rows in one
table (`export-engine/src/targets.ts`), each naming an aspect ratio and a
resolution — never a separate code path. Adding one is a data entry.

They are documented as **ThreadForm export presets**: sensible starting
sizes, not a claim that any external platform accepts or requires them. The
panel says so in as many words. Selecting a preset writes the ordinary
ratio and tier fields, so nothing downstream can tell a preset apart from
the user setting both by hand; conversely, editing either field re-derives
the target so a stored project can never claim a preset that no longer
matches its own settings.

## Rendering

Export does **not** screenshot the visible Studio viewport, and output size
does not depend on the window, the monitor, or `devicePixelRatio`.
`renderGarmentImage` mounts a second React Three Fiber root into a detached
container parked off-screen, renders one frame at the requested size, and
tears the whole thing down.

Studio and exporter share `GarmentScene` — the same lighting rig, the same
`GarmentModel`, the same material and effect pipeline — so the two cannot
drift into different visual systems. What the export root sets differently
is only what has to differ:

- `frameloop="never"`, `dpr={1}`, an explicit `gl.setSize(width, height, false)`.
- `preserveDrawingBuffer: true`, scoped to this root. It is **not** the
  Studio's default; keeping the buffer every frame costs memory and
  bandwidth for a canvas nobody is reading back.
- `alpha` on only for `png-transparent`, where the backdrop is also omitted.
- Three settle frames after bounds are known, so lazily-loaded textures and
  the first material compile are in before the read-back.

Determinism: no timestamps reach the pixels, nothing is randomized, and
nothing reads the viewport. Verified in QA by exporting the same project
state at 1080p and 4K — ink centroid `0.4430, 0.4542` versus `0.4431,
0.4545`, ink fraction `0.00945` versus `0.00946`.

## Camera

Export uses the **persisted** camera configuration, never live OrbitControls
state, so the file does not depend on where the user happened to leave the
mouse. Specifically it consumes `Project.camera.presetId`, resolved through
`garment-runtime`'s `CAMERA_PRESETS` to an azimuth, polar angle and
distance, falling back to `front` if the stored id is unknown. Nothing else
in `Project.camera` is read by export.

Framing is re-solved for the **export's** aspect ratio at a fixed 26° vertical
field of view, so a 9:16 export is framed for 9:16 rather than cropped from
the viewport's shape. `frameGarment` fits the garment's bounding **box** by
solving each of its eight corners against the perspective frustum; fitting
the bounding sphere instead left the garment at about a third of a 9:16
frame, because a sphere around a t-shirt is more than twice the garment's
depth in every direction.

The guarantee: the garment is fully visible, centred, unclipped and
reasonably scaled at every shape, and never stretched. QA measured the
garment's silhouette aspect at 1.0472 / 1.0468 / 1.0477 / 1.0465 across 1:1,
4:5, 9:16 and 16:9 — a 0.2% spread, where a stretched render would have
varied by a factor of three.

## Transparency

`png-transparent` omits the backdrop and renders with a genuinely
transparent clear color. The garment stays fully opaque and artwork edges
keep their partial alpha. Verified by decoding the file: 63.8% of pixels at
alpha 0, 36.0% at alpha 255, 0.17% partial, with zero dark partial-alpha
pixels — nothing composited against the dark studio backdrop, so no halo.
Every opaque pixel matches the equivalent opaque export exactly (0 pixels
differing, max channel delta 0).

## Filenames & download

`threadform-<slug>-<width>x<height>.<ext>`, e.g.
`threadform-my-project-1080x1920.png`. The slug is NFKD-normalized,
stripped of combining marks, lowercased, reduced to `a-z0-9-`, and capped at
48 characters, falling back to `project` if nothing survives. No timestamps:
the same project at the same settings yields the same filename, which is
what makes a re-export overwrite rather than accumulate.

Object URLs are revoked on the next tick after the download is triggered,
and the off-screen root is unmounted and its container removed in a
`finally`. QA across eleven consecutive exports (including a 4K) measured
the heap at 10.25 MB → 12.19 MB, falling back to 11.34 MB after a project
switch, with the canvas count constant at 2 and zero surviving off-screen
containers.

## Job states & refusal

`idle` → `preparing` → `rendering` → `encoding` → `completed` | `failed`.
This is UI state, held in the hook — it is **not** persisted into `Project`,
because "exporting" is not a fact about a design. A job in flight blocks a
second one; a failure leaves the Studio fully usable.

An export presented as final output must not silently omit known content.
If any visible artwork layer's bytes have not resolved, or failed to
resolve, the export refuses before rendering and names the problem.

## Video

**Not implemented.** Reserved: WebM via `MediaRecorder`, MP4 where the
browser's encoder supports it (capability must be reported, never assumed),
24/30/60 FPS, the same resolution tiers. `ExportPreferences.video` is
modeled and preserved through image-only edits, but no control exposes it.

## 3D export

**Not implemented.** Reserved: GLB, glTF, and USDZ where the in-browser
pipeline can produce them without a server round-trip.

## Client-side vs. server-side

Export is fully client-side and fully local. No network request is made
during an export, and no project or artwork data leaves the device. A
server-side adapter is architecturally allowed for something the browser
genuinely cannot do alone, but it must be an explicit, separate adapter
behind the same interface — never a silent fallback that changes
determinism or ships project data without the user knowing.

## Entitlement boundary

Resolution ceilings, watermarking and commercial-use terms are entitlement
decisions, checked once before invoking `export-engine`. The engine has no
concept of "Pro" and contains no `isPro` check. No entitlement system exists
yet, and M05 did not invent one — every implemented format and resolution is
available to everyone.
