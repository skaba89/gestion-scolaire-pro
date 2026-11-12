import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Contrôle de contrat frontend → API (AUD-ROUTES, 2026-11-12). */
const SCRIPT = path.resolve(__dirname, "../frontend-api-routes.mjs");

function run(source: string): { code: number; out: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-routes-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "page.ts"), source);
  fs.writeFileSync(path.join(dir, "ops.json"), JSON.stringify([
    ["GET", "/api/v1/students/{student_id}/"],
    ["GET", "/api/v1/students/me/"],
    ["PATCH", "/api/v1/school-life/check-ins/sessions/{session_id}/end/"],
  ]));
  fs.writeFileSync(path.join(dir, "baseline.json"), "[]");
  try {
    const out = execFileSync("node", [SCRIPT, "ops.json", "src", "report.txt", "--baseline", "baseline.json"], {
      cwd: dir, encoding: "utf8", stdio: "pipe",
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

describe("frontend-api-routes", () => {
  it("flags a literal segment that only a {param} route captures", () => {
    const { code, out } = run('apiClient.get("/students/classes/");');
    expect(code).toBe(1);
    expect(out).toContain("GET /students/classes [capturé par /students/{student_id}]");
  });

  it("accepts an exact route and a dynamic segment filling a parameter", () => {
    const { code } = run([
      'apiClient.get("/students/me/");',
      "apiClient.get(`/students/${student.id}/`);",
      "apiClient.patch(`/school-life/check-ins/sessions/${active?.id}/end/`, {});",
    ].join("\n"));
    expect(code).toBe(0);
  });
});
