import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublishableKey, getSupabaseUrl } from "./env.js";
import { createUserClient } from "./supabase.js";
import { errorResult } from "./format.js";

const PUBLIC_KEY = "sb_publishable_test_only";
const CONFIG_NAMES = [
  "MCP_USE_OAUTH_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL",
  "MCP_USE_OAUTH_SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_ID",
  "MCP_USE_OAUTH_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
];
const jwt = (role: string) => `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.test`;

beforeEach(() => {
  for (const name of CONFIG_NAMES) vi.stubEnv(name, "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Supabase public configuration", () => {
  it("accepts the variable names documented by mcp-use v2", () => {
    vi.stubEnv("SUPABASE_PROJECT_ID", "project-test");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", PUBLIC_KEY);
    expect(getSupabaseUrl()).toBe("https://project-test.supabase.co");
    expect(getPublishableKey()).toBe(PUBLIC_KEY);
  });
  it("accepts the app's public variables when explicitly passed to this process", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://project.example.com/// ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY", jwt("anon"));
    expect(getSupabaseUrl()).toBe("https://project.example.com");
    expect(getPublishableKey()).toBe(jwt("anon"));
  });
  it("preserves explicit MCP overrides and trims whitespace", () => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_other");
    vi.stubEnv("MCP_USE_OAUTH_SUPABASE_PUBLISHABLE_KEY", ` ${PUBLIC_KEY}\n`);
    vi.stubEnv("SUPABASE_URL", "https://fallback.example.com");
    vi.stubEnv("MCP_USE_OAUTH_SUPABASE_URL", " https://override.example.com/ ");
    expect(getPublishableKey()).toBe(PUBLIC_KEY);
    expect(getSupabaseUrl()).toBe("https://override.example.com");
  });
  it.each(["sb_secret_test", jwt("service_role"), jwt("authenticated"), "placeholder", "eyJmalformed"])("rejects privileged/non-API credentials without echoing them", key => {
    vi.stubEnv("MCP_USE_OAUTH_SUPABASE_PUBLISHABLE_KEY", key);
    vi.stubEnv("SUPABASE_ANON_KEY", jwt("anon"));
    expect(() => getPublishableKey()).toThrow();
    try { getPublishableKey(); } catch (err) { expect(String(err)).not.toContain(key); }
  });
  it("rejects an audit credential reused as a public key", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", PUBLIC_KEY);
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", PUBLIC_KEY);
    expect(() => getPublishableKey()).toThrow("never a secret or service-role key");
  });
  it("reports missing public credentials before a tool query", () => {
    expect(() => getPublishableKey()).toThrow("not configured");
    expect(() => getSupabaseUrl()).toThrow("not configured");
  });
});

describe("request-scoped data access", () => {
  it("sends the public key and caller's bearer separately, preserving RLS identity", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.example.com");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", PUBLIC_KEY);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_audit_only");
    const mockFetch = vi.fn(async () => new Response("[]", { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", mockFetch);
    const result = await createUserClient("caller-access-token").from("courses").select("course_id");
    expect(result.error).toBeNull();
    const [, options] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(headers.get("apikey")).toBe(PUBLIC_KEY);
    expect(headers.get("authorization")).toBe("Bearer caller-access-token");
  });
  it("returns an actionable configuration error for the observed gateway rejection", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.example.com");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", PUBLIC_KEY);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Unregistered API key" }), { status: 401, headers: { "Content-Type": "application/json" } })));
    const { error } = await createUserClient("caller-access-token").from("courses").select("course_id");
    expect(error).not.toBeNull();
    const result = errorResult(`Listing courses: ${error!.message}`);
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error_code).toBe("UPSTREAM_CONFIGURATION_ERROR");
    expect(result.content[0].text).toContain("same project");
    expect(result.content[0].text).not.toContain(PUBLIC_KEY);
  });
  it("does not label other failures as invalid arguments", () => {
    expect(errorResult("Course not found")).toEqual({ isError: true, content: [{ type: "text", text: "Error: Course not found" }] });
  });
});
