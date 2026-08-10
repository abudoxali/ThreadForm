---
name: threadform-milestone-closeout
description: Use at the end of a ThreadForm milestone or substantial task — verifies acceptance criteria against actual repository state, runs the required checks, and updates the single canonical STATUS.md with honest completion percentages, exact verification evidence, and real blockers. Use proactively whenever work is about to be reported as complete or a milestone is being closed out, not only when explicitly asked to update STATUS.md.
---

# ThreadForm Milestone Closeout

## 1. Verify acceptance criteria against reality

Don't take a prior claim of "done" at face value — check the actual
repository state for each criterion (file exists, command succeeds, route
renders). If the milestone has a written acceptance list, walk it item by
item.

## 2. Run required checks

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` at minimum. Run
`pnpm test:e2e` and a visual QA pass (see `threadform-visual-qa`) if browser
tooling is available; if not, say explicitly that they were not run — never
imply they were.

## 3. Inspect repository status

`git status` for uncommitted or stray files, `git log` for what's actually
landed. Confirm there is exactly one `STATUS.md` at the repo root — never
`STATUS-2.md`, `progress.md`, `implementation-status.md`, or similar. If a
duplicate exists, consolidate into `STATUS.md` and remove the duplicate.

## 4. Update STATUS.md

Rewrite `STATUS.md` in place (single canonical file) with:

- Project, current milestone, milestone state (in progress / complete /
  partial).
- Honest completion percentage for the milestone *and* the overall project —
  not rounded up to look better.
- Completed work, as a concrete list.
- Acceptance criteria, checked off only where actually verified.
- Verification performed: exact commands run and their exact results.
  Anything not run is listed as "not tested," not omitted.
- Known issues and blockers, stated plainly.
- The next required milestone (one item — not a new roadmap).
- Git branch/commit reference if available.
- Last-updated timestamp.

## 5. Never fabricate

No invented test results, no invented screenshots, no rounding a partial
result up to "complete." If acceptance criteria fail, the milestone state is
`PARTIAL`, not `PASS` — say so.
