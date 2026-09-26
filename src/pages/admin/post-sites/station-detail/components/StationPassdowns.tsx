/**
 * Pestaña «Pases de turno» de la estación.
 *
 * El pase de turno es parte del registro del PUESTO, no una tarea: quién
 * entregó a quién, a qué hora, si el saliente seguía allí cuando llegó el
 * relevo, cómo marcó la entrada el que llegó, las novedades y las consignas.
 * Aquí se lee de un vistazo, el más reciente arriba; la ficha completa es la
 * misma que abre la página de Pases de turno.
 */
import type { Station } from "@/types";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ClipboardSignature, ImageOff, Repeat } from "lucide-react";

import PassdownDetailModal from "@/pages/admin/passdown/PassdownDetailModal";
import {
  EstadoDelPase,
  PrioridadBadge,
  SalienteEstabaBadge,
  consignasDelPase,
  fmtPase,
  horaDeAceptacion,
  horaDeEntrega,
  imagenDelPase,
  metodoDeEntrada,
} from "@/pages/admin/passdown/paseDeTurno";
import {
  EmptyState,
  Section,
  SkeletonCards,
  SmartImage,
  StatusBadge,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import passdownService, { type Passdown } from "@/lib/api/passdownService";

type Props = { station: Station; stationId: string; postSiteId: string };

/** Cuántos se enseñan aquí; el histórico entero está en la página del menú. */
const LIMITE = 50;

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="cg-eyebrow mb-0.5">{label}</div>
      <div className="text-sm" style={{ color: "var(--ink)" }}>
        {children}
      </div>
    </div>
  );
}

