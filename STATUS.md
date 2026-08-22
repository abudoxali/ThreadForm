# ThreadForm — Status

**Project:** ThreadForm — browser-based 2D/3D apparel design & mockup studio
**Current milestone:** M04 — Material & Print-Effect Rendering
**Milestone state:** PASS
**Overall project completion:** ~43% (foundation, local persistence, a real 3D garment, real artwork import/placement/projection, and real fabric + print-process rendering now exist; no animation, no export, no auth/billing/cloud/admin/AI — those remain the bulk of the product)
**M04 completion:** ~95%

## What a user can actually do now

Open a project → choose between Cotton and Jersey and watch the garment
surface change → import artwork → apply Screen print or Embroidery to a
specific layer → see a genuinely different physical treatment on the real 3D
garment → adjust its strength, and an embroidery's stitch angle → keep the
garment colour and every M03 placement → autosave, reload, and get the same
result → switch projects without anything leaking between them → do all of it
on a phone.

Nothing in that flow is mocked. The E2E suite proves it by measuring the
actual WebGL output: a knit's contrast runs vertically where a weave's does
not, and embroidered thread has far more local relief than screen-printed
ink.

## Completed work

**`packages/material-engine` (new)** — fabric presets and resolution, with no
React, no Three.js and no GPU. `resolveMaterial` takes a
`MaterialConfiguration` plus the garment's own `supportedMaterials` and
returns clamped, renderer-ready surface parameters. Three.js is deliberately
not the source of truth for what a fabric _is_: a preset is plain data, so a
fabric can be authored, diffed and unit-tested without a WebGL context, and
adding one later is a row in a table rather than another conditional in a
component. 21 tests.

**`packages/effects-engine` (new)** — print-process presets and resolution,
same constraints. `resolveEffect` clamps intensity and derives roughness and
relief from it; `parameters` is filtered through a strict per-kind allow-list
before anything reaches the renderer. 21 tests.

**Cotton** — a plain weave. Warp and weft alternate over and under, with the
over/under weight a continuous cosine rather than a parity test, so the
surface has no discontinuity at a thread boundary. Matte (roughness 0.86),
low relief, dense: light scatters rather than reflects.

**Jersey** — a knit. Columns of interlocking loops, so its dominant read is
_columnar_ — visible vertical wales where cotton has an even grid. Smoother
faced (roughness 0.71) and more structurally pronounced. The difference is
structural, not a roughness tweak, which is what the E2E gradient-direction
measurement pins down.

**Screen print** — flat ink bonded to the cloth. It has no structure of its
own, so it borrows the _garment's_ weave: the same artwork genuinely looks
different screen-printed on cotton than on jersey. More ink (higher
intensity) means a thicker, smoother, glossier film that fills the weave in,
so its relief falls as intensity rises.

**Embroidery** — raised satin stitching with its own thread surface, running
at a configurable angle, markedly shinier than ink (roughness 0.62 → 0.34).
Relief climbs with intensity — the opposite direction to screen print,
because it is a different process. Clipped exactly to the artwork's alpha,
for free: the overlay material is transparent and the artwork texture's alpha
is zero outside the print, so those texels are never shaded at all.

**Procedural surfaces, no assets** — ThreadForm ships no fabric photographs
or scans. Every surface is generated from `surfaceHeightField.ts`: a
plain weave, a knit and a satin stitch, each a seamlessly-tiling height field
converted to a tangent-space normal map. Height first, normals second,
because a height field is something you can reason about and unit-test. No
`Math.random` anywhere, so the same parameters always produce the same
surface — which is what makes the renderer's cache safe to key on them.

