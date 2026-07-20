# 1. Base stage with system dependencies
FROM oven/bun:1.2 AS base
WORKDIR /app
# Install openssl (required by Prisma)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# 2. Dependency stage (installs all node packages and automatically generates Prisma client via postinstall)
FROM base AS deps
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY packages/db/package.json packages/db/package.json
COPY packages/inferhence/package.json packages/inferhence/package.json
COPY packages/ingestion/package.json packages/ingestion/package.json
COPY packages/providers/package.json packages/providers/package.json
RUN bun install --frozen-lockfile

# 3. App Builder stage (compiles next.js app)
FROM deps AS builder
# Copy all source files
COPY . .
# Unset NODE_ENV during build so Next.js doesn't complain about non-standard values
RUN NODE_ENV=production bun run build

# 4. App Runner stage (Target: app)
FROM base AS app
ENV NODE_ENV=production
COPY --from=builder /app /app
# Link workspace package node_modules to the root hoisted folder
RUN for pkg in packages/*/; do \
      rm -rf "$pkg/node_modules" && ln -s /app/node_modules "$pkg/node_modules"; \
    done
EXPOSE 3000
CMD ["bun", "run", "start"]

# 5. Worker Runner stage (Target: worker)
FROM base AS worker
ENV NODE_ENV=production
# Copy generated dependencies (including Prisma client) from deps stage
COPY --from=deps /app/node_modules /app/node_modules
# Copy only worker/packages source
COPY packages ./packages
COPY prisma ./prisma
# Link workspace package node_modules to the root hoisted folder
RUN for pkg in packages/*/; do \
      rm -rf "$pkg/node_modules" && ln -s /app/node_modules "$pkg/node_modules"; \
    done
CMD ["bun", "packages/ingestion/src/worker.ts"]
