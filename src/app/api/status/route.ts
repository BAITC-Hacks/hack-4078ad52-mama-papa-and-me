import { systemStatus } from "@/backend";
import { respond } from "../http";
export const runtime = "nodejs";
export async function GET() {
  return respond(systemStatus);
}
