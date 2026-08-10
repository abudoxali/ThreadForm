# ThreadForm — Product Specification

## Purpose

ThreadForm is a browser-based 2D/3D apparel design and mockup studio. It lets a
user turn artwork into realistic, exportable apparel visuals without
installing software or creating an account.

## Target users

- Clothing brands and small labels producing product photography.
- Print-on-demand sellers who need fast, consistent mockups per SKU.
- Independent designers prototyping apparel concepts.
- Marketers and creators producing social-ready apparel visuals.

## Core workflow

1. Choose a garment (data-driven, from the garment library — see
   `GARMENT_SPEC.md`).
2. Upload artwork and place it on the garment's print zones.
3. Adjust garment color and material.
4. Apply print/fabric effects to individual artwork layers.
5. Direct the shot: camera, lighting, environment, background.
6. Optionally animate the garment or camera.
7. Export an image, video, or 3D file sized for the target platform.

The 3D Studio and the 2D Studio (flat lay, hanging, ghost model, and similar
mockup templates) both operate on the same underlying `Project` — see
`PROJECT_SCHEMA.md` — so switching between them does not require re-doing
artwork placement or garment/material choices that both editors understand.

## Free vs. Pro

Access is entitlement-based, not mode-based: the Studio checks _what a user is
entitled to_, not _whether they are logged in_. See `ARCHITECTURE.md` for why
this matters architecturally.

**Free** — no signup required:

- Standard garments and templates.
- Local, browser-only projects.
- Standard-resolution export, potentially watermarked.

**Pro** (future, not built in M00):

- High-resolution/4K, 60 FPS export, no watermark.
- Commercial-use entitlement.
- Premium garments, animations, and effects.
- Cloud projects and cross-device sync.

## Local-first principle

The core editor must work fully for a guest with no account: garment choice,
artwork placement, material/effect edits, camera/lighting direction, and
export. Project state and uploaded artwork persist in the browser (see
`PRIVACY_SECURITY.md`). An account is only required for cloud sync and future
billing-gated features — never for basic Studio operation.

## Future accounts / cloud

An optional account will enable saving projects to the cloud and syncing
across devices. This is additive: it must not become a dependency for
features that are otherwise free and local.

## Future admin

An internal admin/CMS will eventually manage garments, materials, effects,
animations, backgrounds, categories, users, subscriptions, and feature flags.
Not built in M00; the data-driven garment/material/effect contracts in
`packages/types` are what the admin will eventually publish into.

## Non-goals for this milestone (M00)

- No working 3D/2D renderer — the Studio shell is a real, honest empty state,
  not a mocked-up editor.
- No authentication, billing, or cloud sync.
- No garment/material/effect asset pipeline — only the contracts they will
  populate.
- No production export pipeline — only its architectural boundary.
