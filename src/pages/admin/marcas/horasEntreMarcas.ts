/**
 * «HORAS ENTRE MARCAS» (Multimarca phase 4) — the pure part of the page.
 *
 * Payroll is not shared: a person is paid by the brand they registered in
 * (employer), even for hours worked at another brand's sites. This report
 * says how many hours people of brand X worked at sites of brand Y in a
 * period, so the companies can settle between them.
 */
import type { ParDeHoras } from "@/lib/api/marcasService";

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
