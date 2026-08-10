# ThreadForm — Privacy & Security

This describes what M00 actually guarantees and what is architecturally
intended for later. It does not promise anything the current implementation
cannot back up.

## Local-first artwork (intended architecture, not yet implemented)

Guest artwork and project data are designed to live in the browser (future
`local-storage` package, IndexedDB-backed) and are not intended to be
uploaded anywhere unless the user takes an explicit cloud-sync action after
opting into an account. **As of M00, no artwork upload or persistence exists
at all** — this section describes the boundary the next milestone must
respect, not a shipped guarantee.

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
