# ThreadForm — Status

**Project:** ThreadForm — browser-based 2D/3D apparel design & mockup studio
**Current milestone:** M00 — Product, Architecture, Claude Code Skills & Design Foundation
**Milestone state:** PASS
**Overall project completion:** ~8% (foundation only — no garment/3D/2D engine, no persistence, no auth/billing exist yet; those are the bulk of the product)
**M00 completion:** ~97%

## Completed work

**Repository & tooling**
- pnpm workspaces + Turborepo monorepo, `.gitignore`, `.editorconfig`, Prettier (with `prettier-plugin-tailwindcss`), root scripts (`dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `format`).
- `packages/config` — shared strict `tsconfig` bases + ESLint 9 flat configs.

**Domain foundation**
- `packages/types` — strict TypeScript contracts for the full `Project` domain model (garment, material, artwork layers, print zones, effects, animation, camera, lighting, background, export preferences), discriminated unions where they add correctness, schema-version constant.
- `packages/project-engine` — pure functions: `createProject`, artwork-layer operations (`addArtworkLayer`, `removeArtworkLayer`, `duplicateArtworkLayer`, `reorderArtworkLayer`, `centerArtworkLayer`), `zod`-based `validateProject` at the trust boundary, `migrateProject` scaffold. Every enum in the `zod` schema is pinned to its `@threadform/types` union via `satisfies readonly X[]`, so a union member added to the type without updating the schema is a compile error, not a silent runtime rejection. 18 Vitest unit tests, all passing.
- `packages/ui` — dark-first design tokens (`tokens.css`, with a reserved light-theme block) and presentational primitives (`Button`, `IconButton`, `Panel`, `VisuallyHidden`). 3 component tests passing.

**Application**
- `apps/web` — Next.js 15 / React 19 / Tailwind v4, TypeScript strict.
  - `/` — original marketing landing page (hero, 4-step workflow, capability list, local-first note, footer). No fake social proof, no fake stats, no stock content.
  - `/studio` — real Studio shell: topbar, icon tool rail, canvas, inspector, responsive down to mobile (bottom tool bar + collapsible inspector via native `<details>`). Garment-category picker is real and interactive; everything that depends on a garment/3D engine is explicitly disabled (`aria-disabled` + explanatory `title`, still focusable so the explanation is reachable by keyboard and mouse), and the inspector says outright that it isn't wired to a garment engine yet. No fake 3D/garment rendering.
  - 4 component/route smoke tests passing (Vitest + Testing Library).
  - Playwright configured (`test:e2e`) with a home→Studio smoke flow, tool-rail unlock flow, and a mobile-overflow check. Not run in CI (see Known Issues).

**Docs** (`docs/`): `PRODUCT.md`, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, `PROJECT_SCHEMA.md`, `GARMENT_SPEC.md`, `EXPORT_SPEC.md`, `PRIVACY_SECURITY.md`.

**Claude Code intelligence**
- `CLAUDE.md` — concise, project-specific.
- `.claude/rules/` — `architecture-boundaries.md`, `frontend-quality.md`, `testing-qa.md`, `security-privacy.md`.
- `.claude/skills/` — `threadform-visual-qa`, `threadform-change-review`, `threadform-milestone-closeout`, each a valid `SKILL.md` with frontmatter. All three were actually invoked during this milestone's closeout (not just written and left untested) — see Verification below.

**CI**: `.github/workflows/ci.yml` — install (frozen lockfile) → lint → typecheck → test → build, on push/PR to `main`.

## Acceptance criteria

**Repository** — [x] initialized/configured · [x] pnpm + lockfile · [x] Turborepo working · [x] no secrets/junk (verified via `git status`)

**Claude Code** — [x] `CLAUDE.md` · [x] `.claude/rules/` · [x] `threadform-visual-qa` · [x] `threadform-change-review` · [x] `threadform-milestone-closeout` · [x] valid frontmatter/conventions

**Product** — [x] PRODUCT.md · [x] ARCHITECTURE.md · [x] DESIGN_SYSTEM.md · [x] PROJECT_SCHEMA.md · [x] GARMENT_SPEC.md · [x] EXPORT_SPEC.md · [x] PRIVACY_SECURITY.md

**Domain** — [x] core TS contracts · [x] strict/type-safe (zero `any`, zero non-null assertions; three `as` casts total, each justified and reviewed: `as HexColor` after regex validation, `raw as Record<string, unknown>` after a `typeof`/`null` guard, one in a test deliberately constructing invalid input) · [x] schema versioning scaffolded, with enum lists compile-time-pinned to their types · [x] non-trivial behavior tested (18 tests)

**UI** — [x] `/` renders · [x] `/studio` renders · [x] original visual identity (warm-copper accent, no generic AI-purple/glassmorphism) · [x] desktop polish · [x] tablet usable · [x] mobile usable · [x] no fake garment functionality · [x] no fake social proof · [x] no major a11y defects found after fix (see Verification — one real defect was found and fixed, not just found)

**Quality** — [x] lint passes (0 errors, 0 warnings) · [x] typecheck passes · [x] unit tests pass (25/25) · [x] production build passes · [x] browser smoke via Playwright: no console errors, no horizontal overflow at 6 viewports · [x] no known console/hydration errors · [x] final diff reviewed (via `threadform-change-review`)

**CI** — [x] GitHub Actions workflow exists and covers install/lint/typecheck/test/build

**Status** — [x] exactly one `STATUS.md` · [x] reflects actual state · [x] verification evidence below is real, not fabricated

## Verification performed

All commands run from the repo root unless noted.

- `pnpm install` — succeeded (approved `esbuild`/`sharp`/`unrs-resolver` postinstall scripts via `pnpm-workspace.yaml`'s `allowBuilds`).
- `pnpm typecheck` — **4/4 packages passed.**
- `pnpm lint` — **4/4 packages passed, 0 errors, 0 warnings** (two Next.js `import/no-anonymous-default-export` warnings and one `next-env.d.ts` triple-slash-reference error were found and fixed during this pass).
- `pnpm test` — **25/25 tests passed** across `project-engine` (18), `ui` (3), `web` (4).
- `pnpm build` — **succeeded.** `apps/web` production build: 3 static routes (`/`, `/studio`, `/_not-found`).
- `pnpm format` — verified working after fixing a real bug (see below); not run as a CI gate (see Known Issues).

### Independent engineering review (`pr-review-toolkit:code-reviewer` subagent)

Run against the whole repo — architecture boundaries, type safety, dead code/deps, security, config correctness, and whether `/studio`'s "no fake functionality" rule actually held in the rendered output. This is the process the `threadform-change-review` skill exists to run.

**Confirmed and fixed, most severe first:**
1. **Critical — Tailwind v4 was never scanning `packages/ui/src`.** `apps/web`'s automatic content detection only walks its own subtree, so `packages/ui` (reached only via a pnpm symlink) was invisible to it. Verified directly against the built CSS: `.h-9`, `.h-10`, `.rounded-lg`, `disabled:opacity-40`, and `disabled:pointer-events-none` were genuinely absent — every `IconButton` in the tool rail was rendering at its bare ~20px icon size with no visible disabled state, silently breaking both the ≥36px touch-target rule and the "disabled controls must look disabled" honesty rule. **Fixed** by adding `@source '../../../../packages/ui/src';` to `globals.css`; rebuilt and confirmed all five classes now present in the compiled stylesheet, then re-ran the full visual QA pass (see below) and visually confirmed the tool rail now renders disabled tools dimmed and enabled tools at full size.
2. **Critical — `prettier-plugin-tailwindcss` was referenced in `.prettierrc.json` but never installed.** Every Prettier invocation failed (with exit code 0, so it fails open). **Fixed** by adding it to root `devDependencies`; `npx prettier --version` and dependency resolution now succeed.
3. **Important — `ToolRail`'s disabled tools used the native `disabled` attribute alongside an explanatory `title`.** Native `disabled` removes an element from the tab order and (once finding 1 was fixed and `disabled:pointer-events-none` actually started applying) blocks the hover that would show the tooltip — making the explanation unreachable by keyboard or mouse. **Fixed** by switching to `aria-disabled` + a guarded no-op `onClick` (the guard already existed in `StudioShell.selectTool`), keeping the control focusable and hoverable. Updated the two tests that asserted native `disabled`; added a Playwright assertion that the title is reachable while `aria-disabled`.
4. **Important — the `zod` schema in `project-engine` duplicated eight `packages/types` unions as plain string arrays**, so a category/zone/etc. added to a type without updating the schema would compile cleanly and then silently reject valid saved projects at the trust boundary. **Fixed** — every list is now `as const satisfies readonly X[]` against its source type.
5. **Important — `apps/web` declared `@threadform/project-engine` as a runtime dependency it never imports**, and `@threadform/types` (type-only usage) was listed under `dependencies` instead of `devDependencies`. **Fixed** — removed the unused dependency and its `transpilePackages` entry, moved `types` to `devDependencies`.
6. **`centerArtworkLayer` was missing the not-found guard every sibling mutator has**, so calling it with an unknown layer id allocated a fresh `Project` and bumped `updatedAt` for a no-op change. **Fixed** with the same guard pattern as `removeArtworkLayer`/`reorderArtworkLayer`; added the matching test.
7. **`project-engine` used `crypto.randomUUID()`'s types without declaring `@types/node`**, relying entirely on pnpm's transitive hoisting. **Fixed** by declaring it explicitly.
8. **The hex-color regex accepted invalid lengths** (5- and 7-digit hex strings, e.g. `#12345`). **Fixed** to only accept 3/4/6/8-digit forms.
9. **Landing-page copy asserted local persistence in the present tense** ("Guest projects live in your browser") while `docs/PRIVACY_SECURITY.md` explicitly states no persistence exists yet in M00. **Fixed** to "are designed to stay in your browser."
10. **`VisuallyHidden` was exported and documented but had zero call sites and no test**, and was silently broken by finding 1 (relied only on an inline `clip` style with no fallback). Left in the package as a legitimate not-yet-consumed primitive (consistent with `packages/ui` shipping primitives ahead of use), but added a render test now that its CSS classes actually apply.
- Also fixed two minor doc/comment inaccuracies the review surfaced (`ARCHITECTURE.md` overstating `packages/types` as having no runtime code at all; a stale comment in `eslint/nextjs.mjs`), and added a version-must-increase guard to `migrateProject` to prevent a latent infinite loop in a future migration.
- **Not fixed (logged as a real gap, not silently dropped):** `packages/config` declares no `lint`/`typecheck` scripts for its own `.mjs` files; `MarketingHeader`'s in-page anchor nav (Workflow/Capabilities/Local-first) is hidden below `md` with no mobile equivalent (content is still reachable by scrolling); the root `tsconfig.json` isn't wired to anything and would error if invoked directly. None of these affect the shipped app; deferred rather than scope-creeping this closeout.

All of the above were re-verified after fixing: `pnpm typecheck`, `pnpm lint`, and `pnpm test` were re-run clean (25/25 tests, 0 lint errors/warnings), and `pnpm build` was re-run successfully.

### Visual QA (`threadform-visual-qa` skill, run twice — before and after the Tailwind fix)

Claude-in-Chrome MCP browser tool was unavailable in this environment (extension not connected); Playwright + real headless Chromium was used instead for actual rendering, not CSS-in-the-abstract reasoning.

- **First pass** (before the Tailwind `@source` fix) captured full-page screenshots of `/` and `/studio` at 1440×900, 1280×720, 1024×768, 768×1024, 390×844, 360×800 (12 renders) plus an interaction flow (select a garment category → tool rail unlocks → inspector updates → switch tool). No horizontal overflow at any viewport, no console errors — but the tool rail's disabled/enabled visual distinction was not actually inspected closely enough to catch finding 1 at the time; the independent engineering review caught it by inspecting the compiled CSS directly.
- **Second pass** (after the fix) re-ran the identical 12-viewport + interaction suite. Confirmed: still no horizontal overflow, no console errors, and — visually confirmed by re-reading the screenshots — the tool rail now clearly renders disabled tools dimmed (`opacity-40`) and the active/enabled tool at full brightness and correct 36×36px size, where before the fix all icons looked visually identical regardless of state.
- **Not tested:** keyboard-only tab-order was not manually driven end-to-end (focus-visible CSS is present and inspectable, but not walked interactively); no real screen reader was used; `pnpm test:e2e` (the committed Playwright suite) was not run in CI or against a production build in this pass — the ad hoc QA harness above covered the same routes/viewports and was removed after use to keep it out of the deliverable.

## Known issues

- No garment/3D/2D rendering engine exists yet — by design for M00.
- No persistence layer (`local-storage`/IndexedDB) exists yet — `project-engine`'s `createProject`/`validateProject` are ready for it, but nothing calls them from the UI yet.
- `pnpm test:e2e` and `pnpm format:check` are configured but not run in CI. Deliberate for `test:e2e` at this stage (no persisted state yet worth regression-testing in a browser matrix); `format:check` should arguably be added to CI now that the plugin actually works — not done in this pass.
- Keyboard-only navigation and screen-reader behavior were not manually walked end-to-end — only inspected structurally.
- `packages/config`'s own `.mjs` files aren't linted/typechecked by any script.
- Git repository was initialized this session; commit/push happens immediately after this file is finalized.

## Blockers

None.

## Git

- **Branch:** `main`
- **Remote:** `https://github.com/3bud-ZC/ThreadForm.git` (empty on GitHub; local git identity and `gh` auth both confirmed working)
- **Commit:** `d3e789a` — pushed to `origin/main`.

## Next milestone

**M01 — Local-first project persistence.** Wire `project-engine`'s `createProject`/`validateProject` to a real `local-storage` package (IndexedDB-backed), make the Studio's garment picker actually create and persist a `Project`, and make the Inspector read/write real project fields instead of local UI state.

---
*Last updated: 2026-08-10 (M00 — initial pass + independent review + fixes).*
