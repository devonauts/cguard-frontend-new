/**
 * LIVE EDITS vs THE OPEN DRAFT (phase 5, 2026-11-01).
 *
 * When someone changes the live schedule on a guard or station that the shared
 * draft also changes, the server tells both sides right after the commit
 * (`schedule:draftOverlap`, backend services/scheduling/draftOverlap):
 *
 *   · side «live»  — whoever made the change: whose draft has it;
 *   · side «draft» — whoever has the draft open: who changed what.
 *
 * The draft also keeps those changes (`liveChanges`) so its cells are marked
 * when it opens. Nothing here blocks: the publish check (409) stays the guard.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { crearSocket, cerrarSocket } from "@/lib/socket";
import { getAuthToken } from "@/lib/api";
import { localeActual } from "@/lib/localeActual";

export const EVENTO_CRUCE = "schedule:draftOverlap";

export interface CambioEnVivo {
  kind: "shift" | "assignment" | "mark";
  guardId: string | null;
  stationId: string | null;
  /** The company day the change lands on; null for an assignment (from `from`). */
  day: string | null;
  from?: string | null;
  guard: string | null;
  station: string | null;
  by: string;
  byId?: string;
  at: string;
}

export interface AvisoEnVivo {
  side: "live";
  draftId: string;
  owners: string[];
  editing: boolean;
  draftSavedAt: string | null;
  at: string;
  items: CambioEnVivo[];
  total: number;
}

export interface AvisoDeBorrador {
  side: "draft";
  draftId: string;
  by: string;
  at: string;
  items: CambioEnVivo[];
  total: number;
}

export type Aviso = AvisoEnVivo | AvisoDeBorrador;

type T = (key: string, opts?: any) => string;

