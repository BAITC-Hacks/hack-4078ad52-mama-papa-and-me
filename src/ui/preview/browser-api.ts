import { analysisRequestSchema, saveScenarioSchema, simulationSchema, scenarioSchema, type AnalysisView, type SavedScenario, type ScenarioInput } from "@/contracts";
import { dataset, scenarioInput } from "@/data";
import { canonicalSelections, simulate } from "@/engine";
import type { ApiClient } from "../features/city-simulator";

const archiveKey = "akim-preview-scenarios-v1";
const analyses = new Map<string, AnalysisView>();

function calculate(input: ScenarioInput, final: boolean) {
  const result = simulate(input, dataset, final);
  if (!result.valid) throw new Error(result.errors.map(item => item.message).join(" "));
  return result.report;
}

function readArchive(): SavedScenario[] {
  const raw: unknown = JSON.parse(localStorage.getItem(archiveKey) || "[]");
  if (!Array.isArray(raw)) throw new Error("Архив браузера повреждён.");
  return raw.map(item => {
    if (typeof item?.id !== "string" || typeof item?.name !== "string" || typeof item?.createdAt !== "string") throw new Error("Не удалось прочитать сохранённый сценарий.");
    const input = scenarioSchema.parse(item.input);
    return { id: item.id, name: item.name, createdAt: item.createdAt, input, report: calculate(input, true) };
  });
}

// Explicit offline preview adapter. Production still uses the Next.js HTTP API.
export const browserApi: ApiClient = async <T>(url: string, method = "GET", value?: unknown): Promise<T> => {
  let result: unknown;
  if (url === "/api/status") {
    result = { aiConfigured: false, model: "preview", reasoning: "medium" };
  } else if (url === "/api/simulate" && method === "POST") {
    const request = simulationSchema.parse(value);
    result = calculate(scenarioInput(request.selections), request.mode === "final");
  } else if (url === "/api/scenarios") {
    if (method === "GET") result = readArchive();
    else if (method === "POST") {
      const request = saveScenarioSchema.parse(value);
      const input = scenarioInput(request.selections);
      const saved: SavedScenario = { id: crypto.randomUUID(), name: request.name, createdAt: new Date().toISOString(), input, report: calculate(input, true) };
      localStorage.setItem(archiveKey, JSON.stringify([saved, ...readArchive()]));
      result = saved;
    } else throw new Error("Это действие недоступно в предпросмотре.");
  } else if (url === "/api/analyses" && method === "POST") {
    const request = analysisRequestSchema.parse(value);
    const report = calculate(scenarioInput(request.selections), request.kind === "final");
    const claim = (text: string) => ({ text, factIds: [], sourceIds: [] });
    const district = report.districts.find(item => item.id === request.districtId);
    const measure = dataset.measures.find(item => item.id === request.measureId);
    const view: AnalysisView = {
      id: crypto.randomUUID(), kind: request.kind, status: "completed", phase: "done",
      snapshotKey: canonicalSelections(request.selections), createdAt: new Date().toISOString(),
      mode: "fallback", sources: [], error: null, usage: { input: 0, output: 0 }, model: "preview", reasoning: "medium", promptVersion: "ui-preview-1",
      explanation: {
        summary: claim(`В вашем сценарии ${request.selections.length} из 5 решений. Потрачено ${report.cost} из 100 единиц бюджета, осталось ${report.remaining}.`),
        strengths: measure ? [claim(measure.description)] : [],
        risks: district ? [claim(`Индекс района ${district.name}: ${district.score.toFixed(2).replace(".", ",")}. Сравните его показатели с другими районами на карте.`)] : [],
        recommendations: [claim(request.selections.length < 5 ? "Соберите пять инициатив. Учитывайте бюджет, сроки и совместимость решений." : "Посмотрите итоговый отчёт и сравните районы до и после изменений.")],
        context: [],
        limitations: ["Это демонстрационная справка по текущему сценарию, а не ответ AI на ваш вопрос. Поиск источников и свободный диалог доступны при подключении основного приложения к AI."],
      },
    };
    analyses.set(view.id, view);
    result = view;
  } else if (url.startsWith("/api/analyses/")) {
    const id = url.split("/").at(-1)!;
    if (method === "DELETE") { analyses.delete(id); result = { ok: true }; }
    else {
      result = analyses.get(id);
      if (!result) throw new Error("Демонстрационный ответ уже недоступен.");
    }
  } else throw new Error("Этот раздел требует основного сервера приложения.");
  return result as T;
};
