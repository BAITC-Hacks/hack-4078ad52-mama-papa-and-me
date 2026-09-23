import "server-only";
import path from "node:path";
export function getConfig() {
  const cloud = process.env.DEPLOY_TARGET === "netlify" || Boolean(process.env.SITE_ID) || process.env.NETLIFY === "true";
  const databaseUrl = process.env.DATABASE_URL?.trim() || "";
  const appOrigin = process.env.APP_ORIGIN?.trim() || "";
  const workerSecret = process.env.WORKER_SECRET?.trim() || "";
  if (cloud && (!databaseUrl || !appOrigin || workerSecret.length < 32))
    throw new Error("Cloud configuration is incomplete");
  const minutes = Number(process.env.AI_MAX_ANALYSIS_MINUTES || (cloud ? 12 : 3));
  const dailyAnalysisLimit = Number(process.env.AI_DAILY_ANALYSIS_LIMIT || 50);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 12 ||
      !Number.isInteger(dailyAnalysisLimit) || dailyAnalysisLimit < 0)
    throw new Error("Invalid analysis limits");
  if (appOrigin && (new URL(appOrigin).origin !== appOrigin || !appOrigin.startsWith("https://")))
    throw new Error("APP_ORIGIN must be an HTTPS origin without a trailing slash");
  return {
    cloud, databaseUrl, appOrigin, workerSecret, dailyAnalysisLimit,
    apiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
    model: process.env.OPENAI_MODEL || "gpt-6-astra",
    effort: "medium" as const,
    databasePath: path.resolve(
      /* turbopackIgnore: true */ process.cwd(),
      process.env.SQLITE_PATH || "./var/akim.sqlite",
    ),
    aiEnabled: process.env.AI_ENABLED !== "false",
    maxAnalysisMs: minutes * 60_000,
  };
}