**Effect ownership** — `ArtworkLayer.effectId` now references an
`EffectConfiguration.id` in `Project.effects`, which is what
`docs/PRODUCT.md` always described ("apply print/fabric effects to individual
artwork layers") and nothing had connected. A stable id, not an array index:
layers get reordered and removed. Each layer owns its own configuration, so
tuning one print's stitch relief cannot reach through a shared record and
move another's.

**Garment colour has one source again** — `MaterialConfiguration` carried a
`color` through M03 that nothing ever read; the renderer, the colour control
and a manifest's `defaultColor` all used `Project.garmentColor`. It was
removed rather than kept in sync.

## Effect ownership / association model

|             |                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Owner       | `Project.effects: EffectConfiguration[]`                                                                                                  |
| Reference   | `ArtworkLayer.effectId?: string` → `EffectConfiguration.id`                                                                               |
| Cardinality | One configuration per layer; never shared                                                                                                 |
| Absent      | No effect — the plain untreated print M03 shipped                                                                                         |
| Dangling id | Resolves to no effect; not a validation failure                                                                                           |
| Lifecycle   | Unlinking, removing a layer, or changing effect garbage-collects the orphaned configuration; duplicating a layer clones its configuration |

## Persistence & backward compatibility

Material selection, effect kind, intensity and parameters all survive
autosave, reload, project switching and browser reopen, through the existing
IndexedDB v2 store. **No schema version bump and no migration** — neither
change needed one, and manufacturing one would have been dishonest:

- Removing `MaterialConfiguration.color`: zod's default object mode strips
  unknown keys, so an M03 document validates unchanged and simply sheds the
  duplicate on its next save.
- Adding `ArtworkLayer.effectId`: optional, so every pre-M04 project
  validates unchanged and renders as the plain print it always was.

Six tests in `validate.test.ts` cover this directly against an M03-shaped
document, including that its garment colour and artwork survive intact.
M01's legacy-placeholder E2E flow still passes untouched.

## Supported capability enforcement

The Essential Tee declares `["cotton", "jersey"]` and
`["screen-print", "embroidery"]`. `MaterialId` has nine members and
`EffectKind` sixteen; none of the rest are offered, because enforcement
happens in three places rather than one:

1. `availableMaterials` / `availableEffects` intersect the manifest's list
   with what this build actually implements, so the UI can only ever offer
   something real.
2. `project-engine`'s mutators refuse anything outside the allow-list they
   are handed.
3. The resolvers substitute rather than render — an unsupported fabric
   resolves to one the garment does list, flagged `substituted: true`; an
   unimplemented effect resolves to `null` and renders as the plain print.

Layers 2 and 3 exist because hiding an option in the UI does nothing about a
persisted project that already names a fabric the garment never offered.
E2E Flow D seeds exactly that document (material `denim`, effect `foil`,
`roughness: 900`, a hostile `parameters` key) straight into IndexedDB and
verifies it opens, renders, and substitutes without a console error.

## Architecture changes

- **Two new packages**, `@threadform/material-engine` and
  `@threadform/effects-engine`, added to `docs/ARCHITECTURE.md`'s package
  table and removed from its "future boundaries" list. Both depend only on
  `@threadform/types`.
- `docs/ARCHITECTURE.md` gained a "Material & print-effect rendering"
  section covering why Three.js is not the source of material truth, why
  capability enforcement is layered, how procedural surfaces are generated
  and owned, and why effects group into consecutive runs.
- `docs/PROJECT_SCHEMA.md` documents the single colour source and the
  artwork→effect reference model, with the compatibility reasoning.
- `docs/GARMENT_SPEC.md` records that `supportedMaterials`/`supportedEffects`
  are now enforced, and that a manifest may list something unimplemented
  without that becoming a control.
- `docs/PRIVACY_SECURITY.md` gained an "Effect parameters" section.
- Dependency direction unchanged and still one-way.

## Testing

Exact commands, run from a clean state after every fix below:

- `pnpm format:check` — **passed.**
- `pnpm typecheck` — **10/10 packages passed.**
- `pnpm lint` — **10/10 packages passed, 0 errors, 0 warnings.**
- `pnpm test` — **356/356 passed**: `project-engine` 96, `web` 65, `3d-engine`
  57, `artwork-engine` 48, `local-storage` 23, `garment-runtime` 22,
  `material-engine` 21, `effects-engine` 21, `ui` 3.
  (M03 total was 223; **133 tests are new this milestone.**)
- `pnpm build` — **succeeded.**
- `pnpm --filter @threadform/web test:e2e` — **13/13 passed.**
- `node scripts/verify-essential-tee.mjs` — **passed** (unchanged asset;
  re-run to confirm M04 touched no garment geometry).

New coverage by area: material-engine 21 (cotton/jersey resolution, override
merging, clamps, non-finite input, unsupported material, determinism, no
input mutation), effects-engine 21 (both processes, intensity and parameter
clamping, the allow-list dropping `__proto__`/unknown keys, determinism, no
mutation), project-engine 30 (material mutations + enforcement, effect
link/unlink/GC, per-layer independence, old-project compatibility),
3d-engine 40 (height-field structure/tiling/determinism, normal encoding,
surface caching, effect-run ordering), web 15 (Studio material and effect
flows through IndexedDB).

## E2E flows

Thirteen tests: nine carried over from M01–M03, four new in
`apps/web/e2e/materialEffects.spec.ts`. Every M04 assertion measures the real
WebGL canvas via `measureSurface` — local contrast and its direction —
rather than comparing against a stored image. A snapshot would break on any
lighting change while proving nothing about whether two materials differ.

- **Flow A — garment material.** Cotton renders → switch to Jersey → the
  render measurably changes, _and_ jersey's contrast is far more horizontal
  than cotton's (a knit's wales run vertically) → garment colour still works
  → wait for Saved → reload → jersey is still selected _and_ still measures
  as a knit.
