# ThreadForm

Browser-based 2D/3D apparel design and mockup studio. Turn artwork into
realistic apparel visuals — garment selection, artwork placement, materials,
effects, camera/lighting, and export — without installing anything or
creating an account.

This is a greenfield project. See `docs/PRODUCT.md` for what ThreadForm is,
`docs/ARCHITECTURE.md` for how it's structured, and `STATUS.md` for exactly
what's implemented right now — as of M02, the Studio renders a real,
original 3D garment (WebGL, camera presets, color) with local-first
persistence; artwork/materials/effects/animation/export are still ahead.

## Getting started

```bash
pnpm install
pnpm dev        # apps/web on http://localhost:3000
```

## Workspace

```
apps/web              Next.js app — marketing site (/) and Studio (/studio), with local-first project persistence and a real 3D garment render
packages/types         Strict TypeScript domain contracts
packages/project-engine  Create/validate/migrate/mutate a Project
packages/local-storage   IndexedDB persistence adapter for guest projects
packages/garment-runtime  Garment manifest schema, catalog, camera presets, legacy-reference resolution
packages/3d-engine       React Three Fiber garment canvas: loading, lighting, camera framing, color
packages/ui             Design tokens + presentational React primitives
packages/config         Shared tsconfig + ESLint configs
assets/garments/         Source-of-truth original garment assets (GLB + manifest + provenance)
docs/                  Product, architecture, design, schema, garment, export, privacy specs
```

## Commands

| Command             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `pnpm dev`          | Run the web app locally                          |
| `pnpm lint`         | Lint every package                               |
| `pnpm typecheck`    | Type-check every package                         |
| `pnpm test`         | Unit tests (Vitest)                              |
| `pnpm test:e2e`     | Playwright suite (build the app first; Chromium) |
| `pnpm build`        | Production build                                 |
| `pnpm format`       | Format with Prettier                             |
| `pnpm format:check` | Check formatting without writing (used in CI)    |

## Contributing / working with Claude Code

See `CLAUDE.md` for project-specific conventions, `.claude/rules/` for
modular engineering rules, and `.claude/skills/` for reusable QA/review
workflows.
