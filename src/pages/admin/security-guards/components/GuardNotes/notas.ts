import { localeActual } from "@/lib/localeActual";
import { soloFechaCivil, zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

function fmtDate(v: string | number | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);

  if (isNaN(d.getTime())) return String(v);

  return d.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * The note's day as written. `noteDate` is a calendar day: read as an instant
 * it moved to the day before for anyone west of UTC (Ecuador: 1 nov → 31 oct).
 * Only a note without one falls back to when it was created.
 */
export function fechaDeNota(note: {
  noteDate?: string | null;
  date?: string | null;
  createdAt?: string | null;
}): string {
  const dia = note?.noteDate ?? note?.date;

  if (dia)
    return soloFechaCivil(
      dia,
      { day: "2-digit", month: "short", year: "numeric" },
      "",
    );

  return fmtDate(note?.createdAt);
}

/** Title and description are both marked required in the form. */
export function notaIncompleta(f: {
  title: string;
  description: string;
  date: string;
}): "title" | "description" | "date" | null {
  if (!f.title.trim()) return "title";
  if (!f.description.trim()) return "description";
  if (!f.date) return "date";

  return null;
}
