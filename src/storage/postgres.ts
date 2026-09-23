import "server-only";
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import type { SavedScenario } from "@/contracts";
import type { AnalysisJob } from "./index";

export type Query = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

// Schema is applied explicitly with scripts/migrate-neon.mjs, never during a request.
export function createPostgresStorage(url: string, dailyLimit = 50, query?: Query) {
  const client = query ? null : neon(url);
  const run: Query = query || ((sql, params) => client!.query(sql, params, { fetchOptions: { signal: AbortSignal.timeout(10_000) } }));
  const one = async <T>(sql: string, params: unknown[]) => {
    const rows = await run(sql, params);
    return rows[0] ? rows[0].payload as T : null;
  };
  const jobs = async (session: string, limit: number) =>
    (await run("SELECT payload FROM analyses WHERE session_id=$1 ORDER BY created_at DESC LIMIT $2", [session, limit]))
      .map(r => r.payload as AnalysisJob);
  return {
    close: () => {},
    async saveScenario(s: SavedScenario) {
      await run("INSERT INTO scenarios(id,created_at,payload) VALUES($1,$2,$3::jsonb)", [s.id, s.createdAt, JSON.stringify(s)]);
    },
    getScenario: (id: string) => one<SavedScenario>("SELECT payload FROM scenarios WHERE id=$1", [id]),
    async listScenarios() {
      return (await run("SELECT payload FROM scenarios ORDER BY created_at DESC LIMIT 100", []))
        .map(r => r.payload as SavedScenario);
    },
    async insertJob(job: AnalysisJob) {
      // Atomic global allowance: concurrent visitors cannot bypass the daily cap.
      // A failed/duplicate admission can consume an allowance, but never refund it
      // automatically: this deliberately errs on the side of limiting API costs.
      const quota = await run(`INSERT INTO analysis_quota(day, used)
        SELECT (now() AT TIME ZONE 'UTC')::date, 1 WHERE $1::integer > 0
        ON CONFLICT(day) DO UPDATE SET used=analysis_quota.used+1
        WHERE analysis_quota.used < $1::integer RETURNING used`, [dailyLimit]);
      if (!quota.length) throw new Error("DAILY_ANALYSIS_LIMIT");
      const inserted = await run(`INSERT INTO analyses(id,request_id,session_id,created_at,payload)
        VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(request_id) DO NOTHING RETURNING id`,
        [job.id, job.request.requestId, job.request.sessionId, job.createdAt, JSON.stringify(job)]);
      return inserted.length === 1;
    },
    async saveJob(job: AnalysisJob) {
      // Terminal state wins even if cancellation races with a provider response.
      await run("UPDATE analyses SET payload=$1::jsonb WHERE id=$2 AND payload->>'status'='pending'",
        [JSON.stringify(job), job.id]);
    },
    getJob: (id: string) => one<AnalysisJob>("SELECT payload FROM analyses WHERE id=$1", [id]),
    getRequest: (id: string) => one<AnalysisJob>("SELECT payload FROM analyses WHERE request_id=$1", [id]),
    async countRecent(session: string, since: string) {
      const rows = await run("SELECT count(*)::integer AS n FROM analyses WHERE session_id=$1 AND created_at>$2", [session, since]);
      return Number(rows[0].n);
    },
    activeJobs: async (session: string) => (await jobs(session, 30)).filter(j => j.status === "pending"),
    history: async (session: string) => (await jobs(session, 6))
      .filter(j => j.kind === "chat" && j.status === "completed" && j.explanation)
      .reverse().map(j => ({ question: j.request.question, answer: j.explanation!.summary.text })),
    async lock(id: string) {
      const token = randomUUID();
      const rows = await run(`UPDATE analyses SET locked_until=now()+interval '90 seconds', lock_token=$2
        WHERE id=$1 AND (locked_until IS NULL OR locked_until<now()) RETURNING id`, [id, token]);
      return rows.length === 1 ? token : false;
    },
    async unlock(id: string, token: string | boolean) {
      await run("UPDATE analyses SET locked_until=NULL,lock_token=NULL WHERE id=$1 AND lock_token=$2", [id, token]);
    },
  };
}