- **Flow B — screen print.** Real artwork imported → screen print applied →
  the ink shows the weave where an untreated print is perfectly smooth →
  artwork transformed → garment orbited → the print stays attached.
- **Flow C — embroidery.** Applied on top of a controlled screen-print
  baseline at the same camera and transform → the print has >1.6× the local
  relief → alpha clipping verified (bare fabric beside the print is
  unchanged) → stitch relief slider changes the render → reload restores a
  visually equivalent treatment.
- **Flow D — capability enforcement.** No unsupported fabric or process is
  offered; a seeded hostile project opens, renders and substitutes safely.
- **Flow E — mobile at 390×844.** Material and effect controls reachable,
  ≥36px touch targets, artwork stays visible while adjusting, no horizontal
  overflow.

## Visual QA actually performed

Rendered via Playwright + Chromium against the **production build**
(Claude-in-Chrome MCP unavailable in this environment, as in M00–M03) at
1440×900, 1280×720, 768×1024, 390×844 and 360×800, across twelve states:
cotton/jersey × light/dark garment, artwork with screen print, with
embroidery, embroidery at close viewing distance, transformed artwork with an
effect, the back zone with its own effect, two layers with different effects
in one zone, and the mobile material and effect controls. Screenshots
inspected individually. **Four real defects found and fixed:**

- **Both fabrics looked like knitwear, not apparel.** The first preset values
  put a wale or thread at roughly 8 mm with heavy relief — the garment read
  as corduroy and mesh, exactly the "carpet" failure the brief warns about.
  Fixed by roughly doubling the tile counts (to ~3–4 mm structure) and
  cutting relief by about half. Both now read as credible cloth while
  remaining obviously different from each other.
- **Embroidery relief did not render at all.** Attaching a normal map to a
  material that did not previously have one changes the shader's defines, so
  the program must be rebuilt; letting React set the prop left the old,
  map-less program in place and the stitching simply never appeared. Fixed
  by assigning the map imperatively with an explicit `needsUpdate`, the same
  way the garment material already did.
- **The mobile fabric picker was unreachable.** The Inspector sheet opened
  for every tool _except_ garment — which was harmless in M03 and became a
  dead end in M04, when the fabric picker joined the garment tool. Fixed so
  any tool opens the sheet.
