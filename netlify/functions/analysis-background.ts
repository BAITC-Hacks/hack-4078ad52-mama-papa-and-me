import { workerAuthorized } from "../../src/backend/worker-auth";

export const config = { background: true };

// This worker calls the protected Next.js adapter; it does not import Next's
// server-only modules into the standalone Netlify function bundle.
export default async function handler(request: Request) {
  const secret = process.env.WORKER_SECRET || "";
  if (!workerAuthorized(request, secret)) return new Response(null, { status: 403 });
  const { id } = await request.json();
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
    return new Response(null, { status: 400 });
  const origin = process.env.APP_ORIGIN || "";
  if (!origin.startsWith("https://") || new URL(origin).origin !== origin)
    throw new Error("Invalid worker origin");
  const deadline = Date.now() + 14 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${origin}/api/internal/analyses/${id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(55_000),
      redirect: "error",
    });
    if (response.status === 404) return;
    // Netlify retries errors. Database leases and persisted phase transitions
    // keep retries from silently creating a second paid phase.
    if (!response.ok) throw new Error(`Analysis worker HTTP ${response.status}`);
    const job = await response.json();
    if (job.status !== "pending") return;
    await new Promise(resolve => setTimeout(resolve, 4_000));
  }
  throw new Error("Worker deadline reached");
}
