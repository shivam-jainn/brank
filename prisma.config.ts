import { loadEnvConfig } from "@next/env";
import { defineConfig, env } from "prisma/config";
import { normalizeLocalServiceUrl } from "./lib/local-url";

loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: normalizeLocalServiceUrl(env("DATABASE_URL")),
  },
});
