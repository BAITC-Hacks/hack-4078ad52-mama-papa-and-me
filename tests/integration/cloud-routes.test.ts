import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/analyses/[id]/route";
import { POST as advance } from "@/app/api/internal/analyses/[id]/route";
import { POST as create } from "@/app/api/analyses/route";

const backend = vi.hoisted(() => ({
  readAnalysis: vi.fn(), pollAnalysis: vi.fn(), startAnalysis: vi.fn(), cancelAnalysis: vi.fn(),
}));
vi.mock("@/backend", async original => ({
  ...await original<typeof import("@/backend")>(), ...backend,
}));
const secret = "cloud-test-secret-with-more-than-32-characters";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DEPLOY_TARGET", "netlify");
  vi.stubEnv("DATABASE_URL", "postgresql://test.invalid/test");
  vi.stubEnv("APP_ORIGIN", "https://akim.example");
  vi.stubEnv("WORKER_SECRET", secret);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const params = () => ({ params: Promise.resolve({ id: "test-job" }) });

it("cloud browser polling only reads state and never advances paid work", async () => {
  backend.readAnalysis.mockResolvedValue({ id: "test-job", status: "pending" });
  const response = await GET(new Request("https://akim.example/api/analyses/test-job"), params());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(backend.readAnalysis).toHaveBeenCalledWith("test-job");
  expect(backend.pollAnalysis).not.toHaveBeenCalled();
});

it("internal endpoint refuses requests without the worker credential", async () => {
  const response = await advance(new Request("https://akim.example/api/internal/analyses/test-job", { method: "POST" }), params());
  expect(response.status).toBe(403);
  expect(backend.pollAnalysis).not.toHaveBeenCalled();
});

it("authenticated worker advances the persisted job", async () => {
  backend.pollAnalysis.mockResolvedValue({ status: "completed" });
  const response = await advance(new Request("https://akim.example/api/internal/analyses/test-job", {
    method: "POST", headers: { authorization: `Bearer ${secret}` },
  }), params());
  expect(response.status).toBe(200);
  expect(backend.pollAnalysis).toHaveBeenCalledWith("test-job");
});

it("a failed background dispatch cancels the job and returns a recoverable error", async () => {
  backend.startAnalysis.mockResolvedValue({ id: "test-job", status: "pending" });
  const send = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", send);
  const response = await create(new Request("https://akim.example/api/analyses", {
    method: "POST", headers: { origin: "https://akim.example", "content-type": "application/json" }, body: "{}",
  }));
  expect(response.status).toBe(503);
  expect(backend.cancelAnalysis).toHaveBeenCalledWith("test-job");
  expect(send).toHaveBeenCalledWith("https://akim.example/.netlify/functions/analysis-background", expect.objectContaining({ redirect: "error" }));
  expect(JSON.stringify(await response.json())).not.toContain(secret);
});
