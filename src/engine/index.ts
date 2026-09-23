import type {
  CityState,
  Dataset,
  IndicatorId,
  RuleError,
  ScenarioInput,
  ScenarioReport,
  Selection,
  SimulationResult,
  Values,
} from "@/contracts";

export function validate(
  input: ScenarioInput,
  data: Dataset,
  final = true,
): RuleError[] {
  const errors: RuleError[] = [];
  if (
    input.datasetVersion !== data.version ||
    input.rulesVersion !== data.rulesVersion
  )
    errors.push({
      code: "VERSION",
      message: "Версия данных изменилась. Начните новый сценарий.",
    });
  if ((final && input.selections.length !== 5) || input.selections.length > 5)
    errors.push({
      code: "COUNT",
      message: "Для итогового сценария выберите ровно пять мер.",
    });
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  let cost = 0;
  for (const selection of input.selections) {
    const m = data.measures.find((m) => m.id === selection.measureId);
    if (!m) {
      errors.push({
        code: "UNKNOWN_MEASURE",
        message: "Неизвестное мероприятие.",
      });
      continue;
    }
    if (seen.has(m.id))
      errors.push({
        code: "DUPLICATE",
        message: "Мероприятие можно выбрать только один раз.",
        measureIds: [m.id],
      });
    seen.add(m.id);
    counts[m.category] = (counts[m.category] ?? 0) + 1;
    cost += m.cost;
    if (
      m.scope === "city"
        ? selection.districtId !== null
        : !data.districts.some((d) => d.id === selection.districtId)
    )
      errors.push({
        code: "DISTRICT",
        message:
          "Укажите район для местной меры; для городской район не нужен.",
        measureIds: [m.id],
      });
  }
  if (cost > data.budget)
    errors.push({
      code: "BUDGET",
      message: `Недостаточно бюджета: нужно ${cost}, доступно ${data.budget}.`,
    });
  if (Object.values(counts).some((n) => n > 2))
    errors.push({
      code: "CATEGORY",
      message: "Допустимо не больше двух мер одного направления.",
    });
  for (const [a, b, global] of [
    ["M1", "M3", true],
    ["M4", "M7", false],
    ["M5", "M13", false],
  ] as const) {
    const x = input.selections.find((s) => s.measureId === a),
      y = input.selections.find((s) => s.measureId === b);
    if (x && y && (global || x.districtId === y.districtId))
      errors.push({
        code: "CONFLICT",
        message: `${a} и ${b} несовместимы${global ? "" : " в одном районе"}.`,
        measureIds: [a, b],
      });
  }
  return errors;
}

function cityState(
  indicators: Record<string, Values>,
  data: Dataset,
): CityState {
  const districts = data.districts.map((d) => ({
    id: d.id,
    name: d.name,
    indicators: indicators[d.id],
    score: data.indicators.reduce(
      (sum, k) => sum + k.weight * indicators[d.id][k.id],
      0,
    ),
  }));
  const average = districts.reduce(
    (sum, d, i) => sum + data.districts[i].population * d.score,
    0,
  );
  const minimum = Math.min(...districts.map((d) => d.score));
  const critical = districts.reduce(
    (sum, d) => sum + Object.values(d.indicators).filter((v) => v < 40).length,
    0,
  );
  return {
    districts,
    average,
    minimum,
    critical,
    score: 0.7 * average + 0.3 * minimum - critical,
  };
}
export function baseline(data: Dataset): CityState {
  return cityState(
    Object.fromEntries(data.districts.map((d) => [d.id, { ...d.indicators }])),
    data,
  );
}

export function simulate(
  input: ScenarioInput,
  data: Dataset,
  final = true,
): SimulationResult {
  const errors = validate(input, data, final);
  if (errors.length) return { valid: false, errors };
  const normalized = {
    ...input,
    selections: [...input.selections].sort((a, b) =>
      a.measureId.localeCompare(b.measureId, undefined, { numeric: true }),
    ),
  };
  const initial = baseline(data);
  const indicators = Object.fromEntries(
    data.districts.map((d) => [d.id, { ...d.indicators }]),
  );
  const contributions: ScenarioReport["contributions"] = [];
  const applied: string[] = [];
  let cost = 0;
  for (const s of normalized.selections) {
    const m = data.measures.find((m) => m.id === s.measureId)!;
    cost += m.cost;
    for (const districtId of m.scope === "city"
      ? data.districts.map((d) => d.id)
      : [s.districtId!]) {
      for (const [key, value] of Object.entries(m.effects)) {
        const indicator = key as IndicatorId;
        const effect = (value * (data.horizon - m.lag)) / data.horizon;
        indicators[districtId][indicator] += effect;
        contributions.push({ measureId: m.id, districtId, indicator, effect });
      }
    }
  }
  for (const synergy of data.synergies) {
    const first = normalized.selections.find(
      (s) => s.measureId === synergy.measures[0],
    );
    if (
      first?.districtId &&
      normalized.selections.some((s) => s.measureId === synergy.measures[1])
    ) {
      indicators[first.districtId][synergy.indicator] += synergy.effect;
      applied.push(
        `${synergy.measures.join(" + ")}: ${synergy.indicator} +${synergy.effect} (${data.districts.find((d) => d.id === first.districtId)!.name})`,
      );
    }
  }
  const clipping: ScenarioReport["clipping"] = [];
  for (const d of data.districts)
    for (const k of data.indicators) {
      const raw = indicators[d.id][k.id],
        clipped = Math.max(0, Math.min(100, raw));
      if (raw !== clipped)
        clipping.push({
          districtId: d.id,
          indicator: k.id,
          adjustment: clipped - raw,
        });
      indicators[d.id][k.id] = clipped;
    }
  const after = cityState(indicators, data);
  const facts: ScenarioReport["facts"] = [
    { id: "budget.spent", text: "Расход условного бюджета", value: cost },
    {
      id: "budget.remaining",
      text: "Остаток бюджета",
      value: data.budget - cost,
    },
    { id: "baseline.score", text: "Исходный Score", value: initial.score },
    {
      id: "critical.after",
      text: "Критических показателей после мер",
      value: after.critical,
    },
  ];
  for (const d of after.districts)
    for (const k of data.indicators) {
      facts.push({
        id: `${d.id}.${k.id}.before`,
        text: `${d.name}: ${k.name} до`,
        value: indicatorsFrom(initial, d.id, k.id),
      });
      facts.push({
        id: `${d.id}.${k.id}.after`,
        text: `${d.name}: ${k.name} после`,
        value: d.indicators[k.id],
      });
    }
  if (final)
    facts.push(
      { id: "score.after", text: "Итоговый Score", value: after.score },
      {
        id: "score.delta",
        text: "Изменение Score",
        value: after.score - initial.score,
      },
    );
  return {
    valid: true,
    report: {
      input: normalized,
      final,
      cost,
      remaining: data.budget - cost,
      baseline: initial,
      districts: after.districts,
      average: after.average,
      minimum: after.minimum,
      critical: after.critical,
      score: final ? after.score : null,
      delta: final ? after.score - initial.score : null,
      synergies: applied,
      contributions,
      clipping,
      facts,
    },
  };
}
function indicatorsFrom(state: CityState, district: string, key: IndicatorId) {
  return state.districts.find((d) => d.id === district)!.indicators[key];
}
export function canonicalSelections(selections: Selection[]) {
  return [...selections]
    .sort((a, b) => a.measureId.localeCompare(b.measureId))
    .map((s) => `${s.measureId}:${s.districtId ?? "city"}`)
    .join("|");
}
