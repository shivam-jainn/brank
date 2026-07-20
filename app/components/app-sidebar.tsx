"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  EyeDashed,
  LayoutDashboardIcon,
  LogOutIcon,
  PanelLeftIcon,
  Settings2Icon,
  SquarePenIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeftIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { hardSignOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { BrankLogo } from "@/components/ui/brank-logo";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { useRecentConversations, CONVERSATIONS_QUERY_KEY } from "@/hooks/use-recent-conversations";
import type { SavedConversation } from "@/hooks/use-recent-conversations";

export function AppSidebar({
  sidebarOpen,
  setSidebarOpen,
  currentConversationId,
  onNewConversation,
  onResumeConversation,
  onOpenSettings,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentConversationId?: string;
  onNewConversation?: () => void;
  onResumeConversation?: (conversation: SavedConversation) => void;
  onOpenSettings?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";
  const queryClient = useQueryClient();
  const [localConversationId, setLocalConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentConversationId) {
      setLocalConversationId(window.localStorage.getItem("brank-conversation-id"));
    }
  }, [currentConversationId]);

  const activeConversationId = currentConversationId ?? localConversationId;

  const { data: session } = useSession();
  const user = session?.user;
  const displayName = user?.name || user?.email || "Guest";
  const displayEmail = user?.email ?? "Not signed in";
  const initials =
    (user?.name ?? user?.email ?? "G")
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "G";

  const { data: savedConversations = [] } = useRecentConversations();

  const handleNewConversation = useCallback(() => {
    const next = crypto.randomUUID();
    window.localStorage.setItem("brank-conversation-id", next);
    if (!currentConversationId) {
      setLocalConversationId(next);
    }
    if (onNewConversation) {
      onNewConversation();
    }
    router.push("/chat");
  }, [router, onNewConversation, currentConversationId]);

  const handleResumeConversation = useCallback(
    (conversation: SavedConversation) => {
      window.localStorage.setItem("brank-conversation-id", conversation.id);
      if (!currentConversationId) {
        setLocalConversationId(conversation.id);
      }
      if (onResumeConversation) {
        onResumeConversation(conversation);
      }
      router.push("/chat");
    },
    [router, onResumeConversation, currentConversationId]
  );

  const handleGoToChat = useCallback(() => {
    router.push("/chat");
  }, [router]);

  const handleLogout = useCallback(async () => {
    const result = await hardSignOut();

    if (result.error) {
      toast.error(result.error.message ?? "Could not sign out.");
      return;
    }

    window.localStorage.removeItem("brank-session-id");
    const nextConversationId = crypto.randomUUID();
    window.localStorage.setItem("brank-conversation-id", nextConversationId);
    queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    toast.success("Signed out.");
    window.location.href = "/";
  }, [queryClient]);

  const openGeneralSettings = useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      router.push("/settings");
    }
  }, [onOpenSettings, router]);

  return (
    <aside
      className={cn(
        "hidden h-full w-[260px] shrink-0 flex-col bg-[#171717] p-2",
        sidebarOpen && "md:flex"
      )}
    >
      <div className="mb-2 flex h-10 items-center justify-between px-2">
        <Link href="/">
          <BrankLogo />
        </Link>
        <button
          aria-label="Collapse sidebar"
          className="rounded-lg p-2 text-[#b4b4b4] transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => setSidebarOpen(false)}
          type="button"
        >
          <PanelLeftIcon className="size-4" />
        </button>
      </div>
      <button
        className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors hover:bg-white/10"
        onClick={isDashboard ? handleGoToChat : handleNewConversation}
        type="button"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={isDashboard ? "dashboard" : "chat"}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3"
          >
            {isDashboard ? (
              <>
                <ArrowLeftIcon className="size-4" />
                <span>Go to chat</span>
              </>
            ) : (
              <>
                <SquarePenIcon className="size-4" />
                <span>New chat</span>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </button>

      {!isDashboard && (
        <Link
          className="mt-1 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors hover:bg-white/10 text-[#ececec]"
          href="/dashboard"
        >
          <EyeDashed className="size-4" />
          <span>Observe</span>
        </Link>
      )}

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-1 flex flex-col">
        <AnimatePresence initial={false}>
          {!isDashboard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="flex flex-col"
            >
              {savedConversations.length > 0 && (
                <p className="px-2 pb-2 text-xs font-medium text-[#8b8b8b]">Recent</p>
              )}
              <div className="space-y-0.5">
                {savedConversations.map((conversation) => (
                  <button
                    className={cn(
                      "block w-full truncate rounded-lg px-2 py-2 text-left text-sm text-[#ececec] transition-colors hover:bg-white/10",
                      conversation.id === activeConversationId && "bg-white/10"
                    )}
                    key={conversation.id}
                    onClick={() => handleResumeConversation(conversation)}
                    title={conversation.title ?? conversation.id}
                    type="button"
                  >
                    {conversation.title ?? "Untitled conversation"}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="mt-auto w-full">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/10 data-[popup-open]:bg-white/10"
                type="button"
              >
                <Avatar data-size="default" className="size-8 ring-1 ring-white/10">
                  {user?.image ? (
                    <AvatarImage alt={displayName} src={user.image} />
                  ) : null}
                  <AvatarFallback className="bg-[#252525] text-[#ececec]">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 text-[#ececec]">
                  <span className="block truncate font-medium">{displayName}</span>
                  <span className="block truncate text-xs text-[#8b8b8b]">
                    {displayEmail}
                  </span>
                </span>
                <ChevronDownIcon className="size-4 text-[#8b8b8b]" />
              </button>
            }
          />
          <DropdownMenuContent
            align="start"
            className="sidebar-dropdown-content w-[236px] rounded-xl border border-white/10 bg-[#2b2b2b]/95 p-1 text-[#ececec] shadow-2xl before:hidden"
            side="top"
            sideOffset={8}
          >
            <DropdownMenuItem
              className="min-h-10 rounded-lg px-3"
              onClick={openGeneralSettings}
            >
              <Settings2Icon className="size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              className="min-h-10 rounded-lg px-3"
              onClick={handleLogout}
            >
              <LogOutIcon className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
