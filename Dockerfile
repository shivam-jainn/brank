FROM oven/bun:1.2 AS deps
WORKDIR /app
COPY package.json bun.lock ./
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
EXPOSE 3000
CMD ["bun", "run", "start"]
