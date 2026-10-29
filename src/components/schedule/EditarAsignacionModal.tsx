import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ApiService } from "@/services/api/apiService";
import {
  FIELD_CLS_LG,
  LabeledField,
} from "@/pages/admin/clientes/components/_shared/tab-kit";

import type { EstacionParaSacafranco } from "./AgregarSacafrancoModal";
import SecuenciaPropiaSelect from "./SecuenciaPropiaSelect";

/** La asignación tal como la manda el overview (sólo lo que aquí se toca). */
export interface AsignacionCruda {
  id: string;
  stationId: string;
  startDate?: string | null;
  endDate?: string | null;
  rotationStyleId?: string | null;
  isRelief?: boolean;
  coveredStationIds?: string[] | null;
  coveredStationDays?: Record<string, number> | null;
}

const ymd = (v: unknown) => (v ? String(v).slice(0, 10) : "");

/**
 * EDITAR UNA ASIGNACIÓN SIN SALIR DE LA HOJA: desde cuándo, hasta cuándo, su
 * ciclo propio, cuándo cae su próximo libre (rephase) y, en un sacafranco, qué
 * estaciones cubre y cuántos días seguidos en cada una. Es el mismo PUT de la
 * ficha; al guardar el servidor regenera sus turnos y la hoja se relee.
 */
