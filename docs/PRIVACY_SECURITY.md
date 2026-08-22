# ThreadForm — Privacy & Security

This describes what the current implementation actually guarantees and what
is architecturally intended for later. It does not promise anything the code
cannot back up.

## Local-first project data (implemented, M01)

Guest project data — the `Project` document itself (garment reference,
metadata, name) — is persisted in the browser via IndexedDB
(`packages/local-storage`) and is never sent to a server: there is no backend
in this repository, no upload endpoint, and no network call in the save/load
path. Opening `/studio`, choosing a garment, renaming a project, reloading,
and switching between local projects all work fully offline once the page
has loaded.

Artwork (M03) is local-first on the same terms: an imported file is read in
the browser, stored in IndexedDB, and never leaves the device. There is no
upload endpoint, and the import path makes no network request of any kind.

## Garment assets (M02)

M02 introduces the Studio's first `fetch()` calls: `packages/garment-runtime`
loads a garment's `manifest.json`, and `@react-three/drei`'s `useGLTF` loads
its `model.glb`. Both are same-origin requests to files `apps/web` serves
from its own `public/garments/` directory (copied from the versioned
`assets/garments/` source of truth) — no third-party host, no user data sent
in the request, and no project/artwork content leaves the browser. The
manifest response is zod-validated before use (same untrusted-until-validated
pattern as a stored `Project`); an invalid or unreachable manifest surfaces
as an honest error state, never a silent fallback to guessed data.

## Artwork import (implemented, M03)

Every uploaded file passes through `packages/artwork-engine` before anything
else in the app sees it. That module is the whole boundary, and it is
deliberately the only place these decisions are made:

- **Identity comes from the bytes.** `sniffArtworkFileKind` reads the file's
  actual signature (PNG/JPEG/WebP magic numbers; a structural check for SVG).
  `File.type` and the filename extension both come from the operating
  system's extension mapping and change when a file is renamed, so neither is
  consulted. A text file named `logo.png` and served as `image/png` is
  rejected.
- **Size is bounded before decoding.** A 12 MB file ceiling, plus per-axis
  (8192 px) and total-pixel (40 megapixel) limits read out of the image's own
  header by `readImageHeaderSize`. This ordering is the point: a
  decompression bomb is a few kilobytes of entirely valid PNG that declares a
  30000×30000 canvas, and by the time an `<img>` could report its
  `naturalWidth` the gigabytes are already allocated.
- **SVG is rebuilt, not filtered.** `sanitizeSvg` parses the document with
  `DOMParser` and re-serializes only what survives: `<script>`,
  `<foreignObject>`, `<iframe>`, animation elements that can retarget an
  attribute, every `on*` handler, every non-fragment `href`/`xlink:href`,
  `@import` and external `url()` in CSS, and any doctype or processing
  instruction outside the root are all removed. Parsing first defeats the
  entity-encoding and attribute-quoting tricks that beat regex-based
  filtering. The bytes written to storage are the rebuilt document, so the
  hostile original is never persisted.
- **Rendering is inert by construction.** Artwork is drawn into a canvas via
  an `<img>` element and uploaded as a WebGL texture. It is never inserted
  into the page's DOM, never passed to `dangerouslySetInnerHTML`, and never
  given a same-origin document context.
- **Persisted bytes are re-checked.** Storage is a trust boundary of its own,
  so `decodeStoredArtwork` re-sniffs and re-sanitizes on every read and
  refuses a blob whose real signature contradicts what the project records —
  the same untrusted-until-validated pattern `local-storage` applies to a
  stored `Project`.
- **Rejections are honest and recoverable.** An unsupported or damaged file
  produces a specific, user-facing message beside the control that was used,
  and nothing is written to storage. It never silently does nothing, and it
  never falls back to a placeholder image.

## Object URL lifecycle

`ArtworkSource` (`packages/types/src/artwork.ts`) deliberately stores a
`blobId` referencing persisted storage, never a raw `URL.createObjectURL()`
string — object URLs are session-scoped and revoked on reload, so persisting
one would silently break on the user's next visit.

As of M03 this is enforced in exactly one place. Every decode returned by
`artwork-engine` carries its own `release()`, and
`apps/web/src/hooks/useArtworkAssets.ts` is the sole owner of when that is
called: it reconciles the set of blob ids a project references against the
set it currently holds, releasing anything no longer referenced. Deleting a
layer, replacing its artwork, switching projects and unmounting the Studio
therefore all clean up through the same path, rather than each needing to
remember its own. The failure paths release too, before returning the error.

## SVG safety

SVG is an accepted artwork format (`ArtworkFileKind`), and it is a full XML
document format that can carry `<script>`, embedded HTML via
`<foreignObject>`, event-handler attributes, and external resource
references. The rule stands unchanged: an uploaded SVG is sanitized before it
is rendered or rasterized, and is never rendered in a context that grants it
the app's own origin or privileges — never via `dangerouslySetInnerHTML` on
trusted-origin markup, and never as an unsandboxed same-origin iframe.

Implemented in M03 by `sanitizeSvg` — see "Artwork import" above for what it
removes and why it parses rather than pattern-matches. Its regression tests
(`packages/artwork-engine/src/sanitizeSvg.test.ts`) assert on what is
_absent_ from the rebuilt document, since that is what actually protects the
user. Any future SVG entry point (a template library, a cloud-sync
response, an imported project file) must go through the same function; it is
not specific to the upload path.

## File validation

Any upload path validates: the file's actual signature (never its declared
MIME type or filename extension), a file-size ceiling, and image dimensions
read from the header _before_ decoding — to avoid decompression-bomb-style
resource exhaustion from a single small file. Implemented in M03; see
"Artwork import" above for the specific limits.

## Effect parameters (M04)

`EffectConfiguration.parameters` is an open `Record<string, number>` in the
domain model and a strictly allow-listed one at the point of use. Persisted
project data is untrusted input, and an open-ended record of numbers flowing
into a renderer is how a shader parameter becomes an injection surface — so
`@threadform/effects-engine` keeps only the keys the effect's own preset
declares, clamps each to its declared range, and substitutes a deterministic
default for anything missing or non-finite. A stored `{ displacementScale:
9999 }` or `{ __proto__: 1 }` is dropped, not forwarded.

The same reasoning covers material overrides: `MaterialProperties` values are
clamped by `@threadform/material-engine` before reaching Three.js. A NaN or
negative roughness does not throw — it silently renders a black or blank
garment, which reads as a renderer bug rather than as bad data.

No effect or material introduces user-supplied GLSL, and none fetches an
external asset at runtime: every fabric and thread surface in the Studio is
generated procedurally in code (see `ARCHITECTURE.md`), so there is nothing
to fetch and no third-party texture to trust.

## XSS prevention

No user-generated content (artwork names, project names) is ever rendered as
raw HTML. React's default text rendering already prevents this as long as
`dangerouslySetInnerHTML` is not introduced for user content — this repo does
not use it.

## Secrets

No API keys, tokens, or credentials are committed to this repository. `.env*`
files are gitignored. CI must source any future secrets from GitHub Actions
secrets, never from a committed file.

## Future authentication & cloud boundaries

When authentication ships, it must not become a requirement for any feature
that is currently free and local (see `PRODUCT.md`). When cloud project sync
ships, uploading a project is an explicit user action, not a background
default — a guest's local project must never be silently transmitted.
