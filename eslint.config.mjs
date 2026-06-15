import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
]);

export default eslintConfig;
