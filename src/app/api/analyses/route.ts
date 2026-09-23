import { startAnalysis, cancelAnalysis, HttpError } from "@/backend";
import { dispatchAnalysis } from "@/backend/dispatch";
import { body, respond } from "../http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return respond(async () => {
    const job = await startAnalysis(await body(request));
    if (job.status === "pending") {
      try { await dispatchAnalysis(job.id); }
      catch {
        await cancelAnalysis(job.id);
        throw new HttpError(503, "Фоновый запуск недоступен. Анализ отменён; повторите позже.");
      }
    }
    return job;
  }, 202);
}
