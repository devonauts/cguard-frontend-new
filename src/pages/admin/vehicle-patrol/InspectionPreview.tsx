import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  X,
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Users2,
  MessageSquareText,
  Smartphone,
  EyeOff,
} from "lucide-react";

import type {
  TemplateContent,
  TemplateItem,
} from "@/lib/api/routeInspectionTemplateService";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * VISTA PREVIA — LA PLANTILLA COMO LA VE EL SUPERVISOR
 *
 * Una plantilla es una lista de campos en una pantalla de administración; en el
 * teléfono es un formulario que alguien rellena de pie, de noche, en un puesto.
 * Quien la escribe no puede juzgar si funciona mirando la lista: hay que ver el
 * paso, cuántas preguntas caen en cada uno y cómo queda el último.
 *
 * Por eso esto NO es una maqueta libre: reproduce el mismo reparto que la app —
 * un paso por sección, el CIERRE al final (personal, fotos, notas) y los mismos
 * controles por tipo de respuesta. Si la app cambia de reparto, esto cambia con
 * ella; una vista previa que miente es peor que no tenerla.
 *
 * ── LO APAGADO NO SE PINTA ────────────────────────────────────────────────
 * Es el sentido de la vista previa: apagar una pregunta y VER que el paso se
 * queda en cuatro, o que la sección entera desaparece. El servidor aplica ese
 * mismo filtro una sola vez, al congelar la instantánea de la visita.
 *
 * Es de sólo lectura: nada de lo que se toque aquí se guarda en ninguna parte.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** ¿Se le pregunta hoy? Ausente = encendida, igual que en el servidor. */
const activa = (it: TemplateItem) => it.enabled !== false;

function Pastilla({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-md px-2 py-1 text-[11px] font-semibold"
      style={{ background: "var(--glass-raised)", color: "var(--ink-soft)" }}
    >
      {children}
    </span>
  );
}

/** El control de cada tipo de respuesta, sin estado: sólo para verlo. */
function Control({ it }: { it: TemplateItem }) {
  const { t } = useTranslation();
  const caja =
    "flex-1 rounded-lg border px-3 py-2 text-center text-[13px] font-medium";
  const estilo = {
    borderColor: "var(--line-2)",
    color: "var(--ink-soft)",
  } as const;

  switch (it.type) {
    case "yes_no":
      return (
        <div className="flex gap-2">
          <span className={caja} style={estilo}>
            <Check className="mr-1 inline size-3.5" />
            {t("ui.InspectionPreview.si", "Sí")}
          </span>
          <span className={caja} style={estilo}>
            <X className="mr-1 inline size-3.5" />
            {t("ui.InspectionPreview.no", "No")}
          </span>
        </div>
      );
    case "pass_fail":
      return (
        <div className="flex gap-2">
          <span className={caja} style={estilo}>
            {t("ui.InspectionPreview.pasa", "Pasa")}
          </span>
          <span className={caja} style={estilo}>
            {t("ui.InspectionPreview.alerta", "Alerta")}
          </span>
          <span className={caja} style={estilo}>
            {t("ui.InspectionPreview.falla", "Falla")}
          </span>
        </div>
      );
    case "slider":
    case "rating": {
      const min = it.scale?.min ?? (it.type === "rating" ? 1 : 0);
      const max = it.scale?.max ?? (it.type === "rating" ? 5 : 10);

      return (
        <div>
          <div
            className="mb-1 flex justify-between text-[11px]"
            style={{ color: "var(--ink-faint)" }}
          >
            <span>{it.scale?.minLabel || min}</span>
            <span>{it.scale?.maxLabel || max}</span>
          </div>
          <div
            className="h-1.5 rounded-full"
            style={{ background: "var(--line-2)" }}
          >
            <div
              className="h-1.5 w-1/2 rounded-full"
              style={{ background: "var(--brand)" }}
            />
          </div>
        </div>
      );
    }
    case "single_select":
    case "multi_select":
      return (
        <div className="flex flex-wrap gap-1.5">
          {(it.options || []).map((o) => (
            <Pastilla key={o.value}>{o.label}</Pastilla>
          ))}
        </div>
      );
    case "boolean":
    case "checkbox":
    case "acknowledgement":
    case "signature":
      return (
        <span className={caja} style={{ ...estilo, display: "inline-block" }}>
          {it.type === "acknowledgement"
            ? t("ui.InspectionPreview.confirmo", "Confirmo")
            : it.type === "signature"
              ? t("ui.InspectionPreview.firmo", "Firmo conforme")
              : t("ui.InspectionPreview.verificado", "Verificado")}
        </span>
      );
    case "photo":
      return (
        <span className={caja} style={{ ...estilo, display: "inline-block" }}>
          <Camera className="mr-1 inline size-3.5" />
          {t("ui.InspectionPreview.anadirFoto", "Añadir foto")}
          {it.photo?.min
            ? ` · ${t("ui.InspectionPreview.minimo", "mín. {{n}}", { n: it.photo.min })}`
            : ""}
        </span>
      );
    default:
      return (
        <div
          className="rounded-lg border px-3 py-2 text-[13px]"
          style={{ borderColor: "var(--line-2)", color: "var(--ink-faint)" }}
        >
          {t("ui.InspectionPreview.respuestaEscrita", "Respuesta escrita…")}
        </div>
      );
  }
}

