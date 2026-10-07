FROM rust:1-bookworm AS converter
RUN apt-get update && apt-get install -y --no-install-recommends cmake libsqlite3-dev libgmp-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY native-store native-store
COPY vendor/sqlite-rational vendor/sqlite-rational
RUN cargo build --manifest-path native-store/Cargo.toml --release --locked --bin och-convert
RUN cargo vendor --locked --manifest-path native-store/Cargo.toml /app/rust-dependencies

FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
ARG OCH_BUILD_COMMIT
ARG OCH_BUILD_VERSION
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/rational-ordered-map-0.1.0.tgz vendor/
RUN npm ci
COPY scripts scripts
COPY LICENSE NOTICE THIRD_PARTY.md ./
COPY legal legal
COPY src src
COPY server server
COPY platform platform
COPY native-store native-store
COPY src-tauri src-tauri
COPY vendor vendor
COPY docs docs
COPY deploy deploy
COPY test test
COPY .github .github
COPY README.md compose.yml tsconfig.json pnpm-lock.yaml yarn.lock .yarnrc.yml .dockerignore .gitignore .env.example ./
COPY --from=converter /app/rust-dependencies /app/rust-dependencies
RUN --mount=type=bind,target=/build-context export OCH_BUILD_CONTEXT=/build-context OCH_BUILD_COMMIT="$OCH_BUILD_COMMIT" OCH_BUILD_VERSION="$OCH_BUILD_VERSION" && npm run build && node scripts/source.mjs --rust-vendor /app/rust-dependencies && cp dist/openchronology-web-source.tar.gz platform/public/

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-0 libgmp10 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=5173 OCH_APP_ROOT=/app NEXT_TELEMETRY_DISABLED=1 OCH_CONVERTER=/usr/local/bin/och-convert
WORKDIR /app
COPY --from=converter /app/native-store/target/release/och-convert /usr/local/bin/och-convert
COPY --from=build --chown=node:node /app/platform/.next/standalone ./
COPY --from=build --chown=node:node /app/platform/.next/static platform/.next/static
COPY --from=build --chown=node:node /app/platform/public platform/public
COPY --from=build --chown=node:node /app/dist dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server server
COPY LICENSE NOTICE THIRD_PARTY.md ./
COPY legal legal
COPY LICENSE NOTICE THIRD_PARTY.md /usr/local/share/openchronology/
COPY legal /usr/local/share/openchronology/legal/
COPY --from=build /app/platform/public/THIRD_PARTY.txt /usr/local/share/openchronology/PLATFORM_THIRD_PARTY.txt
COPY vendor/sqlite-rational/LICENSE vendor/sqlite-rational/THIRD_PARTY.md /usr/local/share/openchronology/sqlite-rational/
USER node
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:5173/healthz',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "platform/server.cjs"]