/** «jue 5 nov» for a company day 'YYYY-MM-DD' (already in the company's calendar). */
export function fechaCorta(ymd: string): string {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);

  if (!y || !m || !d) return String(ymd || "");

  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeActual(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

const lista = (xs: string[]) => [...new Set(xs.filter(Boolean))].join(", ");

/** «Carlos Mendoza (Bravo 4, jue 5 nov)» — what a change touched, in words. */
export function queCambio(t: T, c: CambioEnVivo): string {
  const quien =
    c.guard ||
    c.station ||
    t("ui.AvisoEnVivo.alguien", { defaultValue: "un turno" });
  const donde = c.guard && c.station ? c.station : "";
  const cuando = c.day
    ? fechaCorta(c.day)
    : c.from
      ? t("ui.AvisoEnVivo.desde", {
          defaultValue: "desde {{dia}}",
          dia: fechaCorta(c.from),
        })
      : "";
  const extra = [donde, cuando].filter(Boolean).join(", ");

  return extra ? `${quien} (${extra})` : quien;
}

function resumen(t: T, items: CambioEnVivo[], total: number): string {
  const primeros = items.slice(0, 3).map((c) => queCambio(t, c));
  const resto = Math.max(0, total - primeros.length);

  return resto
    ? t("ui.AvisoEnVivo.yMas", {
        defaultValue: "{{lista}} y {{count}} más",
        lista: primeros.join("; "),
        count: resto,
      })
    : primeros.join("; ");
}

/** For whoever edited live. */
export function textoEnVivo(t: T, a: AvisoEnVivo): string {
  const quien =
    lista(a.owners) ||
    t("ui.AvisoEnVivo.otraPersona", { defaultValue: "Otra persona" });

  return t(a.editing ? "ui.AvisoEnVivo.vivoEditando" : "ui.AvisoEnVivo.vivo", {
    defaultValue: a.editing
      ? "{{quien}} está editando un borrador que también cambia {{que}}. Tu cambio ya está en el horario real; lo verá antes de publicar."
      : "El borrador sin publicar de {{quien}} también cambia {{que}}. Tu cambio ya está en el horario real; lo verá antes de publicar.",
    quien,
    que: resumen(t, a.items, a.total),
  });
}

/** For whoever has the draft open. */
export function textoDeBorrador(
  t: T,
  a: { by: string; items: CambioEnVivo[]; total: number },
): string {
  return t("ui.AvisoEnVivo.borrador", {
    defaultValue:
      "{{quien}} acaba de cambiar en vivo {{que}}, que este borrador también cambia. Revisa antes de publicar.",
    quien:
      a.by || t("ui.AvisoEnVivo.otraPersona", { defaultValue: "Otra persona" }),
    que: resumen(t, a.items, a.total),
  });
}

/** Newest first, one per cell (same rule as the server). */
export function juntarCambios(
  antes: CambioEnVivo[],
  nuevos: CambioEnVivo[],
): CambioEnVivo[] {
  const visto = new Set<string>();
  const out: CambioEnVivo[] = [];

  for (const c of [...nuevos, ...antes].sort((a, b) =>
    String(b.at).localeCompare(String(a.at)),
  )) {
    const k = `${c.kind}|${c.guardId || ""}|${c.stationId || ""}|${c.day || ""}`;

    if (visto.has(k)) continue;
    visto.add(k);
    out.push(c);
  }

  return out.slice(0, 100);
}

export interface IndiceDeMarcas {
  /** Changes on a person (plan persona id) that day ("*" = every day: an assignment). */
  persona(id: string, dia: string): CambioEnVivo[];
  /** Changes on a station that day, not tied to a guard of the draft. */
  puesto(id: string, dia: string): CambioEnVivo[];
  vacio: boolean;
}

/** Where to put the marks: plan personas are linked to guards by `enlace.personas`. */
export function indiceDeMarcas(
  cambios: CambioEnVivo[],
  personas: Record<string, { guardId: string; stationId: string }>,
): IndiceDeMarcas {
  const porPersona = new Map<string, CambioEnVivo[]>();
  const porPuesto = new Map<string, CambioEnVivo[]>();
  const personasDe = new Map<string, string[]>();

  for (const [pid, l] of Object.entries(personas || {})) {
    if (!l?.guardId) continue;
    const xs = personasDe.get(l.guardId) || [];

    xs.push(pid);
    personasDe.set(l.guardId, xs);
  }
  const poner = (
    m: Map<string, CambioEnVivo[]>,
    k: string,
    c: CambioEnVivo,
  ) => {
    const xs = m.get(k) || [];

    xs.push(c);
    m.set(k, xs);
  };

  for (const c of cambios) {
    const dia = c.day || "*";
    const pids = c.guardId ? personasDe.get(c.guardId) || [] : [];

    for (const pid of pids) poner(porPersona, `${pid}|${dia}`, c);
    if (!pids.length && c.stationId)
      poner(porPuesto, `${c.stationId}|${dia}`, c);
  }

  return {
    persona: (id, dia) => [
      ...(porPersona.get(`${id}|${dia}`) || []),
      ...(porPersona.get(`${id}|*`) || []),
    ],
    puesto: (id, dia) => [
      ...(porPuesto.get(`${id}|${dia}`) || []),
      ...(porPuesto.get(`${id}|*`) || []),
    ],
    vacio: !cambios.length,
  };
}

/**
 * Listen for the server's overlap notices. Live side → a toast (never blocks).
 * Draft side → `alBorrador` when the draft is on screen, else a toast too.
 */
export function useAvisosDeBorrador(
  tenantId: string,
  alBorrador?: (a: AvisoDeBorrador) => void,
): void {
  const { t } = useTranslation();
  const ref = useRef(alBorrador);

  useEffect(() => {
    ref.current = alBorrador;
  }, [alBorrador]);

  useEffect(() => {
    if (!tenantId) return;
    let socket: ReturnType<typeof crearSocket> | null = null;
    const oir = (a: Aviso) => {
      if (!a || typeof a !== "object") return;
      if (a.side === "live") {
        // One toast per draft: a burst of clicks updates it instead of stacking.
        toast.warning(textoEnVivo(t, a), {
          id: `cruce-vivo-${a.draftId}`,
          duration: 10000,
        });

        return;
      }
      if (a.side === "draft") {
        if (ref.current) ref.current(a);
        else
          toast.warning(textoDeBorrador(t, a), {
            id: `cruce-borrador-${a.draftId}`,
            duration: 12000,
          });
      }
    };

    try {
      socket = crearSocket(getAuthToken() || "", String(tenantId));
      socket.on(EVENTO_CRUCE, oir);
    } catch {
      /* without a socket the publish check still catches it */
    }

    return () => {
      if (socket) {
        socket.off(EVENTO_CRUCE, oir);
        cerrarSocket(socket);
      }
    };
  }, [tenantId, t]);
}
