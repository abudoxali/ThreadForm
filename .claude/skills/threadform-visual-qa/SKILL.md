---
name: threadform-visual-qa
description: Use after any visual/frontend change in ThreadForm (apps/web or packages/ui) — starts or connects to the local app, renders the actual UI across desktop/tablet/mobile viewports, inspects it for real defects (hierarchy, spacing, overflow, contrast, focus states, console/network errors), fixes what it finds, and re-checks. Use proactively before calling frontend work done, not just when asked to "check the UI."
---

# ThreadForm Visual QA

A true inspect-fix-reinspect loop, not a one-shot report. Don't stop after
listing problems — fix them and verify the fix.

## 1. Get the app running

- Check if a dev server is already running (`pnpm dev` from repo root, or
  `apps/web` specifically). If not, start it and wait for it to be ready.
- If browser automation tooling is available (Playwright, an MCP browser
  tool), use it to actually render the pages. If nothing is available, say so
  explicitly rather than reasoning about the CSS in the abstract.

## 2. Inspect both routes at representative viewports

Routes: `/` and `/studio`.

Viewports (minimum): 1440×900, 1280×720 (desktop); 1024×768, 768×1024
(tablet); 390×844, 360×800 (mobile).

At each, check:

- Horizontal overflow / clipping / text wrapping.
- Visual hierarchy, spacing consistency, alignment.
- Toolbar/control collisions, unreadable type, touch target size (≥36px) on
  mobile.
- Contrast against `docs/DESIGN_SYSTEM.md` tokens.
- Focus-visible states reachable via keyboard (Tab through interactive
  elements — don't just check that a CSS rule exists).
- Interactive states (hover/active/disabled) actually apply.
- Browser console errors, hydration warnings, and failed network requests
  (read them if the tool supports it — don't skip this).
- Obvious performance red flags (layout jank, huge unoptimized assets).

## 3. Fix what you find

Apply fixes directly in `apps/web` / `packages/ui`. Prefer fixing the design
token or shared primitive over a one-off patch if the defect is systemic
(e.g. a contrast issue in a token affects every consumer).

## 4. Re-run the loop

After fixing, re-render and re-check the specific viewport/route that had the
defect. Don't declare done on the first pass if anything was changed.

## 5. Report honestly

State exactly which routes/viewports were inspected, what tooling was used
(named explicitly — don't imply browser rendering happened if it didn't), and
what was fixed vs. what remains. Never claim a screenshot was reviewed if it
wasn't actually looked at.
