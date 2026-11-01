/**
 * The filters of the Asistencia pages, kept in the URL so a filtered view can
 * be bookmarked or sent («los atrasos de Ana esta semana» is a link).
 *
 * Dates are COMPANY-LOCAL days (YYYY-MM-DD); the server turns them into
 * instants in the company zone. The browser's own zone never enters.
 */
import { hoyEnLaEmpresa, sumaDias } from "@/lib/horaDeLaEmpresa";

export interface FiltrosDeAsistencia {
  from: string;
  to: string;
  guard: string;
  station: string;
  branch: string;
  status: string;
  payroll: string;
  type: string;
  page: number;
  size: number;
}

export const TAMANOS_DE_PAGINA = [25, 50, 100, 200];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const TEXTO = ["guard", "station", "branch", "status", "payroll", "type"] as const;

/** Monday..Sunday containing `ymd`. */
export function semanaDe(ymd: string): { from: string; to: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const from = sumaDias(ymd, -dow);

  return { from, to: sumaDias(from, 6) };
}

/** First..last day of the month of `ymd`. */
export function mesDe(ymd: string): { from: string; to: string } {
  const [y, m] = ymd.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");

  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

export type Periodo = "day" | "week" | "month" | "custom";

/** Which preset a range is, so the period switch shows the right option. */
export function periodoDe(from: string, to: string): Periodo {
  if (from === to) return "day";
  const s = semanaDe(from);
  if (s.from === from && s.to === to) return "week";
  const m = mesDe(from);
  if (m.from === from && m.to === to) return "month";

  return "custom";
}

/** The range of `periodo` around `ancla`. */
export function rangoDe(periodo: Exclude<Periodo, "custom">, ancla: string): { from: string; to: string } {
  if (periodo === "day") return { from: ancla, to: ancla };
  if (periodo === "week") return semanaDe(ancla);

  return mesDe(ancla);
}

/** Previous/next range of the same kind (a custom range moves by its length). */
export function moverRango(from: string, to: string, dir: 1 | -1): { from: string; to: string } {
  const p = periodoDe(from, to);
  if (p === "month") return mesDe(sumaDias(dir > 0 ? to : from, dir));
  if (p === "week") return semanaDe(sumaDias(from, dir * 7));
  const largo = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

  return { from: sumaDias(from, dir * largo), to: sumaDias(to, dir * largo) };
}

export function leerFiltros(
  sp: URLSearchParams,
  porDefecto: Partial<FiltrosDeAsistencia> & { periodo?: Exclude<Periodo, "custom">; hoy?: string } = {},
): FiltrosDeAsistencia {
  const hoy = porDefecto.hoy || hoyEnLaEmpresa();
  const base = rangoDe(porDefecto.periodo || "week", hoy);
  let from = sp.get("from") || "";
  let to = sp.get("to") || "";
  // A notification link carries `date`: open the week of that day.
  const date = sp.get("date") || "";
  if (!YMD.test(from) && YMD.test(date)) ({ from, to } = semanaDe(date));
  if (!YMD.test(from)) from = porDefecto.from || base.from;
  if (!YMD.test(to)) to = porDefecto.to || (from === base.from ? base.to : from);
  if (to < from) to = from;
  const size = Number(sp.get("size"));
  const page = Number(sp.get("page"));
  const f: FiltrosDeAsistencia = {
    from,
    to,
    guard: "",
    station: "",
    branch: "",
    status: "",
    payroll: "",
    type: "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: TAMANOS_DE_PAGINA.includes(size) ? size : porDefecto.size || 50,
  };
  for (const k of TEXTO) f[k] = sp.get(k) || (porDefecto[k] as string) || "";

  return f;
}

/** Back to the URL. Keeps unrelated params (e.g. `focus`), drops empties. */
export function escribirFiltros(f: FiltrosDeAsistencia, previo?: URLSearchParams): URLSearchParams {
  const sp = new URLSearchParams(previo);
  sp.delete("date");
  sp.set("from", f.from);
  sp.set("to", f.to);
  for (const k of TEXTO) {
    if (f[k]) sp.set(k, f[k]);
    else sp.delete(k);
  }
  if (f.page > 1) sp.set("page", String(f.page));
  else sp.delete("page");
  if (f.size !== 50) sp.set("size", String(f.size));
  else sp.delete("size");

  return sp;
}

/** Changing any filter goes back to page 1. */
export function conFiltro(f: FiltrosDeAsistencia, cambio: Partial<FiltrosDeAsistencia>): FiltrosDeAsistencia {
  const pagina = "page" in cambio ? cambio.page! : 1;

  return { ...f, ...cambio, page: pagina };
}

/** limit/offset of the current page. */
export function paginaDe(f: FiltrosDeAsistencia): { limit: number; offset: number } {
  return { limit: f.size, offset: (f.page - 1) * f.size };
}
