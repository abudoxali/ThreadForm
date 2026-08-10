# ThreadForm

Browser-based 2D/3D apparel design and mockup studio. Turn artwork into
realistic apparel visuals — garment selection, artwork placement, materials,
effects, camera/lighting, and export — without installing anything or
creating an account.

This is a greenfield project. See `docs/PRODUCT.md` for what ThreadForm is,
`docs/ARCHITECTURE.md` for how it's structured, and `STATUS.md` for exactly
what's implemented right now.

## Getting started

```bash
pnpm install
pnpm dev        # apps/web on http://localhost:3000
```

## Workspace

```
apps/web              Next.js app — marketing site (/) and Studio shell (/studio)
packages/types         Strict TypeScript domain contracts
packages/project-engine  Create/validate/migrate/mutate a Project
packages/ui             Design tokens + presentational React primitives
packages/config         Shared tsconfig + ESLint configs
docs/                  Product, architecture, design, schema, garment, export, privacy specs
```

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Run the web app locally |
| `pnpm lint` | Lint every package |
| `pnpm typecheck` | Type-check every package |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Playwright smoke tests (build the app first) |
| `pnpm build` | Production build |
| `pnpm format` | Format with Prettier |

## Contributing / working with Claude Code

See `CLAUDE.md` for project-specific conventions, `.claude/rules/` for
modular engineering rules, and `.claude/skills/` for reusable QA/review
workflows.
