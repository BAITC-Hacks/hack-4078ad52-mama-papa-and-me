import { afterEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createPostgresStorage } from "@/storage/postgres";
import type { AnalysisJob } from "@/storage";
import { dataset, exampleSelections, scenarioInput } from "@/data";
import { simulate } from "@/engine";
import { body } from "@/app/api/http";
import { getConfig } from "@/config";
import handler from "../../netlify/functions/analysis-background";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function job(): AnalysisJob {
  const input = scenarioInput(exampleSelections);
  const result = simulate(input, dataset, true);
  if (!result.valid) throw new Error("fixture");
  return {
    id: randomUUID(), request: { ...input, kind: "final", question: "", districtId: null, measureId: null, requestId: randomUUID(), sessionId: randomUUID() },
    report: result.report, kind: "final", status: "pending", phase: "research",
    snapshotKey: "test", createdAt: new Date().toISOString(), mode: "ai", explanation: null,
    sources: [], error: null, providerId: "provider-test", researchText: "",
    usage: { input: 0, output: 0 }, model: "test", reasoning: "medium", promptVersion: "test",
  };
}

describe("cloud persistence and execution", () => {
  it("fails closed when a Netlify runtime has no persistent database", () => {
    vi.stubEnv("SITE_ID", "test-site");
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getConfig()).toThrow("Cloud configuration is incomplete");
  });

  it("uses a twelve-minute cloud deadline and rejects an unbounded deadline", () => {
    vi.stubEnv("DEPLOY_TARGET", "netlify");
    vi.stubEnv("DATABASE_URL", "postgresql://test.invalid/test");
    vi.stubEnv("APP_ORIGIN", "https://akim.example");
    vi.stubEnv("WORKER_SECRET", "test-secret-with-at-least-32-characters");
    expect(getConfig().maxAnalysisMs).toBe(720_000);
    vi.stubEnv("AI_MAX_ANALYSIS_MINUTES", "60");
    expect(() => getConfig()).toThrow("Invalid analysis limits");
  });

  it("runs PostgreSQL migration, deduplicates jobs, enforces quota and preserves terminal states", async () => {
    const pg = new PGlite();
    try {
      const migration = await readFile("src/storage/migrations/001-postgres.sql", "utf8");
      await pg.exec(migration);
      await pg.exec(migration);
      const db = createPostgresStorage("", 3, async (sql, params) => (await pg.query<Record<string, unknown>>(sql, params)).rows);
      const first = job();
      expect(await db.insertJob(first)).toBe(true);
      expect(await db.insertJob(first)).toBe(false);
      expect(await db.getRequest(first.request.requestId)).toEqual(first);
      const lease = await db.lock(first.id);
      expect(lease).toBeTruthy();
      expect(await db.lock(first.id)).toBe(false);
      await db.unlock(first.id, "wrong-token");
      expect(await db.lock(first.id)).toBe(false);
      await db.unlock(first.id, lease);
      expect(await db.lock(first.id)).toBeTruthy();
      await db.saveJob({ ...first, status: "cancelled", phase: "done" });
      await db.saveJob({ ...first, status: "completed", phase: "done" });
      expect((await db.getJob(first.id))?.status).toBe("cancelled");
      const admissions = await Promise.allSettled([db.insertJob(job()), db.insertJob(job())]);
      expect(admissions.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(admissions.filter(r => r.status === "rejected")).toHaveLength(1);
      const saved = { id: randomUUID(), name: "Test", createdAt: first.createdAt, input: first.report.input, report: first.report };
      await db.saveScenario(saved);
      expect(await db.getScenario(saved.id)).toEqual(saved);
      expect(await db.listScenarios()).toEqual([saved]);
      expect(await db.countRecent(first.request.sessionId, "2000-01-01")).toBe(1);
      expect(await db.activeJobs(first.request.sessionId)).toEqual([]);
    } finally { await pg.close(); }
  }, 30_000);

  it("allows the configured HTTPS origin and rejects a foreign origin", async () => {
    vi.stubEnv("APP_ORIGIN", "https://akim.example");
    const request = (origin: string) => new Request("https://akim.example/api/simulate", {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}",
    });
    expect(await body(request("https://akim.example"))).toEqual({});
    await expect(body(request("https://other.example"))).rejects.toThrow();
  });

  it("finishes a background job without any browser polling", async () => {
    vi.useFakeTimers();
    const secret = "worker-test-secret-at-least-32-characters";
    vi.stubEnv("WORKER_SECRET", secret);
    vi.stubEnv("APP_ORIGIN", "https://akim.example");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "pending" }))
      .mockResolvedValueOnce(Response.json({ status: "completed" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = handler(new Request("https://akim.example/.netlify/functions/analysis-background", {
      method: "POST", headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify({ id: randomUUID() }),
    }));
    await vi.advanceTimersByTimeAsync(4_100);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an unauthenticated worker invocation without doing work", async () => {
    vi.stubEnv("WORKER_SECRET", "worker-test-secret-at-least-32-characters");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await handler(new Request("https://akim.example/worker", { method: "POST" }));
    expect(response?.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
