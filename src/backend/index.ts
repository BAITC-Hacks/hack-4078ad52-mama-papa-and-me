import "server-only";
import { randomUUID } from "node:crypto";
import {
  analysisRequestSchema,
  simulationSchema,
  saveScenarioSchema,
  type AnalysisView,
  type ScenarioInput,
} from "@/contracts";
import { dataset } from "@/data";
import { canonicalSelections, simulate } from "@/engine";
import { getConfig } from "@/config";
import { createStorage, type AnalysisJob, type Storage } from "@/storage";
import {
  createAI,
  extractSources,
  verifyExplanation,
  fallback,
  PROMPT_VERSION,
} from "@/ai";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
const databases = new Map<string, Storage>();
function storage() {
  const path = getConfig().databasePath;
  if (!databases.has(path)) databases.set(path, createStorage(path));
  return databases.get(path)!;
}
export function runSimulation(value: unknown) {
  const { mode, ...input } = simulationSchema.parse(value);
  const result = simulate(input, dataset, mode === "final");
  if (!result.valid)
    throw new HttpError(
      400,
      result.errors.map((e) => e.message).join(" "),
      result.errors,
    );
  return result.report;
}
export function listScenarios() {
  return storage().listScenarios();
}
export function getScenario(id: string) {
  const value = storage().getScenario(id);
  if (!value) throw new HttpError(404, "Сценарий не найден.");
  return value;
}
export function saveScenario(value: unknown) {
  const parsed = saveScenarioSchema.parse(value);
  const input: ScenarioInput = {
    datasetVersion: parsed.datasetVersion,
    rulesVersion: parsed.rulesVersion,
    selections: parsed.selections,
  };
  const result = simulate(input, dataset, true);
  if (!result.valid)
    throw new HttpError(400, result.errors.map((e) => e.message).join(" "));
  const saved = {
    id: randomUUID(),
    name: parsed.name,
    createdAt: new Date().toISOString(),
    input: result.report.input,
    report: result.report,
  };
  storage().saveScenario(saved);
  return saved;
}
function view(job: AnalysisJob): AnalysisView {
  const {
    id,
    kind,
    status,
    phase,
    snapshotKey,
    createdAt,
    mode,
    explanation,
    sources,
    error,
    usage,
    model,
    reasoning,
    promptVersion,
  } = job;
  return {
    id,
    kind,
    status,
    phase,
    snapshotKey,
    createdAt,
    mode,
    explanation,
    sources,
    error,
    usage,
    model,
    reasoning,
    promptVersion,
  };
}
function context(job: AnalysisJob) {
  return {
    selectedMeasures: job.report.input.selections.map((s) => ({
      selection: s,
      measure: dataset.measures.find((m) => m.id === s.measureId),
    })),
    focusedMeasure: dataset.measures.find(
      (m) => m.id === job.request.measureId,
    ),
    focusedDistrict: dataset.districts.find(
      (d) => d.id === job.request.districtId,
    ),
    promptVersion: PROMPT_VERSION,
    city: "Астана, Казахстан; районы и значения синтетические. Климатические и экономические данные для обоснования требуется проверить по источникам.",
  };
}
function failed(job: AnalysisJob, message: string) {
  job.status = "failed";
  job.phase = "done";
  job.mode = "fallback";
  job.error = message;
  job.explanation = fallback(job.report, message);
  storage().saveJob(job);
  return view(job);
}
function safeAIError(error: unknown) {
  const status = (error as { status?: number })?.status;
  if (status === 401) return "OpenAI отклонил ключ. Проверьте локальный .env.";
  if (status === 403 || status === 404)
    return "Модель недоступна этому API-проекту. Модель не заменена.";
  if (status === 429)
    return "Достигнут лимит OpenAI. Проверьте квоту и повторите позже.";
  return "Не удалось получить проверенный AI-ответ. Расчёт остаётся доступным.";
}
export async function startAnalysis(value: unknown) {
  const request = analysisRequestSchema.parse(value),
    db = storage();
  if (request.kind === "chat" && !request.question)
    throw new HttpError(400, "Введите вопрос советнику.");
  if (
    request.districtId &&
    !dataset.districts.some((d) => d.id === request.districtId)
  )
    throw new HttpError(400, "Неизвестный район.");
  if (
    request.measureId &&
    !dataset.measures.some((m) => m.id === request.measureId)
  )
    throw new HttpError(400, "Неизвестная мера.");
  const duplicate = db.getRequest(request.requestId);
  if (duplicate) return view(duplicate);
  const input = {
    datasetVersion: request.datasetVersion,
    rulesVersion: request.rulesVersion,
    selections: request.selections,
  };
  const result = simulate(
    input,
    dataset,
    request.kind === "final" || request.selections.length === 5,
  );
  if (!result.valid)
    throw new HttpError(400, result.errors.map((e) => e.message).join(" "));
  if (request.previousSelections) {
    const previous = simulate(
      { ...input, selections: request.previousSelections },
      dataset,
      false,
    );
    if (!previous.valid)
      throw new HttpError(400, "Некорректный предыдущий набор.");
    result.report.facts.push(
      ...previous.report.facts.map((f) => ({
        ...f,
        id: `previous.${f.id}`,
        text: `До текущего хода: ${f.text}`,
      })),
    );
  }
  if (
    db.countRecent(
      request.sessionId,
      new Date(Date.now() - 60_000).toISOString(),
    ) >= 6
  )
    throw new HttpError(
      429,
      "Не больше шести анализов в минуту. Подождите немного.",
    );
  for (const active of db.activeJobs(request.sessionId))
    await cancelAnalysis(active.id);
  const job: AnalysisJob = {
    id: randomUUID(),
    request,
    report: result.report,
    kind: request.kind,
    status: "pending",
    phase: "research",
    snapshotKey: canonicalSelections(request.selections),
    createdAt: new Date().toISOString(),
    mode: "ai",
    explanation: null,
    sources: [],
    error: null,
    providerId: null,
    researchText: "",
    usage: { input: 0, output: 0 },
    model: getConfig().model,
    reasoning: "medium",
    promptVersion: PROMPT_VERSION,
  };
  // A durable row prevents a repeated browser submission from generating twice.
  db.insertJob(job);
  const config = getConfig();
  if (!config.aiEnabled || !config.apiKey)
    return failed(
      job,
      "AI не подключён: добавьте ключ в .env и перезапустите сервер.",
    );
  try {
    const response = await createAI(config).research(
      request,
      result.report,
      context(job),
      db.history(request.sessionId),
    );
    if (db.getJob(job.id)?.status === "cancelled") {
      await createAI(config)
        .cancel(response.id)
        .catch(() => {});
      return view(db.getJob(job.id)!);
    }
    job.providerId = response.id;
    db.saveJob(job);
    return view(job);
  } catch (error) {
    if (db.getJob(job.id)?.status === "cancelled")
      return view(db.getJob(job.id)!);
    return failed(job, safeAIError(error));
  }
}
export async function pollAnalysis(id: string) {
  const db = storage();
  let job = db.getJob(id);
  if (!job) throw new HttpError(404, "Анализ не найден.");
  if (job.status !== "pending") return view(job);
  if (!db.lock(id)) return view(job);
  try {
    job = db.getJob(id)!;
    if (job.status !== "pending") return view(job);
    if (!job.providerId) {
      if (Date.now() - Date.parse(job.createdAt) > 30_000)
        return failed(
          job,
          "Запуск анализа был прерван. При необходимости повторите вручную.",
        );
      return view(job);
    }
    const ai = createAI({
        ...getConfig(),
        model: job.model || getConfig().model,
      }),
      response = await ai.retrieve(job.providerId);
    // Cancel can arrive while the provider request is being read.
    if (db.getJob(id)?.status !== "pending") return view(db.getJob(id)!);
    const expired =
      Date.now() - Date.parse(job.createdAt) > getConfig().maxAnalysisMs;
    // A suspended browser may poll late: deliver an already completed final answer.
    // Never start a new paid phase after the overall deadline.
    if (
      expired &&
      (response.status !== "completed" || job.phase === "research")
    ) {
      if (response.status === "queued" || response.status === "in_progress")
        await ai.cancel(job.providerId).catch(() => {});
      return failed(
        job,
        "Время ожидания истекло. Повторный платный запрос не запускался.",
      );
    }
    if (response.status === "queued" || response.status === "in_progress")
      return view(job);
    if (response.status !== "completed")
      return failed(
        job,
        "OpenAI не завершил ответ. Можно повторить анализ вручную.",
      );
    job.usage.input += response.usage?.input_tokens ?? 0;
    job.usage.output += response.usage?.output_tokens ?? 0;
    if (job.phase === "research") {
      job.sources = extractSources(response);
      job.researchText = response.output_text;
      if (!job.sources.length)
        return failed(
          job,
          "Поиск не вернул проверяемых ссылок. Исследование не считается выполненным.",
        );
      // Persist the transition before creating a paid response. A restart during
      // creation leaves an interrupted job rather than silently submitting twice.
      job.phase = "explanation";
      job.providerId = null;
      db.saveJob(job);
      const next = await ai.explain(
        job.request,
        job.report,
        context(job),
        job.researchText,
        job.sources,
      );
      if (db.getJob(id)?.status !== "pending") {
        await ai.cancel(next.id).catch(() => {});
        return view(db.getJob(id)!);
      }
      job.providerId = next.id;
      job.phase = "explanation";
      db.saveJob(job);
    } else {
      job.explanation = verifyExplanation(
        JSON.parse(response.output_text),
        job.report,
        job.sources,
      );
      job.status = "completed";
      job.phase = "done";
      db.saveJob(job);
    }
    return view(job);
  } catch (error) {
    if (db.getJob(id)?.status === "cancelled") return view(db.getJob(id)!);
    return failed(job, safeAIError(error));
  } finally {
    db.unlock(id);
  }
}
export async function cancelAnalysis(id: string) {
  const db = storage(),
    job = db.getJob(id);
  if (!job) throw new HttpError(404, "Анализ не найден.");
  if (job.status === "pending") {
    job.status = "cancelled";
    job.phase = "done";
    db.saveJob(job);
    if (job.providerId && getConfig().apiKey)
      await createAI(getConfig())
        .cancel(job.providerId)
        .catch(() => {});
  }
  return view(job);
}
export function systemStatus() {
  const config = getConfig();
  return {
    aiConfigured: Boolean(config.apiKey && config.aiEnabled),
    model: config.model,
    reasoning: "medium",
    datasetVersion: dataset.version,
    rulesVersion: dataset.rulesVersion,
    promptVersion: PROMPT_VERSION,
  };
}
