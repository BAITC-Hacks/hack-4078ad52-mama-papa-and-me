import "server-only";
import { getConfig } from "@/config";

export async function dispatchAnalysis(id: string) {
  const config = getConfig();
  if (!config.cloud) return;
  const response = await fetch(`${config.appOrigin}/.netlify/functions/analysis-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.workerSecret}` },
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (response.status !== 202) throw new Error("Background dispatch failed");
}
