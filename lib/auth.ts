import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { anonymous } from "better-auth/plugins/anonymous";

import { appConfig, isGuestLoginEnabled } from "@/lib/config";
import { getPrismaClient } from "@/lib/db";

const prisma = getPrismaClient();

if (!prisma) {
  console.warn("Better Auth requires DATABASE_URL to be configured; auth is disabled.");
}

const socialProviders = {
  ...(appConfig.auth.googleClientId && appConfig.auth.googleClientSecret
    ? {
        google: {
          clientId: appConfig.auth.googleClientId,
          clientSecret: appConfig.auth.googleClientSecret,
          prompt: "select_account" as const,
        },
      }
    : {}),
  ...(appConfig.auth.githubClientId && appConfig.auth.githubClientSecret
    ? {
        github: {
          clientId: appConfig.auth.githubClientId,
          clientSecret: appConfig.auth.githubClientSecret,
        },
      }
    : {}),
};

export const auth = (() => {
  if (!prisma) {
    return {} as ReturnType<typeof betterAuth>;
  }

  try {
    return betterAuth({
      baseURL: appConfig.auth.url,
      secret: appConfig.auth.secret,
      database: prismaAdapter(prisma, {
        provider: "postgresql",
      }),
      socialProviders,
      plugins: isGuestLoginEnabled ? [anonymous()] : [],
      account: {
        accountLinking: {
          enabled: true,
          trustedProviders: ["google", "github"],
        },
      },
    });
  } catch (error) {
    console.warn("Failed to initialize Better Auth; auth is disabled.", error);
    return {} as ReturnType<typeof betterAuth>;
  }
})();
