FROM oven/bun:1.2 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/db/package.json packages/db/package.json
COPY packages/inferhence/package.json packages/inferhence/package.json
COPY packages/ingestion/package.json packages/ingestion/package.json
COPY packages/providers/package.json packages/providers/package.json
RUN bun install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
# OpenSSL is required by Prisma to detect the correct binary target
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY . .
RUN bun run prisma:generate
# Unset NODE_ENV during build so Next.js doesn't complain about non-standard values
RUN NODE_ENV=production bun run build

FROM oven/bun:1.2 AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=builder /app .
# Workspace packages are symlinked into node_modules. When the ingestion
# worker is run directly (bun packages/ingestion/src/worker.ts) without a
# bundler, bare imports from a workspace package resolve against that
# package's own node_modules dir, which bun leaves empty. Point each
# workspace package's node_modules at the hoisted root node_modules so
# runtime resolution (used by the worker) matches the bundled app build.
RUN for pkg in packages/*/; do \
      rm -rf "$pkg/node_modules" && ln -s /app/node_modules "$pkg/node_modules"; \
    done
EXPOSE 3000
CMD ["bun", "run", "start"]
