/**
 * PARIDAD PLANIFICADOR ↔ HORARIO REAL, SOBRE 200 CASOS LÍMITE
 *
 * Los casos los monta `backend/scripts/e2ePlanificadorParidad.ts` en el tenant
 * de demo local (estación + plazas + gente por los servicios de la API) y
 * deja un overview por caso en `scratchpad/paridad/casos.jsonl`. Aquí cada
 * overview pasa por el lector (`planDesdeHorarioReal`) y se comprueba que:
 *
 *   1. las franjas llevan su tramo por hora de entrada (D/T/N/24);
 *   2. lo que PIDE el puesto cada día es lo que se configuró (a la vez × días);
 *   3. cada fijo se lee igual que sus turnos reales (día a día, ≤ 2 fallos);
 *   4. el parecido global del caso es ≥ 95 %;
 *   5. con sacafranco, «cubrir lo que falta» no empeora nada.
 *
 * Sin el fichero (no se montaron los casos) la suite se salta sola. El
 * informe queda en `scratchpad/paridad/informe.md`.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FRANCO, falta, limpiar, pide, propio, type Persona } from "./motor";
import { planDesdeHorarioReal, tramoDeHora } from "./real";

const CARPETA =
  process.env.PARIDAD_DIR || path.resolve(__dirname, "../../../../paridad");
/* `casos.jsonl` de una tirada de un solo trabajador, o `casos-0.jsonl`,
   `casos-1.jsonl`… de una tirada repartida en varios (3000 casos). */
const FICHEROS = existsSync(CARPETA)
  ? readdirSync(CARPETA)
      .filter((f) => /^casos(-\d+)?\.jsonl$/.test(f))
      .sort()
      .map((f) => path.join(CARPETA, f))
  : [];

const diasEntre = (base: string, fecha: string) => {
  const [by, bm, bd] = base.split("-").map(Number);
  const [y, m, d] = fecha.split("-").map(Number);

  return Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(by, bm - 1, bd)) / 86_400_000,
  );
};
const minutosDe = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);

  return h * 60 + m;
};
const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

const hay = FICHEROS.length > 0;

