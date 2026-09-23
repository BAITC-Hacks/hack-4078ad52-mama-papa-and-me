import { getScenario } from "@/backend";
import { respond } from "../../http";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => getScenario((await params).id));
}
