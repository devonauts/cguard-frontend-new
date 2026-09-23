/**
 * Piezas compartidas del pase de turno: la página de Pases de turno y la
 * pestaña de la estación enseñan lo mismo y tienen que decirlo igual.
 *
 * Conviven dos generaciones de pase:
 *  - Los antiguos: las consignas son TAREAS (`taskToDo`, `wasItDone`) y sólo
 *    llegan en el detalle. No tienen entrega ni aceptación.
 *  - Los del relevo v2: las consignas viven en el propio pase como JSON
 *    (`text`, `priority`, `done`), y el pase sabe cuándo se entregó, cuándo se
 *    aceptó y si el saliente seguía allí.
 * Todo lo de aquí lee las dos sin preguntar de cuál se trata.
 */
import type { TFunction } from "i18next";

import { StatusBadge } from "@/components/kit";
import type { Passdown } from "@/lib/api/passdownService";
import { fechaYHora } from "@/lib/horaDeLaEmpresa";

/** Fecha y hora en la zona de la EMPRESA, no en la del navegador. */
export const fmtPase = (s?: string | null) => fechaYHora(s);

export type Prioridad = "alta" | "media" | "baja";

export type Consigna = {
  key: string;
  text: string;
  priority: Prioridad | null;
  done: boolean;
  note: string | null;
};

/**
 * Las consignas del pase, sea cual sea su forma.
 * El JSON puede llegar sin parsear (columna de texto) y cada elemento puede ser
 * una tarea antigua o una consigna nueva. Lo que no se entienda se descarta en
 * vez de romper la ficha.
 */
export function consignasDelPase(raw: unknown): Consigna[] {
  let v: unknown = raw;

  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];

  const out: Consigna[] = [];

  v.forEach((x: any, i: number) => {
    if (!x || typeof x !== "object") return;
    const text = String(x.text ?? x.taskToDo ?? "").trim();

    if (!text) return;
    const p = String(x.priority || "").toLowerCase();

    out.push({
      key: String(x.id ?? i),
      text,
      priority: p === "alta" || p === "media" || p === "baja" ? p : null,
      done: Boolean(x.done ?? x.wasItDone),
      note: x.completionNotes ? String(x.completionNotes) : null,
    });
  });

  return out;
}

/** TINYINT → booleano. Null = no se preguntó (pase antiguo o app vieja). */
export function salienteEstaba(p: Pick<Passdown, "outgoingPresent">) {
  const v = p.outgoingPresent as unknown;

  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;

  return null;
}

/** Cómo se registró la entrada del que llegó. */
export function metodoDeEntrada(t: TFunction, m?: string | null) {
  switch (m) {
    case "app":
      return t("passdown.entryMethod.app", "Desde la app");
    case "auto_location":
      return t("passdown.entryMethod.auto_location", "Automática por ubicación");
    case "supervisor":
      return t("passdown.entryMethod.supervisor", "Marcada por el supervisor");
    default:
      return null;
  }
}

export function PrioridadBadge({
  t,
  priority,
}: {
  t: TFunction;
  priority: Prioridad | null;
}) {
  const p = priority || "media";
  const tone = p === "alta" ? "bad" : p === "media" ? "warn" : "neutral";
  const label =
    p === "alta"
      ? t("passdown.priority.alta", "Alta")
      : p === "media"
        ? t("passdown.priority.media", "Media")
        : t("passdown.priority.baja", "Baja");

  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

/** «Estaba» / «No estaba» / «—». El «No estaba» en aviso: no se pagó la espera. */
export function SalienteEstabaBadge({
  t,
  passdown,
}: {
  t: TFunction;
  passdown: Pick<Passdown, "outgoingPresent">;
}) {
  const v = salienteEstaba(passdown);

  if (v === true)
    return (
      <StatusBadge dot={false} tone="ok">
        {t("passdown.outgoingPresent.yes", "Estaba")}
      </StatusBadge>
    );
  if (v === false)
    return (
      <StatusBadge dot={false} tone="warn">
        {t("passdown.outgoingPresent.no", "No estaba")}
      </StatusBadge>
    );

  return <span style={{ color: "var(--ink-faint)" }}>—</span>;
}

/** Estado del pase. «Relevo no llegó» manda sobre lo demás mientras nadie acepte. */
export function EstadoDelPase({
  t,
  passdown,
}: {
  t: TFunction;
  passdown: Passdown;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {passdown.acceptedAt || passdown.status === "received" ? (
        <StatusBadge tone="ok">
          {passdown.acceptedAt
            ? t("passdown.status.accepted", "Aceptado")
            : t("passdown.status.received", "Recibido")}
        </StatusBadge>
      ) : (
        <StatusBadge tone="warn">
          {t("ui.PassdownsPage.pendienteDeRecibir", "Pendiente de recibir")}
        </StatusBadge>
      )}
      {passdown.reliefMissingReportedAt && (
        <StatusBadge dot={false} tone="bad">
          {t("passdown.reliefMissing", "Relevo no llegó")}
        </StatusBadge>
      )}
    </span>
  );
}

/** «Saliente → Entrante», con «—» donde falte alguno. */
export function quienEntregaYRecibe(p: Passdown): string {
  const de = p.outgoingGuardName?.trim() || "—";
  const a = p.receivedByName?.trim() || "—";

  return `${de} → ${a}`;
}

/** La hora de entrega. Los pases antiguos nacían al entregar: su `createdAt` vale. */
export const horaDeEntrega = (p: Passdown) => p.deliveredAt || p.createdAt;

/**
 * La hora de aceptación. Un pase antiguo «recibido» sólo quiere decir que el
 * entrante abrió la app, así que se enseña como recibido, no como aceptado.
 */
export function horaDeAceptacion(t: TFunction, p: Passdown): string {
  if (p.acceptedAt) return fmtPase(p.acceptedAt);
  if (p.status === "received" && p.receivedAt)
    return `${t("passdown.status.received", "Recibido")} · ${fmtPase(p.receivedAt)}`;

  return t("passdown.notAccepted", "Sin aceptar");
}

export function imagenDelPase(img: {
  downloadUrl?: string | null;
  publicUrl?: string | null;
}): string | null {
  return img.downloadUrl || img.publicUrl || null;
}
