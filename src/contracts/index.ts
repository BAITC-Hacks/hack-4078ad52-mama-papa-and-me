import { z } from "zod";

export const indicatorIds = [
  "T1",
  "T2",
  "E1",
  "E2",
  "S1",
  "S2",
  "B1",
  "B2",
  "C1",
  "C2",
] as const;
export type IndicatorId = (typeof indicatorIds)[number];
export type Values = Record<IndicatorId, number>;
export type Category =
  "transport" | "ecology" | "social" | "safety" | "services";
export interface District {
  id: string;
  name: string;
  population: number;
  profile: string;
  indicators: Values;
}
export interface Measure {
  id: string;
  category: Category;
  name: string;
  scope: "district" | "city";
  cost: number;
  lag: number;
  effects: Partial<Values>;
  description: string;
}
export interface Dataset {
  version: string;
  rulesVersion: string;
  budget: number;
  horizon: number;
  indicators: {
    id: IndicatorId;
    name: string;
    weight: number;
    category: Category;
  }[];
  districts: District[];
  measures: Measure[];
  synergies: {
    measures: [string, string];
    indicator: IndicatorId;
    effect: number;
  }[];
}
export const selectionSchema = z
  .object({
    measureId: z.string().max(20),
    districtId: z.string().max(30).nullable(),
  })
  .strict();
export type Selection = z.infer<typeof selectionSchema>;
export const scenarioSchema = z
  .object({
    datasetVersion: z.string().max(40),
    rulesVersion: z.string().max(40),
    selections: z.array(selectionSchema).max(5),
  })
  .strict();
export type ScenarioInput = z.infer<typeof scenarioSchema>;
export const simulationSchema = scenarioSchema.extend({
  mode: z.enum(["preview", "final"]).default("final"),
});
export type SimulationInput = z.infer<typeof simulationSchema>;
export interface RuleError {
  code: string;
  message: string;
  measureIds?: string[];
}
export interface CityState {
  districts: { id: string; name: string; indicators: Values; score: number }[];
  average: number;
  minimum: number;
  critical: number;
  score: number;
}
export interface ScenarioReport {
  input: ScenarioInput;
  final: boolean;
  cost: number;
  remaining: number;
  baseline: CityState;
  districts: CityState["districts"];
  average: number;
  minimum: number;
  critical: number;
  score: number | null;
  delta: number | null;
  synergies: string[];
  contributions: {
    measureId: string;
    districtId: string;
    indicator: IndicatorId;
    effect: number;
  }[];
  clipping: {
    districtId: string;
    indicator: IndicatorId;
    adjustment: number;
  }[];
  facts: { id: string; text: string; value: number }[];
}
export type SimulationResult =
  | { valid: true; report: ScenarioReport }
  | { valid: false; errors: RuleError[] };
export const analysisRequestSchema = scenarioSchema.extend({
  kind: z.enum(["step", "chat", "final"]),
  question: z.string().trim().max(3000).default(""),
  districtId: z.string().max(30).nullable().default(null),
  measureId: z.string().max(20).nullable().default(null),
  previousSelections: z.array(selectionSchema).max(5).optional(),
  requestId: z.string().uuid(),
  sessionId: z.string().uuid(),
});
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;
export interface Source {
  id: string;
  title: string;
  url: string;
  checkedAt: string;
}
const claimSchema = z
  .object({
    text: z.string().min(1).max(2200),
    factIds: z.array(z.string()).max(15),
    sourceIds: z.array(z.string()).max(10),
  })
  .strict();
export const explanationSchema = z
  .object({
    summary: claimSchema,
    strengths: z.array(claimSchema).max(5),
    risks: z.array(claimSchema).max(5),
    recommendations: z.array(claimSchema).max(5),
    context: z.array(claimSchema).max(5),
    limitations: z.array(z.string().max(700)).max(8),
  })
  .strict();
export type Explanation = z.infer<typeof explanationSchema>;
export interface AnalysisView {
  id: string;
  kind: AnalysisRequest["kind"];
  status: "pending" | "completed" | "failed" | "cancelled";
  phase: "research" | "explanation" | "done";
  snapshotKey: string;
  createdAt: string;
  mode: "ai" | "fallback";
  explanation: Explanation | null;
  sources: Source[];
  evidence?: ScenarioReport["facts"];
  error: string | null;
  usage: { input: number; output: number };
  model: string;
  reasoning: "medium";
  promptVersion: string;
}
export const saveScenarioSchema = scenarioSchema.extend({
  name: z.string().trim().min(1).max(80),
  analysisId: z.string().uuid().nullable().optional(),
});
export interface SavedScenario {
  id: string;
  name: string;
  createdAt: string;
  input: ScenarioInput;
  report: ScenarioReport;
  analysis?: AnalysisView;
}