export default function InspectionPreview({
  content,
}: {
  content: TemplateContent;
}) {
  const { t } = useTranslation();
  const [paso, setPaso] = useState(0);

  // Las secciones que de verdad llegan al teléfono: sin preguntas activas, una
  // sección no existe — es el mismo recorte que hace `soloPreguntasActivas`.
  const secciones = useMemo(
    () =>
      content.sections
        .map((s) => ({ ...s, items: s.items.filter(activa) }))
        .filter((s) => s.items.length > 0),
    [content],
  );
  const total = secciones.length + 1; // + el cierre
  const actual = Math.min(paso, total - 1);
  const sec = actual < secciones.length ? secciones[actual] : null;
  const apagadas = content.sections
    .flatMap((s) => s.items)
    .filter((it) => !activa(it)).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="cg-eyebrow inline-flex items-center gap-1.5">
          <Smartphone className="size-3.5" />
          {t(
            "ui.InspectionPreview.titulo",
            "Vista previa · lo que ve el supervisor",
          )}
        </span>
        {apagadas > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: "var(--ink-faint)" }}
          >
            <EyeOff className="size-3" />
            {t("ui.InspectionPreview.apagadas", "{{n}} sin preguntar", {
              n: apagadas,
            })}
          </span>
        )}
      </div>

      {/* El teléfono. Ancho fijo a propósito: si se estira, deja de enseñar
          cuántas preguntas caben de verdad en una pantalla. */}
      <div
        className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[1.75rem] border p-3"
        style={{ borderColor: "var(--line-2)", background: "var(--float)" }}
      >
        {/* Barra de pasos, igual que en la app */}
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{
                background:
                  i < actual
                    ? "var(--ok)"
                    : i === actual
                      ? "var(--brand)"
                      : "var(--line-2)",
              }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="cg-eyebrow">
            {t("ui.InspectionPreview.paso", "Paso {{n}} de {{total}}", {
              n: actual + 1,
              total,
            })}
          </span>
          {sec && (
            <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
              0/{sec.items.length}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[17px] font-bold leading-tight">
          {sec
            ? sec.title
            : t("ui.InspectionPreview.cierre", "Cierre de la parada")}
        </p>

        <div className="mt-3 max-h-[22rem] space-y-3 overflow-y-auto pr-1">
          {sec ? (
            sec.items.map((it) => (
              <div key={it.id}>
                <p className="mb-1.5 text-[13px] font-semibold">
                  {it.label ||
                    t("ui.InspectionPreview.sinTexto", "(sin texto)")}
                  {it.required !== false && (
                    <span style={{ color: "var(--brand-text)" }}> *</span>
                  )}
                </p>
                {it.help && (
                  <p
                    className="mb-1.5 text-[11px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {it.help}
                  </p>
                )}
                <Control it={it} />
              </div>
            ))
          ) : (
            // El CIERRE no sale de la plantilla: es lo que la empresa exige de
            // toda visita, venga la plantilla que venga.
            <>
              <div>
                <p className="mb-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold">
                  <Users2 className="size-3.5" />
                  {t("ui.InspectionPreview.personal", "Personal del puesto")}
                  {content.settings?.requireGuardVerification && (
                    <span style={{ color: "var(--brand-text)" }}>*</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Pastilla>
                    {t("ui.InspectionPreview.presente", "Presente")}
                  </Pastilla>
                  <Pastilla>
                    {t("ui.InspectionPreview.ausente", "Ausente")}
                  </Pastilla>
                  <Pastilla>
                    {t("ui.InspectionPreview.reemplazo", "Reemplazo")}
                  </Pastilla>
                </div>
              </div>
              <div>
                <p className="mb-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold">
                  <Camera className="size-3.5" />
                  {t("ui.InspectionPreview.evidencia", "Foto de evidencia")}
                  {(content.settings?.minPhotos ?? 0) > 0 && (
                    <span style={{ color: "var(--ink-faint)" }}>
                      ·{" "}
                      {t("ui.InspectionPreview.minimo", "mín. {{n}}", {
                        n: content.settings?.minPhotos,
                      })}
                    </span>
                  )}
                </p>
                <Control
                  it={{ id: "p", type: "photo", label: "" } as TemplateItem}
                />
              </div>
              <div>
                <p className="mb-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold">
                  <MessageSquareText className="size-3.5" />
                  {t("ui.InspectionPreview.notas", "Novedades / notas")}
                  {content.settings?.requireNotes && (
                    <span style={{ color: "var(--brand-text)" }}>*</span>
                  )}
                </p>
                <div
                  className="rounded-lg border px-3 py-4 text-[12px]"
                  style={{
                    borderColor: "var(--line-2)",
                    color: "var(--ink-faint)",
                  }}
                >
                  {t(
                    "ui.InspectionPreview.observaciones",
                    "Observaciones de la parada…",
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* El pie: el mismo par Atrás / Siguiente, y «Completar parada» al final. */}
        <div
          className="mt-3 border-t pt-2.5"
          style={{ borderColor: "var(--line)" }}
        >
          <p
            className="mb-2 inline-flex items-center gap-1 text-[11px]"
            style={{ color: "var(--brand-text)" }}
          >
            <AlertTriangle className="size-3" />
            {sec
              ? t("ui.InspectionPreview.sinResponder", "{{n}} sin responder", {
                  n: sec.items.filter((x) => x.required !== false).length,
                })
              : t("ui.InspectionPreview.listo", "Todo listo para cerrar")}
          </p>
          <div className="flex gap-2">
            {actual > 0 && (
              <button
                className="rounded-lg border px-3 py-2 text-[13px] font-semibold"
                style={{ borderColor: "var(--line-2)" }}
                type="button"
                onClick={() => setPaso(actual - 1)}
              >
                <ChevronLeft className="mr-1 inline size-3.5" />
                {t("ui.InspectionPreview.atras", "Atrás")}
              </button>
            )}
            <button
              className="flex-1 rounded-lg px-3 py-2 text-[13px] font-bold"
              style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
              type="button"
              onClick={() => setPaso(Math.min(actual + 1, total - 1))}
            >
              {sec
                ? t("ui.InspectionPreview.siguiente", "Siguiente")
                : t("ui.InspectionPreview.completar", "Completar parada")}
              {sec && <ChevronRight className="ml-1 inline size-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <p
        className="text-center text-[11px]"
        style={{ color: "var(--ink-faint)" }}
      >
        {t(
          "ui.InspectionPreview.nota",
          "Sólo para verlo: nada de lo que toques aquí se guarda.",
        )}
      </p>
    </div>
  );
}
