import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MoveHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  guardAssignmentService,
  cuantos,
  type CorrerCicloResultado,
} from "@/lib/api/guardAssignmentService";
import { soloFecha, soloFechaCivil, soloHora } from "@/lib/horaDeLaEmpresa";
import { FIELD_CLS_LG } from "@/pages/admin/clientes/components/_shared/tab-kit";

/**
 * CORRER EL CICLO de una asignación rotativa en el horario REAL.
 *
 * Incidente 2026-10-11 (B.A.S., CASA SINOHYDRO, 22-8): el ciclo de un
 * vigilante quedó un día adelantado tras importar el horario. Se corrigió en el
 * Planificador, que es un borrador, y nunca se publicó. Esto lo hace donde se
 * debe: en el servidor (`POST guard-assignment/:id/shift-cycle`), primero en
 * seco (`dryRun`) para enseñar en palabras cómo queda, y sólo al confirmar de
 * verdad.
 */
export default function CorrerCicloModal({
  open,
  onClose,
  onDone,
  assignmentId,
  nombre,
}: {
  open: boolean;
  onClose: () => void;
  /** Tras aplicar: recargar el horario. */
  onDone: () => void;
  assignmentId: string;
  nombre: string;
}) {
  const { t } = useTranslation();
  const [dias, setDias] = useState(1);
  const [vista, setVista] = useState<{
    dias: number;
    r: CorrerCicloResultado;
  } | null>(null);
  const [pensando, setPensando] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDias(1);
    setVista(null);
  }, [open]);

  const error = (e: any) =>
    toast.error(
      e?.data?.message ||
        e?.message ||
        t("ui.CorrerCiclo.noSePudo", "No se pudo correr el ciclo"),
    );

  const probar = async (n: number) => {
    const d = Math.trunc(n);

    if (!d) return;
    setDias(d);
    setVista(null);
    setPensando(true);
    try {
      const r = await guardAssignmentService.shiftCycle(assignmentId, d, true);

      setVista({ dias: d, r });
    } catch (e) {
      error(e);
    } finally {
      setPensando(false);
    }
  };

  const aplicar = async () => {
    if (!vista) return;
    setAplicando(true);
    try {
      const r = await guardAssignmentService.shiftCycle(
        assignmentId,
        vista.dias,
        false,
      );

      toast.success(
        t("ui.CorrerCiclo.hecho", {
          defaultValue:
            "Ciclo de {{nombre}} corrido. {{creados}} turnos nuevos, {{quitados}} retirados de hoy.",
          nombre,
          creados: cuantos(r?.created),
          quitados: cuantos(r?.removedToday),
        }),
      );
      onDone();
    } catch (e) {
      error(e);
    } finally {
      setAplicando(false);
    }
  };

  /** Un día civil (`YYYY-MM-DD`) o un instante, como fecha larga. */
  const fecha = (v: string, conDiaDeSemana = false) => {
    const o: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "long",
      year: undefined,
      ...(conDiaDeSemana ? { weekday: "long" } : {}),
    };

    return /T\d/.test(v) ? soloFecha(v, o) : soloFechaCivil(v, o);
  };

  const frase = (r: CorrerCicloResultado) => {
    const b = r.nextRestBlocks?.[0];
    const vuelve = r.nextWorkStart
      ? /T\d/.test(r.nextWorkStart)
        ? t("ui.CorrerCiclo.vuelveElALas", {
            defaultValue: "vuelve el {{dia}} a las {{hora}}",
            dia: fecha(r.nextWorkStart, true),
            hora: soloHora(r.nextWorkStart),
          })
        : t("ui.CorrerCiclo.vuelveEl", {
            defaultValue: "vuelve el {{dia}}",
            dia: fecha(r.nextWorkStart, true),
          })
      : "";

    if (b)
      return vuelve
        ? t("ui.CorrerCiclo.descansaraYVuelve", {
            defaultValue:
              "{{nombre}} descansará del {{desde}} al {{hasta}} y {{vuelve}}.",
            nombre,
            desde: fecha(b.from),
            hasta: fecha(b.to),
            vuelve,
          })
        : t("ui.CorrerCiclo.descansara", {
            defaultValue: "{{nombre}} descansará del {{desde}} al {{hasta}}.",
            nombre,
            desde: fecha(b.from),
            hasta: fecha(b.to),
          });

    return vuelve
      ? t("ui.CorrerCiclo.sinDescansoVuelve", {
          defaultValue: "{{nombre}} no tiene descansos cerca; {{vuelve}}.",
          nombre,
          vuelve,
        })
      : t("ui.CorrerCiclo.sinDescanso", {
          defaultValue: "{{nombre}} no tiene descansos en los próximos días.",
          nombre,
        });
  };

  const ocupado = pensando || aplicando;

  return (
    <Modal
      description={t("ui.CorrerCiclo.descripcion", {
        defaultValue:
          "Mueve toda la rotación de {{nombre}} en el horario real: un número positivo la retrasa, uno negativo la adelanta. Primero se enseña cómo queda; nada cambia hasta que confirmes.",
        nombre,
      })}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button
            disabled={!vista || ocupado}
            variant="brand"
            onClick={aplicar}
          >
            {aplicando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoveHorizontal className="h-4 w-4" />
            )}
            {t("ui.CorrerCiclo.aplicar", "Aplicar")}
          </Button>
        </div>
      }
      icon={<MoveHorizontal className="h-5 w-5" />}
      open={open}
      size="md"
      title={t("ui.CorrerCiclo.titulo", {
        defaultValue: "Correr el ciclo de {{nombre}}",
        nombre,
      })}
      onOpenChange={(o) => !o && onClose()}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={ocupado}
            variant="outline"
            onClick={() => probar(-1)}
          >
            {t("ui.CorrerCiclo.unDiaAntes", "−1 día (antes)")}
          </Button>
          <Button
            disabled={ocupado}
            variant="outline"
            onClick={() => probar(1)}
          >
            {t("ui.CorrerCiclo.unDiaDespues", "+1 día (después)")}
          </Button>
          <div className="flex items-center gap-2">
            <input
              aria-label={t("ui.CorrerCiclo.dias", "Días")}
              className={`${FIELD_CLS_LG} w-24`}
              max={60}
              min={-60}
              step={1}
              type="number"
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void probar(dias);
              }}
            />
            <Button
              disabled={ocupado || !Math.trunc(dias)}
              variant="outline"
              onClick={() => probar(dias)}
            >
              {pensando && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("ui.CorrerCiclo.verComoQueda", "Ver cómo queda")}
            </Button>
          </div>
        </div>

        {vista && (
          <div className="rounded-xl border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-100">
            <p className="font-semibold">{frase(vista.r)}</p>
            {(vista.r.nextRestBlocks?.length ?? 0) > 1 && (
              <p className="mt-1">
                {t("ui.CorrerCiclo.despues", "Después:")}{" "}
                {vista.r.nextRestBlocks
                  .slice(1)
                  .map((b) => `${fecha(b.from)} – ${fecha(b.to)}`)
                  .join(" · ")}
              </p>
            )}
            <p className="mt-1 text-xs opacity-80">
              {t("ui.CorrerCiclo.resumen", {
                defaultValue:
                  "{{n}} días · fase {{antes}} → {{despues}} · {{creados}} turnos nuevos, {{quitados}} retirados de hoy.",
                n: vista.dias > 0 ? `+${vista.dias}` : String(vista.dias),
                antes: vista.r.platoonOffsetBefore,
                despues: vista.r.platoonOffsetAfter,
                creados: cuantos(vista.r.created),
                quitados: cuantos(vista.r.removedToday),
              })}
            </p>
            <p className="mt-2 font-medium">
              {t("ui.CorrerCiclo.aplicarPregunta", "¿Aplicar?")}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
