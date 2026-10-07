import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ApiService } from "@/services/api/apiService";
import { localToday } from "@/lib/utils";
import {
  FIELD_CLS_LG,
  LabeledField,
} from "@/pages/admin/clientes/components/_shared/tab-kit";

import BuscadorDeVigilante, {
  useVigilantesDisponibles,
} from "./BuscadorDeVigilante";
import SecuenciaPropiaSelect from "./SecuenciaPropiaSelect";

export interface EstacionParaSacafranco {
  id: string;
  nombre: string;
  sede?: string;
  cliente?: string;
}

/**
 * AGREGAR UN SACAFRANCO desde el Planificador: la persona, qué estaciones
 * cubre, desde cuándo, su ciclo (cuántos días seguidos está disponible y
 * cuántos libra) y en qué día del ciclo entra. No tiene plaza: cubre los
 * huecos que dejan los fijos de esas estaciones; el Planificador lo coloca.
 */
export default function AgregarSacafrancoModal({
  open,
  onClose,
  onSaved,
  tenantId,
  estaciones,
  preseleccion,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenantId: string;
  estaciones: EstacionParaSacafranco[];
  /** Ids marcados al abrir (los puestos del cliente desde el que se pulsó). */
  preseleccion?: string[];
}) {
  const { t } = useTranslation();
  const { disponibles, cargando } = useVigilantesDisponibles(tenantId, open);
  const [guardId, setGuardId] = useState("");
  const [cubre, setCubre] = useState<Set<string>>(new Set());
  const [desde, setDesde] = useState(() => localToday());
  const [ciclo, setCiclo] = useState("");
  const [k, setK] = useState(0);
  const [estilos, setEstilos] = useState<any[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGuardId("");
    setCubre(
      new Set(
        preseleccion?.length ? preseleccion : estaciones.map((e) => e.id),
      ),
    );
    setDesde(localToday());
    setCiclo("");
    setK(0);
    ApiService.get(`/tenant/${tenantId}/rotation-styles`)
      .then((r: any) => setEstilos(r?.rows || r?.data?.rows || []))
      .catch(() => setEstilos([]));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const grupos = useMemo(() => {
    const m = new Map<string, EstacionParaSacafranco[]>();

    for (const e of estaciones) {
      const k2 = [e.cliente, e.sede].filter(Boolean).join(" › ") || "—";

      m.set(k2, [...(m.get(k2) || []), e]);
    }

    return [...m.entries()];
  }, [estaciones]);

  const diasDelCiclo = useMemo(() => {
    const s = estilos.find((x) => String(x.id) === ciclo);

    if (!s) return [];
    const out: { k: number; label: string }[] = [];
    const trabajo = (s.dayShifts || 0) + (s.nightShifts || 0);
    let i = 0;

    for (let j = 0; j < trabajo; j++, i++)
      out.push({
        k: i,
        label: `${t("ui.Sacafranco.disponible", "Disponible")} ${j + 1} de ${trabajo}`,
      });
    for (let j = 0; j < (s.restDays || 0); j++, i++)
      out.push({
        k: i,
        label: `${t("ui.ShiftAssignModal.libre", "Libre")} ${j + 1} de ${s.restDays}`,
      });

    return out;
  }, [estilos, ciclo, t]);

  const guardar = async () => {
    if (!guardId) {
      toast.error(
        t("ui.ShiftAssignModal.seleccionarVigilante", "Elige al vigilante"),
      );

      return;
    }
    const ids = estaciones.filter((e) => cubre.has(e.id)).map((e) => e.id);

    if (!ids.length) {
      toast.error(
        t(
          "ui.Sacafranco.eligeEstaciones",
          "Marca al menos una estación que cubra.",
        ),
      );

      return;
    }
    setGuardando(true);
    try {
      await ApiService.post(`/tenant/${tenantId}/guard-assignment`, {
        data: {
          guardId,
          stationId: ids[0],
          positionId: null,
          isRelief: true,
          coveredStationIds: ids,
          rotationStyleId: ciclo || null,
          startDate: desde,
          cycleStartIndex: k,
        },
      });
      toast.success(t("ui.Sacafranco.hecho", "Sacafranco agregado."));
      onSaved();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      description={t(
        "ui.Sacafranco.descripcion",
        "No tiene plaza: cubre los libres de los fijos de las estaciones que marques. El Planificador le coloca los días.",
      )}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button
            disabled={guardando || !guardId}
            variant="brand"
            onClick={guardar}
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            {t("ui.Sacafranco.agregar", "Agregar sacafranco")}
          </Button>
        </div>
      }
      icon={<UserPlus className="h-5 w-5" />}
      open={open}
      size="lg"
      title={t("ui.Sacafranco.titulo", "Agregar sacafranco")}
      onOpenChange={(o) => !o && onClose()}
    >
      <div className="space-y-4">
        <LabeledField label={t("comun.vigilante", "Vigilante")}>
          <BuscadorDeVigilante
            cargando={cargando}
            opciones={disponibles}
            value={guardId}
            onChange={setGuardId}
          />
        </LabeledField>
        <LabeledField
          label={t("ui.Sacafranco.queCubre", "Qué estaciones cubre")}
        >
          <div
            className="max-h-48 space-y-2 overflow-y-auto rounded-xl border p-2"
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
                      <button
                        key={e.id}
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
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </LabeledField>
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField label={t("ui.Sacafranco.desde", "Desde")}>
            <input
              className={FIELD_CLS_LG}
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </LabeledField>
          <LabeledField
            label={t(
              "ui.Sacafranco.ciclo",
              "Cuántos días está y cuántos libra",
            )}
          >
            <SecuenciaPropiaSelect
              etiquetaPorDefecto={t(
                "ui.Sacafranco.siempreDisponible",
                "Siempre disponible (libra lo que el Planificador decida)",
              )}
              tenantId={tenantId}
              value={ciclo}
              onChange={setCiclo}
            />
          </LabeledField>
        </div>
        {diasDelCiclo.length > 1 && (
          <LabeledField
            label={t(
              "ui.ShiftAssignModal.enQueDiaDelCicloEntra",
              "¿En qué día de su ciclo entra ese día?",
            )}
          >
            <select
              className={FIELD_CLS_LG}
              value={k}
              onChange={(e) => setK(Number(e.target.value))}
            >
              {diasDelCiclo.map((o) => (
                <option key={o.k} value={o.k}>
                  {o.label}
                </option>
              ))}
            </select>
          </LabeledField>
        )}
      </div>
    </Modal>
  );
}
