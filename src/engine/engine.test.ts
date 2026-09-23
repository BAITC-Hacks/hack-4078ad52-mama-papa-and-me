import { describe, it, expect } from "vitest";
import { dataset, exampleSelections, scenarioInput } from "@/data";
import { baseline, simulate, validate } from "./index";
import type { Selection } from "@/contracts";
const s = (id: string, districtId: string | null = "nura"): Selection => ({
  measureId: id,
  districtId,
});
describe("synthetic city engine", () => {
  it("reproduces independent Decimal reference values", () => {
    expect(baseline(dataset).score).toBeCloseTo(52.55768, 8);
    const result = simulate(scenarioInput(exampleSelections), dataset);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.report.score).toBeCloseTo(56.54307, 8);
    expect(result.report.cost).toBe(95);
    expect(result.report.critical).toBe(0);
    expect(result.report.synergies).toHaveLength(1);
    expect(
      result.report.districts.find((d) => d.id === "nura")?.indicators.S1,
    ).toBe(48);
  });
  it("separates incomplete previews from a final submission", () => {
    expect(
      simulate(scenarioInput(exampleSelections.slice(0, 4)), dataset).valid,
    ).toBe(false);
    const result = simulate(scenarioInput([s("M4")]), dataset, false);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.report.score).toBeNull();
      expect(
        result.report.districts.find((d) => d.id === "nura")!.indicators.E1,
      ).toBe(54);
    }
  });
  it("is order-independent and does not mutate input or dataset", () => {
    const before = JSON.stringify(dataset);
    expect(
      simulate(scenarioInput([...exampleSelections].reverse()), dataset),
    ).toEqual(simulate(scenarioInput(exampleSelections), dataset));
    expect(JSON.stringify(dataset)).toBe(before);
  });
  it("accepts a budget exactly at 100 and rejects overspend", () => {
    const equal = [s("M3"), s("M5"), s("M8"), s("M11"), s("M4")];
    expect(validate(scenarioInput(equal), dataset)).toEqual([]);
    expect(
      validate(
        scenarioInput([s("M3"), s("M5"), s("M8"), s("M10"), s("M4")]),
        dataset,
      ).some((e) => e.code === "BUDGET"),
    ).toBe(true);
  });
  it.each([
    ["DUPLICATE", [s("M4"), s("M4")]],
    ["COUNT", [...exampleSelections, s("M9")]],
    ["CATEGORY", [s("M7"), s("M8"), s("M9")]],
    ["UNKNOWN_MEASURE", [s("M99")]],
    ["DISTRICT", [s("M4", null)]],
    ["DISTRICT", [s("M4", "unknown")]],
    ["DISTRICT", [s("M12")]],
    ["CONFLICT", [s("M1", "esil"), s("M3", "nura")]],
    ["CONFLICT", [s("M4"), s("M7")]],
    ["CONFLICT", [s("M5"), s("M13")]],
  ])("rejects %s", (code, selections) => {
    expect(
      validate(scenarioInput(selections as Selection[]), dataset, false).some(
        (e) => e.code === code,
      ),
    ).toBe(true);
  });
  it("allows local conflicting programs in different districts", () => {
    expect(
      validate(
        scenarioInput([s("M4", "esil"), s("M7", "nura")]),
        dataset,
        false,
      ),
    ).toEqual([]);
  });
  it("rejects unknown versions", () => {
    expect(
      validate(
        { ...scenarioInput([]), rulesVersion: "future" },
        dataset,
        false,
      )[0].code,
    ).toBe("VERSION");
  });
  it("applies every synergy once without scaling it by lag", () => {
    for (const synergy of dataset.synergies) {
      const selections = synergy.measures.map((id) =>
        s(
          id,
          dataset.measures.find((m) => m.id === id)!.scope === "city"
            ? null
            : "nura",
        ),
      );
      const result = simulate(scenarioInput(selections), dataset, false);
      if (!result.valid) throw new Error("invalid fixture");
      const total = result.report.contributions
        .filter(
          (c) => c.districtId === "nura" && c.indicator === synergy.indicator,
        )
        .reduce((n, c) => n + c.effect, 0);
      expect(
        result.report.districts.find((d) => d.id === "nura")!.indicators[
          synergy.indicator
        ],
      ).toBe(
        dataset.districts.find((d) => d.id === "nura")!.indicators[
          synergy.indicator
        ] +
          total +
          2,
      );
    }
  });
  it("clips after all effects and counts strictly below 40", () => {
    const custom = structuredClone(dataset);
    custom.districts[4].indicators.B2 = 99;
    custom.districts[4].indicators.T1 = 1;
    custom.districts[4].indicators.S1 = 40;
    custom.districts[4].indicators.S2 = 40;
    const result = simulate(scenarioInput([s("M11")]), custom, false);
    if (!result.valid) throw new Error("invalid fixture");
    expect(result.report.districts[4].indicators.B2).toBe(100);
    expect(result.report.districts[4].indicators.T1).toBe(0);
    expect(result.report.critical).toBe(1);
  });
  it("different decisions change the final score", () => {
    const a = simulate(scenarioInput(exampleSelections), dataset),
      b = simulate(
        scenarioInput(
          exampleSelections.map((x) =>
            x.measureId === "M5" ? s("M4", "saryarka") : x,
          ),
        ),
        dataset,
      );
    if (!a.valid || !b.valid) throw new Error("invalid fixture");
    expect(a.report.score).not.toBe(b.report.score);
  });
});
