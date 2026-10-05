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
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5173
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/dist dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server server
USER node
EXPOSE 5173
CMD ["node", "server/main.mjs"]
