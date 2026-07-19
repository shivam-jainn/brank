import Link from "next/link";

import { AuthProviderButtons } from "@/components/marketing/auth-provider-buttons";
import { enabledOAuthProviders, isGuestLoginEnabled } from "@/lib/config";
import { cn } from "@/lib/utils";

export function OAuthPanel({
  mode = "signup",
  className,
}: {
  mode?: "signin" | "signup";
  className?: string;
}) {
  const isSignIn = mode === "signin";

  return (
    <section
      className={cn(
        "border border-black/10 bg-[#f3f1ea] text-[#111111]",
        "p-5 sm:p-6",
        className
      )}
    >
      <div className="border-b border-black/10 pb-5">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-normal text-black/55">
            <span className="size-2 rounded-full bg-[#9bca24]" />
            {isSignIn ? "Welcome back" : "Account access"}
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl">
            {isSignIn ? "Sign in to Brank" : "Create your Brank account"}
          </h2>
        </div>
      </div>

      <div className="mt-6">
        <AuthProviderButtons
          allowGuest={isGuestLoginEnabled}
          enabledProviders={enabledOAuthProviders}
        />
      </div>

      <p className="mt-6 text-center text-sm text-black/50">
        {isSignIn ? "New here?" : "Already have access?"}{" "}
        <Link
          className="font-semibold text-black underline-offset-4 hover:underline"
          href={isSignIn ? "/auth/sign-up" : "/auth/sign-in"}
        >
          {isSignIn ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </section>
  );
}
