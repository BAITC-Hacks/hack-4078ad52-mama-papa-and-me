import { listScenarios, saveScenario } from "@/backend";
import { body, respond } from "../http";
export const runtime = "nodejs";
export async function GET() {
  return respond(listScenarios);
}
export async function POST(request: Request) {
  return respond(async () => saveScenario(await body(request)), 201);
}
