# Frontend Instructions

Read the root [instructions](../AGENTS.md) and [conventions](../docs/CONVENTIONS.md).

- Use existing standalone components, template-driven forms, RxJS services, and route-data configuration before introducing another pattern.
- Shared design tokens live in `src/styles.scss`; responsive mixins live in `src/styles/_breakpoints.scss`. Keep reusable styling values in SCSS, not templates or TypeScript.
- Use Lucide icons and retain icon references in navigation configuration.
- Keep `provideZoneChangeDetection()` and `angular.json`'s `zone.js` polyfill. Async UI updates must work without a follow-up click.
- Ordinary pages use class fields and subscriptions. The existing PWA service uses signals; this is not a precedent for migrating other pages to signals.
- API calls use the relative environment API URL and session credentials. Match Java DTO changes in the service interfaces.
- Verify async changes using the [browser regressions](../docs/TESTING.md), and use the [build guide](../docs/BUILD.md) for production output.
