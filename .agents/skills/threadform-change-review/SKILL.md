---
name: threadform-change-review
description: Use before declaring any meaningful ThreadForm change complete — inspects the git diff for accidental changes, architectural leakage across the packages/apps/web boundary, duplicated or dead code, unused dependencies, unsafe type escapes (any, unchecked casts), and security/privacy issues, runs the relevant tests and build, fixes what it finds, and produces concise findings. Use proactively before a PR, commit, or "this is done" claim.
---

# ThreadForm Change Review

## 1. Inspect the diff

`git status` and `git diff` (staged and unstaged). Identify:

- Files touched that aren't related to the stated task — accidental changes
  don't belong in this change.
- Anything under `node_modules`, `.next`, `.turbo`, `dist`, `coverage` —
  should never be staged; if present, check `.gitignore` instead of just
  unstaging.
- Secrets or credential-shaped strings — `.env*` values, API keys, tokens. If
  found, stop and flag it; do not commit it.

## 2. Architectural leakage

Cross-check against `docs/ARCHITECTURE.md` / `.Codex/rules/architecture-boundaries.md`:

- Does `packages/types` import anything with runtime behavior?
- Does `packages/project-engine` import React, DOM APIs, or storage?
- Does `packages/ui` import anything domain-specific (`Project`,
  `GarmentReference`, etc.)?
- Is a `Project` being hand-mutated in a component instead of going through a
  `project-engine` function?

## 3. Code quality

- Unsafe type escapes: `any`, non-null assertions (`!`), broad `as` casts
  without a preceding runtime check. Each one needs a reason or a fix.
- Duplicated logic that should be a shared function/component.
- Dead code: exports nothing imports, components nothing renders.
- Unused dependencies added to a `package.json` but never imported.
- A `<button>` nested inside another interactive element (see
  `frontend-quality` rule) — use `buttonStyles` on the non-button element
  instead.

## 4. Verify

Run, for every package touched (or all, if unsure): lint, typecheck, test,
build. Use the workspace-aware root scripts (`pnpm lint`, `pnpm typecheck`,
`pnpm test`, `pnpm build`) so Turborepo scopes correctly. Report the exact
commands and their exact outcomes — don't summarize a failure as "mostly
passing."

## 5. Fix and report

Fix what you find. Produce a short, concrete findings list: what was wrong,
where, and what changed — not a restatement of the diff.
