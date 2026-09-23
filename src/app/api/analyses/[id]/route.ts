import { cancelAnalysis, pollAnalysis, readAnalysis } from "@/backend";
import { getConfig } from "@/config";
import { body, respond } from "../../http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  return respond(async () => (getConfig().cloud ? readAnalysis : pollAnalysis)((await params).id));
}
export async function DELETE(request: Request, { params }: Context) {
  return respond(async () => {
    await body(request);
    return cancelAnalysis((await params).id);
  });
}
