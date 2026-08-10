# Testing & QA

- Non-trivial domain behavior (anything in `project-engine` beyond a plain
  getter/setter) needs a `vitest` test beside it (`*.test.ts`).
- UI components with real interaction logic (not pure presentation) need a
  Testing Library test. Pure presentational primitives don't need one for
  every prop permutation.
- Never claim a check passed without running it. If something wasn't tested
  (e.g. no browser available), say so explicitly in `STATUS.md`.
- For responsive/duplicate-DOM patterns (e.g. a desktop layout and a mobile
  layout both rendered and toggled with CSS breakpoints), jsdom does not
  apply real CSS — both copies exist in the test DOM. Use `getAllByRole(...)`
  and take the first match rather than asserting a single element exists;
  note why in a comment.
- Visual/frontend changes need an actual render-and-inspect pass (browser
  tooling if available), not just "the CSS looks reasonable." See the
  `threadform-visual-qa` skill.
- Before declaring work complete, see the `threadform-change-review` skill
  (diff review, dead code, unsafe casts, unused deps) and, at a
  milestone/task boundary, the `threadform-milestone-closeout` skill.
