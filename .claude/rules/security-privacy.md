# Security & privacy

Full rationale: `docs/PRIVACY_SECURITY.md`.

- Never commit secrets, tokens, credentials, or `.env*` files. If you see one
  staged, stop and flag it — don't commit it "to be safe."
- Artwork is local-first by design: no upload path should exist for guest
  data unless the user takes an explicit cloud-sync action after opting into
  an account (that feature does not exist yet).
- `ArtworkSource` stores a `blobId` referencing persisted storage, never a
  raw `URL.createObjectURL()` string (object URLs don't survive reload). Any
  object URL created for display must be revoked when no longer needed.
- SVG artwork must eventually be sanitized before render/rasterize (strip
  scripts, `foreignObject`, external references) and never rendered via
  `dangerouslySetInnerHTML` on untrusted content or an unsandboxed iframe.
- No user-generated content (project/artwork names) is ever rendered as raw
  HTML — rely on React's default text escaping; don't introduce
  `dangerouslySetInnerHTML` for user content.
- Any future file upload validates declared MIME type against the actual
  file signature and enforces a size ceiling before decoding.
