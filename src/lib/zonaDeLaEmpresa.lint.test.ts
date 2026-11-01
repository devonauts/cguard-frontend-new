/**
 * Lint-style guard: Turnos, Asistencia and Nómina show times in the COMPANY
 * zone, never the viewer's device zone (see horaDeLaEmpresa.ts).
 *
 * In the watched folders every `.toLocaleDateString/TimeString/String(` call
 * must pass `timeZone`, and every `.getHours()` / `.getMinutes()` reads the
 * device clock. Both are allowed only with a `tz:` comment on the same line or
 * the two lines above saying why (e.g. `// tz: civil day built at local
 * midnight`). A new device-zone format fails here instead of in a client's
 * timesheet.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const WATCHED = [
  "pages/admin/programmer",
  "pages/admin/nomina",
  "pages/admin/dobletes",
  "components/schedule",
];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

function closingParen(s: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < s.length && depth) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    i++;
  }
  return i;
}

export function deviceZoneUses(src: string): Array<{ line: number; what: string }> {
  const lines = src.split("\n");
  const excused = (line: number) =>
    [line, line - 1, line - 2].some((l) => l >= 1 && /\btz:/.test(lines[l - 1] || ""));
  const out: Array<{ line: number; what: string }> = [];
  const lineOf = (i: number) => src.slice(0, i).split("\n").length;

  for (const m of src.matchAll(/\.(toLocaleDateString|toLocaleTimeString|toLocaleString)\(/g)) {
    const start = (m.index || 0) + m[0].length;
    const args = src.slice(start, closingParen(src, start) - 1);
    if (/\btimeZone\b/.test(args)) continue;
    const line = lineOf(m.index || 0);
    if (!excused(line)) out.push({ line, what: m[1] });
  }
  for (const m of src.matchAll(/\.(getHours|getMinutes)\(\)/g)) {
    const line = lineOf(m.index || 0);
    if (!excused(line)) out.push({ line, what: m[1] });
  }
  return out;
}

describe("company time zone in Turnos / Asistencia / Nómina", () => {
  it("the rule catches a device-zone format and accepts an explained one", () => {
    expect(deviceZoneUses('x = d.toLocaleTimeString("es", { hour: "2-digit" });')).toHaveLength(1);
    expect(deviceZoneUses('x = d.toLocaleTimeString("es", { timeZone: z });')).toHaveLength(0);
    expect(deviceZoneUses("// tz: civil day\nx = d.toLocaleDateString(l);")).toHaveLength(0);
    expect(deviceZoneUses("h = ini.getHours();")).toHaveLength(1);
  });

  it("no screen formats an instant in the viewer's device zone", () => {
    const found: string[] = [];
    for (const dir of WATCHED) {
      for (const f of files(join(ROOT, dir))) {
        for (const u of deviceZoneUses(readFileSync(f, "utf8"))) {
          found.push(`${f.slice(ROOT.length + 1)}:${u.line} ${u.what}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