describe.skipIf(!hay)("paridad Planificador ↔ Horario (casos reales)", () => {
  it("lee cada caso igual que el horario real", () => {
    const lineas = FICHEROS.flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    ).sort((a, b) => (a.caso?.n ?? 0) - (b.caso?.n ?? 0));
    const filas: string[] = [];
    const fallos: string[] = [];
    let sumaCoincidencia = 0;
    let conCoincidencia = 0;

    for (const reg of lineas) {
      const problemas: string[] = [];
      let coincidencia = 0;
      let faltasAntes = 0;
      let faltasDespues = 0;

      if (reg.error) {
        problemas.push(`no se montó: ${reg.error}`);
      } else {
        const r = planDesdeHorarioReal(
          reg.overview,
          reg.rotaciones,
          reg.base,
          reg.tz,
          60,
        );
        const plan = r.plan;
        const pu = plan.puestos[0];

        coincidencia = r.coincidencia;
        if (!pu) problemas.push("el lector no vio el puesto");
        else {
          // 0) La ausencia planificada (vacaciones V de 2 días del primer fijo,
          //    pasado mañana) se lee como ausencia, no como falta ni como turno.
          if (reg.caso?.ausencia && reg.asignaciones?.length) {
            const hoyIdx = diasEntre(reg.base, reg.hoy);
            const guardId = String(reg.asignaciones[0].guard.id);
            const pid = Object.keys(r.enlace.personas).find(
              (k) => r.enlace.personas[k].guardId === guardId,
            );
            const p = plan.personas.find((x) => x.id === pid);
            const vac = (p?.ausencias || []).filter(
              (a) => a.tipo === "vacaciones",
            );

            for (const d of [hoyIdx + 2, hoyIdx + 3])
              if (!vac.some((a) => d >= a.desde && d <= a.hasta))
                problemas.push(`día ${d}: no se leyó la ausencia (vacaciones)`);
            if ((p?.ausencias || []).some((a) => a.tipo === "falta"))
              problemas.push("la ausencia planificada se leyó como falta");
          }
          // 1) Tramos por hora de entrada.
          for (const fid of pu.franjas) {
            const fr = plan.franjas[fid];
            const esperado = fr.ini === fr.fin ? "24" : tramoDeHora(fr.ini);

            if (fr.tramo !== esperado)
              problemas.push(`franja ${fid}: tramo ${fr.tramo} ≠ ${esperado}`);
          }
          // 2) Lo que pide cada día = lo configurado.
          for (const cf of reg.cobertura.franjas as {
            start: string;
            end: string;
            guards: number;
            days: string[];
          }[]) {
            const ini = minutosDe(cf.start);
            const fid = pu.franjas.find((x) => plan.franjas[x].ini === ini);

            if (!fid) {
              problemas.push(`no hay franja que entre a las ${cf.start}`);
              continue;
            }
            for (let dow = 0; dow < 7; dow++) {
              const opera = !cf.days.length || cf.days.includes(DIAS[dow]);
              const esperado = opera ? cf.guards : 0;
              const visto = pide(pu, fid, dow);

              if (visto !== esperado) {
                problemas.push(
                  `pide ${fid} ${DIAS[dow]}: ${visto} ≠ ${esperado}`,
                );
                break;
              }
            }
          }
          // 3) Cada fijo, día a día, contra sus turnos reales.
          const base: string = reg.base;
          const tz: string = reg.tz;
          const porGuardia = new Map<string, Map<number, number>>();

          for (const s of reg.overview.shifts) {
            const ini = new Date(s.startTime);
            const dia = ini.toLocaleDateString("en-CA", { timeZone: tz });
            const d = diasEntre(base, dia);
            const [hh, mm] = ini
              .toLocaleTimeString("en-GB", {
                timeZone: tz,
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
              .split(":")
              .map(Number);
            const g = String(s.guardId);

            if (!porGuardia.has(g)) porGuardia.set(g, new Map());
            porGuardia.get(g)!.set(d, (hh % 24) * 60 + mm);
          }
          const franjaCercana = (min: number) => {
            let mejor = pu.franjas[0];
            let dist = Infinity;

            for (const id of pu.franjas) {
              const raw = Math.abs(plan.franjas[id].ini - min);
              const dd = Math.min(raw, 1440 - raw);

              if (dd < dist) {
                dist = dd;
                mejor = id;
              }
            }

            return mejor;
          };

          for (const p of plan.personas as Persona[]) {
            if (p.puesto !== pu.id) continue; // los sacafrancos van aparte
            const guardId = r.enlace.personas[p.id]?.guardId;
            const hechos = porGuardia.get(String(guardId)) || new Map();

            if (!hechos.size) {
              problemas.push(`${p.nombre}: sin turnos reales`);
              continue;
            }
            const desde = Math.max(0, Math.min(...hechos.keys()));
            const hasta = Math.min(42, Math.max(...hechos.keys()) + 1);
            let malos = 0;
            const ejemplos: string[] = [];

            for (let d = desde; d < hasta; d++) {
              const real = hechos.has(d)
                ? franjaCercana(hechos.get(d)!)
                : FRANCO;
              const leido = propio(p, d);

              if (real !== leido) {
                malos++;
                if (ejemplos.length < 3)
                  ejemplos.push(`d${d} real ${real} leído ${leido}`);
              }
            }
            if (malos > 2)
              problemas.push(
                `${p.nombre}: ${malos} días distintos de ${hasta - desde} (${ejemplos.join("; ")})`,
              );
          }
          // 4) Parecido global.
          if (coincidencia < 0.95)
            problemas.push(`parecido ${(coincidencia * 100).toFixed(0)} %`);
          sumaCoincidencia += coincidencia;
          conCoincidencia++;
          // 5) Con sacafranco, cubrir lo que falta no empeora.
          if (reg.caso.sacafranco) {
            const cuenta = () => {
              let n = 0;

              for (let d = 7; d < 35; d++)
                for (const fid of pu.franjas)
                  n += Math.max(0, falta(plan, pu, fid, d));

              return n;
            };

            faltasAntes = cuenta();
            limpiar(plan, 0, 42);
            faltasDespues = cuenta();
            if (faltasDespues > faltasAntes)
              problemas.push(
                `cubrir lo que falta empeora: ${faltasAntes} → ${faltasDespues}`,
              );
          }
        }
      }
      const etiqueta = `${String(reg.caso.n).padStart(3, "0")} · ${reg.cobertura?.nombre || reg.caso.cobertura} · ${reg.caso.ciclo} · ${reg.caso.arranque}${reg.caso.sacafranco ? " · sf" : ""}${reg.caso.porPlaza ? " · por plaza" : ""}`;

      filas.push(
        `| ${etiqueta} | ${reg.turnos ?? "-"} | ${(coincidencia * 100).toFixed(0)} % | ${reg.caso.sacafranco ? `${faltasAntes} → ${faltasDespues}` : "—"} | ${problemas.length ? "❌ " + problemas.join(" · ") : "✓"} |`,
      );
      if (problemas.length)
        fallos.push(`${etiqueta}: ${problemas.join(" · ")}`);
    }

    const informe = [
      "# Paridad Planificador ↔ Horario real",
      "",
      `Casos: ${lineas.length} · con problemas: ${fallos.length} · parecido medio: ${conCoincidencia ? ((sumaCoincidencia / conCoincidencia) * 100).toFixed(1) : "-"} %`,
      "",
      "| Caso | Turnos reales | Parecido | Faltas con sf (antes → después de cubrir) | Resultado |",
      "|---|---|---|---|---|",
      ...filas,
      "",
      fallos.length
        ? "## Problemas\n\n" + fallos.map((x) => `- ${x}`).join("\n")
        : "Sin problemas.",
      "",
    ].join("\n");

    writeFileSync(path.join(CARPETA, "informe.md"), informe);
    expect(fallos).toEqual([]);
  });
});
