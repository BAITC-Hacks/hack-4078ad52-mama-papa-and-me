import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataset, exampleSelections, scenarioInput } from "@/data";
import { simulate } from "@/engine";
import { createStorage } from "@/storage";
import { fallback } from "@/ai";
import { startAnalysis, pollAnalysis, cancelAnalysis } from "@/backend";
const provider = vi.hoisted(() => ({
  research: vi.fn(),
  explain: vi.fn(),
  retrieve: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/ai", async (original) => ({
  ...(await original<typeof import("@/ai")>()),
  createAI: () => provider,
}));
let directory: string, filename: string;
beforeEach(() => {
  vi.resetAllMocks();
  directory = mkdtempSync(path.join(tmpdir(), "akim-ai-"));
  filename = path.join(directory, "test.sqlite");
  vi.stubEnv("SQLITE_PATH", filename);
  vi.stubEnv("OPENAI_API_KEY", "test-only-placeholder");
  vi.stubEnv("AI_ENABLED", "true");
  provider.research.mockResolvedValue({ id: "research-1" });
  provider.explain.mockResolvedValue({ id: "explanation-1" });
  provider.cancel.mockResolvedValue({});
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});
function input() {
  return {
    ...scenarioInput(exampleSelections),
    kind: "final",
    question: "",
    requestId: randomUUID(),
    sessionId: randomUUID(),
  };
}
const research = {
  status: "completed",
  output_text: "Primary research context",
  usage: { input_tokens: 20, output_tokens: 10 },
  output: [
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: "Context",
          annotations: [
            {
              type: "url_citation",
              url: "https://example.org/study",
              title: "Fixture study",
            },
          ],
        },
      ],
    },
  ],
};
function finalResponse() {
  const result = simulate(scenarioInput(exampleSelections), dataset);
  if (!result.valid) throw new Error("fixture");
  return {
    status: "completed",
    output_text: JSON.stringify(fallback(result.report, "Test fixture")),
    usage: { input_tokens: 30, output_tokens: 15 },
  };
}
function updateJob(
  id: string,
  change: (
    job: NonNullable<ReturnType<ReturnType<typeof createStorage>["getJob"]>>,
  ) => void,
) {
  const db = createStorage(filename),
    job = db.getJob(id)!;
  change(job);
  db.saveJob(job);
  db.close();
}
describe("durable AI lifecycle with a fake provider (no network)", () => {
  it("deduplicates submissions, progresses through two phases and records usage", async () => {
    const request = input(),
      job = await startAnalysis(request);
    expect((await startAnalysis(request)).id).toBe(job.id);
    expect(provider.research).toHaveBeenCalledTimes(1);
    provider.retrieve
      .mockResolvedValueOnce(research)
      .mockResolvedValueOnce(finalResponse());
    expect((await pollAnalysis(job.id)).phase).toBe("explanation");
    const result = await pollAnalysis(job.id);
    expect(result.status).toBe("completed");
    expect(result.sources).toHaveLength(1);
    expect(result.usage).toEqual({ input: 50, output: 25 });
    expect(result.model).toBe("gpt-6-astra");
    expect(result.reasoning).toBe("medium");
    expect(result).not.toHaveProperty("providerId");
    expect(provider.explain).toHaveBeenCalledTimes(1);
  });
  it("returns an already completed answer after the browser was suspended", async () => {
    const job = await startAnalysis(input());
    provider.retrieve.mockResolvedValueOnce(research);
    await pollAnalysis(job.id);
    updateJob(job.id, (j) => {
      j.createdAt = new Date(Date.now() - 240_000).toISOString();
    });
    provider.retrieve.mockResolvedValueOnce(finalResponse());
    expect((await pollAnalysis(job.id)).status).toBe("completed");
    expect(provider.cancel).not.toHaveBeenCalled();
  });
  it("times out unfinished responses without retrying a paid phase", async () => {
    const job = await startAnalysis(input());
    updateJob(job.id, (j) => {
      j.createdAt = new Date(Date.now() - 240_000).toISOString();
    });
    provider.retrieve.mockResolvedValue({ status: "in_progress" });
    expect((await pollAnalysis(job.id)).mode).toBe("fallback");
    expect(provider.cancel).toHaveBeenCalledWith("research-1");
    expect(provider.explain).not.toHaveBeenCalled();
  });
  it("does not start synthesis if research finished after the deadline", async () => {
    const job = await startAnalysis(input());
    updateJob(job.id, (j) => {
      j.createdAt = new Date(Date.now() - 240_000).toISOString();
    });
    provider.retrieve.mockResolvedValue(research);
    expect((await pollAnalysis(job.id)).status).toBe("failed");
    expect(provider.explain).not.toHaveBeenCalled();
  });
  it("cancels superseded jobs and prevents late results from changing them", async () => {
    const first = input(),
      job = await startAnalysis(first);
    await startAnalysis({ ...input(), sessionId: first.sessionId });
    expect((await pollAnalysis(job.id)).status).toBe("cancelled");
    expect(provider.cancel).toHaveBeenCalledWith("research-1");
    expect(provider.retrieve).not.toHaveBeenCalled();
  });
  it("keeps cancellation when it arrives during provider retrieval", async () => {
    const job = await startAnalysis(input());
    updateJob(job.id, (j) => {
      j.createdAt = new Date(Date.now() - 240_000).toISOString();
    });
    provider.retrieve.mockImplementation(async () => {
      await cancelAnalysis(job.id);
      return { status: "in_progress" };
    });
    expect((await pollAnalysis(job.id)).status).toBe("cancelled");
    expect(provider.explain).not.toHaveBeenCalled();
  });
  it("does not create a duplicate generation when a transition was interrupted", async () => {
    const job = await startAnalysis(input());
    updateJob(job.id, (j) => {
      j.phase = "explanation";
      j.providerId = null;
      j.createdAt = new Date(Date.now() - 40_000).toISOString();
    });
    expect((await pollAnalysis(job.id)).mode).toBe("fallback");
    expect(provider.explain).not.toHaveBeenCalled();
  });
  it("does not accept research without citations or leak provider error details", async () => {
    const job = await startAnalysis(input());
    provider.retrieve.mockResolvedValue({ ...research, output: [] });
    expect((await pollAnalysis(job.id)).error).toContain("ссылок");
    provider.research.mockRejectedValue({
      status: 429,
      message: "private-provider-details",
    });
    const failed = await startAnalysis(input());
    expect(failed.error).toContain("лимит");
    expect(JSON.stringify(failed)).not.toContain("private-provider-details");
  });
});
