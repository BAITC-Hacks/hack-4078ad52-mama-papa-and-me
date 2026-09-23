import { closeStorageConnections } from "@/backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataset, exampleSelections, scenarioInput } from "@/data";
import { simulate } from "@/engine";
import { createStorage } from "@/storage";
import {
  runSimulation,
  startAnalysis,
  saveScenario,
  getScenario,
  cancelAnalysis,
  pollAnalysis,
} from "@/backend";
import { fallback, verifyExplanation } from "@/ai";
const directories: string[] = [];
afterEach(() => {
  closeStorageConnections();
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function temp() {
  const directory = mkdtempSync(path.join(tmpdir(), "akim-test-"));
  directories.push(directory);
  return path.join(directory, "test.sqlite");
}
describe("server boundaries and persistence", () => {
  it("rejects client-provided price and Score", () => {
    expect(() =>
      runSimulation({
        ...scenarioInput(exampleSelections),
        score: 100,
        cost: 0,
      }),
    ).toThrow();
  });
  it("persists complete scenarios across storage restarts", () => {
    const file = temp(),
      db = createStorage(file),
      result = simulate(scenarioInput(exampleSelections), dataset);
    if (!result.valid) throw new Error("fixture");
    const saved = {
      id: randomUUID(),
      name: "Сохранённый город",
      createdAt: new Date().toISOString(),
      input: scenarioInput(exampleSelections),
      report: result.report,
    };
    db.saveScenario(saved);
    db.close();
    const reopened = createStorage(file);
    expect(reopened.getScenario(saved.id)).toEqual(saved);
    reopened.close();
  });
  it("saves and opens a server-calculated scenario", async () => {
    vi.stubEnv("SQLITE_PATH", temp());
    const saved = await saveScenario({
      ...scenarioInput(exampleSelections),
      name: "Нура",
    });
    expect((await getScenario(saved.id)).report.score).toBeCloseTo(56.54307, 8);
  });
  it("supports fallback without credentials and deduplicates browser submissions", async () => {
    vi.stubEnv("SQLITE_PATH", temp());
    vi.stubEnv("OPENAI_API_KEY", "");
    const input = {
      ...scenarioInput(exampleSelections),
      kind: "final",
      question: "",
      requestId: randomUUID(),
      sessionId: randomUUID(),
    };
    const first = await startAnalysis(input),
      again = await startAnalysis(input);
    expect(first.mode).toBe("fallback");
    expect(first.explanation).not.toBeNull();
    expect(again.id).toBe(first.id);
    expect((await pollAnalysis(first.id)).mode).toBe("fallback");
    expect((await cancelAnalysis(first.id)).id).toBe(first.id);
  });
  it("invalid portfolio never starts AI", async () => {
    vi.stubEnv("SQLITE_PATH", temp());
    await expect(
      startAnalysis({
        ...scenarioInput([]),
        kind: "final",
        question: "",
        requestId: randomUUID(),
        sessionId: randomUUID(),
      }),
    ).rejects.toThrow("ровно пять");
  });
  it("rejects invented references", () => {
    const result = simulate(scenarioInput(exampleSelections), dataset);
    if (!result.valid) throw new Error("fixture");
    const explanation = fallback(result.report, "test");
    explanation.summary.factIds = ["fabricated"];
    expect(() => verifyExplanation(explanation, result.report, [])).toThrow(
      "UNVERIFIED_REFERENCE",
    );
  });
});
