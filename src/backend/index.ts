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
import { createStorage, createPostgresStorage, type AnalysisJob, type Storage } from "@/storage";
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
export function closeStorageConnections() {
  for (const db of databases.values()) db.close();
  databases.clear();
}
function storage() {
  const config = getConfig();
  const path = config.databaseUrl || config.databasePath;
  if (!databases.has(path)) databases.set(path, config.databaseUrl ? createPostgresStorage(config.databaseUrl, config.dailyAnalysisLimit) : createStorage(path));
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
export async function getScenario(id: string) {
  const value = await storage().getScenario(id);
  if (!value) throw new HttpError(404, "Сценарий не найден.");
  return value;
}
export async function saveScenario(value: unknown) {
  const parsed = saveScenarioSchema.parse(value);
  const input: ScenarioInput = {
    datasetVersion: parsed.datasetVersion,
    rulesVersion: parsed.rulesVersion,
    selections: parsed.selections,
  };
  const result = simulate(input, dataset, true);
  if (!result.valid)
    throw new HttpError(400, result.errors.map((e) => e.message).join(" "));
  let analysis: AnalysisView | undefined;
  if (parsed.analysisId) {
    const job = await storage().getJob(parsed.analysisId);
    if (!job || job.kind !== "final" || !job.explanation ||
        !["completed", "failed"].includes(job.status) ||
        job.snapshotKey !== canonicalSelections(input.selections) ||
        job.report.input.datasetVersion !== input.datasetVersion ||
        job.report.input.rulesVersion !== input.rulesVersion)
      throw new HttpError(400, "Объяснение не относится к этому итоговому сценарию. Сохраните без него или выполните новый разбор.");
    // An older prompt does not invalidate a matching archive by itself.
    // Recheck AI output with current guards before carrying it into a new save.
    if (job.mode === "ai") {
      try {
        verifyExplanation(job.explanation, job.report, job.sources);
      } catch {
        throw new HttpError(400, "Сохранённый AI-ответ не прошёл текущую проверку. Выполните новый разбор.");
      }
    }
    analysis = view(job);
  }
  const saved = {
    id: randomUUID(),
    name: parsed.name,
    createdAt: new Date().toISOString(),
    input: result.report.input,
    report: result.report,
    ...(analysis ? { analysis } : {}),
  };
  await storage().saveScenario(saved);
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
    evidence: job.report.facts.filter((fact) => {
      const e = job.explanation;
      return e && [e.summary, ...e.strengths, ...e.risks, ...e.recommendations, ...e.context]
        .some((claim) => claim.factIds.includes(fact.id));
    }),
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
async function failed(job: AnalysisJob, message: string) {
  const current = await storage().getJob(job.id);
  if (current && current.status !== "pending") return view(current);
  job.status = "failed";
  job.phase = "done";
  job.mode = "fallback";
  job.error = message;
  job.explanation = fallback(job.report, message);
  await storage().saveJob(job);
  return view((await storage().getJob(job.id))!);
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
  const duplicateView = (duplicate: AnalysisJob) => {
    const key = (r: typeof request) => JSON.stringify({ ...r,
      selections: canonicalSelections(r.selections),
      previousSelections: r.previousSelections ? canonicalSelections(r.previousSelections) : null,
    });
    if (key(duplicate.request) !== key(request))
      throw new HttpError(409, "Идентификатор запроса уже использован для другого анализа.");
    return view(duplicate);
  };
  const duplicate = await db.getRequest(request.requestId);
  if (duplicate) return duplicateView(duplicate);
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
    await db.countRecent(
      request.sessionId,
      new Date(Date.now() - 60_000).toISOString(),
    ) >= 6
  )
    throw new HttpError(
      429,
      "Не больше шести анализов в минуту. Подождите немного.",
    );
  const previousJobs = await db.activeJobs(request.sessionId);
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
  try {
    if (!(await db.insertJob(job))) {
      const existing = await db.getRequest(request.requestId);
      if (existing) return duplicateView(existing);
      throw new Error("Missing duplicate job");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "DAILY_ANALYSIS_LIMIT")
      throw new HttpError(429, "Дневной лимит AI-анализов исчерпан. Расчёт города доступен.");
    throw error;
  }
  for (const active of previousJobs) await cancelAnalysis(active.id);
  if ((await db.getJob(job.id))?.status !== "pending") return view((await db.getJob(job.id))!);
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
      await db.history(request.sessionId),
    );
    if ((await db.getJob(job.id))?.status !== "pending") {
      await createAI(config)
        .cancel(response.id)
        .catch(() => {});
      return view((await db.getJob(job.id))!);
    }
    job.providerId = response.id;
    await db.saveJob(job);
    return view(job);
  } catch (error) {
    if ((await db.getJob(job.id))?.status !== "pending")
      return view((await db.getJob(job.id))!);
    return failed(job, safeAIError(error));
  }
}
export async function readAnalysis(id: string) {
  const job = await storage().getJob(id);
  if (!job) throw new HttpError(404, "Анализ не найден.");
  return view(job);
}
export async function pollAnalysis(id: string) {
  const db = storage();
  let job = (await db.getJob(id));
  if (!job) throw new HttpError(404, "Анализ не найден.");
  if (job.status !== "pending") return view(job);
  const lease = await db.lock(id);
  if (!lease) return view(job);
  try {
    job = (await db.getJob(id))!;
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
    if ((await db.getJob(id))?.status !== "pending") return view((await db.getJob(id))!);
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
      await db.saveJob(job);
      const next = await ai.explain(
        job.request,
        job.report,
        context(job),
        job.researchText,
        job.sources,
      );
      if ((await db.getJob(id))?.status !== "pending") {
        await ai.cancel(next.id).catch(() => {});
        return view((await db.getJob(id))!);
      }
      job.providerId = next.id;
      job.phase = "explanation";
      await db.saveJob(job);
    } else {
      job.explanation = verifyExplanation(
        JSON.parse(response.output_text),
        job.report,
        job.sources,
      );
      job.status = "completed";
      job.phase = "done";
      await db.saveJob(job);
    }
    return view(job);
  } catch (error) {
    if ((await db.getJob(id))?.status === "cancelled") return view((await db.getJob(id))!);
    return failed(job, safeAIError(error));
  } finally {
    await db.unlock(id, lease);
  }
}
export async function cancelAnalysis(id: string) {
  const db = storage(),
    job = (await db.getJob(id));
  if (!job) throw new HttpError(404, "Анализ не найден.");
  if (job.status === "pending") {
    job.status = "cancelled";
    job.phase = "done";
    await db.saveJob(job);
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