- **The effect controls sat below the mobile fold.** The artwork panel grew
  by a selector, an intensity control and a parameter. The sheet was grown
  from `max-h-72` to `max-h-80`; see Deliberate scope decisions for what was
  _not_ done.

## Accessibility checks actually performed

A real keyboard-driven pass against the production build, asserting actual
DOM and project-state changes rather than inspecting markup. **18/18 passed:**

- Fabric and effect options expose `aria-pressed`, and both groups are
  labelled for assistive tech (`role="group"` + `aria-labelledby`, with a
  per-instance id since the Inspector renders twice).
- Tab reaches the fabric and effect buttons; both show a visible focus ring;
  Enter selects, flips `aria-pressed`, and — verified through IndexedDB —
  actually persists.
- Every effect slider is focusable, responds to arrow keys, and carries an
  `aria-valuetext` matching its visible readout.
- Active fabric and active effect are both marked with a check icon, not
  colour alone.
- The intensity control is labelled for the selected process ("Ink weight"
  vs "Stitch relief"), and an effect's parameter appears only when that
  effect declares one — no inert sliders.

**Not tested:** screen reader (not run — not claimed).

## Performance impact

Measured against the production build:

|                                            | M03    | M04                |
| ------------------------------------------ | ------ | ------------------ |
| `/studio` First Load JS                    | 139 kB | **142 kB** (+3 kB) |
| Chunks deferred until a garment is chosen  | 5      | **5** (unchanged)  |
| `requestAnimationFrame` calls over 3s idle | 0      | **0**              |
| JS heap after first render                 | ~11 MB | **~11 MB**         |

Plus, new this milestone: 12 consecutive fabric switches, 12 consecutive
effect switches and 3 project switches all left the heap flat at 11 MB — no
GPU or JS resource growth from repeated switching. Surface _pixels_ are
generated once and cached module-wide (bounded to 12 entries, ~256 KB each);
each material gets its own cheap `DataTexture` wrapper that it owns and
disposes, so nothing leaks between materials, projects or instances.
Textures are rebuilt only when a value the GPU cares about changes — keyed
on the resolved surface's values, not on object identity.

## Defects discovered and fixed

Beyond the four visual-QA defects above:

- **The plain weave was discontinuous at every thread boundary.** Choosing
  which thread was on top with a parity test of the cell index is a step
  function, so the surface jumped — not only at the tile's edge, where it
  broke tiling outright, but throughout, which bakes into a normal map that
  reads as a hard grid ruled across the shirt. Found by a tiling test,
  diagnosed rather than threshold-adjusted, and fixed by modelling the
  over/under weight as a continuous cosine, which is also the physically
  correct model. Two regression tests.
- **A NaN detail weight produced a black garment.** `Math.max(0, NaN)` is
  `NaN`, so clamping alone did not make a weight safe; it propagated into
  every height, then every normal. Fixed with a finite check.
- **`vector2`/`vector3`/effect parameters accepted `Infinity`.** Extended
  M03's `.finite()` treatment to the material overrides and effect
  parameters.

## Unresolved defects

None known that are in M04's scope. Two observed characteristics, documented
rather than "fixed" because they are correct behaviour:

- **The fabric difference is subtle on a very dark garment.** Black matte
  cotton absorbs almost everything, so its structure barely reads; black
  jersey shows a little more sheen. That is how those fabrics actually
  behave, and the difference is still measurable — but a user who picks black
  first will see less than one who picks natural.
- **The fabric difference is subtle at 390px.** The garment is small enough
  there that the weave approaches sub-pixel, so most of what changes is
  shading. Flow A measures material fidelity at desktop resolution for this
  reason, and Flow E's threshold is set accordingly with that stated in the
  test.

## Deliberate scope decisions