export default function StationPassdowns({ station, stationId }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Passdown[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (!stationId) return;
    let vivo = true;

    setLoading(true);
    setError(null);
    passdownService
      .list({ stationId, limit: LIMITE })
      .then((r) => {
        if (!vivo) return;
        setRows(r.rows || []);
        setCount(r.count || 0);
      })
      .catch((e: any) => {
        if (!vivo) return;
        setError(
          e?.message ||
            t(
              "passdown.loadError",
              "No se pudieron cargar los pases de turno",
            ),
        );
      })
      .finally(() => vivo && setLoading(false));

    return () => {
      vivo = false;
    };
  }, [stationId]);

  const nombre =
    (station as any)?.stationName || (station as any)?.name || "";
  const verTodos = `/passdowns?stationId=${encodeURIComponent(stationId)}${
    nombre ? `&station=${encodeURIComponent(nombre)}` : ""
  }`;

  return (
    <Section
      action={
        count > rows.length ? (
          <Button asChild size="sm" variant="outline">
            <Link to={verTodos}>
              {t("passdown.station.viewAll", "Ver todos ({{n}})", {
                n: count,
              })}
              <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        ) : undefined
      }
      icon={<Repeat />}
      title={t("station.details.passdowns", "Pases de turno")}
    >
      {loading ? (
        <SkeletonCards count={3} />
      ) : error ? (
        <EmptyState
          description={error}
          icon={<ClipboardSignature />}
          title={t("passdown.loadError", "No se pudieron cargar los pases de turno")}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          description={t(
            "passdown.station.emptyHint",
            "Cuando un vigilante entregue este puesto a su relevo, el pase aparecerá aquí con sus novedades y consignas.",
          )}
          icon={<ClipboardSignature />}
          title={t(
            "passdown.station.empty",
            "Este puesto todavía no tiene pases de turno",
          )}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((p) => {
            const consignas = consignasDelPase(p.instructions);
            const metodo = metodoDeEntrada(t, p.incomingPunchMethod);
            const fotos = (p.passdownImages || [])
              .map(imagenDelPase)
              .filter(Boolean) as string[];

            return (
              <article key={p.id} className="glass-flat min-w-0 space-y-3 p-4">
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold">
                      {p.outgoingGuardName || "—"}
                      <span className="mx-1.5" style={{ color: "var(--ink-faint)" }}>
                        →
                      </span>
                      {p.receivedByName || "—"}
                    </div>
                    {p.shiftLabel && (
                      <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                        {p.shiftLabel}
                      </div>
                    )}
                  </div>
                  <EstadoDelPase passdown={p} t={t} />
                </header>

                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
                  <Dato label={t("passdown.col.delivered", "Entregado")}>
                    <span className="tabular-nums">
                      {fmtPase(horaDeEntrega(p))}
                    </span>
                  </Dato>
                  <Dato label={t("passdown.col.accepted", "Aceptado")}>
                    <span className="tabular-nums">
                      {horaDeAceptacion(t, p)}
                    </span>
                  </Dato>
                  <Dato
                    label={t(
                      "passdown.outgoingPresent.label",
                      "¿Estaba el saliente?",
                    )}
                  >
                    <SalienteEstabaBadge passdown={p} t={t} />
                  </Dato>
                  <Dato label={t("passdown.col.entry", "Entrada del relevo")}>
                    {metodo || "—"}
                  </Dato>
                </div>

                {p.reliefMissingReportedAt && (
                  <p className="text-xs" style={{ color: "var(--bad-text)" }}>
                    {t(
                      "passdown.reliefMissingAt",
                      "El saliente avisó que su relevo no llegó: {{when}}",
                      { when: fmtPase(p.reliefMissingReportedAt) },
                    )}
                  </p>
                )}

                <p
                  className="glass-sunken whitespace-pre-wrap break-words p-3 text-sm"
                  style={{ color: "var(--ink)" }}
                >
                  {p.notes?.trim() ||
                    t("passdown.noNotes", "Sin novedades registradas.")}
                </p>

                {consignas.length > 0 ? (
                  <ul className="space-y-1.5">
                    {consignas.map((c) => (
                      <li
                        key={c.key}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <input
                          readOnly
                          aria-label={
                            c.done
                              ? t("passdown.done", "Hecha")
                              : t("comun.pendiente", "Pendiente")
                          }
                          checked={c.done}
                          className="h-4 w-4 shrink-0"
                          tabIndex={-1}
                          type="checkbox"
                        />
                        <span
                          className="min-w-0 flex-1 break-words"
                          style={
                            c.done
                              ? {
                                  color: "var(--ink-soft)",
                                  textDecoration: "line-through",
                                }
                              : undefined
                          }
                        >
                          {c.text}
                        </span>
                        <PrioridadBadge priority={c.priority} t={t} />
                      </li>
                    ))}
                  </ul>
                ) : (p.instructionCount ?? 0) > 0 ? (
                  // Pase antiguo: sus consignas son tareas y sólo vienen en
                  // la ficha completa.
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {t("ui.StationPassdowns.consignasEnDetalle", {
                      defaultValue: "{{count}} consignas: ábrelo para verlas.",
                      count: p.instructionCount,
                    })}
                  </p>
                ) : null}

                {fotos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {fotos.map((src, i) => (
                      <a
                        key={i}
                        className="glass-flat block h-16 w-16 overflow-hidden"
                        href={src}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <SmartImage
                          alt={t("passdown.imageAlt", "Imagen del pase {{n}}", {
                            n: i + 1,
                          })}
                          className="h-full w-full"
                          fallback={
                            <span
                              className="grid h-full w-full place-items-center [&_svg]:size-5"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              <ImageOff />
                            </span>
                          }
                          fit="cover"
                          src={src}
                        />
                      </a>
                    ))}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDetailId(p.id);
                      setDetailOpen(true);
                    }}
                  >
                    {t("passdown.viewDetail", "Ver detalle")}
                  </Button>
                </div>
              </article>
            );
          })}
          {count > rows.length && (
            <StatusBadge dot={false} tone="neutral">
              {t("passdown.station.showing", "Mostrando {{n}} de {{total}}", {
                n: rows.length,
                total: count,
              })}
            </StatusBadge>
          )}
        </div>
      )}

      <PassdownDetailModal
        open={detailOpen}
        passdownId={detailId}
        onOpenChange={setDetailOpen}
      />
    </Section>
  );
}
