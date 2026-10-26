FROM oven/bun:1.4.4 AS dependencies
WORKDIR /app
COPY package.json bun.lock .npmrc bunfig.toml ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM dependencies AS build
ARG ORIGIN=http://localhost:8091
ENV ORIGIN=$ORIGIN
COPY src ./src
COPY tracker ./tracker
COPY static ./static
COPY scripts/build-tracker.ts ./scripts/build-tracker.ts
COPY vite.config.ts tsconfig.json ./
RUN bun run --bun build

FROM oven/bun:1.4.4 AS production-dependencies
WORKDIR /app
COPY package.json bun.lock .npmrc bunfig.toml ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1.4.4 AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/oddhouse.sqlite
RUN mkdir -p /data /backups && chown bun:bun /data /backups
COPY --from=build --chown=bun:bun /app/build ./build
COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json ./
COPY --chown=bun:bun drizzle ./drizzle
COPY --chown=bun:bun scripts ./scripts
COPY --chown=bun:bun src/lib/server/database.ts src/lib/server/schema.ts ./src/lib/server/
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD bun -e 'const r=await fetch("http://127.0.0.1:3000/api/health");process.exit(r.ok?0:1)'
CMD ["bun", "./build"]
