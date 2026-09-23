#!/usr/bin/env node
// No .env reads, AI requests, scenario writes, or credentials.
// Run: node scripts/judge-smoke.mjs http://127.0.0.1:3000
import assert from "node:assert/strict";

async function main() {
  const base = new URL(process.argv[2] || "http://127.0.0.1:3000");
  assert(["http:", "https:"].includes(base.protocol), "Expected HTTP(S)");
  assert(!base.username && !base.password && !base.search && !base.hash && base.pathname === "/", "Use a bare origin without credentials");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  assert(local || base.protocol === "https:", "Remote checks require HTTPS");

  async function request(route, data, origin = base.origin) {
    const response = await fetch(new URL(route, base), {
      method: data ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: data ? { "Content-Type": "application/json", Origin: origin } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
    // Never print a remote error body, which might contain sensitive details.
    return response;
  }
  const statusResponse = await request("/api/status");
  assert.equal(statusResponse.status, 200, "Status endpoint must return 200");
  const status = await statusResponse.json();
  assert.equal(typeof status.aiConfigured, "boolean", "Missing AI configuration flag");

  const input = {
    datasetVersion: "astana-synthetic-1", rulesVersion: "akim-1", mode: "final",
    selections: [
      { measureId: "M7", districtId: "nura" },
      { measureId: "M8", districtId: "nura" },
      { measureId: "M10", districtId: "nura" },
      { measureId: "M12", districtId: null },
      { measureId: "M5", districtId: "saryarka" },
    ],
  };
  const calculated = await request("/api/simulate", input);
  assert.equal(calculated.status, 200, "Control scenario must be accepted");
  const report = await calculated.json();
  assert(Math.abs(report.score - 56.54307) < 1e-8, "Control Score mismatch");
  assert.equal(report.cost, 95, "Control cost mismatch");
  console.log("PASS: control portfolio, cost 95, Score 56.54307");

  const overBudget = { ...input, selections: [
    { measureId: "M3", districtId: "nura" },
    { measureId: "M13", districtId: "nura" },
    { measureId: "M7", districtId: "nura" },
    { measureId: "M8", districtId: "nura" },
    { measureId: "M10", districtId: "nura" },
  ] };
  assert.equal((await request("/api/simulate", overBudget)).status, 400, "Over-budget portfolio must fail");
  assert.equal((await request("/api/simulate", { ...input, score: 100 })).status, 400, "Client Score injection must fail");
  assert.equal((await request("/api/simulate", input, "https://unrelated.example")).status, 403, "Foreign browser origin must fail");
  console.log("PASS: budget, server authority, foreign Origin rejection");
  console.log(status.aiConfigured
    ? "INFO: AI configured; actual provider access and generation NOT tested."
    : "INFO: AI not configured; live AI unavailable in this environment.");
  console.log("LIMITS: no AI calls, persistence/restart, authentication, quotas, or public readiness verification.");
}
main().catch((error) => {
  console.error("FAIL:", error instanceof assert.AssertionError ? error.message : "Request failed; verify URL, server, TLS, and access.");
  process.exitCode = 1;
});
