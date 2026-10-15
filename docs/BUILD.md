# Build

The two modules have independent builds. For one deployable application, the backend build can bundle the built frontend into its JAR (`-PfrontendDist`); the [Dockerfile](../Dockerfile) does this. See [deployment](DEPLOYMENT.md) for the image and its CI workflow.

## Frontend

From `frontend/`, install dependencies with `npm ci`, then:

| Command | Result |
| --- | --- |
| `npm run build` | Production browser application in `dist/inventorycore/browser/` |
| `npm run build -- --configuration development` | Development configuration with source maps |
| `npm run watch` | Rebuild development output as sources change |

The configuration is [angular.json](../frontend/angular.json). Production builds hash output filenames and generate Angular service-worker assets using [ngsw-config.json](../frontend/ngsw-config.json). Static assets come from `frontend/public/`.

Keep `zone.js` in build polyfills and `provideZoneChangeDetection()` in the application configuration. The polyfill declaration also tells the build to transform async functions for Zone.js compatibility; a source import alone is insufficient.

Current production budgets warn at 500 kB initial JavaScript and 4 kB per component stylesheet; error thresholds are 1 MB and 8 kB respectively. Existing builds emit budget warnings. Do not raise budgets merely to conceal a regression.

## Backend

From `backend/` on Windows:

```powershell
.\gradlew.bat bootJar
.\gradlew.bat build
```

Use `./gradlew` on Unix. `bootJar` produces the executable application under `backend/build/libs/`; `build` also executes tests.

Optional project properties:

| Property | Effect |
| --- | --- |
| `-PappVersion=1.2.0` | Project and JAR version (default `0.0.1-SNAPSHOT`) |
| `-PfrontendDist=../frontend/dist/inventorycore/browser` | Copies the built Angular app into `static/` of the JAR; run `npm run build` first |

Example of one application: `npm run build` in `frontend/`, then `.\gradlew.bat bootJar -PfrontendDist=../frontend/dist/inventorycore/browser` in `backend/`. The wrapper pins Gradle 9.7.1, and [build.gradle](../backend/build.gradle) selects Java 21, Spring Boot 4.1.1, Lombok annotation processing, and PostgreSQL runtime support.

Dependencies may need registry/network access on first installation. Runtime configuration is described in [development](DEVELOPMENT.md); test prerequisites are in [testing](TESTING.md). Never package real development credentials as production configuration.
