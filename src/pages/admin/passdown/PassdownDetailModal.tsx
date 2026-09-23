/**
 * La ficha de un pase de turno. La abren la página de Pases de turno y la
 * pestaña «Pases de turno» de la estación: una sola ficha para que las dos
 * cuenten lo mismo.
 *
 * Pide el detalle ella misma y SÓLO cuando está abierta: un modal cerrado se
 * construye igual (ver la memoria «JSX se evalúa antes de tiempo»), y pedir el
 * detalle al montar sería una petición por cada página que la incluye.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ClipboardSignature, ImageOff, ListChecks } from "lucide-react";

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
} from "./paseDeTurno";

import {
  Field,
  Modal,
  SkeletonCards,
  SmartImage,
  StatusBadge,
} from "@/components/kit";
import passdownService, {
  type PassdownDetail,
} from "@/lib/api/passdownService";

export default function PassdownDetailModal({
  passdownId,
  open,
  onOpenChange,
}: {
  passdownId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<PassdownDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !passdownId) return;
    let vivo = true;

    setDetail(null);
    setLoading(true);
    passdownService
      .get(passdownId)
      .then((r) => vivo && setDetail(r.passdown))
      .catch((e: any) => {
        if (!vivo) return;
        toast.error(
          e?.message ||
            t("passdown.loadDetailError", "No se pudo cargar el pase de turno"),
        );
        onOpenChange(false);
      })
      .finally(() => vivo && setLoading(false));

    return () => {
      vivo = false;
    };
  }, [open, passdownId]);

  const consignas = detail ? consignasDelPase(detail.instructions) : [];
  const metodo = detail ? metodoDeEntrada(t, detail.incomingPunchMethod) : null;
  const esSupervisor = detail?.channel === "supervisor";

  return (
    <Modal
      description={detail?.shiftLabel || undefined}
      icon={<ClipboardSignature />}
      open={open}
      size="lg"
      title={t("ui.PassdownsPage.paseDeTurno", "Pase de turno")}
      onOpenChange={onOpenChange}
    >
      {loading || !detail ? (
        <SkeletonCards count={2} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:grid-cols-3">
            <Field
              label={t("comun.puesto", "Puesto")}
              value={
                detail.stationName ||
                (esSupervisor
                  ? t("passdown.supervision", "Supervisión")
                  : "—")
              }
            />
            <Field label={t("comun.turno", "Turno")} value={detail.shiftLabel} />
            <div className="min-w-0">
              <div className="cg-eyebrow mb-1">
                {t("comun.estado", "Estado")}
              </div>
              <EstadoDelPase passdown={detail} t={t} />
            </div>
            <Field
              label={t("passdown.deliveredBy", "Entregó")}
              value={detail.outgoingGuardName}
            />
            <Field
              label={t("passdown.col.delivered", "Entregado")}
              value={fmtPase(horaDeEntrega(detail))}
            />
            <Field
              label={t("passdown.acceptedBy", "Recibió")}
              value={detail.receivedByName}
            />
            <Field
              label={t("passdown.col.accepted", "Aceptado")}
              value={horaDeAceptacion(t, detail)}
            />
            <div className="min-w-0">
              <div className="cg-eyebrow mb-1">
                {t("passdown.outgoingPresent.label", "¿Estaba el saliente?")}
              </div>
              <SalienteEstabaBadge passdown={detail} t={t} />
            </div>
            <Field
              label={t("passdown.col.entry", "Entrada del relevo")}
              value={metodo}
            />
            {detail.reliefMissingReportedAt && (
              <Field
                label={t("passdown.reliefMissing", "Relevo no llegó")}
                value={fmtPase(detail.reliefMissingReportedAt)}
              />
            )}
          </div>

          <div>
            <div className="cg-eyebrow mb-1">
              {t("passdown.notes", "Novedades")}
            </div>
            <p
              className="glass-sunken whitespace-pre-wrap break-words p-3 text-sm"
              style={{ color: "var(--ink)" }}
            >
              {detail.notes?.trim() ||
                t("passdown.noNotes", "Sin novedades registradas.")}
            </p>
          </div>

          {detail.passdownImages && detail.passdownImages.length > 0 && (
            <div>
              <div className="cg-eyebrow mb-2">
                {t("ui.Passdowns.imagenes", "Imágenes")}
              </div>
              <div className="flex flex-wrap gap-3">
                {detail.passdownImages.map((img, i) => {
                  const src = imagenDelPase(img);

                  return src ? (
                    <a
                      key={i}
                      className="glass-flat block h-24 w-24 overflow-hidden"
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
                            className="grid h-full w-full place-items-center [&_svg]:size-6"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            <ImageOff />
                          </span>
                        }
                        fit="cover"
                        src={src}
                      />
                    </a>
                  ) : (
                    <div
                      key={i}
                      className="glass-sunken flex h-24 w-24 items-center justify-center [&_svg]:size-6"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      <ImageOff />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div
              className="mb-2 flex items-center gap-2 [&_svg]:size-4"
              style={{ color: "var(--brand-text)" }}
            >
              <ListChecks />
              <span className="cg-eyebrow">
                {t("passdown.instructionsCount", "Consignas ({{n}})", {
                  n: consignas.length,
                })}
              </span>
            </div>
            {consignas.length > 0 ? (
              <div className="space-y-2">
                {consignas.map((c) => (
                  <div
                    key={c.key}
                    className="glass-flat flex items-start justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <div className="break-words text-sm font-medium">
                        {c.text}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <PrioridadBadge priority={c.priority} t={t} />
                        {c.note && (
                          <span
                            className="text-xs"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {c.note}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {c.done ? (
                        <StatusBadge tone="ok">
                          {t("passdown.done", "Hecha")}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">
                          {t("comun.pendiente", "Pendiente")}
                        </StatusBadge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "ui.PassdownsPage.sinConsignasRegistradas",
                  "Sin consignas registradas.",
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
