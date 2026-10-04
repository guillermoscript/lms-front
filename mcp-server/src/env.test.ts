import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppOrigin } from "./env.js";

/** getAppOrigin (#843): where lms_complete_exercise finds the platform grader. */
describe("getAppOrigin", () => {
  const clear = () => {
    for (const k of [
      "LMS_APP_URL",
      "MCP_URL",
      "MCP_SERVER_URL",
      "LMS_PLATFORM_DOMAIN",
      "NEXT_PUBLIC_PLATFORM_DOMAIN",
    ])
      vi.stubEnv(k, "");
  };
  afterEach(() => vi.unstubAllEnvs());

  it("prefers LMS_APP_URL and strips trailing slashes", () => {
    clear();
    vi.stubEnv("LMS_APP_URL", "https://app.example.com//");
    vi.stubEnv("MCP_URL", "https://other.example.com/api/mcp");
    expect(getAppOrigin()).toBe("https://app.example.com");
  });

  it("derives the origin from MCP_URL when it is the proxied /api/mcp base", () => {
    clear();
    vi.stubEnv("MCP_URL", "https://school.example.com/api/mcp/");
    expect(getAppOrigin()).toBe("https://school.example.com");
  });

  it("falls back to MCP_SERVER_URL, and ignores an MCP URL without the suffix", () => {
    clear();
    vi.stubEnv("MCP_URL", "http://localhost:3000");
    vi.stubEnv("MCP_SERVER_URL", "https://legacy.example.com/api/mcp");
    expect(getAppOrigin()).toBe("https://legacy.example.com");
  });

  it("builds http:// for a local platform domain and https:// otherwise", () => {
    clear();
    vi.stubEnv("MCP_URL", "http://localhost:3000");
    vi.stubEnv("LMS_PLATFORM_DOMAIN", "lvh.me:3000");
    expect(getAppOrigin()).toBe("http://lvh.me:3000");
    vi.stubEnv("LMS_PLATFORM_DOMAIN", "lmsplatform.com/");
    expect(getAppOrigin()).toBe("https://lmsplatform.com");
  });

  it("is undefined when nothing is configured", () => {
    clear();
    expect(getAppOrigin()).toBeUndefined();
  });
});
