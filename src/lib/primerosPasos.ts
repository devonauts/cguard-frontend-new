/**
 * The Panel's getting-started guide — the server answer, normalised (phase 3).
 * `GET /tenant/:t/getting-started` → steps station → requirement → guards →
 * schedule → publish → clockIn, each done or not, plus whether to show it.
 */
export type ClaveDePaso =
  "station" | "requirement" | "guards" | "schedule" | "publish" | "clockIn";

export const ORDEN_DE_PASOS: ClaveDePaso[] = [
  "station",
  "requirement",
  "guards",
  "schedule",
  "publish",
  "clockIn",
];

export interface PasoDeArranque {
  key: ClaveDePaso;
  done: boolean;
  path: string;
}

export interface PrimerosPasos {
  steps: PasoDeArranque[];
  next: ClaveDePaso | null;
  established: boolean;
  dismissedAt: string | null;
  show: boolean;
}

const RUTA_POR_DEFECTO: Record<ClaveDePaso, string> = {
  station: "/stations",
  requirement: "/stations",
  guards: "/personal/nueva?tipo=vigilante",
  schedule: "/schedule?modo=borrador",
  publish: "/schedule?modo=borrador",
  clockIn: "/nomina/records",
};

/** Unwraps `{data}`, keeps the known steps in order, never throws. */
export function normalizarPrimerosPasos(res: unknown): PrimerosPasos | null {
  const r: any =
    res && typeof res === "object" ? ((res as any).data ?? res) : null;

  if (!r || !Array.isArray(r.steps)) return null;
  const porClave = new Map<string, any>(
    r.steps.map((s: any) => [String(s?.key), s]),
  );
  const steps = ORDEN_DE_PASOS.filter((k) => porClave.has(k)).map((k) => {
    const s = porClave.get(k);
    const path =
      typeof s?.path === "string" && s.path.startsWith("/")
        ? s.path
        : RUTA_POR_DEFECTO[k];

    return { key: k, done: !!s?.done, path };
  });
  const next = steps.find((s) => !s.done)?.key ?? null;

  return {
    steps,
    next,
    established: !!r.established,
    dismissedAt: r.dismissedAt ? String(r.dismissedAt) : null,
    show: !!r.show && next !== null,
  };
}

/** «3 de 6». */
export const hechos = (p: PrimerosPasos) =>
  p.steps.filter((s) => s.done).length;
