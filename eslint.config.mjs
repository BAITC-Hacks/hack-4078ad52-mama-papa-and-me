import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["@/backend*", "@/storage*", "@/ai*", "@/config*"] },
      ],
    },
  },
  {
    files: ["src/engine/**/*.{ts,tsx}", "src/contracts/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "react",
            "next*",
            "openai",
            "better-sqlite3",
            "@/backend*",
            "@/storage*",
            "@/ai*",
            "@/config*",
            "@/ui*",
            "@/data*",
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
