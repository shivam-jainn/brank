import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/app/generated/prisma/client";
import { appConfig } from "@/lib/config";

export { Prisma };

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export function getPrismaClient(): PrismaClient | undefined {
  if (!appConfig.databaseUrl) {
    return undefined;
  }

  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({ connectionString: appConfig.databaseUrl });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.prisma;
}
