/**
 * «HORAS ENTRE MARCAS» (Multimarca phase 4) — the pure part of the page.
 *
 * Payroll is not shared: a person is paid by the brand they registered in
 * (employer), even for hours worked at another brand's sites. This report
 * says how many hours people of brand X worked at sites of brand Y in a
 * period, so the companies can settle between them.
 *
 * Phase 5: with MONEY — each pair (the company that provides the staff →
 * the client's company) has an hour rate effective from a date; the server
 * values every shift at the rate in effect that day. No rate = «Sin tarifa».
 */
import type { CambioDeTarifa, ParDeHoras, TarifaEntreMarcas } from "@/lib/api/marcasService";

import { sumaDias } from "@/lib/horaDeLaEmpresa";

export type PeriodoRapido = "esteMes" | "mesPasado" | "ultimos30";

/** A quick period, from the company's «today» (`YYYY-MM-DD`). */
export function periodoRapido(
  p: PeriodoRapido,
  hoy: string,
): { from: string; to: string } {
  const [a, m] = hoy.split("-").map(Number);
  const dos = (n: number) => String(n).padStart(2, "0");
  const primero = (ano: number, mes: number) => `${ano}-${dos(mes)}-01`;

  if (p === "ultimos30") return { from: sumaDias(hoy, -29), to: hoy };
  if (p === "esteMes") return { from: primero(a, m), to: hoy };
  const ano = m === 1 ? a - 1 : a;
  const mes = m === 1 ? 12 : m - 1;

  return { from: primero(ano, mes), to: sumaDias(primero(a, m), -1) };
}

export interface Matriz {
  /** Employer brands (rows), in the brands' order. */
  filas: string[];
  /** Site brands (columns), in the brands' order. */
  columnas: string[];
  celda: (empleadora: string, sitio: string) => ParDeHoras | null;
  totalFila: (empleadora: string) => number;
  totalColumna: (sitio: string) => number;
  total: number;
}

/**
 * The matrix employer × site brand. Only brands that appear in the data are
 * shown, in the order of `orden` (principal first); unknown ids go last.
 */
export function construirMatriz(pares: ParDeHoras[], orden: string[]): Matriz {
  const pos = (id: string) => {
    const i = orden.indexOf(id);

    return i < 0 ? orden.length : i;
  };
  const ordenar = (ids: Set<string>) =>
    [...ids].sort((x, y) => pos(x) - pos(y) || x.localeCompare(y));
  const porPar = new Map<string, ParDeHoras>();
  const filas = new Set<string>();
  const columnas = new Set<string>();

  for (const p of pares) {
    const k = `${p.employerBrandId}|${p.siteBrandId}`;
    const ya = porPar.get(k);

    porPar.set(
      k,
      ya
        ? {
            ...ya,
            hours: ya.hours + p.hours,
            people: ya.people + p.people,
            shifts: ya.shifts + p.shifts,
            amountCents:
              ya.amountCents == null && p.amountCents == null
                ? null
                : (ya.amountCents ?? 0) + (p.amountCents ?? 0),
            currency: ya.currency ?? p.currency ?? null,
            unratedHours: (ya.unratedHours ?? 0) + (p.unratedHours ?? 0),
          }
        : { ...p },
    );
    filas.add(p.employerBrandId);
    columnas.add(p.siteBrandId);
  }
  const lista = [...porPar.values()];
  const suma = (f: (p: ParDeHoras) => boolean) =>
    redondearHoras(lista.filter(f).reduce((s, p) => s + (Number(p.hours) || 0), 0));

  return {
    filas: ordenar(filas),
    columnas: ordenar(columnas),
    celda: (e, s) => porPar.get(`${e}|${s}`) ?? null,
    totalFila: (e) => suma((p) => p.employerBrandId === e),
    totalColumna: (s) => suma((p) => p.siteBrandId === s),
    total: suma(() => true),
  };
}

/** Hours to two decimals (no float noise like 7.300000000001). */
export function redondearHoras(h: number): number {
  return Math.round((Number(h) || 0) * 100) / 100;
}

