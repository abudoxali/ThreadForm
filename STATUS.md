# ThreadForm — Status

**Project:** ThreadForm — browser-based 2D/3D apparel design & mockup studio
**Current milestone:** M01 — Local-First Project Persistence & Real Studio Project State
**Milestone state:** PASS
**Overall project completion:** ~14% (foundation + real local persistence exist; no garment/3D/2D rendering, no artwork, no auth/billing — those remain the bulk of the product)
**M01 completion:** ~96%

## Completed work

**`packages/local-storage` (new)** — IndexedDB persistence via `idb` (justified: a ~1KB Promise wrapper over the same native API, not a framework; tested against real IndexedDB semantics via `fake-indexeddb`, never a hand-rolled mock). Database `threadform` v1, two object stores: `projects` (keyed by id, indexed by `updatedAt`) and `meta` (holds the "last opened project" pointer). Every read runs the stored payload through `project-engine`'s `migrateProject` + `validateProject` (via `validateProject` alone, which does both) before it's trusted; a record that fails is left untouched in storage and surfaces as `InvalidProjectDataError` — never silently deleted or overwritten. Recovers from a closed/terminated connection (`terminated`/`blocking` handlers) instead of failing every future write until a page reload. 17 tests against real fake-indexeddb: save/load round-trip, update-not-duplicate semantics, corrupt-data and unknown-schema-version handling (record left in place), listing order, delete, existence checks, and IndexedDB-unavailable handling.

**`apps/web/src/lib/projectRepository.ts` (new)** — the only module that combines `project-engine` (domain logic) with `local-storage` (persistence): create+persist, open, save, delete, list recents, restore-last-opened (never throws; clears a stale pointer and falls back to the start state).

**`apps/web/src/hooks/useStudioProject.ts` (new)** — the only place that wires the repository into React. Debounced (600ms) autosave with a monotonic "epoch" so a stale or in-flight write can't flip the save indicator after a newer edit or a project switch; pending-save cancellation ordered *before* delete so a queued write can't resurrect a just-deleted record; a best-effort `pagehide` flush so a rename typed right before navigating away isn't dropped. 10 tests (mocked repository, fake timers) covering initial restore, garment-choice creation, debounce collapsing, save-failure honesty, and delete-current-vs-other-project behavior.

**Studio UI, rewired to a real `Project`** — `StudioShell`/`StudioTopbar`/`Inspector`/`GarmentPicker` now read the garment, project name, and tool-rail unlock state from the hook's `project`, not local UI state (only `activeTool` remains local — genuinely ephemeral). New `RecentProjects` (open/inline-confirm-delete) and `NoticeBanner` (restrained, non-technical error messages) components. Project name is inline-editable in the topbar. Garment ids are a documented placeholder (`garmentId: category`, `garmentVersion: '0.0.0'`) until the real garment-manifest system exists — noted, not hidden. 6 integration tests (`apps/web/src/app/studio/page.test.tsx`, real fake-indexeddb) covering empty state, stale-pointer recovery, create→drives-UI, truthful save-status transitions, recent-project listing/reopening, and delete-returns-to-start.

**Playwright E2E — now required and running.** `apps/web/e2e/smoke.spec.ts` covers, against a real production build + `next start`: home→Studio, mobile-overflow, and a single sequential lifecycle test (choose garment → persists → **reload restores it** → create a second project → both appear in recents → switch between them → **delete → reload confirms it does not return**). Verified stable across 4+ consecutive local runs (no flakiness after fixing two real Playwright API/locator mistakes — see Review Findings).

**CI** — added `format:check` (the plugin that makes it meaningful, `prettier-plugin-tailwindcss`, was actually installed in M00 but this is the first time `format:check` itself ran in CI) and a Playwright stage (installs Chromium only, runs after `pnpm build` since the suite drives `next start`).

**Docs updated:** `ARCHITECTURE.md` (local-storage moved from "documented future boundary" to implemented; new "Project repository & autosave" section explaining the epoch/cross-project-bleed guards), `PROJECT_SCHEMA.md` (local persistence section; noted the schema enums are now compile-time-pinned to their types), `PRIVACY_SECURITY.md` (local-first project data is now an implemented guarantee, not an intention — artwork upload explicitly still does not exist), `CLAUDE.md`, `README.md`. Landing-page copy updated from "designed to stay in your browser" to "live in your browser," per the milestone brief, only after persistence was verified working.

