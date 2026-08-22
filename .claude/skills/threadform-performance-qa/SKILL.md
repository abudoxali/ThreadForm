---
name: threadform-performance-qa
description: Use whenever ThreadForm's Studio (the 3D route, /studio) is suspected of feeling slow or heavy, or after any change that could affect bundle size, load timing, or runtime rendering cost (garment geometry, lighting, Canvas config, dynamic-import boundaries, new drei/three usage). Builds and profiles the real production build — never dev mode — and records only measurements actually taken. Use proactively before and after a performance-motivated change, not just when explicitly asked to profile.
---

# ThreadForm Performance QA

Profile first, optimize second. Never guess the bottleneck and never invent a
metric — every number in a report from this skill must trace back to a
command or a captured trace, named explicitly.

## 1. Build the real thing

`pnpm --filter @threadform/web build` then serve it with `next start` (a
fixed port, e.g. `PORT=3110 npx next start`, run from `apps/web`). Dev mode
(`pnpm dev`) is never a valid baseline — it ships unminified code, disables
production optimizations, and its HMR client adds its own overhead.

## 2. Bundle inspection

Read the `next build` output table directly (Route × Size × First Load JS) —
it's already exact, no estimation needed. For `/studio` specifically, note:

- The static (`ssr:false`, dynamically-imported) 3D chunk's size, separate
  from the route's own First Load JS — confirm three.js/drei/R3F are NOT
  part of the initial `/studio` bundle (check `next build`'s per-chunk
  breakdown, or `grep` the built HTML for which script tags load
  synchronously vs. the lazy chunk requested only after the dynamic
  `import()` resolves).
- Compare against the prior recorded number in `STATUS.md` if one exists —
  a real regression is a real regression, don't round it away.

## 3. Runtime timing (via Playwright against the production server)

Drive the actual flow with Playwright and read real timestamps — do not
estimate from "it felt fast":

- `page.goto('/studio')` → time to the garment-picker being interactive
  (`getByRole('button', { name: /Essential Tee/ }).waitFor()` timed against
  `performance.now()` captured before/after, or Playwright's own
  navigation-timing entries via
  `page.evaluate(() => performance.getEntriesByType('navigation'))`).
- Click the garment button → capture `performance.getEntriesByType('resource')`
  afterward and find the dynamically-imported 3D chunk's and the GLB's
  entries; their `responseEnd - startTime` gives real fetch+parse-adjacent
  timing. Combine with a `page.waitForSelector`/`waitForFunction` on the
  canvas actually appearing to get end-to-end "click → garment visible."
- Repeat 2–3 times; report a representative value and note the spread if
  it's wide, rather than presenting one run as definitive.

## 4. Idle renderer check (frameloop="demand")

Confirm the render loop actually stops when idle — this project's central
performance claim. In the browser context, monkey-patch or count
`requestAnimationFrame` calls (e.g.
`page.evaluate(() => { let n = 0; const raf = window.requestAnimationFrame; window.requestAnimationFrame = (cb) => { n++; return raf(cb); }; window.__rafCount = () => n; })` before the garment loads, then read the
counter after a fixed idle window (e.g. 1.5s with no interaction) and again
after an interaction (orbit drag) to confirm the count only climbs during
and briefly after real interaction, not continuously while idle.

## 5. WebGL/interaction inspection

- Read the browser console for WebGL warnings/errors during load, color
  change, camera preset switch, and orbit drag — `page.on('console', ...)`.
- For a perceived "heaviness" complaint specifically, check whether a long
  task blocks the main thread around the garment-ready moment (Chrome
  DevTools Protocol tracing via `page.context().tracing.start/stop`, or a
  simpler proxy: whether `pointerdown`→first visual response during an
  orbit drag has a noticeable, measured delay).

## 6. Desktop vs. mobile

Repeat the relevant timing/idle checks at a mobile viewport
(e.g. 390×844) — mobile CPUs and GPUs are meaningfully weaker than the
profiling machine, and the DPR range applied there differs.

## 7. Optimize, then re-measure

Fix what the profile actually shows, not a guess. After a fix, re-run the
_same_ measurements from this skill and compare — a before/after table
belongs in the report and in `STATUS.md`, with only genuinely-measured
values in it.

## 8. No invented metrics — ever

Never report an FPS number, a percentage improvement, or a load time that
wasn't actually captured by a command or trace in this session. If a
measurement isn't reliably obtainable in the current environment, say so
explicitly ("FPS could not be reliably sampled here; frame-scheduling count
was used instead") rather than inventing a plausible-looking number. A
missing measurement is honest; a fabricated one is not.
