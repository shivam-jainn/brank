"use client";

import { useMemo, useState } from "react";
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  Settings2Icon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";
import { cn } from "@/lib/utils";
import type { ClientProvider } from "./chatbot";

export const PROVIDER_KEYS_STORAGE_KEY = "brank-provider-api-keys";

export function readProviderKeys(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PROVIDER_KEYS_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

type SettingsDialogProps = {
  open: boolean;
  providers: ClientProvider[];
  initialSection?: "general" | "byok";
  initialProviderId?: string;
  onOpenChange: (open: boolean) => void;
  onKeysChange: (keys: Record<string, string>) => void;
};

export function SettingsDialog({
  open,
  providers,
  initialSection = "byok",
  initialProviderId,
  onOpenChange,
  onKeysChange,
}: SettingsDialogProps) {
  const remoteProviders = useMemo(
    () => providers.filter((provider) => !provider.isLocal),
    [providers]
  );
  const [section, setSection] = useState<"general" | "byok">(initialSection);
  const [activeProviderId, setActiveProviderId] = useState(initialProviderId);
  const [keys, setKeys] = useState<Record<string, string>>(readProviderKeys);
  const [savedProviderId, setSavedProviderId] = useState<string>();
  const [showKey, setShowKey] = useState(false);

  const activeProvider = remoteProviders.find(
    (provider) => provider.id === activeProviderId
  ) ?? remoteProviders[0];

  const saveKey = () => {
    if (!activeProvider) return;
    const nextKeys = { ...keys };
    if (nextKeys[activeProvider.id]?.trim()) {
      nextKeys[activeProvider.id] = nextKeys[activeProvider.id].trim();
    } else {
      delete nextKeys[activeProvider.id];
    }
    window.localStorage.setItem(PROVIDER_KEYS_STORAGE_KEY, JSON.stringify(nextKeys));
    setKeys(nextKeys);
    setSavedProviderId(activeProvider.id);
    onKeysChange(nextKeys);
    window.setTimeout(() => setSavedProviderId(undefined), 1600);
  };

  const removeKey = () => {
    if (!activeProvider) return;
    const nextKeys = { ...keys };
    delete nextKeys[activeProvider.id];
    window.localStorage.setItem(PROVIDER_KEYS_STORAGE_KEY, JSON.stringify(nextKeys));
    setKeys(nextKeys);
    setSavedProviderId(undefined);
    onKeysChange(nextKeys);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="h-[min(780px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] !w-[min(1280px,calc(100vw-3rem))] !max-w-none gap-0 overflow-hidden rounded-xl border border-white/10 bg-[#202020] p-0 text-[#ececec] shadow-2xl sm:!max-w-none"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 border-r border-white/10 bg-[#1b1b1b] p-3 sm:flex sm:flex-col">
            <div className="mb-3 flex items-center justify-between px-2 py-1">
              <span className="text-sm font-semibold">Settings</span>
              <Button
                aria-label="Close settings"
                onClick={() => onOpenChange(false)}
                size="icon-sm"
                variant="ghost"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
            <button
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-left text-sm text-[#b8b8b8] hover:bg-white/5",
                section === "general" && "bg-white/10 font-medium text-[#ececec]"
              )}
              onClick={() => setSection("general")}
              type="button"
            >
              <Settings2Icon className="size-4" />
              General
            </button>
            <button
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-left text-sm text-[#b8b8b8] hover:bg-white/5",
                section === "byok" && "bg-white/10 font-medium text-[#ececec]"
              )}
              onClick={() => setSection("byok")}
              type="button"
            >
              <KeyRoundIcon className="size-4" />
              BYOK
            </button>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5 sm:px-6">
              <div>
                <h2 className="text-base font-semibold">
                  {section === "byok" ? "Bring your own key" : "General"}
                </h2>
                <p className="text-xs text-[#9b9b9b]">
                  {section === "byok" ? "Connect your AI providers" : "App preferences"}
                </p>
              </div>
              <Button
                aria-label="Close settings"
                className="sm:hidden"
                onClick={() => onOpenChange(false)}
                size="icon-sm"
                variant="ghost"
              >
                <XIcon className="size-4" />
              </Button>
            </header>

            {section === "general" ? (
              <ScrollArea className="min-h-0 flex-1">
                <div className="mx-auto max-w-3xl space-y-2 p-5 sm:p-8">
                  <SettingsRow
                    detail="Brank follows the app theme so modals never flash white."
                    label="Appearance"
                    value="Dark"
                  />
                  <SettingsRow
                    detail="Model discovery updates after provider keys change."
                    label="Provider catalog"
                    value="Automatic"
                  />
                  <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-b border-white/10 py-3">
                    <div>
                      <p className="text-sm font-medium">BYOK requests</p>
                      <p className="mt-1 text-xs leading-5 text-[#9b9b9b]">Keys are attached only when chatting with that provider.</p>
                    </div>
                    <Switch checked disabled size="sm" />
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
                <ScrollArea className="border-b border-white/10 p-3 md:border-r md:border-b-0">
                  <div className="flex gap-1 md:flex-col">
                    {remoteProviders.map((provider) => {
                      const configured = Boolean(keys[provider.id] || provider.isConfigured);
                      return (
                        <button
                          className={cn(
                            "flex min-w-36 items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-white/5 md:min-w-0",
                            activeProvider?.id === provider.id && "bg-white/10"
                          )}
                          key={provider.id}
                          onClick={() => {
                            setActiveProviderId(provider.id);
                            setShowKey(false);
                          }}
                          type="button"
                        >
                          <ModelSelectorLogo className="size-5 rounded bg-white p-0.5 dark:invert-0" provider={provider.id} />
                          <span className="min-w-0 flex-1 truncate text-sm">{provider.name}</span>
                          {configured && <CheckIcon className="size-3.5 text-[#86b85b]" />}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>

                <ScrollArea className="min-h-0">
                  {activeProvider && (
                    <div className="mx-auto max-w-3xl space-y-6 p-5 sm:p-8">
                      <div className="flex items-start gap-4">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white">
                          <ModelSelectorLogo className="size-7 dark:invert-0" provider={activeProvider.id} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-base font-semibold">{activeProvider.name}</h3>
                            {(keys[activeProvider.id] || activeProvider.isConfigured) && (
                              <Badge className="bg-[#86b85b]/15 text-[#a7d980]" variant="secondary">Connected</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-sm leading-5 text-[#a5a5a5]">{activeProvider.description}</p>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor={`key-${activeProvider.id}`}>
                          API key
                        </label>
                        <div className="relative">
                          <Input
                            autoComplete="off"
                            className="h-11 border-white/10 bg-[#171717] pr-11 font-mono text-sm"
                            id={`key-${activeProvider.id}`}
                            onChange={(event) => setKeys((current) => ({ ...current, [activeProvider.id]: event.target.value }))}
                            placeholder={`Enter your ${activeProvider.name} API key`}
                            type={showKey ? "text" : "password"}
                            value={keys[activeProvider.id] ?? ""}
                          />
                          <Button
                            aria-label={showKey ? "Hide API key" : "Show API key"}
                            className="absolute top-1.5 right-1.5"
                            onClick={() => setShowKey((current) => !current)}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            {showKey ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                          </Button>
                        </div>
                        <p className="text-xs leading-5 text-[#8f8f8f]">Key is stored locally in this browser and sent per-request to the server.</p>
                      </div>
                      <div className="flex flex-col gap-4 rounded-lg border border-white/10 bg-[#181818] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-[#86b85b]" />
                          <p className="text-xs leading-5 text-[#a5a5a5]">Your key is never included in saved conversations or inference telemetry.</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            disabled={!keys[activeProvider.id]?.trim()}
                            onClick={removeKey}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Remove
                          </Button>
                          <Button disabled={!keys[activeProvider.id]?.trim()} onClick={saveKey} size="sm" type="button">
                            {savedProviderId === activeProvider.id ? "Saved" : "Save key"}
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs leading-5 text-[#8f8f8f]">
                        Provider models appear in the selector after the key is saved and discovery succeeds.
                      </p>
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsRow({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-b border-white/10 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[#9b9b9b]">{detail}</p>
      </div>
      <span className="shrink-0 text-sm text-[#ececec]">{value}</span>
    </div>
  );
}
