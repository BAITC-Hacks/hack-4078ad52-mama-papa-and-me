import { pollAnalysis } from "@/backend";
import { workerAuthorized } from "@/backend/worker-auth";
import { getConfig } from "@/config";
import { respond } from "../../../http";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!workerAuthorized(request, getConfig().workerSecret))
    return new Response(null, { status: 403 });
  return respond(async () => pollAnalysis((await params).id));
}
