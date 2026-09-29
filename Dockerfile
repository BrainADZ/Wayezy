# WAY EZY — production image (kiosk, WAY EZY GO and WAY EZY COMMAND on one Node.js server).
# Build:  docker build -t way-ezy .
# Run:    docker compose up -d   (see docker-compose.yml and docs/DEPLOYMENT.md)

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4173 \
    DATA_DIR=/app/.data
WORKDIR /app
COPY package.json package-lock.json ./
# Client libraries are devDependencies (bundled at build time); only the server runtime is installed.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/.data && chown -R node:node /app/.data
USER node
EXPOSE 4173
VOLUME ["/app/.data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4173) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server/index.js"]
