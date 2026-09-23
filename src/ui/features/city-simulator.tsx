"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coins,
  Compass,
  ExternalLink,
  Flag,
  FolderOpen,
  Leaf,
  LoaderCircle,
  MapPin,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  TrainFront,
  Users,
  Waves,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  scenarioSchema,
  type AnalysisView,
  type Category,
  type Explanation,
  type Measure,
  type SavedScenario,
  type ScenarioReport,
  type Selection,
} from "@/contracts";
import { categories, dataset, exampleSelections, scenarioInput } from "@/data";
import { canonicalSelections, simulate, validate } from "@/engine";
import { Button } from "../components/button";
import { CityMap } from "./city-map";
import { ScenarioEvidence } from "./scenario-evidence";
import { readableEvidenceLabel } from "./evidence-label";

const icons = {
  transport: TrainFront,
  ecology: Leaf,
  social: Users,
  safety: ShieldCheck,
  services: Waves,
};
const fmt = (n: number, digits = 2) =>
  n.toLocaleString("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
const draftKey = "akim-draft-v1";
async function api<T>(
  url: string,
  method = "GET",
  value?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers:
      method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Не удалось выполнить запрос.");
  return result as T;
}

export function CitySimulator() {
  const [selections, setSelections] = useState<Selection[]>([]),
    [selectedDistrict, setSelectedDistrict] = useState("nura");
  const [category, setCategory] = useState<Category | "all">("all"),
    [tab, setTab] = useState<"city" | "result" | "saved">("city");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loaded, setLoaded] = useState(false);
  const [advisor, setAdvisor] = useState(false),
    [question, setQuestion] = useState(""),
    [focusMeasure, setFocusMeasure] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisView | null>(null),
    [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<{
    aiConfigured: boolean;
    model: string;
    reasoning: string;
  } | null>(null);
  const [serverReport, setServerReport] = useState<ScenarioReport | null>(null),
    [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SavedScenario[]>([]),
    [scenarioName, setScenarioName] = useState("Мой городской сценарий");
  const generation = useRef(0),
    activeId = useRef<string | null>(null),
    session = useRef("");
  const dialogRef = useRef<HTMLElement | null>(null);
  const report = useMemo(() => {
    const r = simulate(
      scenarioInput(selections),
      dataset,
      selections.length === 5,
    );
    return r.valid ? r.report : null;
  }, [selections])!;
  const district = dataset.districts.find((d) => d.id === selectedDistrict)!;
  const currentDistrict = report.districts.find(
    (d) => d.id === selectedDistrict,
  )!;
  const catalog = dataset.measures.filter(
    (m) => category === "all" || m.category === category,
  );

  // Browser storage is restored once after hydration; the extra render is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    session.current = crypto.randomUUID();
    try {
      session.current =
        sessionStorage.getItem("akim-session") || session.current;
      sessionStorage.setItem("akim-session", session.current);
    } catch {}
    let restored: Selection[] = [];
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const input = scenarioSchema.parse(JSON.parse(raw));
        if (validate(input, dataset, false).length === 0) restored = input.selections;
      }
    } catch {}
    try {
      const id = sessionStorage.getItem("akim-active-analysis");
      const key = sessionStorage.getItem("akim-active-selection");
      if (id && key === canonicalSelections(restored)) {
        void api<AnalysisView>(`/api/analyses/${id}`)
          .then((job) => {
            if (generation.current === 0 && job.snapshotKey === key) {
              setAnalysis(job);
              activeId.current = job.status === "pending" ? job.id : null;
            }
          })
          .catch(() => {});
      }
    } catch {}
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const input = scenarioSchema.parse(JSON.parse(raw));
        if (validate(input, dataset, false).length === 0)
          setSelections(input.selections);
        else
          setNotice(
            "Старый черновик не соответствует текущим правилам. Начат новый.",
          );
      }
    } catch {
      setNotice("Черновик не удалось восстановить. Начат новый сценарий.");
    }
    setLoaded(true);
    void api<typeof status>("/api/status")
      .then(setStatus)
      .catch(() => setError("Не удалось проверить состояние сервера."));
  }, []);
  useEffect(() => {
    if (loaded) {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify(scenarioInput(selections)),
        );
      } catch {
        setNotice("Браузер не разрешил сохранить черновик.");
      }
    }
  }, [selections, loaded]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!analysis || analysis.status !== "pending") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const token = generation.current;
    async function poll() {
      try {
        const next = await api<AnalysisView>(`/api/analyses/${analysis!.id}`);
        if (stopped || token !== generation.current) return;
        setAnalysis(next);
        if (next.status === "pending") timer = setTimeout(poll, 1800);
        else activeId.current = null;
      } catch (e) {
        if (!stopped) {
          setError((e as Error).message);
          timer = setTimeout(poll, 4000);
        }
      }
    }
    timer = setTimeout(poll, 1200);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [analysis]);

  useEffect(() => {
    if (!advisor) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = dialogRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], textarea, input, select, [tabindex="0"]',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAdvisor(false);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable(),
        first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [advisor]);
  function stopAnalysis() {
    generation.current++;
    try {
      sessionStorage.removeItem("akim-active-analysis");
      sessionStorage.removeItem("akim-active-selection");
    } catch {}
    const id = activeId.current;
    activeId.current = null;
    setStarting(false);
    setAnalysis(null);
    if (id) void api(`/api/analyses/${id}`, "DELETE", {}).catch(() => {});
  }
  async function analyze(
    kind: "step" | "chat" | "final",
    next = selections,
    text = question,
    previous?: Selection[],
    measureId = focusMeasure,
  ) {
    stopAnalysis();
    const token = generation.current;
    setStarting(true);
    setError("");
    try {
      const response = await api<AnalysisView>("/api/analyses", "POST", {
        ...scenarioInput(next),
        kind,
        question: text,
        districtId: selectedDistrict,
        measureId,
        previousSelections: previous,
        requestId: crypto.randomUUID(),
        sessionId: session.current,
      });
      if (token !== generation.current) {
        if (response.status === "pending")
          void api(`/api/analyses/${response.id}`, "DELETE", {}).catch(
            () => {},
          );
        return;
      }
      setAnalysis(response);
      activeId.current = response.status === "pending" ? response.id : null;
      try {
        sessionStorage.setItem("akim-active-analysis", response.id);
        sessionStorage.setItem("akim-active-selection", response.snapshotKey);
      } catch {}
    } catch (e) {
      if (token === generation.current) setError((e as Error).message);
    } finally {
      if (token === generation.current) setStarting(false);
    }
  }
  function commit(next: Selection[]) {
    const errors = validate(scenarioInput(next), dataset, false);
    if (errors.length) {
      setError(errors.map((e) => e.message).join(" "));
      return;
    }
    stopAnalysis();
    setSelections(next);
    setServerReport(null);
    setNotice("");
    setError("");
    // Paid research starts only on an explicit request.
  }
  function add(measure: Measure) {
    commit([
      ...selections,
      {
        measureId: measure.id,
        districtId: measure.scope === "city" ? null : selectedDistrict,
      },
    ]);
  }
  function ask(measure?: Measure) {
    setAdvisor(true);
    setFocusMeasure(measure?.id ?? null);
    setQuestion(
      measure
        ? `Как «${measure.name}» повлияет на район ${district.name}? Какие практики и ограничения стоит учесть?`
        : "",
    );
  }
  async function reset() {
    await stopAnalysis();
    setSelections([]);
    setServerReport(null);
    setTab("city");
    setError("");
    setNotice("Начат новый сценарий с одинаковыми исходными условиями.");
  }
  async function loadExample() {
    await stopAnalysis();
    setSelections(exampleSelections);
    setSelectedDistrict("nura");
    setServerReport(null);
    setTab("city");
    setError("");
    setNotice(
      "Загружен контрольный пример: 5 мер, стоимость 95. Рассчитайте результат.",
    );
  }
  async function run() {
    setBusy(true);
    setError("");
    const token = generation.current;
    try {
      const result = await api<ScenarioReport>("/api/simulate", "POST", {
        ...scenarioInput(selections),
        mode: "final",
      });
      if (token === generation.current) {
        setServerReport(result);
        setTab("result");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/scenarios", "POST", {
        ...scenarioInput(selections),
        name: scenarioName,
        analysisId: analysisCurrent && analysis?.kind === "final" && analysis.explanation
          && ["completed", "failed"].includes(analysis.status) ? analysis.id : null,
      });
      setNotice("Сценарий сохранён на этом компьютере.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openSaved() {
    setTab("saved");
    setError("");
    try {
      setSaved(await api<SavedScenario[]>("/api/scenarios"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restore(s: SavedScenario) {
    const errors = validate(s.input, dataset, true);
    if (errors.length) {
      setError(errors.map((e) => e.message).join(" "));
      return;
    }
    await stopAnalysis();
    setSelections(s.input.selections);
    const recalculated = simulate(s.input, dataset, true);
    if (!recalculated.valid) return;
    setServerReport(recalculated.report);
    setAnalysis(s.analysis ?? null);
    setScenarioName(s.name);
    setTab("result");
    setNotice("Открыт сохранённый сценарий.");
  }
  const analysisCurrent =
    analysis?.snapshotKey === canonicalSelections(selections);
  const pending = starting || analysis?.status === "pending";
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Аким на 5 часов, главная">
          <span className="brand-symbol">
            <Building2 size={22} />
          </span>
          <span>
            аким<span className="brand-sub">на 5 часов</span>
          </span>
        </Link>
        <nav aria-label="Разделы">
          <button
            className={tab === "city" ? "nav-active" : ""}
            onClick={() => setTab("city")}
          >
            Городская лаборатория
          </button>
          <button
            className={tab === "saved" ? "nav-active" : ""}
            onClick={() => void openSaved()}
          >
            Мои сценарии
          </button>
        </nav>
        <div className="header-right">
          <span className="local-badge">
            <i />
            Локальная сессия
          </span>
          <button
            className="avatar"
            onClick={() => ask()}
            aria-label="Открыть AI-советника"
          >
            АК
          </button>
        </div>
      </header>
      <main>
        <div className="page-intro">
          <div>
            <div className="eyebrow">
              <span /> АСТАНА · СИМУЛЯТОР РЕШЕНИЙ
            </div>
            <h1>
              Большой город.
              <br className="mobile-break" /> Ваши решения.
            </h1>
            <p>
              Пять инициатив. Один бюджет. Сделайте город лучше для каждого.
            </p>
          </div>
          <Button variant="outline" onClick={() => ask()}>
            <Sparkles size={17} />
            AI-советник
            <ArrowUpRight size={16} />
          </Button>
        </div>
        <section className="metrics" aria-label="Показатели сценария">
          <div className="metric">
            <div className="metric-label">
              <Coins size={15} />
              Доступный бюджет
            </div>
            <div className="metric-value">
              {report.remaining}
              <span>/ 100 ед.</span>
            </div>
            <div className="budget-track">
              <i style={{ width: `${report.cost}%` }} />
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">
              <Flag size={15} />
              Принято решений
            </div>
            <div className="metric-value">
              {selections.length}
              <span>/ 5 инициатив</span>
            </div>
            <div className="decision-dots">
              {[0, 1, 2, 3, 4].map((i) => (
                <i className={i < selections.length ? "filled" : ""} key={i} />
              ))}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">
              <Compass size={15} />
              Исходный Quality of Life
            </div>
            <div className="metric-value">
              {fmt(report.baseline.score)}
              <span>/ 100</span>
            </div>
            <small>Единая точка отсчёта для всех</small>
          </div>
          <div className="metric metric-accent">
            <div className="metric-label">
              <Clock3 size={15} />
              Горизонт изменений
            </div>
            <div className="metric-value">
              2<span>условных года</span>
            </div>
            <small>Учитываем время реализации</small>
          </div>
        </section>
        {error && (
          <div className="alert error" role="alert">
            <CircleHelp size={18} />
            <span>{error}</span>
            <button aria-label="Закрыть ошибку" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert notice" role="status">
            <Check size={17} />
            <span>{notice}</span>
            <button
              aria-label="Закрыть уведомление"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {tab === "city" && (
          <>
            <div className="workspace-grid">
              <section className="panel map-panel">
                <div className="section-heading">
                  <div>
                    <span className="kicker">01 / ИЗУЧИТЕ ГОРОД</span>
                    <h2>У каждого района — своя история</h2>
                  </div>
                  <span className="pill">5 районов</span>
                </div>
                <CityMap
                  selected={selectedDistrict}
                  onSelect={setSelectedDistrict}
                  report={report}
                />
                <div className="district-detail">
                  <div>
                    <div className="district-title">
                      <MapPin size={16} />
                      <h3>{district.name}</h3>
                      <span>
                        {Math.round(district.population * 100)}% населения
                      </span>
                    </div>
                    <p><strong>Исходная ситуация:</strong> {district.profile}</p>
                  </div>
                  <div className="district-rating">
                    <strong>{fmt(currentDistrict.score, 1)}</strong>
                    <span>индекс района</span>
                  </div>
                </div>
                <div className="indicator-grid">
                  {dataset.indicators.map((k) => {
                    const value = currentDistrict.indicators[k.id],
                      before = district.indicators[k.id];
                    return (
                      <div key={k.id} className="indicator">
                        <div>
                          <span>{k.name}</span>
                          <b className={value < 40 ? "critical" : ""}>
                            {fmt(value, 1)}
                            {value !== before && (
                              <small>
                                {" "}
                                {value > before ? "+" : ""}
                                {fmt(value - before, 1)}
                              </small>
                            )}
                          </b>
                        </div>
                        <div className="indicator-track">
                          <i
                            style={{
                              width: `${value}%`,
                              background:
                                value < 40
                                  ? "#c88654"
                                  : categories.find((c) => c.id === k.category)!
                                      .color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              <aside className="panel portfolio">
                <span className="kicker">02 / СОБЕРИТЕ СЦЕНАРИЙ</span>
                <h2>Ваши пять решений</h2>
                <p className="muted">
                  Выберите инициативы ниже.
                  <br />
                  Не больше двух на направление.
                </p>
                <div className="slots">
                  {[0, 1, 2, 3, 4].map((i) => {
                    const selection = selections[i],
                      m = dataset.measures.find(
                        (m) => m.id === selection?.measureId,
                      );
                    return (
                      <div key={i} className={`slot ${m ? "slot-filled" : ""}`}>
                        <span className="slot-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {m ? (
                          <>
                            <div>
                              <strong>{m.name}</strong>
                              {m.scope === "district" ? (
                                <select
                                  aria-label={`Район для ${m.name}`}
                                  value={selection.districtId!}
                                  onChange={(e) =>
                                    commit(
                                      selections.map((s, j) =>
                                        j === i
                                          ? { ...s, districtId: e.target.value }
                                          : s,
                                      ),
                                    )
                                  }
                                >
                                  {dataset.districts.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span>Весь город</span>
                              )}
                            </div>
                            <b>{m.cost}</b>
                            <button
                              aria-label={`Удалить ${m.name}`}
                              onClick={() =>
                                commit(selections.filter((_, j) => j !== i))
                              }
                            >
                              <X size={15} />
                            </button>
                          </>
                        ) : (
                          <span className="empty-slot">
                            Место для инициативы
                            <Plus size={16} />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="portfolio-total">
                  <span>Выделено на проекты</span>
                  <strong>
                    {report.cost} <small>ед.</small>
                  </strong>
                </div>
                <Button
                  className="full-width"
                  onClick={() => void run()}
                  disabled={selections.length !== 5 || busy}
                >
                  {busy ? <LoaderCircle className="spin" size={17} /> : null}
                  Рассчитать результат
                  <ArrowRight size={18} />
                </Button>
                {selections.length !== 5 && (
                  <small className="helper">
                    Добавьте ещё {5 - selections.length} инициатив
                    {5 - selections.length === 1 ? "у" : "ы"} для итогового
                    расчёта
                  </small>
                )}
                <div className="portfolio-tools">
                  <button onClick={() => void loadExample()}>
                    <BookOpen size={14} />
                    Загрузить пример
                  </button>
                  <button onClick={() => void reset()}>
                    <RotateCcw size={14} />
                    Сбросить
                  </button>
                </div>
                <button
                  className="advisor-card"
                  onClick={() => setAdvisor(true)}
                >
                  <span className="sparkle-box">
                    <Sparkles size={19} />
                  </span>
                  <div>
                    <strong>
                      {pending
                        ? "Советник изучает решение…"
                        : "Решение начинается с вопроса"}
                    </strong>
                    <p>
                      {pending
                        ? "Расчёт готов. Исследование продолжается."
                        : "Узнайте, как работают инициативы и что говорит мировой опыт."}
                    </p>
                    <span>
                      Открыть AI-советника <ArrowUpRight size={13} />
                    </span>
                  </div>
                </button>
                <div className="model-status">
                  <i className={status?.aiConfigured ? "ready" : ""} />
                  {status?.aiConfigured
                    ? "Astra · medium · веб-поиск"
                    : "Расчёты доступны без AI"}
                </div>
              </aside>
            </div>
            <section className="catalog-section">
              <div className="section-heading">
                <div>
                  <span className="kicker">ОТ ПРИОРИТЕТОВ К ДЕЙСТВИЯМ</span>
                  <h2>Во что инвестируем?</h2>
                </div>
                <span className="muted">
                  {dataset.measures.length} инициатив · район{" "}
                  <strong>{district.name}</strong>
                </span>
              </div>
              <div className="filters" role="group" aria-label="Направления">
                <button
                  className={category === "all" ? "active" : ""}
                  onClick={() => setCategory("all")}
                >
                  Все направления <span>14</span>
                </button>
                {categories.map((c) => {
                  const Icon = icons[c.id];
                  return (
                    <button
                      key={c.id}
                      className={category === c.id ? "active" : ""}
                      onClick={() => setCategory(c.id)}
                    >
                      <Icon size={15} />
                      {c.short}
                    </button>
                  );
                })}
              </div>
              <div className="measure-grid">
                {catalog.map((m) => {
                  const c = categories.find((c) => c.id === m.category)!,
                    Icon = icons[m.category],
                    chosen = selections.some((s) => s.measureId === m.id),
                    reason = chosen
                      ? "Уже в вашем сценарии"
                      : validate(
                          scenarioInput([
                            ...selections,
                            {
                              measureId: m.id,
                              districtId:
                                m.scope === "city" ? null : selectedDistrict,
                            },
                          ]),
                          dataset,
                          false,
                        )[0]?.message;
                  return (
                    <article
                      className={`measure-card ${chosen ? "chosen" : ""}`}
                      key={m.id}
                    >
                      <div className="measure-top">
                        <span
                          className="measure-icon"
                          style={{ color: c.color, background: `${c.color}13` }}
                        >
                          <Icon size={20} />
                        </span>
                        <span className="measure-category">{c.short}</span>
                        <span className="measure-price">
                          {m.cost}
                          <small> ед.</small>
                        </span>
                      </div>
                      <h3>{m.name}</h3>
                      <p>{m.description}</p>
                      <div className="measure-meta">
                        <span>
                          <MapPin size={12} />
                          {m.scope === "city" ? "Весь город" : district.name}
                        </span>
                        <span>
                          <Clock3 size={12} />
                          Лаг {m.lag} кв.
                        </span>
                      </div>
                      <div className="effect-chips">
                        {Object.entries(m.effects).map(([key, value]) => (
                          <span
                            key={key}
                            title={`Полный эффект ${value}; за 8 кварталов ${((value * (8 - m.lag)) / 8).toFixed(3)}`}
                            className={value < 0 ? "negative" : ""}
                          >
                            {key} {value > 0 ? "+" : ""}
                            {fmt((value * (8 - m.lag)) / 8, 2)}
                          </span>
                        ))}
                      </div>
                      <small className="effect-note">
                        Реализованный эффект за 8 кварталов
                      </small>
                      <div className="measure-actions">
                        <Button
                          variant={chosen ? "secondary" : "outline"}
                          size="sm"
                          disabled={!!reason}
                          title={reason}
                          onClick={() => add(m)}
                        >
                          {chosen ? <Check size={15} /> : <Plus size={15} />}{" "}
                          {chosen ? "В сценарии" : "Добавить"}
                        </Button>
                        <button
                          aria-label={`Спросить о ${m.name}`}
                          onClick={() => ask(m)}
                          title="Спросить советника"
                        >
                          <MessageSquare size={17} />
                        </button>
                      </div>
                      {reason && !chosen && (
                        <small className="blocked-reason">{reason}</small>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
        {tab === "result" && serverReport && (
          <Result
            report={serverReport}
            name={scenarioName}
            onName={setScenarioName}
            onSave={() => void save()}
            onBack={() => setTab("city")}
            onAnalyze={() => {
              setAdvisor(true);
              void analyze(
                "final",
                selections,
                "Объясни итоговый сценарий, его сильные стороны, риски и международный опыт.",
              );
            }}
            busy={busy}
          />
        )}
        {tab === "saved" && (
          <section className="panel saved-panel">
            <div className="section-heading">
              <div>
                <span className="kicker">ЛОКАЛЬНЫЙ АРХИВ</span>
                <h2>Мои сценарии</h2>
              </div>
              <Button variant="outline" onClick={() => setTab("city")}>
                Вернуться к городу
                <ArrowRight size={16} />
              </Button>
            </div>
            {saved.length === 0 ? (
              <div className="empty-state">
                <FolderOpen size={38} />
                <h3>Здесь будут ваши решения</h3>
                <p>
                  Соберите пять мер, рассчитайте результат и сохраните сценарий.
                </p>
              </div>
            ) : (
              saved.map((s) => (
                <button
                  className="saved-row"
                  onClick={() => void restore(s)}
                  key={s.id}
                >
                  <span className="sparkle-box">
                    <Building2 size={21} />
                  </span>
                  <div>
                    <strong>{s.name}</strong>
                    <span>
                      {new Date(s.createdAt).toLocaleString("ru-RU")} ·{" "}
                      {s.report.cost} ед.
                    </span>
                  </div>
                  <b>{fmt(s.report.score!)}</b>
                  <ChevronRight size={20} />
                </button>
              ))
            )}
          </section>
        )}
        <footer>
          <span>
            <Building2 size={14} />
            Аким на 5 часов
          </span>
          <p>
            Синтетическая модель · одинаковые условия · решения с понятными
            последствиями
          </p>
          <span>
            Сделано для Астаны <span className="footer-dot" />
          </span>
        </footer>
      </main>
      {advisor && (
        <div className="advisor-overlay">
          <button
            className="scrim"
            aria-label="Закрыть панель советника"
            onClick={() => setAdvisor(false)}
          />
          <aside
            ref={dialogRef}
            className="advisor-panel"
            role="dialog"
            aria-modal="true"
            aria-label="AI-советник"
          >
            <div className="advisor-header">
              <div className="sparkle-box">
                <Sparkles size={22} />
              </div>
              <div>
                <h2>Городской советник</h2>
                <p>Astra · medium · исследование по вашему запросу</p>
              </div>
              <button
                aria-label="Закрыть советника"
                onClick={() => setAdvisor(false)}
              >
                <X size={21} />
              </button>
            </div>
            <div className="advisor-body">
              <div className="context-tag">
                <MapPin size={14} />
                {district.name}
                <span>·</span>
                {selections.length}/5 решений<span>·</span>
                {report.remaining} ед. осталось
              </div>
              {!analysis && !starting && (
                <div className="advisor-welcome">
                  <span className="eyebrow">СНАЧАЛА РАЗОБРАТЬСЯ</span>
                  <h3>
                    Каким станет город
                    <br />
                    после вашего решения?
                  </h3>
                  <p>
                    Спросите о пользе, рисках и опыте других городов. Советник
                    изучит источники и объяснит, что применимо к Астане.
                  </p>
                  {[
                    "Как парки и спорт-зоны влияют на городскую среду?",
                    "Какие проблемы сейчас важнее для Нуры?",
                    "Что учесть при выборе между автобусами и ЛРТ?",
                  ].map((q) => (
                    <button key={q} onClick={() => setQuestion(q)}>
                      {q}
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
              )}
              {pending && (
                <div className="thinking" role="status">
                  <LoaderCircle size={24} className="spin" />
                  <h3>
                    {analysis?.phase === "explanation"
                      ? "Формирую объяснение"
                      : "Изучаю источники"}
                  </h3>
                  <p>
                    Сопоставляю решение, контекст района и международный опыт.
                    Можно продолжить работу с городом.
                  </p>
                  <Button variant="ghost" onClick={() => void stopAnalysis()}>
                    Отменить ожидание
                  </Button>
                </div>
              )}
              {analysis && analysisCurrent && analysis.explanation && (
                <ExplanationPanel analysis={analysis} />
              )}
              {analysis && !analysisCurrent && (
                <p className="alert notice">
                  Вы изменили сценарий. Этот ответ относится к предыдущему
                  набору.
                </p>
              )}
              {error && (
                <p className="alert error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <form
              className="question-form"
              onSubmit={(e) => {
                e.preventDefault();
                void analyze("chat");
              }}
            >
              <label htmlFor="advisor-question">Ваш вопрос о городе</label>
              <textarea
                id="advisor-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={3000}
                placeholder="Например: что даст новый парк этому району?"
                rows={3}
              />
              <div>
                <small>Запрос расходует API-баланс · AI может ошибаться</small>
                <Button
                  size="sm"
                  type="submit"
                  disabled={!question.trim() || pending}
                >
                  <Send size={15} />
                  Спросить
                </Button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}

function Result({
  report,
  name,
  onName,
  onSave,
  onBack,
  onAnalyze,
  busy,
}: {
  report: ScenarioReport;
  name: string;
  onName: (name: string) => void;
  onSave: () => void;
  onBack: () => void;
  onAnalyze: () => void;
  busy: boolean;
}) {
  const rows = report.districts.map((d) => ({
    name: d.name,
    До: Number(
      report.baseline.districts.find((b) => b.id === d.id)!.score.toFixed(2),
    ),
    После: Number(d.score.toFixed(2)),
  }));
  return (
    <section className="result-section">
      <div className="result-hero">
        <div>
          <span className="kicker">ВАШ СЦЕНАРИЙ · 8 КВАРТАЛОВ СПУСТЯ</span>
          <h2>
            Решения, которые
            <br />
            меняют город.
          </h2>
          <p>
            Расчёт по исходному датасету. Все пять инициатив прошли серверную
            проверку.
          </p>
          <Button variant="outline" onClick={onBack}>
            Изменить решения
            <ArrowRight size={16} />
          </Button>
        </div>
        <div className="score-display">
          <span>Astana Quality of Life Score</span>
          <strong data-testid="final-score">{fmt(report.score!)}</strong>
          <b>
            {report.delta! >= 0 ? "+" : ""}
            {fmt(report.delta!)} к исходному городу
          </b>
          <small>
            70% среднего + 30% слабейшего района − критические значения
          </small>
        </div>
      </div>
      <div className="result-grid">
        <div className="panel">
          <div className="section-heading">
            <h3>Как изменились районы</h3>
            <span className="pill">Индекс 0–100</span>
          </div>
          <div className="result-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} barGap={5}>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="#e2e7e1"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Legend />
                <Bar dataKey="До" fill="#ced9cf" radius={[5, 5, 0, 0]} />
                <Bar dataKey="После" fill="#356f56" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="district-table">
            <thead>
              <tr>
                <th>Район</th>
                <th>До</th>
                <th>После</th>
                <th>Изменение</th>
              </tr>
            </thead>
            <tbody>
              {report.districts.map((d) => {
                const original = report.baseline.districts.find(
                  (b) => b.id === d.id,
                )!;
                return (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{fmt(original.score)}</td>
                    <td>{fmt(d.score)}</td>
                    <td className="positive">
                      {d.score >= original.score ? "+" : ""}
                      {fmt(d.score - original.score)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="result-summary">
          <div className="panel">
            <h3>Что стоит за результатом</h3>
            <div className="summary-line">
              <span>Потрачено</span>
              <strong>{report.cost} / 100</strong>
            </div>
            <div className="summary-line">
              <span>Критические показатели</span>
              <strong>
                {report.baseline.critical}
                <ArrowRight size={14} />
                {report.critical}
              </strong>
            </div>
            <div className="summary-line">
              <span>Слабейший район</span>
              <strong>{report.districts.filter((d) => d.score === report.minimum).map((d) => d.name).join(", ")} · {fmt(report.minimum)}</strong>
            </div>
            <h4>Сработавшие синергии</h4>
            {report.synergies.length ? (
              report.synergies.map((s) => (
                <p className="synergy" key={s}>
                  <Sparkles size={15} />
                  {s}
                </p>
              ))
            ) : (
              <p className="muted">
                В этом наборе нет дополнительных сочетаний.
              </p>
            )}
            <Button className="full-width" onClick={onAnalyze}>
              <Sparkles size={17} />
              Разобрать сценарий с AI
            </Button>
          </div>
          <div className="panel">
            <h3>Сохранить эту версию</h3>
            <label className="field-label" htmlFor="scenario-name">
              Название сценария
            </label>
            <input
              id="scenario-name"
              maxLength={80}
              value={name}
              onChange={(e) => onName(e.target.value)}
            />
            <Button
              variant="outline"
              className="full-width"
              onClick={onSave}
              disabled={busy || !name.trim()}
            >
              <Save size={16} />
              Сохранить на компьютере
            </Button>
          </div>
        </div>
      </div>
      <ScenarioEvidence report={report} />
      <div className="panel detailed-results">
        <h3>Показатели до и после</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Показатель</th>
                {report.districts.map((d) => (
                  <th key={d.id}>{d.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.indicators.map((k) => (
                <tr key={k.id}>
                  <th>
                    {k.id} · {k.name}
                  </th>
                  {report.districts.map((d) => {
                    const old = report.baseline.districts.find(
                      (b) => b.id === d.id,
                    )!.indicators[k.id];
                    return (
                      <td
                        key={d.id}
                        className={d.indicators[k.id] < 40 ? "critical" : ""}
                      >
                        {fmt(old, 1)} →{" "}
                        <strong>{fmt(d.indicators[k.id], 1)}</strong>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ExplanationPanel({ analysis }: { analysis: AnalysisView }) {
  const e = analysis.explanation!;
  function claim(c: Explanation["summary"], i: number) {
    return (
      <div className="claim" key={i}>
        <p>{c.text}</p>
        {c.factIds.length > 0 && (
          <details>
            <summary>Основания в расчёте</summary>
            <ul>{c.factIds.map((id) => {
              const fact = analysis.evidence?.find((f) => f.id === id);
              return <li key={id}>{fact ? readableEvidenceLabel(fact.text) + ": " + fmt(fact.value) : "Архивный факт: выполните новый разбор для просмотра основания."}</li>;
            })}</ul>
          </details>
        )}
        {c.sourceIds.length > 0 && (
          <div className="claim-links">
            {c.sourceIds.map((id) => {
              const s = analysis.sources.find((s) => s.id === id);
              return s ? (
                <a href={s.url} target="_blank" rel="noreferrer" key={id}>
                  <ExternalLink size={11} />
                  {new URL(s.url).hostname}
                </a>
              ) : null;
            })}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="explanation">
      <span
        className={`answer-badge ${analysis.mode === "fallback" ? "fallback" : ""}`}
      >
        {analysis.mode === "ai"
          ? "AI-анализ с источниками"
          : "Шаблонное объяснение"}
      </span>
      <h3>Главный вывод</h3>
      {claim(e.summary, 0)}
      <p className="muted">Это результат учебной модели, а не прогноз реального города. Числа можно раскрыть под каждым выводом. Критическим считается показатель ниже 40.</p>
      {[
        { title: "Что стало лучше", items: e.strengths, Icon: ArrowUpRight },
        { title: "На что обратить внимание", items: e.risks, Icon: ArrowDown },
        {
          title: "Что сделать дальше",
          items: e.recommendations,
          Icon: Compass,
        },
      ].map(
        ({ title, items, Icon }) =>
          items.length > 0 && (
            <section key={title}>
              <h3>
                <Icon size={16} />
                {title}
              </h3>
              {items.map(claim)}
            </section>
          ),
      )}
      {e.context.length > 0 && (
        <details>
          <summary><BookOpen size={14} /> Что подсказывает мировой опыт</summary>
          {e.context.map(claim)}
        </details>
      )}
      {e.limitations.length > 0 && (
        <div className="limitations">
          <strong>Что ещё нужно учитывать</strong>
          {e.limitations.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
      {analysis.sources.length > 0 && (
        <details>
          <summary>Источники исследования · {analysis.sources.length}</summary>
          {analysis.sources.map((s) => (
            <a
              className="source-row"
              href={s.url}
              target="_blank"
              rel="noreferrer"
              key={s.id}
            >
              <span>
                {s.title}
                <small>
                  Источник получен {new Date(s.checkedAt).toLocaleDateString("ru-RU")}
                </small>
              </span>
              <ExternalLink size={14} />
            </a>
          ))}
        </details>
      )}
    </div>
  );
}
