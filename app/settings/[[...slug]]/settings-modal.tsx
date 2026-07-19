"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KeyRoundIcon } from "lucide-react";
import { useRouter } from "next/navigation";

type SettingsModalProps = {
  provider?: {
    id: string;
    name: string;
    apiKeyEnv?: string;
  };
};

export function SettingsModal({ provider }: SettingsModalProps) {
  const router = useRouter();
  const providerName = provider?.name ?? "Provider";
  const envName = provider?.apiKeyEnv ?? "PROVIDER_API_KEY";

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          router.push("/");
        }
      }}
      open
    >
      <DialogContent className=" gap-5 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <KeyRoundIcon className="size-4" />
          </div>
          <DialogTitle>API keys</DialogTitle>
          <DialogDescription>
            Add your {providerName} key to enable bring-your-own-key inference.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="provider-api-key">
            {envName}
          </label>
          <Input
            autoFocus
            id="provider-api-key"
            placeholder={`Enter ${providerName} API key`}
            type="password"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Key storage is not wired yet. For now, set this value in your server environment.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={() => router.push("/")} type="button" variant="outline">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
