"use client";

import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import type { AttachmentData } from "@/components/ai-elements/attachments";
import {
  Message,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageActions,
  MessageAction,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { readUIMessageStream, parseJsonEventStream, uiMessageChunkSchema, type ToolUIPart } from "ai";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PencilIcon,
  PanelLeftIcon,
  Settings2Icon,
  SquarePenIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { hardSignOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { getStableBrowserId } from "@/lib/browser-id";
import { SettingsDialog, readProviderKeys } from "./settings-dialog";
import { AppSidebar } from "./app-sidebar";
import { motion } from "motion/react";
import { BrankLogo } from "@/components/ui/brank-logo";
import { useRecentConversations, CONVERSATIONS_QUERY_KEY } from "@/hooks/use-recent-conversations";
import type { SavedConversation, SavedChatMessage } from "@/hooks/use-recent-conversations";

const SUGGESTIONS = [
  "What are the latest trends in AI?",
  "How does machine learning work?",
  "Explain quantum computing",
  "Best practices for React development",
];

const isChatboxSearchEnabled = process.env.NEXT_PUBLIC_CHATBOX_SEARCH === "true";
const isChatboxVoiceEnabled = process.env.NEXT_PUBLIC_CHATBOX_VOICE === "true";

interface MessageType {
  key: string;
  from: "user" | "assistant";
  sources?: { href: string; title: string }[];
  versions: {
    id: string;
    content: string;
  }[];
  reasoning?: {
    content: string;
    duration: number;
  };
  tools?: {
    name: string;
    description: string;
    status: ToolUIPart["state"];
    parameters: Record<string, unknown>;
    result: string | undefined;
    error: string | undefined;
  }[];
}

type SourceUrlPart = {
  url?: string;
  title?: string;
};

type ToolLikePart = {
  type: string;
  toolName?: string;
  title?: string;
  state: ToolUIPart["state"];
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
};

function savedMessageToMessageType(message: SavedChatMessage): MessageType | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  return {
    key: message.id,
    from: message.role,
    versions: [{ id: message.id, content: message.content }],
  };
}

function conversationToMessages(
  conversation: SavedConversation | undefined
): MessageType[] {
  return (conversation?.messages ?? [])
    .map(savedMessageToMessageType)
    .filter((message): message is MessageType => Boolean(message));
}

export interface ClientProvider {
  id: string;
  name: string;
  description: string;
  apiKeyEnv?: string;
  isLocal: boolean;
  isConfigured: boolean;
  models: string[];
}

const AttachmentItem = ({
  attachment,
  onRemove,
}: {
  attachment: AttachmentData;
  onRemove: (id: string) => void;
}) => {
  const handleRemove = useCallback(() => {
    onRemove(attachment.id);
  }, [onRemove, attachment.id]);

  return (
    <Attachment data={attachment} onRemove={handleRemove}>
      <AttachmentPreview />
      <AttachmentRemove />
    </Attachment>
  );
};

const PromptInputAttachmentsDisplay = () => {
  const attachments = usePromptInputAttachments();

  const handleRemove = useCallback(
    (id: string) => {
      attachments.remove(id);
    },
    [attachments]
  );

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <AttachmentItem
          attachment={attachment}
          key={attachment.id}
          onRemove={handleRemove}
        />
      ))}
    </Attachments>
  );
};

const SuggestionItem = ({
  suggestion,
  onClick,
}: {
  suggestion: string;
  onClick: (suggestion: string) => void;
}) => {
  const handleClick = useCallback(() => {
    onClick(suggestion);
  }, [onClick, suggestion]);

  return <Suggestion onClick={handleClick} suggestion={suggestion} />;
};

