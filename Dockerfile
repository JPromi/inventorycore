# syntax=docker/dockerfile:1
# One image: the Angular app is built first and bundled into the Spring Boot JAR.
# Version: --build-arg APP_VERSION=1.2.0 (the GitHub workflow passes the tag).
# The build stages run on the build machine's platform (their output is platform independent),
# only the runtime stage exists per target platform.

FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend
WORKDIR /src/frontend
RUN npm install -g npm@12.0.2
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM eclipse-temurin:21-jdk AS backend
WORKDIR /src/backend
COPY backend/gradlew backend/settings.gradle backend/build.gradle ./
COPY backend/gradle gradle
# own layer: dependencies are downloaded again only when the build files change
RUN sh ./gradlew --no-daemon dependencies > /dev/null
COPY backend/src src
COPY --from=frontend /src/frontend/dist/inventorycore/browser /src/frontend-dist
ARG APP_VERSION=dev
RUN sh ./gradlew --no-daemon bootJar -PappVersion="$APP_VERSION" -PfrontendDist=/src/frontend-dist \
    && cp "build/libs/inventorycore-$APP_VERSION.jar" /inventorycore.jar

FROM eclipse-temurin:21-jre
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="InventoryCore" \
      org.opencontainers.image.version="$APP_VERSION"
RUN groupadd --system inventorycore && useradd --system --gid inventorycore --home /app inventorycore \
    && mkdir -p /app/config /app/data && chown inventorycore:inventorycore /app/data
WORKDIR /app
COPY --from=backend /inventorycore.jar /app/inventorycore.jar
COPY docker/application.properties /app/config/application.properties
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -Djava.awt.headless=true"
USER inventorycore
VOLUME /app/data
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/inventorycore.jar"]
