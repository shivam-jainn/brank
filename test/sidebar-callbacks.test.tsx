import { describe, expect, test, mock, beforeAll } from "bun:test";
import React from "react";

// Mock globals for Next.js and React Query
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: (path: string) => {
      (globalThis as any).lastPushedPath = path;
    },
  }),
  usePathname: () => (globalThis as any).currentPathname || "/chat",
}));

mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: (globalThis as any).queryData || [],
  }),
  useQueryClient: () => ({
    invalidateQueries: () => {},
  }),
}));

mock.module("motion/react", () => ({
  motion: {
    div: (props: any) => React.createElement("div", props, props.children),
    main: (props: any) => React.createElement("main", props, props.children),
  },
  AnimatePresence: (props: any) => props.children,
}));

// Mock Better Auth Client
mock.module("@/lib/auth-client", () => ({
  signOut: async () => ({ error: null }),
}));

// Mock React hooks to allow direct function call
mock.module("react", () => {
  const ReactActual = require("react");
  return {
    ...ReactActual,
    useState: (initial: any) => [initial, (val: any) => {}],
    useEffect: (fn: any, deps: any) => {
      // Simulate run
      try { fn(); } catch(e) {}
    },
    useCallback: (fn: any, deps: any) => fn,
    useMemo: (fn: any, deps: any) => fn(),
  };
});

import { AppSidebar } from "@/app/components/app-sidebar";

describe("AppSidebar state callbacks", () => {
  beforeAll(() => {
    // Setup minimal window environment
    globalThis.window = {
      localStorage: {
        getItem: (key: string) => (globalThis as any).storage[key] || null,
        setItem: (key: string, val: string) => {
          (globalThis as any).storage[key] = val;
        },
        removeItem: (key: string) => {
          delete (globalThis as any).storage[key];
        },
      },
    } as any;
    (globalThis as any).storage = {};
    (globalThis as any).lastPushedPath = "";
  });

  test("triggers onNewConversation when creating a new chat and routes to /chat", () => {
    let callbackTriggered = false;
    const onNewConversation = () => {
      callbackTriggered = true;
    };

    // Render component as a function to test logic
    const element = AppSidebar({
      sidebarOpen: true,
      setSidebarOpen: () => {},
      onNewConversation,
    });

    // Extract the onClick handler of the "New chat" button
    // The "New chat" button is the second element inside the aside (after the header container)
    const button = element.props.children[1];
    button.props.onClick();

    expect(callbackTriggered).toBe(true);
    expect((globalThis as any).lastPushedPath).toBe("/chat");
    expect(window.localStorage.getItem("brank-conversation-id")).toBeDefined();
  });

  test("triggers onResumeConversation when a recent chat is clicked", () => {
    let callbackTriggered = false;
    let resumedConvId = "";
    const onResumeConversation = (conversation: any) => {
      callbackTriggered = true;
      resumedConvId = conversation.id;
    };

    (globalThis as any).queryData = [{ id: "conv-123", title: "Test Chat" }];

    const element = AppSidebar({
      sidebarOpen: true,
      setSidebarOpen: () => {},
      onResumeConversation,
    });

    // The AnimatePresence is the 4th element (index 3)
    const animatePresence = element.props.children[3];
    const motionDiv = animatePresence.props.children;
    const buttonList = motionDiv.props.children[1].props.children;
    
    // Simulate clicking the first recent chat button
    buttonList[0].props.onClick();

    expect(callbackTriggered).toBe(true);
    expect(resumedConvId).toBe("conv-123");
    expect((globalThis as any).lastPushedPath).toBe("/chat");
  });

  test("triggers onOpenSettings callback when Settings is clicked", () => {
    let callbackTriggered = false;
    const onOpenSettings = () => {
      callbackTriggered = true;
    };

    const element = AppSidebar({
      sidebarOpen: true,
      setSidebarOpen: () => {},
      onOpenSettings,
    });

    const dropdownMenu = element.props.children[4];
    const dropdownContent = dropdownMenu.props.children[1];
    const settingsItem = dropdownContent.props.children[0];
    settingsItem.props.onClick();

    expect(callbackTriggered).toBe(true);
  });

  test("routes to /settings when Settings is clicked and onOpenSettings callback is not provided", () => {
    (globalThis as any).lastPushedPath = "";

    const element = AppSidebar({
      sidebarOpen: true,
      setSidebarOpen: () => {},
    });

    const dropdownMenu = element.props.children[4];
    const dropdownContent = dropdownMenu.props.children[1];
    const settingsItem = dropdownContent.props.children[0];
    settingsItem.props.onClick();

    expect((globalThis as any).lastPushedPath).toBe("/settings");
  });
});
