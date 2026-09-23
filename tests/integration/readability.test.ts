import { describe, expect, it } from "vitest";
import partialSchool from "../fixtures/ai-partial-school.json";
import liveAnswers from "../fixtures/ai-eval-answers.json";
import { fallback, verifyExplanation } from "@/ai";
import { simulate } from "@/engine";
import { dataset, exampleSelections, scenarioInput } from "@/data";
import type { ScenarioReport } from "@/contracts";

function report(selections = exampleSelections, final = true): ScenarioReport {
  const result = simulate(scenarioInput(selections), dataset, final);
  if (!result.valid) throw new Error("fixture");
  return result.report;
}

describe("reader-friendly explanations preserve the model boundaries", () => {
  it("gives a useful fallback with existing evidence and no invented research", () => {
    const r = report(), e = fallback(r, "AI недоступен.");
    expect(e.summary.text).toContain("улучшает");
    expect(e.strengths[0].text).toContain("не осталось");
    expect(e.risks[0].text).toContain("Нура");
    expect(e.context).toEqual([]);
    expect(e.limitations).toContain("AI недоступен.");
    for (const claim of [e.summary, ...e.strengths, ...e.risks, ...e.recommendations]) {
      expect(claim.factIds.length).toBeGreaterThan(0);
      expect(claim.sourceIds).toEqual([]);
      for (const id of claim.factIds) expect(r.facts.some((f) => f.id === id)).toBe(true);
    }
    expect(e.recommendations[0].text).toContain("пересчитать");
  });
  it("does not call a partial selection a finished improvement", () => {
    const e = fallback(report([], false), "AI недоступен.");
    expect(e.summary.text).toContain("промежуточный");
    expect(e.summary.text).not.toContain("улучшает");
    expect(e.summary.factIds).not.toContain("score.after");
    expect(e.strengths).toEqual([]);
  });
  it("does not hide remaining critical indicators", () => {
    const selections = exampleSelections.map((s) =>
      s.measureId === "M7" ? { ...s, districtId: "esil" } : s);
    const r = report(selections), e = fallback(r, "AI недоступен.");
    expect(r.critical).toBe(1);
    expect(e.strengths[0].text).toContain("часть проблем остаётся");
    expect(e.strengths[0].text).not.toContain("не осталось");
  });
  it("accepts a readable trade-off with precise evidence instead of fabricated numbers", () => {
    const r = report();
    const e = {
      summary: { text: "По расчёту Нура получает больше мест в школах и доступнее первичную медпомощь. Доступность транспорта пока не меняется.", factIds: ["effect.M7.nura.S1", "effect.M8.nura.S2", "nura.T2.before", "nura.T2.after"], sourceIds: [] },
      strengths: [], risks: [],
      recommendations: [{ text: "Попробуйте заменить меру ради улучшения транспорта и пересчитайте результат. Так можно проверить, оправдывает ли выигрыш потерю других улучшений.", factIds: ["nura.T2.before", "nura.T2.after"], sourceIds: [] }],
      context: [], limitations: ["Реальные расходы на работу и ремонт здесь не рассчитаны."],
    };
    expect(verifyExplanation(e, r, [])).toEqual(e);
    expect(r.score).toBeCloseTo(56.54307, 8);
  });
});

it("accepts the real partial-school answer without a false fallback", () => {
  const r = report([{ measureId: "M7", districtId: "nura" }], false);
  expect(verifyExplanation(partialSchool, r, [{id: "source-1", title: "Fixture", url: "https://example.org", checkedAt: "2026-09-23"}])).toEqual(partialSchool);
});

it.each(liveAnswers)("replays real answer $id against recalculated facts", (sample) => {
  const r = report(sample.selections);
  expect(verifyExplanation(sample.explanation, r, sample.sources)).toEqual(sample.explanation);
});