/** «7,5 h» in the reader's locale; `—` for nothing. */
export function textoDeHoras(h: number | null | undefined, locale: string): string {
  if (!h) return "—";

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    redondearHoras(h),
  )} h`;
}

/** A period is usable: both days, from ≤ to, at most a year. */
export function periodoValido(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return false;
  if (from > to) return false;

  return sumaDias(from, 366) >= to;
}

/* ── Phase 5: money ─────────────────────────────────────────────────────── */

/** «USD 1.234,50» in the reader's locale; `null` cents → `null`. */
export function textoDeImporte(
  cents: number | null | undefined,
  currency: string | null | undefined,
  locale: string,
): string | null {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return null;
  const cur = String(currency || "USD").toUpperCase();

  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: cur }).format(Number(cents) / 100);
  } catch {
    return `${cur} ${(Number(cents) / 100).toFixed(2)}`;
  }
}

/** The total owed per currency (pairs may settle in different currencies). */
export function importesPorMoneda(pares: ParDeHoras[]): Array<{ currency: string; cents: number }> {
  const m = new Map<string, number>();

  for (const p of pares) {
    if (p.amountCents === null || p.amountCents === undefined || !p.currency) continue;
    m.set(p.currency, (m.get(p.currency) || 0) + Number(p.amountCents));
  }

  return [...m.entries()].map(([currency, cents]) => ({ currency, cents }));
}

/** Hours of the period without a rate in effect (any pair). */
export function horasSinTarifa(pares: ParDeHoras[]): number {
  return redondearHoras(pares.reduce((s, p) => s + (Number(p.unratedHours) || 0), 0));
}

/**
 * A typed amount («15», «15,5», «1.234,56», «1,234.56») → whole cents, or
 * null when it is not an amount ≥ 0. The last «,» or «.» followed by one or
 * two digits is the decimal separator.
 */
export function centavosDe(texto: string): number | null {
  const s = String(texto || "").trim().replace(/\s/g, "");

  if (!s || !/^[0-9.,]+$/.test(s)) return null;
  const m = s.match(/^(.*?)[.,](\d{1,2})$/);
  const entero = (m ? m[1] : s).replace(/[.,]/g, "");
  const dec = m ? m[2].padEnd(2, "0") : "00";

  if (!/^\d*$/.test(entero) || (!entero && !m)) return null;
  const n = Number(entero || "0") * 100 + Number(dec);

  return Number.isFinite(n) ? n : null;
}

export interface ParConTarifas {
  employerBrandId: string;
  siteBrandId: string;
  currency: string;
  /** Newest first. */
  tarifas: TarifaEntreMarcas[];
}

/** The rates grouped by pair (in the brands' order), newest first in each. */
export function tarifasPorPar(tarifas: TarifaEntreMarcas[], orden: string[]): ParConTarifas[] {
  const pos = (id: string) => {
    const i = orden.indexOf(id);

    return i < 0 ? orden.length : i;
  };
  const m = new Map<string, ParConTarifas>();

  for (const t of tarifas) {
    const k = `${t.employerBrandId}|${t.siteBrandId}`;
    const g = m.get(k) ?? { employerBrandId: t.employerBrandId, siteBrandId: t.siteBrandId, currency: t.currency, tarifas: [] };

    g.tarifas.push(t);
    m.set(k, g);
  }
  for (const g of m.values()) g.tarifas.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  return [...m.values()].sort(
    (a, b) =>
      pos(a.employerBrandId) - pos(b.employerBrandId) || pos(a.siteBrandId) - pos(b.siteBrandId),
  );
}

/** The rate in effect today (or on `dia`) for a pair, or null. */
export function tarifaVigente(
  tarifas: TarifaEntreMarcas[],
  employerBrandId: string,
  siteBrandId: string,
  dia: string,
): TarifaEntreMarcas | null {
  return (
    tarifas
      .filter((t) => t.employerBrandId === employerBrandId && t.siteBrandId === siteBrandId && t.effectiveFrom <= dia)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null
  );
}

/**
 * What the rates form is missing before it can be saved: the two companies
 * (different), an amount and a date. `null` = ready.
 */
export function revisarTarifa(
  f: { employerBrandId: string; siteBrandId: string; monto: string; desde: string },
): "faltanMarcas" | "mismaMarca" | "montoMalo" | "fechaMala" | null {
  if (!f.employerBrandId || !f.siteBrandId) return "faltanMarcas";
  if (f.employerBrandId === f.siteBrandId) return "mismaMarca";
  if (centavosDe(f.monto) === null) return "montoMalo";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.desde)) return "fechaMala";

  return null;
}

/** The PUT body of one new / changed rate. */
export function cambioDeTarifa(
  f: { employerBrandId: string; siteBrandId: string; monto: string; desde: string; moneda?: string | null },
): CambioDeTarifa {
  return {
    employerBrandId: f.employerBrandId,
    siteBrandId: f.siteBrandId,
    rateCents: centavosDe(f.monto),
    currency: f.moneda || null,
    effectiveFrom: f.desde,
  };
}
