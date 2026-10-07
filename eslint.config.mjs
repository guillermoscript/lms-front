import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// BYOK (issue: bring-your-own AI keys): provider SDKs are constructed in exactly
// one place, lib/ai/providers.ts, from a tenant's decrypted key. Importing one
// anywhere else (or the `openai` / `assemblyai` packages) means a code path that
// could pick up a platform key or hardcode a vendor. UI-only and protocol
// packages stay allowed: @ai-sdk/react, @ai-sdk/mcp, @ai-sdk/otel and the
// provider spec/utils packages (types).
const PROVIDER_IMPORT_MESSAGE =
  "Import AI providers only in lib/ai/providers.ts. Everywhere else get a model from createTenantAi() (lib/ai/tenant-ai.ts).";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / compiled output (not source we own):
    "**/dist/**",
    "mcp-server/.mcp-use/**",
    // mcp-server is a separate workspace with its own lint pipeline:
    "mcp-server/**",
    // Vendored skill tooling (untracked, bundled/minified — not app code):
    ".agents/**",
    ".claude/**",
  ]),
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,mts,cts}"],
    // lib/speech/realtime-model.ts is the one client-side provider import: it
    // builds the browser realtime model for the school's provider and can never
    // hold a key (the browser only ever gets an ephemeral token).
    ignores: ["lib/ai/providers.ts", "lib/speech/realtime-model.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          // Bare package names go in `paths`: as a gitignore-style pattern,
          // "openai" would also match our own ./coaches/openai module.
          paths: [
            { name: "openai", message: PROVIDER_IMPORT_MESSAGE },
            { name: "assemblyai", message: PROVIDER_IMPORT_MESSAGE },
          ],
          patterns: [
            {
              group: [
                "@ai-sdk/*",
                "!@ai-sdk/react",
                "!@ai-sdk/mcp",
                "!@ai-sdk/otel",
                "!@ai-sdk/provider",
                "!@ai-sdk/provider-utils",
                "@openrouter/*",
                "openai/*",
                "assemblyai/*",
              ],
              message: PROVIDER_IMPORT_MESSAGE,
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
