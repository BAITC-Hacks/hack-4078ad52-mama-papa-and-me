import { closeStorageConnections } from "@/backend";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { exampleSelections, scenarioInput } from "@/data";
import { createStorage } from "@/storage";
import { startAnalysis, pollAnalysis, cancelAnalysis, saveScenario, getScenario } from "@/backend";
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
  closeStorageConnections();
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
  return {
    status: "completed",
    output_text: JSON.stringify({ summary: { text: "Сценарий улучшает положение Нуры.", factIds: ["score.after", "nura.score.after"], sourceIds: [] }, strengths: [], risks: [], recommendations: [], context: [], limitations: ["Эффекты синтетические."] }),
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
  db.close();
  // Deliberately alter persisted fixtures, including terminal records, to test
  // validation of legacy/corrupt archives; production saveJob forbids this.
  const raw = new Database(filename);
  raw.prepare("UPDATE analyses SET payload=? WHERE id=?").run(JSON.stringify(job), id);
  raw.close();
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

it("deduplicates while a previous provider cancellation is still waiting", async () => {
  const first = input();
  await startAnalysis(first);
  let release!: () => void;
  provider.cancel.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
  const request = { ...input(), sessionId: first.sessionId };
  const a = startAnalysis(request);
  const b = startAnalysis(request);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  release();
  const [one, two] = await Promise.all([a, b]);
  expect(one.id).toBe(two.id);
  expect(provider.research).toHaveBeenCalledTimes(2);
});

it("does not launch a superseded job after awaited cancellation", async () => {
  const first = input();
  await startAnalysis(first);
  let release!: () => void;
  provider.cancel.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  const older = startAnalysis({ ...input(), sessionId: first.sessionId });
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const newer = await startAnalysis({ ...input(), sessionId: first.sessionId });
  release();
  expect((await older).status).toBe("cancelled");
  expect(newer.status).toBe("pending");
  expect(provider.research).toHaveBeenCalledTimes(2);
});

it("rejects request ID reuse with another question or session", async () => {
  const request = input();
  await startAnalysis(request);
  await expect(startAnalysis({ ...request, question: "Другой вопрос" })).rejects.toMatchObject({ status: 409 });
  await expect(startAnalysis({ ...request, sessionId: randomUUID() })).rejects.toMatchObject({ status: 409 });
  expect(provider.research).toHaveBeenCalledTimes(1);
});

it("saves the final explanation, sources and server facts with the matching scenario", async () => {
  const job = await startAnalysis(input());
  provider.retrieve.mockResolvedValueOnce(research).mockResolvedValueOnce(finalResponse());
  await pollAnalysis(job.id);
  const completed = await pollAnalysis(job.id);
  expect(completed.evidence?.find((f) => f.id === "score.after")?.value).toBeCloseTo(56.54307, 8);
  const saved = await saveScenario({ ...scenarioInput(exampleSelections), name: "С объяснением", analysisId: job.id });
  expect((await getScenario(saved.id)).analysis).toEqual(completed);
  expect(saved.analysis).not.toHaveProperty("providerId");
  const other = exampleSelections.map((s) => s.measureId === "M10" ? { ...s, districtId: "esil" } : s);
  await expect(saveScenario({ ...scenarioInput(other), name: "Другой", analysisId: job.id })).rejects.toThrow("не относится");
});

it("rejects pending analyses when saving but still permits saving without AI", async () => {
  const job = await startAnalysis(input());
  await expect(saveScenario({ ...scenarioInput(exampleSelections), name: "Ожидание", analysisId: job.id })).rejects.toThrow();
  expect((await saveScenario({ ...scenarioInput(exampleSelections), name: "Без AI" })).analysis).toBeUndefined();
});

it("keeps cancellation arriving during timeout cleanup", async () => {
  const job = await startAnalysis(input());
  updateJob(job.id, (j) => { j.createdAt = new Date(Date.now() - 240000).toISOString(); });
  provider.retrieve.mockResolvedValue({ status: "in_progress" });
  provider.cancel.mockImplementation(async () => { updateJob(job.id, (j) => { j.status = "cancelled"; }); });
  expect((await pollAnalysis(job.id)).status).toBe("cancelled");
});

it("rejects forged numeric prose and exposes a labelled fallback", async () => {
  const job = await startAnalysis(input());
  provider.retrieve.mockResolvedValueOnce(research);
  await pollAnalysis(job.id);
  const fake = finalResponse();
  const explanation = JSON.parse(fake.output_text);
  explanation.summary.text = "Итоговый Score равен 99,99.";
  provider.retrieve.mockResolvedValue({ ...fake, output_text: JSON.stringify(explanation) });
  const result = await pollAnalysis(job.id);
  expect(result.status).toBe("failed");
  expect(result.mode).toBe("fallback");
  expect(result.explanation?.summary.text).not.toContain("99,99");
});

it("does not revive a failed startup when the provider returns late", async () => {
  let release!: (value: { id: string }) => void;
  provider.research.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const request = input();
  const pending = startAnalysis(request);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const db = createStorage(filename);
  const job = db.getRequest(request.requestId)!;
  db.close();
  updateJob(job.id, (j) => { j.createdAt = new Date(Date.now() - 40000).toISOString(); });
  expect((await pollAnalysis(job.id)).status).toBe("failed");
  release({ id: "late-research" });
  expect((await pending).status).toBe("failed");
  expect(provider.cancel).toHaveBeenCalledWith("late-research");
  expect((await pollAnalysis(job.id)).status).toBe("failed");
});

it("resaves an older prompt only if its explanation passes current checks", async () => {
  const job = await startAnalysis(input());
  provider.retrieve.mockResolvedValueOnce(research).mockResolvedValueOnce(finalResponse());
  await pollAnalysis(job.id);
  await pollAnalysis(job.id);
  updateJob(job.id, (j) => { j.promptVersion = "urban-advisor-2"; });
  const saved = await saveScenario({ ...scenarioInput(exampleSelections), name: "Проверенный архив", analysisId: job.id });
  expect(saved.analysis?.promptVersion).toBe("urban-advisor-2");
  expect(saved.analysis?.explanation?.summary.text).toContain("Нуры");
  updateJob(job.id, (j) => { j.explanation!.summary.text = "Итоговый Score равен 99,99."; });
  await expect(saveScenario({ ...scenarioInput(exampleSelections), name: "Ошибочный архив", analysisId: job.id })).rejects.toThrow("текущую проверку");
});
