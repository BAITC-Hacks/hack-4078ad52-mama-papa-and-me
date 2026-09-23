import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AnalysisRequest,
  AnalysisView,
  SavedScenario,
  ScenarioReport,
} from "@/contracts";
export interface AnalysisJob extends AnalysisView {
  request: AnalysisRequest;
  report: ScenarioReport;
  providerId: string | null;
  researchText: string;
}
export function createStorage(filename: string) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.transaction(() => {
    const version = db.pragma("user_version", { simple: true }) as number;
    if (version > 1) throw new Error("Unsupported database version");
    if (version === 0) {
      db.exec(`CREATE TABLE scenarios (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE analyses (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, session_id TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX analysis_session_date ON analyses(session_id, created_at); PRAGMA user_version = 1;`);
    }
  })();
  function unpack<T>(row: unknown): T | null {
    return row ? (JSON.parse((row as { payload: string }).payload) as T) : null;
  }
  return {
    close: () => db.close(),
    saveScenario: (s: SavedScenario) => {
      db.prepare(
        "INSERT INTO scenarios(id,created_at,payload) VALUES(?,?,?)",
      ).run(s.id, s.createdAt, JSON.stringify(s));
    },
    getScenario: (id: string) =>
      unpack<SavedScenario>(
        db.prepare("SELECT payload FROM scenarios WHERE id=?").get(id),
      ),
    listScenarios: () =>
      db
        .prepare(
          "SELECT payload FROM scenarios ORDER BY created_at DESC LIMIT 100",
        )
        .all()
        .map((r) => unpack<SavedScenario>(r)!),
    insertJob: (job: AnalysisJob) => {
      return db.prepare(
        "INSERT OR IGNORE INTO analyses(id,request_id,session_id,created_at,payload) VALUES(?,?,?,?,?)",
      ).run(
        job.id,
        job.request.requestId,
        job.request.sessionId,
        job.createdAt,
        JSON.stringify(job),
      ).changes === 1;
    },
    saveJob: (job: AnalysisJob) => {
      db.prepare("UPDATE analyses SET payload=? WHERE id=? AND json_extract(payload, '$.status')='pending'").run(
        JSON.stringify(job),
        job.id,
      );
    },
    getJob: (id: string) =>
      unpack<AnalysisJob>(
        db.prepare("SELECT payload FROM analyses WHERE id=?").get(id),
      ),
    getRequest: (id: string) =>
      unpack<AnalysisJob>(
        db.prepare("SELECT payload FROM analyses WHERE request_id=?").get(id),
      ),
    countRecent: (session: string, since: string) =>
      (
        db
          .prepare(
            "SELECT count(*) AS n FROM analyses WHERE session_id=? AND created_at>?",
          )
          .get(session, since) as { n: number }
      ).n,
    activeJobs: (session: string) =>
      db
        .prepare(
          "SELECT payload FROM analyses WHERE session_id=? ORDER BY created_at DESC LIMIT 30",
        )
        .all(session)
        .map((r) => unpack<AnalysisJob>(r)!)
        .filter((j) => j.status === "pending"),
    history: (session: string) =>
      db
        .prepare(
          "SELECT payload FROM analyses WHERE session_id=? ORDER BY created_at DESC LIMIT 6",
        )
        .all(session)
        .map((r) => unpack<AnalysisJob>(r)!)
        .filter(
          (j) => j.kind === "chat" && j.status === "completed" && j.explanation,
        )
        .reverse()
        .map((j) => ({
          question: j.request.question,
          answer: j.explanation!.summary.text,
        })),
    lock: (id: string) =>
      db
        .prepare(
          "UPDATE analyses SET locked_until=? WHERE id=? AND locked_until<?",
        )
        .run(Date.now() + 90_000, id, Date.now()).changes === 1,
    unlock: (id: string, _lease?: string | boolean) => {
      void _lease;
      db.prepare("UPDATE analyses SET locked_until=0 WHERE id=?").run(id);
    },
  };
}
export { createPostgresStorage } from "./postgres";
export type Storage = ReturnType<typeof createStorage> | ReturnType<typeof import("./postgres").createPostgresStorage>;
