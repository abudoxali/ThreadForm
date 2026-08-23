# ThreadForm — Claude Code Guide

ThreadForm is a browser-based 2D/3D apparel design and mockup studio
(same product category as VirtualThreads; original architecture, assets, and
UI — never copy their code, assets, or layout). Full product context:
`docs/PRODUCT.md`. Architecture and dependency direction: `docs/ARCHITECTURE.md`.

## Monorepo

pnpm workspaces + Turborepo.

```
apps/web              Next.js app — marketing site (/) and Studio (/studio)
packages/types         Strict TS domain contracts (Project, Garment, Material, ...)
packages/project-engine  Pure functions: create/validate/migrate/mutate a Project
packages/local-storage   IndexedDB persistence adapter (save/load/list/delete a Project)
packages/garment-runtime  Garment manifest schema/validation, catalog, camera presets,
                         print-zone lookup, legacy-reference resolution — no rendering
packages/artwork-engine  Artwork trust boundary: file-signature sniffing, size/dimension
                         limits, SVG sanitization, decode + object-URL lifetime
packages/material-engine Fabric presets -> clamped renderer surface parameters (no GPU)
packages/effects-engine  Print-process presets -> clamped print parameters, with a
                         per-kind allow-list for effect parameters (no GPU)
packages/export-engine   Export decisions as pure data: resolution/aspect -> pixel
                         dimensions, target presets, format capability + MIME mapping,
                         deterministic filenames, job contracts (no DOM/storage/GPU)
packages/3d-engine       React Three Fiber garment canvas: GLB loading, lighting rig,
                         camera framing/orbit, color, print-zone artwork overlays,
                         error boundary, and the off-screen export renderer
packages/ui             Design tokens (tokens.css) + presentational React primitives
packages/config         Shared tsconfig + ESLint flat configs
assets/garments/        Source-of-truth original garment assets (GLB + manifest.json +
                         PROVENANCE.md), copied into apps/web/public/garments for serving
scripts/                Asset generation/verification scripts (the procedural garment
                         generator/verifier — see PROVENANCE.md — and the E2E artwork
                         fixture generator)
docs/                  Product, architecture, design, schema, garment, export, privacy specs
```

`apps/web/src/lib/projectRepository.ts` is the only place that combines
`project-engine` (domain logic) with `local-storage` (persistence); the
`useStudioProject` hook (`apps/web/src/hooks`) is the only place that wires
that repository into React state (debounced autosave, restore-on-mount).
Components call the hook, never the repository or `local-storage` directly.
Material and print-effect presets live in `material-engine`/`effects-engine`,
never in Three.js or a component: a fabric is data that resolves to clamped
surface parameters, so it can be authored and tested without a GPU. A garment
manifest's `supportedMaterials`/`supportedEffects` is the authority on what
may be offered, intersected with what the build actually implements — never
expose a `MaterialId`/`EffectKind` union member with no implementation
behind it.

`useResolvedGarment` (`apps/web/src/hooks`) resolves a `Project`'s
`GarmentReference` against `garment-runtime`'s catalog/manifest and is the
only place that does so; `useArtworkAssets` is the only place a stored
artwork `blobId` becomes a decoded image, and the only place its object URL
is released. `StudioShell` renders `3d-engine`'s `StudioGarmentCanvas` from
the result — never inline Three.js in a component. `useImageExport` is the
only place export meets storage: `export-engine` decides dimensions,
formats and filenames but must never learn where a `blobId`'s bytes live,
so the hook resolves assets and hands `renderGarmentImage` already-decoded
artwork. Export renders off-screen at the requested size through the same
`GarmentScene` the Studio uses — never a screenshot of the viewport, and
never a second visual system.

Other packages named in `docs/ARCHITECTURE.md` (2d-engine, animation-engine,
entitlements, analytics) are
**documented boundaries, not yet implemented**. Do not create empty
placeholder packages for them — build them when there is real logic to put
inside.

## Commands

Run from the repo root (Turborepo fans out per package):

- `pnpm install` — install (uses the lockfile; never skip it in CI).
- `pnpm dev` — run the web app locally.
- `pnpm lint` / `pnpm typecheck` / `pnpm test` — per-package via Turborepo.
- `pnpm test:e2e` — Playwright suite (`apps/web/e2e`), run in CI; requires a
  build first (`pnpm --filter @threadform/web build`) since it drives
  `next start`. Chromium only — `npx playwright install chromium` once locally.
- `pnpm build` — production build of every package/app.
- `pnpm format` / `pnpm format:check` — Prettier.

## Standards

- TypeScript strict mode everywhere. No `any`, no unsafe casts. Prefer
  discriminated unions over optional-field soup (see `packages/types`).
- Dependency direction is one-way: UI → project state → domain engines →
  garment runtime → renderer/persistence/export adapters. Never let a
  component do rendering, persistence, entitlement checks, and domain
  mutation all at once — see `docs/ARCHITECTURE.md`.
- Domain mutation happens through `project-engine` functions
  (`addArtworkLayer`, `reorderArtworkLayer`, ...), never by hand-editing a
  `Project` object's fields inline.
- Entitlement checks (free vs. Pro) go through a single boundary when that
  package exists — never `if (user.pro)` scattered through code.
- Design: dark-first, restrained, one accent color, no gimmicks — see
  `docs/DESIGN_SYSTEM.md`. Use `packages/ui` primitives and `--tf-*` tokens;
  don't hand-roll one-off colors or spacing.
- Accessibility is not optional: semantic HTML first, visible focus states,
  labeled icon-only controls, no color-only affordances.

## No fake implementations

Never present a control as functional when it isn't wired to real behavior.
If a feature doesn't exist yet (e.g. animation, or video/3D export — still
ahead as of M05), the UI must say so
honestly (disabled state + explanatory `title`, or descriptive placeholder
copy) rather than simulate output. No fake social proof, no fake metrics, no
placeholder data presented as real.

## Before editing

Inspect before you change: `git status`, read the file you're about to edit,
and check whether existing tests/docs already describe the intended
behavior. Never touch unrelated production code to "clean up" while doing a
focused task — scope changes to what was asked.

## Git

Remote: `https://github.com/3bud-ZC/ThreadForm.git`, default branch `main`.
Never force-push, never rewrite published history, never commit secrets or
`.env*` files. Inspect `git status`/`git diff` before committing; commit only
intentional changes.

## Verification & status

After meaningful work: run the relevant lint/typecheck/test/build commands
and report exact results — never claim a check passed without running it.
Update the single `STATUS.md` at the repo root (never create a second status
file) with honest completion percentages and what was and wasn't verified.

## Reusable workflows

Procedural checklists live in `.claude/skills/` (`threadform-visual-qa`,
`threadform-change-review`, `threadform-milestone-closeout`) and
`.claude/rules/` — consult those instead of re-deriving the process here.
