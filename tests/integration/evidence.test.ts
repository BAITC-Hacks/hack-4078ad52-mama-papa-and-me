import { describe, expect, it } from "vitest";
import { verifyExplanation } from "@/ai";
import { simulate } from "@/engine";
import { dataset, exampleSelections, scenarioInput } from "@/data";
import type { Explanation } from "@/contracts";

const result = simulate(scenarioInput(exampleSelections), dataset);
if (!result.valid) throw new Error("fixture");
const report = result.report;
function explanation(): Explanation {
  return { summary: { text: "Сценарий улучшает положение Нуры.", factIds: ["score.after"], sourceIds: [] },
    strengths: [], risks: [], recommendations: [], context: [], limitations: ["Синтетическая модель."] };
}
describe("AI claims are qualitative with independently rendered evidence", () => {
  it.each(["Score 99,99", "Рост на 100%", "Score ９９", "Score ٩٩", "девяносто девять баллов", "рост вдвое", "one hundred points", "сотня баллов", "сотни баллов", "семи баллов"])(
    "rejects untrusted quantity: %s", (text) => {
      const e = explanation(); e.summary.text = text;
      expect(() => verifyExplanation(e, report, [])).toThrow("UNVERIFIED_QUANTITY");
    });
  it("rejects a claim with no evidence", () => {
    const e = explanation(); e.summary.factIds = [];
    expect(() => verifyExplanation(e, report, [])).toThrow("MISSING_EVIDENCE");
  });
  it("also checks quantities in limitations", () => {
    const e = explanation(); e.limitations = ["Рост ВВП 20%."];
    expect(() => verifyExplanation(e, report, [])).toThrow("UNVERIFIED_QUANTITY");
  });
  it("accepts grounded qualitative text without altering the report", () => {
    const before = JSON.stringify(report);
    expect(verifyExplanation(explanation(), report, []).summary.factIds).toEqual(["score.after"]);
    expect(JSON.stringify(report)).toBe(before);
  });
  it("rejects uncited context even if it cites a game fact", () => {
    const e = explanation(); e.context = [{ text: "Международный опыт.", factIds: ["score.after"], sourceIds: [] }];
    expect(() => verifyExplanation(e, report, [])).toThrow("MISSING_SOURCE");
  });
});

it.each(["Сотрудничество служб требует согласования.", "Подготовьте сотрудников к работе.", "Семинары помогут обсудить работу служб."])(
  "does not mistake ordinary words for numerals: %s", (text) => {
    const e = explanation(); e.summary.text = text;
    expect(verifyExplanation(e, report, []).summary.text).toBe(text);
  },
);
