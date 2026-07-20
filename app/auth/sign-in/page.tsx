import Link from "next/link";

import { DitherOrb } from "@/components/marketing/dither-orb";
import { OAuthPanel } from "@/components/marketing/oauth-panel";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main className="relative grid min-h-dvh bg-[#f3f1ea] text-[#111111] lg:grid-cols-[1fr_0.86fr]">
      <Link
        className="absolute left-5 top-5 z-20 flex items-center gap-2.5 font-semibold sm:left-8 sm:top-6 lg:left-12"
        href="/"
      >
        <span className="grid size-7 grid-cols-2 gap-[3px] p-1">
          <i className="block bg-black" />
          <i className="block bg-[#d7ff73]" />
          <i className="block bg-black" />
          <i className="block bg-black" />
        </span>
        <span>Brank</span>
      </Link>
      <section className="relative hidden overflow-hidden border-r border-black/10 p-10 lg:block">
        <div className="absolute inset-y-0 left-[12%] w-px bg-black/10" />
        <div className="absolute inset-y-0 right-[12%] w-px bg-black/10" />
        <div className="relative z-10 flex h-full items-center justify-center">
          <DitherOrb className="mx-auto" />
        </div>
      </section>
      <section className="flex items-center justify-center border-y border-black/10 px-5 py-10 lg:border-y-0">
        <OAuthPanel className="w-full max-w-md" mode="signin" />
      </section>
    </main>
  );
}
