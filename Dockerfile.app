FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl curl unzip bash
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

COPY package.json bun.lock ./
COPY prisma ./prisma
COPY packages/db/package.json packages/db/package.json
COPY packages/inferhence/package.json packages/inferhence/package.json
COPY packages/ingestion/package.json packages/ingestion/package.json
COPY packages/providers/package.json packages/providers/package.json

RUN bun install --frozen-lockfile

COPY . .
RUN node node_modules/.bin/next build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=builder /app /app
EXPOSE 3000
CMD ["node", "node_modules/.bin/next", "start"]
