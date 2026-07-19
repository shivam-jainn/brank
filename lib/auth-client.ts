"use client";

import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [anonymousClient()],
});

export const { signIn, signOut, useSession } = authClient;

export async function hardSignOut() {
  const result = await signOut();

  if (result.error) {
    return result;
  }

  const response = await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!response.ok) {
    return {
      data: null,
      error: {
        message: "Could not clear the auth session cookie.",
      },
    };
  }

  return result;
}
