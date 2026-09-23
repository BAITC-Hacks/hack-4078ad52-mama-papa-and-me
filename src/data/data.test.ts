import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { dataset, exampleSelections } from "./index";
import { indicatorIds } from "@/contracts";
it("preserves every numeric input from the six original DOCX tables", () => {
  const source = readFileSync(
    new URL("../../docs/data/dataset-source.md", import.meta.url),
    "utf8",
  );
  const tables = source.replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .filter((block) => block.startsWith("|"))
    .map((block) =>
      block
        .split("\n")
        .filter((line) => line.startsWith("|"))
        .map((line) =>
          line
            .slice(1, -1)
            .split("|")
            .map((cell) => cell.trim()),
        )
        .filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell))),
    );
  expect(tables).toHaveLength(6);
  const [indicators, districts, measures, synergies, weights, example] = tables;
  expect(dataset.indicators.map((i) => i.id)).toEqual(
    indicators.slice(1).map((r) => r[0]),
  );
  expect(dataset.indicators.map((i) => i.weight)).toEqual(
    weights[1].slice(1).map(Number),
  );
  expect(
    dataset.districts.map((d) => [
      d.name,
      d.population,
      ...indicatorIds.map((k) => d.indicators[k]),
    ]),
  ).toEqual(
    districts.slice(1).map((r) => [r[0], ...r.slice(1, -1).map(Number)]),
  );
  const categories: Record<string, string> = {
    Транспорт: "transport",
    Экология: "ecology",
    Соцсфера: "social",
    Безопасность: "safety",
    Сервисы: "services",
  };
  expect(
    dataset.measures.map(({ id, category, scope, cost, lag, effects }) => ({
      id,
      category,
      scope,
      cost,
      lag,
      effects,
    })),
  ).toEqual(
    measures.slice(1).map((r) => ({
      id: r[0],
      category: categories[r[1]],
      scope: r[3] === "Город" ? "city" : "district",
      cost: Number(r[4]),
      lag: Number(r[5]),
      effects: Object.fromEntries(
        r[6]
          .replaceAll("−", "-")
          .split(",")
          .map((effect) => {
            const [key, value] = effect.trim().split(/\s+/);
            return [key, Number(value)];
          }),
      ),
    })),
  );
  expect(dataset.synergies).toEqual(
    synergies.slice(1).map((r) => {
      const [indicator, effect] = r[1].split(" ");
      return { measures: r[0].split(" + "), indicator, effect: Number(effect) };
    }),
  );
  expect(
    exampleSelections.map((s) => [
      s.measureId,
      s.districtId === null
        ? "город"
        : dataset.districts.find((d) => d.id === s.districtId)!.name,
    ]),
  ).toEqual(example.slice(1).map((r) => r.slice(1)));
});
