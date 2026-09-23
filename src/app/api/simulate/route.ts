import { runSimulation } from "@/backend";
import { body, respond } from "../http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return respond(async () => runSimulation(await body(request)));
}