- **`MaterialProperties` overrides are implemented but not exposed.** All
  five map into the render pipeline and are clamped, and a persisted project
  carrying them is honoured — but no slider drives them. `roughness` and
  `normalIntensity` are what the fabric preset _is_, and exposing them would
  be a knob farm rather than a fabric choice. The brief's "don't create
  meaningless knobs" applies.
- **One intensity control per effect, plus one parameter for embroidery.**
  Both visibly change the render, both are labelled for their process, and
  screen print shows no stitch-angle slider because it has no stitch
  direction. Nothing inert was added.
- **The mobile Inspector sheet still scrolls.** It was grown once; growing it
  further would eat the garment preview, which is the product. A scrolling
  bottom sheet is a standard pattern and the section headings make the
  remaining content discoverable.
- **Effects group into consecutive runs**, not buckets. Bucketing by effect
  would be one draw call cheaper in the interleaved case and would silently
  reorder the stack; correctness wins.

## Carried backlog (unchanged, not folded into M04)

- The ~600 ms tab-close autosave data-loss window (M01).
- Keyboard testing of delete/confirm and "New Project" specifically (M01);
  screen-reader testing generally (M00–M04).
- `packages/config` still has no `lint`/`typecheck` scripts of its own.
- `Project.camera`'s persisted `distance`/`target`/`fieldOfViewDegrees` are
  still ignored by the renderer.
- Layer reordering has no UI control (M03).
- Garment version-mismatch UX (`GARMENT_SPEC.md`'s "surface an explicit
  older-version state" rule) is still unimplemented.
- `meshNaming` has no key for a hood or a trouser leg.
- The Essential Tee remains `readiness: "development"` — a procedurally
  generated placeholder garment, honestly labelled.
- No animation, no export, no auth/billing/cloud/admin/AI.

**One backlog item was touched, because M04 depended on it:** Playwright's
default 30s test timeout was raised to 120s in
`apps/web/playwright.config.ts`. The artwork and material/effect journeys
each drive a real WebGL canvas through a dozen-plus screenshot-and-settle
cycles and take ~25–35s alone; under parallel load they exceeded the default
while every assertion still passed. Raising the ceiling was the honest fix —
trimming the measurements to fit would have traded real coverage for a
number.

## Git

- **Branch:** `main`
- **Remote:** `https://github.com/3bud-ZC/ThreadForm.git`
- **M04 implementation commit:** `5ebcc29` — "Milestone 04: material &
  print-effect rendering". This is the commit that contains all M04 code,
  tests and documentation.
- **Current HEAD:** the documentation-only commit that carries this section
  ("docs: record M04 commit hash in STATUS.md"), which sits directly on top
  of `5ebcc29` and changes nothing but these three lines. A commit cannot
  state its own hash; `git log -1` gives it. The distinction matters only so
  that "the M04 commit" is never ambiguous — `5ebcc29` is the one to check
  out to review the implementation.
- **Push:** succeeded — `07c7260..5ebcc29 main -> main`, and the
  documentation commit after it.

## Next milestone

**M05 — Export.** Materials and effects make the Studio's output worth
taking out of the browser, and `docs/EXPORT_SPEC.md` plus
`ExportPreferences` have been modelled since M00 while `exportPreferences`
stays inert. The obvious next step is `export-engine` as the documented
boundary describes — a `Project` plus `ExportPreferences` to a PNG at a
chosen resolution and aspect ratio, rendered off-screen from the same
`3d-engine` scene rather than by screenshotting the viewport, with the
social/commerce target presets the spec already lists. It needs no new
domain modelling, exercises everything M02–M04 built, and turns the Studio
from something you look at into something you ship. Animation (`M06`) is
the larger and riskier piece and reads better after export exists, since a
video export shares most of its machinery.

---

_Last updated: 2026-08-22 (M04 — material-engine, effects-engine, cotton/jersey, screen print/embroidery, procedural surfaces, capability enforcement, visual + keyboard QA, fixes)._
