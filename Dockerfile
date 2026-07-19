FROM oven/bun:1.2 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/inferhence/package.json packages/inferhence/package.json
COPY packages/ingestion/package.json packages/ingestion/package.json
COPY packages/providers/package.json packages/providers/package.json
RUN bun install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
COPY . .
RUN bun run prisma:generate
RUN bun run build

FROM oven/bun:1.2 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app .
EXPOSE 3000
CMD ["bun", "run", "start"]
