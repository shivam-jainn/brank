import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { CHAT_ROUTE } from "@/components/marketing/auth-provider-buttons";

describe("auth navigation", () => {
  test("continues signed-in users to chat without opening settings", () => {
    expect(CHAT_ROUTE).toBe("/chat");
    expect(CHAT_ROUTE).not.toBe("/");
    expect(CHAT_ROUTE).not.toBe("/settings");
  });

  test("proxy redirects unauthorized requests to protected routes to sign-in page", () => {
    for (const path of ["/chat", "/dashboard", "/settings"]) {
      const req = new NextRequest(`http://localhost:3000${path}`);
      const res = proxy(req);
      expect(res).toBeDefined();
      expect(res!.status).toBe(307);
      expect(res!.headers.get("location")).toBe("http://localhost:3000/auth/sign-in");
    }
  });

  test("proxy lets public routes pass through without redirecting", () => {
    const req = new NextRequest("http://localhost:3000/some-random-public-route");
    const res = proxy(req);
    expect(res!.status).toBe(200);
  });

  test("proxy redirects authorized requests (session cookie present) trying to visit auth pages back to chat", () => {
    const req = new NextRequest("http://localhost:3000/auth/sign-in");
    req.cookies.set("better-auth.session_token", "dummy-session-token");
    const res = proxy(req);
    expect(res).toBeDefined();
    expect(res!.status).toBe(307);
    expect(res!.headers.get("location")).toBe("http://localhost:3000/chat");
  });

  test("proxy allows unauthorized requests to access landing page", () => {
    const req = new NextRequest("http://localhost:3000/");
    const res = proxy(req);
    expect(res!.status).toBe(200);
  });

  test("proxy redirects authorized requests (session cookie present) trying to visit landing page back to chat", () => {
    const req = new NextRequest("http://localhost:3000/");
    req.cookies.set("better-auth.session_token", "dummy-session-token");
    const res = proxy(req);
    expect(res).toBeDefined();
    expect(res!.status).toBe(307);
    expect(res!.headers.get("location")).toBe("http://localhost:3000/chat");
  });
});

