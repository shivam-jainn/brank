"use client";

import { useState } from "react";
import { IconBrandGithub, IconBrandGoogleFilled } from "@tabler/icons-react";
import { ArrowRightIcon, LogOutIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { authClient, hardSignOut, signIn, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type ProviderId = "google" | "github";

export const CHAT_ROUTE = "/chat";

const providers: {
  id: ProviderId;
  name: string;
  icon: typeof IconBrandGoogleFilled;
  detail: string;
}[] = [
  {
    id: "google",
    name: "Google",
    icon: IconBrandGoogleFilled,
    detail: "Workspace and Gmail accounts",
  },
  {
    id: "github",
    name: "GitHub",
    icon: IconBrandGithub,
    detail: "Developer identity and org access",
  },
] as const;

export function AuthProviderButtons({
  allowGuest,
  enabledProviders,
}: {
  allowGuest: boolean;
  enabledProviders: Record<ProviderId, boolean>;
}) {
  const { data: session, isPending: isSessionPending } = useSession();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSocial(provider: ProviderId) {
    setPending(provider);
    setError(null);

    const result = await signIn.social({
      provider,
    });

    if (result.error) {
      setError(result.error.message ?? "Could not start OAuth sign-in.");
      setPending(null);
    }
  }

  async function handleGuest() {
    setPending("guest");
    setError(null);

    const result = await authClient.signIn.anonymous();

    if (result.error) {
      const message = result.error.message ?? "";
      setError(
        message.includes("Anonymous users cannot sign in again anonymously")
          ? null
          : message || "Could not continue as guest."
      );
      setPending(null);
      return;
    }

    setPending(null);
  }

  async function handleSignOut() {
    setPending("signout");
    setError(null);

    const result = await hardSignOut();

    if (result.error) {
      setError(result.error.message ?? "Could not sign out.");
      setPending(null);
      return;
    }

    window.location.reload();
  }

  if (session) {
    const user = session.user;

    return (
      <div className="space-y-3">
        <div className="border border-black/10 bg-white px-4 py-3 text-[#111111]">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center bg-[#d7ff73] text-black">
              <UserRoundIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                Signed in as {user.name || user.email}
              </p>
              <p className="truncate text-xs text-black/45">{user.email}</p>
            </div>
          </div>
        </div>

        <Link
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "h-12 w-full justify-between rounded-none bg-[#d7ff73] px-4 text-black hover:bg-[#c8ef68]"
          )}
          href={CHAT_ROUTE}
        >
          <span className="text-sm font-semibold">Continue to chat</span>
          <ArrowRightIcon className="size-4" />
        </Link>

        <button
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-12 w-full justify-between rounded-none border-black/15 bg-white px-4 text-black hover:bg-black/[0.035]"
          )}
          disabled={pending !== null}
          onClick={handleSignOut}
          type="button"
        >
          <span className="flex items-center gap-3">
            <LogOutIcon className="size-4" />
            <span className="text-sm font-semibold">
              {pending === "signout" ? "Signing out..." : "Sign out"}
            </span>
          </span>
        </button>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {providers.map((provider) => {
        const Icon = provider.icon;
        const isPending = pending === provider.id;
        const isEnabled = enabledProviders[provider.id];

        return (
          <button
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-14 w-full justify-between rounded-none border-black/15 bg-white px-4 text-left text-[#111111] shadow-none hover:border-black/30 hover:bg-black/[0.035] disabled:bg-white/55 disabled:text-black/40"
            )}
            disabled={pending !== null || !isEnabled}
            key={provider.name}
            onClick={() => handleSocial(provider.id)}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-3">
              <Icon className="size-5" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {isPending ? "Connecting..." : `Continue with ${provider.name}`}
                </span>
                <span className="block truncate text-xs text-black/45">
                  {isEnabled ? provider.detail : "Provider credentials not configured"}
                </span>
              </span>
            </span>
            <ArrowRightIcon className="size-4 text-black/75" />
          </button>
        );
      })}

      {allowGuest ? (
        <button
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "h-12 w-full justify-between rounded-none bg-[#d7ff73] px-4 text-black hover:bg-[#c8ef68] disabled:bg-[#d7ff73]/55 disabled:text-black/40"
          )}
          disabled={pending !== null || isSessionPending}
          onClick={handleGuest}
          type="button"
        >
          <span className="flex items-center gap-3">
            <UserRoundIcon className="size-4" />
            <span className="text-sm font-semibold">
              {pending === "guest" ? "Creating guest session..." : "Continue as guest"}
            </span>
          </span>
          <ArrowRightIcon className="size-4" />
        </button>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
