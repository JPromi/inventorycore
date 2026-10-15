# InventoryCore Frontend

Angular 21 standalone application with TypeScript, SCSS, RxJS, Lucide icons, and Zone.js change detection. The repository-wide entry point is [README.md](../README.md); frontend coding agents should read [AGENTS.md](AGENTS.md).

From this directory:

```sh
npm ci
npm start
```

The default dev URL is `http://localhost:4200`. The Angular proxy forwards API and OIDC paths to the backend on port 8080.

| Task | Documentation |
| --- | --- |
| Prerequisites, backend setup, alternate ports | [Development](../docs/DEVELOPMENT.md) |
| Production build and artifacts | [Build](../docs/BUILD.md) |
| Vitest, known unit-test failures, Playwright | [Testing](../docs/TESTING.md) |
| SCSS variables, German characters, icons, async state | [Conventions](../docs/CONVENTIONS.md) |
| Hosting and PWA behavior | [Deployment](../docs/DEPLOYMENT.md) |

For scaffolding, use the installed CLI through `npm exec -- ng generate component component-name` or inspect `npm exec -- ng generate --help`. Browser tests use `npm run test:e2e`; there is no configured `ng e2e` target.