## Persistence

- **IndexedDB implementation:** `idb`-wrapped native IndexedDB. No fake in-memory production path.
- **Database/version:** `threadform`, version `1`. Stores: `projects` (keyPath `id`, index `by-updatedAt`), `meta` (keyPath `key`, holds `lastOpenedProjectId`).
- **Validation/migration boundary:** every `loadProject` call runs the stored payload through `project-engine`'s `validateProject` (migrates internally, then validates); failures throw `InvalidProjectDataError` and never touch the stored record.
- **Autosave:** 600ms debounce; monotonic epoch prevents a stale write from reporting "Saved" after a newer edit failed, is pending, or belongs to a different project; pending saves are cancelled (not silently dropped) before a delete, and flushed (not dropped) on explicit "New Project" or `pagehide`.
- **Restore behavior:** on mount, restores the last-opened project if its pointer resolves to a valid record; otherwise (missing, corrupt, or no pointer at all) shows the garment-picker start state and clears the stale pointer so it doesn't keep failing on every future visit.

## Testing

Exact commands, run from a clean state after all fixes below:

- `pnpm format:check` — **passed.**
- `pnpm typecheck` — **6/6 packages passed** (added `@threadform/local-storage`).
- `pnpm lint` — **6/6 packages passed, 0 errors, 0 warnings.**
- `pnpm test` — **62/62 tests passed**: `project-engine` 18, `local-storage` 17, `ui` 3, `web` 24 (6 `formatRelativeTime` — including the crash-guard regression test below — + 2 home + 10 hook + 6 studio-integration).
- `pnpm build` — **succeeded.** `/studio` production bundle grew from 3.17 kB (M00 shell) to ~22 kB (real persistence logic).
- `pnpm --filter @threadform/web test:e2e` — **3/3 passed**, run 4+ times consecutively with no flakiness, against a real production build (`next start`).

## E2E

Flows actually exercised in the committed suite, in one sequential Chromium test (shares one browser context/storage across steps by design, since the flows are about persistence *between* steps):

