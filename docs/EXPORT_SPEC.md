# ThreadForm — Export Specification

Not implemented in M00. This defines the boundary the future `export-engine`
package must honor, and the preferences already modeled in
`packages/types/src/export.ts`.

## Boundary

`export-engine` takes a `Project` (rendered state) + `ExportPreferences` and
produces a file. It does not know about entitlements (that's
`entitlements`'s job — the Studio checks `can(user, 'export:4k')` before ever
calling into `export-engine`) and does not know about UI (it is called from a
thin Studio action, not the reverse).

## Images

- Formats: PNG, JPG, WEBP, transparent PNG.
- Resolutions: 720p, 1080p, 1440p, 4K.
- Deterministic output: identical `Project` + `ExportPreferences` must produce
  pixel-identical output, modulo font/GPU rendering differences already
  inherent to the browser — no randomized watermark placement, no
  timestamp-dependent rendering.

## Video

- Formats: WebM (broad browser support via `MediaRecorder`), MP4 where the
  browser's encoder supports it — MP4 is not guaranteed client-side across all
  browsers, so the engine must report capability rather than assume it.
- Frame rates: 24 / 30 / 60 FPS.
- Same resolution tiers as images.

## Aspect ratios & platform presets

`1:1`, `4:5`, `9:16`, `16:9`, and `custom` (explicit width/height). Platform
presets (Instagram, TikTok, YouTube Shorts, Shopify, Amazon, Etsy) are named
combinations of aspect ratio + resolution, not a separate code path — adding
one is a data entry, not a new export mode.

## 3D export

Reserved: GLB, glTF, and USDZ (for AR Quick Look on iOS) where the
in-browser export pipeline can produce them without a server round-trip.

## Client-side vs. server-side

Default is fully client-side (canvas/WebGL capture, `MediaRecorder` for
video). A server-side fallback is architecturally allowed for cases the
browser can't handle alone (e.g. guaranteed MP4, very long video) but must be
an explicit, separate adapter behind the same `export-engine` interface — not
a silent fallback that changes output determinism or leaks project data
without the user's awareness.

## Entitlement boundary

Resolution/frame-rate ceilings, watermarking, and commercial-use terms are
entitlement decisions, checked once before invoking `export-engine` — the
engine itself has no concept of "Pro."