export default function EditarAsignacionModal({
  open,
  onClose,
  onSaved,
  tenantId,
  asignacion,
  nombre,
  estaciones,
  semanal = false,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenantId: string;
  asignacion: AsignacionCruda;
  nombre: string;
  estaciones: EstacionParaSacafranco[];
  /** Weekly style: its days off are weekdays, there is no franco to move. */
  semanal?: boolean;
}) {
  const { t } = useTranslation();
  const relevo = !!asignacion.isRelief;
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [ciclo, setCiclo] = useState("");
  const [proximoLibre, setProximoLibre] = useState("");
  const [cubre, setCubre] = useState<Set<string>>(new Set());
  const [cadencia, setCadencia] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDesde(ymd(asignacion.startDate));
    setHasta(ymd(asignacion.endDate));
    setCiclo(
      asignacion.rotationStyleId ? String(asignacion.rotationStyleId) : "",
    );
    setProximoLibre("");
    setCubre(new Set((asignacion.coveredStationIds || []).map(String)));
    const c: Record<string, string> = {};

    for (const [k, v] of Object.entries(asignacion.coveredStationDays || {}))
      c[String(k)] = String(v);
    setCadencia(c);
  }, [open, asignacion]);

  const grupos = useMemo(() => {
    const m = new Map<string, EstacionParaSacafranco[]>();

    for (const e of estaciones) {
      const k = [e.cliente, e.sede].filter(Boolean).join(" › ") || "—";

      m.set(k, [...(m.get(k) || []), e]);
    }

    return [...m.entries()];
  }, [estaciones]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const data: any = {};

      if (desde && desde !== ymd(asignacion.startDate)) data.startDate = desde;
      if (hasta !== ymd(asignacion.endDate)) data.endDate = hasta || null;
      if (
        ciclo !==
        (asignacion.rotationStyleId ? String(asignacion.rotationStyleId) : "")
      )
        data.rotationStyleId = ciclo || null;
      if (relevo) {
        const ids = estaciones.filter((e) => cubre.has(e.id)).map((e) => e.id);
        const antes = (asignacion.coveredStationIds || []).map(String);

        if (ids.join() !== antes.join()) data.coveredStationIds = ids;
        const dias: Record<string, number> = {};

        for (const id of ids) {
          const n = Number(cadencia[id]);

          if (Number.isFinite(n) && n > 0) dias[id] = Math.floor(n);
        }
        const antesDias = asignacion.coveredStationDays || {};

        if (JSON.stringify(dias) !== JSON.stringify(antesDias))
          data.coveredStationDays = Object.keys(dias).length ? dias : null;
      }
      if (Object.keys(data).length)
        await ApiService.put(
          `/tenant/${tenantId}/guard-assignment/${asignacion.id}`,
          { data },
        );
      if (proximoLibre)
        await ApiService.post(
          `/tenant/${tenantId}/guard-assignment/${asignacion.id}/rephase`,
          { data: { restStartDate: proximoLibre } },
        );
      if (!Object.keys(data).length && !proximoLibre) {
        toast.message(
          t("ui.EditarAsignacion.sinCambios", "No cambiaste nada."),
        );
        onClose();

        return;
      }
      toast.success(
        t("ui.EditarAsignacion.hecho", "Guardado; se regeneran sus turnos."),
      );
      onSaved();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      description={
        relevo
          ? t(
              "ui.EditarAsignacion.descSf",
              "Sacafranco: cuándo entra, su ciclo y qué estaciones cubre.",
            )
          : t(
              "ui.EditarAsignacion.descFijo",
              "Cuándo entra, hasta cuándo, su ciclo y cuándo cae su próximo libre.",
            )
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button disabled={guardando} variant="brand" onClick={guardar}>
            <Pencil className="mr-1.5 h-4 w-4" />
            {t("common.save", "Guardar")}
          </Button>
        </div>
      }
      icon={<Pencil className="h-5 w-5" />}
      open={open}
      size="lg"
      title={`${t("ui.EditarAsignacion.titulo", "Editar")} · ${nombre}`}
      onOpenChange={(o) => !o && onClose()}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField label={t("ui.EditarAsignacion.desde", "Desde")}>
            <input
              className={FIELD_CLS_LG}
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </LabeledField>
          <LabeledField
            label={t("ui.EditarAsignacion.hasta", "Hasta (vacío = indefinida)")}
          >
            <input
              className={FIELD_CLS_LG}
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </LabeledField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField
            label={
              relevo
                ? t("ui.Sacafranco.ciclo", "Cuántos días está y cuántos libra")
                : t(
                    "ui.AsignacionEditModal.secuenciaDeEsteVigilante",
                    "Secuencia de este vigilante",
                  )
            }
          >
            <SecuenciaPropiaSelect
              etiquetaPorDefecto={
                relevo
                  ? t(
                      "ui.Sacafranco.siempreDisponible",
                      "El ciclo de su estación base (si no tiene, siempre disponible)",
                    )
                  : undefined
              }
              tenantId={tenantId}
              value={ciclo}
              onChange={setCiclo}
            />
          </LabeledField>
          {!semanal && (
          <LabeledField
            label={t(
              "ui.EditarAsignacion.proximoLibre",
              "Su próximo libre empieza el…",
            )}
          >
            <input
              className={FIELD_CLS_LG}
              type="date"
              value={proximoLibre}
              onChange={(e) => setProximoLibre(e.target.value)}
            />
            <p
              className="mt-1 text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {t(
                "ui.EditarAsignacion.proximoLibreAyuda",
                "Corre el ciclo para que el bloque de libres caiga ahí. Déjalo vacío para no tocarlo.",
              )}
            </p>
          </LabeledField>
          )}
        </div>
        {relevo && (
          <LabeledField
            label={t("ui.Sacafranco.queCubre", "Qué estaciones cubre")}
          >
            <div
              className="max-h-56 space-y-2 overflow-y-auto rounded-xl border p-2"
              style={{ borderColor: "var(--hairline)" }}
            >
              {grupos.map(([titulo, lista]) => (
                <div key={titulo}>
                  <div
                    className="mb-1 text-[11px] font-semibold"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {titulo}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {lista.map((e) => {
                      const on = cubre.has(e.id);

                      return (
                        <span
                          key={e.id}
                          className="inline-flex items-center gap-1"
                        >
                          <button
                            className="cg-focus rounded-full border px-2.5 py-1 text-xs font-semibold"
                            style={
                              on
                                ? {
                                    background: "var(--brand)",
                                    color: "var(--brand-ink)",
                                    borderColor: "var(--brand)",
                                  }
                                : {
                                    background: "var(--glass)",
                                    color: "var(--ink)",
                                    borderColor: "var(--hairline)",
                                  }
                            }
                            type="button"
                            onClick={() =>
                              setCubre((c) => {
                                const n = new Set(c);

                                if (n.has(e.id)) n.delete(e.id);
                                else n.add(e.id);

                                return n;
                              })
                            }
                          >
                            {e.nombre}
                          </button>
                          {on && (
                            <input
                              className="cg-input cg-focus h-7 w-12 px-1 text-center text-xs"
                              min={1}
                              placeholder="días"
                              title={t(
                                "ui.EditarAsignacion.diasSeguidos",
                                "Días seguidos en esta estación antes de pasar a la siguiente (vacío = la cadencia la decide el Planificador)",
                              )}
                              type="number"
                              value={cadencia[e.id] || ""}
                              onChange={(ev) =>
                                setCadencia((c) => ({
                                  ...c,
                                  [e.id]: ev.target.value,
                                }))
                              }
                            />
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p
              className="mt-1 text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {t(
                "ui.EditarAsignacion.cadenciaAyuda",
                "Con números en dos o más estaciones (3 y 1, 2 y 2…) rota por ellas en ese orden; sin números, el Planificador lo coloca donde falte.",
              )}
            </p>
          </LabeledField>
        )}
      </div>
    </Modal>
  );
}