1. Choose a garment on a fresh `/studio` → a real project is created and persisted; topbar/Inspector reflect it; previously-disabled tools unlock.
2. Reload the page → the persisted project is restored directly (the picker's empty state does not flash first).
3. Create a second project → both projects appear in "recent projects" → switching to the first one reopens it correctly.
4. Delete a project via the recents list (inline confirm) → reload → the deleted project never returns; the still-open project survives.
Plus: home→Studio navigation, and no horizontal overflow at 375px width.

## Visual QA

Actually rendered via Playwright + Chromium (Claude-in-Chrome MCP tool unavailable in this environment, as in M00) at 1440×900, 1280×720, 1024×768, 768×1024, 390×844, 360×800 for the Studio's **editing** state (topbar with editable name + save status + New Project), plus desktop and mobile for the **start-with-recents** and **delete-confirmation** states. **Found and fixed one real defect:** at 390px/360px the topbar wrapped to two lines ("New Project" broke mid-word) because the inert Export/Sign-in placeholders were competing for space with the one real action. Fixed by hiding those two disabled placeholders below the `sm` breakpoint (they do nothing functionally, so hiding them costs nothing) and giving "New Project" `whitespace-nowrap`; re-verified clean at all six viewports after the fix.

## Accessibility

A keyboard-only pass (real Tab/Enter/typing, no mouse) was run against the flows this milestone changed: tabbed to and activated a garment option with Enter, tabbed to the project-name input and renamed it by typing (autosave triggered correctly). Verified via Playwright driving real keyboard events, not by inspecting CSS. **Not tested:** delete/confirm and New Project via keyboard specifically, and no real screen reader was used — both logged here rather than silently skipped.

## Review Findings

Two independent engineering-review passes were run (`pr-review-toolkit:code-reviewer` subagent) — one over the full local-storage/repository/hook code before final verification, one focused specifically on race conditions, effect correctness, and boundary violations. Findings, all fixed and re-verified:

- **Critical:** `formatRelativeTime` threw `RangeError` on an unparseable/missing timestamp, which would have crashed the entire recent-projects list render (the one path that deliberately skips full validation for fast listing) — fixed with a `Number.isFinite` guard, regression test added.
- **Real bug:** `projectRef` was synced via a `useEffect` (one commit behind), so two same-tick mutations could both read a stale base and lose an update — fixed by setting the ref synchronously wherever `project` state changes (`setProjectState` helper), removing the effect entirely.
- **Real bug:** a pending debounced save could still fire *after* a project was deleted (its `put` racing the `delete`), because the cancel call was ordered after the delete completed — fixed by cancelling before deleting.
- **Correctness:** `loadProject` re-implemented `validateProject`'s internal migration behind an unchecked cast, which both duplicated work and could throw a raw `TypeError` instead of `InvalidProjectDataError` for certain malformed input — simplified to call `validateProject` directly (it already migrates and handles bad input).
- **Robustness:** the cached IndexedDB connection had no recovery if the browser closed it out from under the app (storage eviction, a future version bump blocked by another tab) — added `idb`'s `terminated`/`blocking` handlers so the app reopens instead of failing every save forever.
- Two Playwright authoring mistakes were found and fixed while writing the E2E suite itself (not from the subagent review): `page.getByText` takes a string/RegExp, not a matcher function (unlike Testing Library); and strict-mode violations from the project's established dual desktop/mobile DOM pattern don't retry the same way plain visibility assertions do, so every ambiguous locator needed an explicit `.first()`.
- One real UI defect from the visual QA pass (mobile topbar wrapping) — see Visual QA above.
- Minor, deliberately not fixed this pass (logged, not silently dropped): a ~600ms data-loss window remains for a hard tab-close immediately after an edit (client-side navigation and backgrounding are covered by the new `pagehide` flush; a true `beforeunload`-synchronous flush is not reliably possible for an async IndexedDB write); `packages/local-storage`'s `resetDatabaseConnectionForTests`/`clearAllDataForTests` are exported from the package's main entry rather than a quieter `/testing` subpath.

## Privacy

- No new network call, upload endpoint, or analytics path exists anywhere in the new code — verified by review and by inspection (no `fetch`/`XHR`/`WebSocket`/`sendBeacon` in the diff).
- Project data (garment reference, name, timestamps) stays in the browser's IndexedDB; there is still no backend in this repository.
- `docs/PRIVACY_SECURITY.md` updated to state this as implemented fact, not intention — and explicit that artwork upload still does not exist (out of scope for M01, per the milestone brief).

## Git

- **Branch:** `main`
- **Remote:** `https://github.com/3bud-ZC/ThreadForm.git`
- **Commit:** created immediately after this status write.
- Note: the diff includes cosmetic Tailwind-class-order reformatting across several M00 files untouched by this milestone's logic — `prettier-plugin-tailwindcss` (added as a dependency during M00's own review) is exercised repo-wide for the first time now that `pnpm format`/`format:check` are actually run as part of this milestone's workflow.

## Remaining Issues

- No garment/3D/2D rendering, no artwork, no materials/effects/animation — all explicitly out of scope for M01.
- The ~600ms tab-close data-loss window noted above.
- Keyboard testing of delete/confirm and "New Project" specifically, and screen-reader testing, were not performed this pass.
- `packages/config` still has no `lint`/`typecheck` scripts of its own (carried over from M00, not addressed here — out of this milestone's scope).

## Next Milestone

**M02 — Garment Runtime & First 3D Render.** Implement the data-driven garment manifest system (`docs/GARMENT_SPEC.md`) for at least one real garment, and the first `garment-runtime`/`3d-engine` slice that renders it in the Studio canvas — replacing the "3D / 2D preview arrives in a later milestone" placeholder with an actual (even if minimal) garment render driven by the persisted `Project.garment` reference.

---
*Last updated: 2026-08-10 (M01 — persistence, autosave, real Studio state, independent review, fixes).*