const ChatMessage = ({
  from,
  messageKey,
  content,
  reasoning,
  sources,
  onEditUserMessage,
}: {
  from: "user" | "assistant";
  messageKey: string;
  content: string;
  reasoning?: MessageType["reasoning"];
  sources?: MessageType["sources"];
  onEditUserMessage: (messageKey: string, newContent: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<number>(0);

  useEffect(
    () => () => {
      window.clearTimeout(copyTimeoutRef.current);
    },
    []
  );

  const handleCopy = useCallback(async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      copyTimeoutRef.current = window.setTimeout(() => setIsCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  }, [content]);

  const handleSaveEdit = useCallback(() => {
    setIsEditing(false);
    if (from === "user") {
      onEditUserMessage(messageKey, editedContent);
    }
  }, [from, messageKey, editedContent, onEditUserMessage]);

  return (
    <Message className="py-1" from={from}>
      <div className="w-full">
        {sources?.length && (
          <div className="mb-3">
            <Sources>
              <SourcesTrigger count={sources.length} />
              <SourcesContent>
                {sources.map((source) => (
                  <Source href={source.href} key={source.href} title={source.title} />
                ))}
              </SourcesContent>
            </Sources>
          </div>
        )}
        {reasoning && (
          <div className="mb-3">
            <Reasoning duration={reasoning.duration}>
              <ReasoningTrigger />
              <ReasoningContent>{reasoning.content}</ReasoningContent>
            </Reasoning>
          </div>
        )}
        <MessageContent
          className={cn(
            from === "user"
              ? "ml-auto max-w-[85%] rounded-3xl bg-[#303030] px-4 py-2.5 text-[15px] font-normal text-[#ececec]"
              : "max-w-full rounded-2xl bg-[#303030] px-4 py-3 text-[15px] leading-7 text-[#ececec]"
          )}
        >
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea
                autoFocus
                className="min-h-[80px] w-full resize-y rounded-lg border border-white/10 bg-[#1f1f1f] px-3 py-2 text-[15px] leading-7 text-[#ececec] outline-none focus:border-white/25"
                onChange={(event) => setEditedContent(event.target.value)}
                value={editedContent}
              />
              <div className="flex justify-end gap-2">
                <button
                  className="rounded-lg px-3 py-1.5 text-[13px] text-[#b4b4b4] hover:bg-white/10"
                  onClick={() => {
                    setEditedContent(content);
                    setIsEditing(false);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-black hover:bg-[#e5e5e5]"
                  onClick={handleSaveEdit}
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <MessageResponse>{content}</MessageResponse>
          )}
        </MessageContent>
        <MessageActions
          className={cn(
            "mt-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
            from === "user" && "justify-end"
          )}
        >
          <MessageAction
            aria-label="Copy message"
            label="Copy message"
            onClick={handleCopy}
            tooltip={isCopied ? "Copied" : "Copy"}
          >
            {isCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </MessageAction>
          {from === "user" && (
            <MessageAction
              aria-label="Edit message"
              label="Edit message"
              onClick={() => setIsEditing((prev) => !prev)}
              tooltip="Edit"
            >
              <PencilIcon size={14} />
            </MessageAction>
          )}
        </MessageActions>
      </div>
    </Message>
  );
};

const ModelItem = ({
  provider,
  modelId,
  isSelected,
  onSelect,
}: {
  provider: ClientProvider;
  modelId: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) => {
  const id = `${provider.id}:${modelId}`;
  const handleSelect = useCallback(() => {
    onSelect(id);
  }, [onSelect, id]);

  return (
    <ModelSelectorItem
      className="ml-9 min-h-9 gap-3 px-3 py-2"
      onSelect={handleSelect}
      value={`${provider.name} ${provider.id} ${modelId}`}
    >
      <ModelSelectorName>{modelId}</ModelSelectorName>
      {isSelected ? (
        <CheckIcon className="ml-auto size-4" />
      ) : (
        <div className="ml-auto size-4" />
      )}
    </ModelSelectorItem>
  );
};

const ProviderAccordionItem = ({
  provider,
  selectedModel,
  onConfigure,
  onSelect,
}: {
  provider: ClientProvider;
  selectedModel: string;
  onConfigure: (providerId: string) => void;
  onSelect: (id: string) => void;
}) => {
  const sortedModels = useMemo(
    () => [...provider.models].sort((a, b) => a.localeCompare(b)),
    [provider.models]
  );

  return (
    <AccordionItem
      className="overflow-hidden rounded-xl border border-border/50 bg-background/30 data-open:bg-muted/30"
      value={provider.id}
    >
      <AccordionTrigger className="min-h-12 items-center gap-3 px-3 py-2 hover:bg-muted/50 hover:no-underline">
        <ModelSelectorLogo className="size-6 rounded-md ring-1 ring-white/10" provider={provider.id} />
        <div className="min-w-0 flex-1">
          <span className="block truncate font-medium">{provider.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {provider.isConfigured
              ? `${sortedModels.length} model${sortedModels.length === 1 ? "" : "s"} available`
              : provider.apiKeyEnv ?? "Bring your own key"}
          </span>
        </div>
        {!provider.isConfigured && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRoundIcon className="size-3.5" />
            Needs key
          </span>
        )}
      </AccordionTrigger>
      <AccordionContent className="space-y-1 px-0 pb-2">
        {provider.isConfigured && sortedModels.length > 0 ? (
          sortedModels.map((modelId) => (
            <ModelItem
              isSelected={selectedModel === `${provider.id}:${modelId}`}
              key={`${provider.id}:${modelId}`}
              modelId={modelId}
              provider={provider}
              onSelect={onSelect}
            />
          ))
        ) : (
          <ModelSelectorItem
            className="ml-9 min-h-9 gap-3 px-3 py-2 text-muted-foreground"
            onSelect={() => onConfigure(provider.id)}
            value={`${provider.name} ${provider.id} set API key`}
          >
            <KeyRoundIcon className="size-4" />
            <ModelSelectorName>Configure provider to load models</ModelSelectorName>
          </ModelSelectorItem>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

export function Chatbot() {
  const router = useRouter();
  const [providers, setProviders] = useState<ClientProvider[]>([]);
  const [model, setModel] = useState<string>(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem("brank-selected-model") ?? ""
  );
  const [modelSearch, setModelSearch] = useState("");
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"general" | "byok">("byok");
  const [settingsProviderId, setSettingsProviderId] = useState<string>();
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  const [text, setText] = useState<string>("");
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false);
  const [status, setStatus] = useState<
    "submitted" | "streaming" | "ready" | "error"
  >("ready");
  const [conversationId, setConversationId] = useState<string>(() =>
    typeof window === "undefined" ? "" : getStableBrowserId("brank-conversation-id")

  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const queryClient = useQueryClient();
  const scrollParentRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<MessageType[]>([]);

  const watermarkRef = useRef<HTMLSpanElement>(null);
  const [watermarkMousePos, setWatermarkMousePos] = useState({ x: -1000, y: -1000 });
  const [isHoveringChat, setIsHoveringChat] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!watermarkRef.current) return;
    const rect = watermarkRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setWatermarkMousePos({ x, y });
  }, []);

  const {
    data: savedConversations = [],
  } = useRecentConversations();

  const currentSavedConversation = useMemo(
    () => savedConversations.find((conversation) => conversation.id === conversationId),
    [conversationId, savedConversations]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 132,
    overscan: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const scrollToBottom = useCallback(() => {
    if (messages.length === 0) {
      return;
    }
    virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  }, [messages.length, virtualizer]);

  const loadProviders = useCallback(async (apiKeys: Record<string, string>) => {
      try {
        const hasKeys = Object.keys(apiKeys).length > 0;
        const res = await fetch("/api/models", {
          method: hasKeys ? "POST" : "GET",
          headers: hasKeys ? { "Content-Type": "application/json" } : undefined,
          body: hasKeys ? JSON.stringify({ apiKeys }) : undefined,
        });
        if (!res.ok) {
          throw new Error(`Failed to load providers: ${res.status}`);
        }
        const data = await res.json();
        const formatted: ClientProvider[] = Array.isArray(data.providers)
          ? data.providers
          : [];

        setProviders(formatted);
        const preferredProvider =
          formatted.find((provider) => provider.isLocal && provider.models.length > 0) ??
          formatted.find((provider) => provider.models.length > 0);

        if (preferredProvider) {
          setModel((current) => current || `${preferredProvider.id}:${preferredProvider.models[0]}`);
        }
      } catch (error) {
        console.error("Failed to load providers:", error);
      }
  }, []);

  useEffect(() => {
    const storedKeys = readProviderKeys();
    setProviderKeys(storedKeys);
    loadProviders(storedKeys);
    if (window.location.pathname.startsWith("/settings")) {
      const providerFromPath = window.location.pathname.match(/^\/settings\/byok\/([^/]+)/)?.[1];
      setSettingsSection(providerFromPath ? "byok" : "general");
      setSettingsProviderId(providerFromPath);
      setSettingsOpen(true);
    }
  }, [loadProviders]);

  const openProviderSettings = useCallback((providerId: string) => {
    setModelSelectorOpen(false);
    setModelSearch("");
    setSettingsSection("byok");
    setSettingsProviderId(providerId);
    setSettingsOpen(true);
    window.history.pushState(null, "", `/settings/byok/${providerId}`);
  }, []);

  const openGeneralSettings = useCallback(() => {
    setModelSelectorOpen(false);
    setSettingsSection("general");
    setSettingsProviderId(undefined);
    setSettingsOpen(true);
    window.history.pushState(null, "", "/settings");
  }, []);

  const handleSettingsOpenChange = useCallback((open: boolean) => {
    setSettingsOpen(open);
    if (!open && window.location.pathname.startsWith("/settings")) {
      router.push("/chat");
    }
  }, [router]);

  const handleKeysChange = useCallback((keys: Record<string, string>) => {
    setProviderKeys(keys);
    loadProviders(keys);
  }, [loadProviders]);

  const handleModelSelectorOpenChange = useCallback((open: boolean) => {
    setModelSelectorOpen(open);
    if (!open) {
      setModelSearch("");
    }
  }, []);

  useEffect(() => {
    if (status === "streaming" && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom, status]);

  useEffect(() => {
    if (messages.length > 0 || !currentSavedConversation) {
      return;
    }
    setMessages(conversationToMessages(currentSavedConversation));
  }, [currentSavedConversation, messages.length]);

  const selectedModelData = useMemo(
    () => {
      const [providerId, modelId] = model.split(":", 2);
      const provider = providers.find((item) => item.id === providerId);

      if (!(provider && modelId)) {
        return undefined;
      }

      return {
        name: modelId,
        provider,
      };
    },
    [model, providers]
  );

  const sortedProviders = useMemo(
    () =>
      [...providers].sort((a, b) => {
        if (a.isConfigured !== b.isConfigured) {
          return a.isConfigured ? -1 : 1;
        }
        if (a.isLocal !== b.isLocal) {
          return a.isLocal ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      }),
    [providers]
  );

  const visibleProviders = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();

    if (!query) {
      return sortedProviders;
    }

    return sortedProviders.filter((provider) => {
      const providerText = [
        provider.id,
        provider.name,
        provider.description,
        provider.apiKeyEnv,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        providerText.includes(query) ||
        provider.models.some((modelId) => modelId.toLowerCase().includes(query))
      );
    });
  }, [modelSearch, sortedProviders]);

  const addUserMessage = useCallback(
    async (content: string) => {
      // Validate model before sending message
      if (!model) {
        toast.error("Please select a model first.");
        setStatus("ready");
        return;
      }
      const [providerId, modelId] = model.split(":", 2);
      const isValidModel = providers.some(
        (provider) => provider.id === providerId && provider.models.includes(modelId)
      );
      if (!isValidModel) {
        toast.error(`The selected provider "${model}" is not valid or available.`);
        setStatus("ready");
        return;
      }

      const userMessageId = `user-${Date.now()}`;
      const userMessage: MessageType = {
        from: "user",
        key: userMessageId,
        versions: [
          {
            content,
            id: userMessageId,
          },
        ],
      };

      setMessages((prev) => [...prev, userMessage]);

      const currentMessages = [...messages, userMessage];

      const uiMessages = currentMessages.map((msg) => ({
        id: msg.versions[0]?.id || msg.key,
        role: msg.from === "user" ? ("user" as const) : ("assistant" as const),
        content: msg.versions[0]?.content || "",
        parts: [
          { type: "text" as const, text: msg.versions[0]?.content || "" },
        ],
      }));

      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: MessageType = {
        from: "assistant",
        key: assistantMessageId,
        versions: [
          {
            content: "",
            id: assistantMessageId,
          },
        ],
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStatus("streaming");
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-conversation-id": conversationId || getStableBrowserId("brank-conversation-id"),
            "x-session-id": getStableBrowserId("brank-session-id"),
            ...(providerKeys[model.split(":", 1)[0]]
              ? { "x-provider-api-key": providerKeys[model.split(":", 1)[0]] }
              : {}),
          },
          body: JSON.stringify({
            messages: uiMessages,
            model: model,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat API error: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error("No response body received");
        }

        const parsedStream = parseJsonEventStream({
          stream: response.body,
          schema: uiMessageChunkSchema,
        }).pipeThrough(
          new TransformStream({
            transform(part, controller) {
              if (part.success) {
                controller.enqueue(part.value);
              } else {
                throw part.error;
              }
            },
          })
        );

        const reader = readUIMessageStream({
          stream: parsedStream,
        });

        for await (const uiMessage of reader) {
          let text = "";
          let reasoningText = "";
          const sourcesList: { href: string; title: string }[] = [];
          const toolsList: NonNullable<MessageType["tools"]> = [];

          if (uiMessage.parts) {
            for (const part of uiMessage.parts) {
              if (part.type === "text") {
                text += part.text;
              } else if (part.type === "reasoning") {
                reasoningText += part.text;
              } else if (part.type === "source-url") {
                const sourcePart = part as SourceUrlPart;
                if (sourcePart.url) {
                  sourcesList.push({ href: sourcePart.url, title: sourcePart.title || sourcePart.url });
                }
              } else if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
                const toolPart = part as ToolLikePart;
                const toolName = part.type === "dynamic-tool" ? toolPart.toolName : part.type.slice(5);
                toolsList.push({
                  name: toolName ?? "tool",
                  description: toolPart.title || `Executing ${toolName}`,
                  status: toolPart.state,
                  parameters: toolPart.input || {},
                  result: toolPart.state === "output-available" ? JSON.stringify(toolPart.output) : undefined,
                  error: toolPart.state === "output-error" ? toolPart.errorText : undefined,
                });
              }
            }
          }

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.versions.some((v) => v.id === assistantMessageId)) {
                return {
                  ...msg,
                  versions: msg.versions.map((v) =>
                    v.id === assistantMessageId ? { ...v, content: text } : v
                  ),
                  reasoning: reasoningText
                    ? { content: reasoningText, duration: msg.reasoning?.duration || 0 }
                    : undefined,
                  sources: sourcesList.length ? sourcesList : undefined,
                  tools: toolsList.length ? toolsList : undefined,
                };
              }
              return msg;
            })
          );
        }

        setStatus("ready");
        await queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          toast.info("Conversation cancelled");
          setStatus("ready");
          return;
        }
        console.error("Error streaming chat response:", error);
        toast.error(`Error: ${error instanceof Error ? error.message : "Failed to get response"}`);
        setStatus("error");
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [model, providers, messages, conversationId, queryClient, providerKeys]
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const hasText = Boolean(message.text);
      const hasAttachments = Boolean(message.files?.length);

      if (!(hasText || hasAttachments)) {
        return;
      }

      setStatus("submitted");

      if (message.files?.length) {
        toast.success("Files attached", {
          description: `${message.files.length} file(s) attached to message`,
        });
      }

      addUserMessage(message.text || "Sent with attachments");
      setText("");
    },
    [addUserMessage]
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setStatus("submitted");
      addUserMessage(suggestion);
    },
    [addUserMessage]
  );

  const handleEditUserMessage = useCallback(
    (messageKey: string, newContent: string) => {
      if (!newContent.trim()) {
        return;
      }

      const messageIndex = messages.findIndex((msg) => msg.key === messageKey);

      if (messageIndex === -1) {
        return;
      }

      const trimmedMessages = messages.slice(0, messageIndex);

      setMessages(trimmedMessages);

      setStatus("submitted");
      addUserMessage(newContent);
    },
    [messages, addUserMessage]
  );

  const handleTranscriptionChange = useCallback((transcript: string) => {
    setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
  }, []);

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value);
    },
    []
  );

  const toggleWebSearch = useCallback(() => {
    if (!isChatboxSearchEnabled) {
      setUseWebSearch(false);
      return;
    }

    setUseWebSearch((prev) => !prev);
  }, []);

  const handleModelSelect = useCallback((modelId: string) => {
    window.localStorage.setItem("brank-selected-model", modelId);
    setModel(modelId);
    setModelSelectorOpen(false);
  }, []);

  const handleNewConversation = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    const next = crypto.randomUUID();
    window.localStorage.setItem("brank-conversation-id", next);
    setConversationId(next);
    setMessages([]);
    setStatus("ready");
  }, []);

  const handleLogout = useCallback(async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    const result = await hardSignOut();

    if (result.error) {
      toast.error(result.error.message ?? "Could not sign out.");
      return;
    }

    window.localStorage.removeItem("brank-session-id");
    const nextConversationId = crypto.randomUUID();
    window.localStorage.setItem("brank-conversation-id", nextConversationId);
    setConversationId(nextConversationId);
    setMessages([]);
    setText("");
    setStatus("ready");
    queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
    toast.success("Signed out.");
    window.location.reload();
  }, [queryClient]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleResumeConversation = useCallback((conversation: SavedConversation) => {
    setConversationId(conversation.id);
    window.localStorage.setItem("brank-conversation-id", conversation.id);
    setMessages(conversationToMessages(conversation));
    setStatus("ready");
  }, []);

  const handleScroll = useCallback(() => {
    const element = scrollParentRef.current;
    if (!element) {
      return;
    }

    const remaining =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    setIsAtBottom(remaining < 80);
  }, []);

  const isSubmitDisabled = useMemo(
    () => status !== "submitted" && status !== "streaming" && !text.trim(),
    [text, status]
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[#212121]">
      <AppSidebar 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={setSidebarOpen}
        currentConversationId={conversationId}
        onNewConversation={handleNewConversation}
        onResumeConversation={handleResumeConversation}
        onOpenSettings={openGeneralSettings}
      />

      <motion.main 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHoveringChat(true)}
        onMouseLeave={() => {
          setIsHoveringChat(false);
          setWatermarkMousePos({ x: -1000, y: -1000 });
        }}
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
      >
        <header className="z-20 flex h-14 shrink-0 items-center justify-between px-3 md:px-4">
          <div className="flex items-center gap-1">
            {!sidebarOpen && (
              <button
                aria-label="Open sidebar"
                className="hidden rounded-lg p-2 text-[#b4b4b4] hover:bg-white/10 md:block"
                onClick={() => setSidebarOpen(true)}
                type="button"
              >
                <PanelLeftIcon className="size-5" />
              </button>
            )}
            <button
              aria-label="New chat"
              className="rounded-lg p-2 text-[#b4b4b4] hover:bg-white/10 md:hidden"
              onClick={handleNewConversation}
              type="button"
            >
              <SquarePenIcon className="size-5" />
            </button>
            <ModelSelector onOpenChange={handleModelSelectorOpenChange} open={modelSelectorOpen}>
              <ModelSelectorTrigger
                render={
                  <button className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-[15px] font-medium text-[#ececec] transition-colors hover:bg-white/10">
                    <span className="max-w-[230px] truncate">
                      {selectedModelData?.name ?? "Select a model"}
                    </span>
                    <ChevronDownIcon className="size-4 text-[#a6a6a6]" />
                  </button>
                }
              />
              <ModelSelectorContent commandProps={{ shouldFilter: false }}>
                <ModelSelectorInput
                  onValueChange={setModelSearch}
                  placeholder="Search providers or models..."
                  value={modelSearch}
                />
                <ModelSelectorList>
                  {visibleProviders.length === 0 && (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      No providers or models found.
                    </div>
                  )}
                  <ModelSelectorGroup heading="Providers">
                    <Accordion
                      className="gap-1 rounded-none border-0 bg-transparent"
                      defaultValue={visibleProviders.find((provider) => provider.isConfigured)?.id}
                      key={visibleProviders.map((provider) => provider.id).join(":")}
                    >
                      {visibleProviders.map((provider) => (
                        <ProviderAccordionItem
                          key={provider.id}
                          onConfigure={openProviderSettings}
                          onSelect={handleModelSelect}
                          provider={provider}
                          selectedModel={model}
                        />
                      ))}
                    </Accordion>
                  </ModelSelectorGroup>
                </ModelSelectorList>
              </ModelSelectorContent>
            </ModelSelector>
          </div>
          <Link href="/">
            <BrankLogo className="md:hidden" showText={true} />
          </Link>
        </header>
        <SettingsDialog
          initialSection={settingsSection}
          initialProviderId={settingsProviderId}
          key={`${settingsSection}-${settingsProviderId ?? "settings"}`}
          onKeysChange={handleKeysChange}
          onOpenChange={handleSettingsOpenChange}
          open={settingsOpen}
          providers={providers}
        />

        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden select-none">
          <span
            ref={watermarkRef}
            className="text-[12vw] md:text-[120px] font-extrabold translate-y-[-3vh] tracking-tighter select-none bg-clip-text text-transparent bg-no-repeat transition-all duration-300"
            style={{
              backgroundImage: `radial-gradient(180px circle at ${watermarkMousePos.x}px ${watermarkMousePos.y}px, #d7ff73 0%, #2b2d31 50%, #151617 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            brank.
          </span>
        </div>

        <div
          className="z-10 w-full flex-1 overflow-y-auto"
          onScroll={handleScroll}
          ref={scrollParentRef}
          role="log"
        >
          <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
            {messages.length === 0 && (
              <div className="flex min-h-[42vh] items-end justify-center pb-3">
                <h1 className="text-center text-2xl font-semibold tracking-[-0.02em] text-[#ececec] md:text-3xl">
                  What can I help with?
                </h1>
              </div>
            )}
            {messages.length > 0 && (
              <div
                className="relative"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualItems.map((virtualItem) => {
                  const { versions, ...message } = messages[virtualItem.index];

                  return (
                    <div
                      className="absolute top-0 left-0 w-full pb-7"
                      data-index={virtualItem.index}
                      key={message.key}
                      ref={virtualizer.measureElement}
                      style={{
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <MessageBranch defaultBranch={0}>
                        <MessageBranchContent>
                          {versions.map((version) => (
                            <ChatMessage
                              key={`${message.key}-${version.id}`}
                              from={message.from}
                              messageKey={message.key}
                              content={version.content}
                              reasoning={message.reasoning}
                              sources={message.sources}
                              onEditUserMessage={handleEditUserMessage}
                            />
                          ))}
                        </MessageBranchContent>
                        {versions.length > 1 && (
                          <MessageBranchSelector className="mt-2">
                            <MessageBranchPrevious />
                            <MessageBranchPage />
                            <MessageBranchNext />
                          </MessageBranchSelector>
                        )}
                      </MessageBranch>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {!isAtBottom && messages.length > 0 && (
          <button
            aria-label="Scroll to bottom"
            className="absolute bottom-36 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-[#2f2f2f] text-white shadow-lg transition-colors hover:bg-[#3a3a3a]"
            onClick={scrollToBottom}
            type="button"
          >
            <ArrowDownIcon className="size-4" />
          </button>
        )}

        <div className="z-10 w-full shrink-0 bg-gradient-to-t from-[#212121] via-[#212121] to-transparent px-3 pt-4 pb-3 md:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {messages.length === 0 && (
              <Suggestions className="justify-center gap-2">
                {SUGGESTIONS.slice(0, 3).map((suggestion) => (
                  <SuggestionItem
                    key={suggestion}
                    onClick={handleSuggestionClick}
                    suggestion={suggestion}
                  />
                ))}
              </Suggestions>
            )}
            <PromptInput
              className="rounded-[26px] border border-white/5 bg-[#303030] shadow-[0_8px_28px_rgba(0,0,0,0.22)]"
              globalDrop
              multiple
              onSubmit={handleSubmit}
            >
            <PromptInputHeader>
              <PromptInputAttachmentsDisplay />
            </PromptInputHeader>
            <PromptInputBody>
              <PromptInputTextarea
                onChange={handleTextChange}
                value={text}
                placeholder="Ask anything"
                className="min-h-[54px] max-h-[200px] resize-none px-4 pt-4 text-[15px] placeholder:text-[#9b9b9b]"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                {isChatboxVoiceEnabled && (
                  <SpeechInput
                    className="shrink-0 rounded-full text-[#d0d0d0] hover:bg-white/10"
                    onTranscriptionChange={handleTranscriptionChange}
                    size="icon-sm"
                    variant="ghost"
                  />
                )}
                {isChatboxSearchEnabled && (
                  <PromptInputButton
                    className={cn("rounded-full", useWebSearch && "bg-white text-black hover:bg-white/90")}
                    onClick={toggleWebSearch}
                    variant={useWebSearch ? "default" : "ghost"}
                  >
                    <GlobeIcon size={16} />
                    <span>Search</span>
                  </PromptInputButton>
                )}
              </PromptInputTools>
              <PromptInputSubmit
                className="size-8 rounded-full bg-white text-black hover:bg-[#e5e5e5] disabled:bg-[#676767] disabled:text-[#303030]"
                disabled={isSubmitDisabled}
                onStop={handleCancel}
                status={status}
              />
            </PromptInputFooter>
          </PromptInput>
            <p className="text-center text-[11px] text-[#8b8b8b]">
              AI can make mistakes. Check important information.
            </p>
          </div>
        </div>
      </motion.main>
    </div>
  );
}

