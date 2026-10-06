FROM rust:1-bookworm AS converter
RUN apt-get update && apt-get install -y --no-install-recommends cmake libsqlite3-dev libgmp-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY native-store native-store
COPY vendor/sqlite-rational vendor/sqlite-rational
RUN cargo build --manifest-path native-store/Cargo.toml --release --locked --bin och-convert

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/rational-ordered-map-0.1.0.tgz vendor/
RUN npm ci
COPY scripts scripts
COPY LICENSE ./
COPY src src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-0 libgmp10 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5173 OCH_CONVERTER=/usr/local/bin/och-convert
WORKDIR /app
COPY --from=converter /app/native-store/target/release/och-convert /usr/local/bin/och-convert
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/dist dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server server
COPY LICENSE THIRD_PARTY.md /usr/local/share/openchronology/
COPY vendor/sqlite-rational/LICENSE vendor/sqlite-rational/THIRD_PARTY.md /usr/local/share/openchronology/sqlite-rational/
USER node
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:5173/healthz',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.mjs"]
