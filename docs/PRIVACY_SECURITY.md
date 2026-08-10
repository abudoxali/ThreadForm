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

**Artwork upload does not exist yet** — M01 introduces real project
persistence, not artwork. `ArtworkLayer`/`ArtworkSource` remain domain types
only; no UI path creates one yet. The object-URL and SVG-safety guidance
below is the boundary that artwork upload (a later milestone) must respect.

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

## Object URL lifecycle

`ArtworkSource` (`packages/types/src/artwork.ts`) deliberately stores a
`blobId` referencing persisted storage, never a raw `URL.createObjectURL()`
string — object URLs are session-scoped and revoked on reload, so persisting
one would silently break on the user's next visit. Any future code that
creates an object URL for display must revoke it (`URL.revokeObjectURL`) when
the owning component unmounts or the layer is removed, to avoid leaking
memory over a long editing session.

## SVG safety

SVG is an accepted artwork format (`ArtworkFileKind`). SVG can contain
`<script>`, external references, and event handler attributes. The future
artwork-import path must sanitize SVGs before rendering or rasterizing them —
strip scripts, foreignObject, and external resource references — and must
never render an uploaded SVG in a context that grants it the app's own
origin/privileges (e.g. never via `dangerouslySetInnerHTML` on trusted-origin
markup, never as a same-origin iframe without a sandboxed, restricted
`allow`/`sandbox` policy).

## File validation

Any future upload path must validate: declared MIME type against actual file
signature (not filename extension alone), file size ceiling, and image
dimensions before decoding — to avoid decompression-bomb-style resource
exhaustion from a single oversized image.

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
