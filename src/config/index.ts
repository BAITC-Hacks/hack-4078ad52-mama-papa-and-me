import "server-only";
import path from "node:path";
export function getConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
    model: process.env.OPENAI_MODEL || "gpt-6-astra",
    effort: "medium" as const,
    databasePath: path.resolve(
      /* turbopackIgnore: true */ process.cwd(),
      process.env.SQLITE_PATH || "./var/akim.sqlite",
    ),
    aiEnabled: process.env.AI_ENABLED !== "false",
    maxAnalysisMs: 180_000,
  };
}
