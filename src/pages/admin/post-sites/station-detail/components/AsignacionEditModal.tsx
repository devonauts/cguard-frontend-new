import { cicloDe as leerCiclo, esSemanal } from "@/lib/secuenciaDeRotacion";
import { urlDePatrones } from "@/lib/patronesVigentes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  CalendarRange,
  Loader2,
  Moon,
  MoveHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import { ApiService } from "@/services/api/apiService";
import { Modal } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  FIELD_CLS_LG,
  LabeledField,
} from "@/pages/admin/clientes/components/_shared/tab-kit";
import SecuenciaPropiaSelect from "@/components/schedule/SecuenciaPropiaSelect";
import CorrerCicloModal from "@/components/schedule/CorrerCicloModal";
import { nombreDeTramo } from "@/components/schedule/tramos";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import {
  nextRestDates,
  rotationDseOf,
  shortRestLabel,
  weeklyRestWeekday,
  type RotationCycle,
} from "@/lib/utils";

interface PositionRow {
  id: string;
  type?: string;
  sortOrder?: number;
  startTime?: string | null;
  endTime?: string | null;
}
interface RotationStyleRow extends RotationCycle {
  id: string;
  name?: string;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EDITAR EL TURNO DE UN VIGILANTE YA ASIGNADO
 *
 * Sobre un vigilante que ya estaba en un puesto sólo se podía RELEVAR (cambiar
 * quién) o QUITAR. Todo lo demás —moverlo a la otra plaza, corregir la fecha de
 * inicio (que es lo que decide en qué día cae su descanso), darle otra
 * secuencia, ponerle una fecha de fin— obligaba a quitarlo y volverlo a dar de
 * alta. Y eso NO es lo mismo: la baja anula sus turnos futuros y el alta re-fasea
 * el puesto desde cero, así que una corrección de un dato acababa moviéndole el
 * descanso a él y a su compañero de plaza.
 *
 * Aquí se edita la MISMA asignación (PUT /guard-assignment/:id): conserva su
 * historial y sólo se recalcula lo que el cambio obliga a recalcular.
 * ════════════════════════════════════════════════════════════════════════════
 */
export default function AsignacionEditModal({
  open,
  onClose,
  onSaved,
  tenantId,
  stationId,
  assignmentId,
  stationRotationStyleId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenantId: string;
  stationId: string;
  assignmentId: string | null;
  stationRotationStyleId?: string | null;
}) {
  const { t } = useTranslation();
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [asignacion, setAsignacion] = useState<any | null>(null);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [estilos, setEstilos] = useState<RotationStyleRow[]>([]);
  const [ocupadas, setOcupadas] = useState<Set<string>>(new Set());

  const [positionId, setPositionId] = useState("");
  const [secuencia, setSecuencia] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [corriendo, setCorriendo] = useState(false);

  useEffect(() => {
    if (!open || !assignmentId) return;
    let vivo = true;

    setCargando(true);
    (async () => {
      try {
        const [aRes, pRes, rRes]: any[] = await Promise.all([
          ApiService.get(
            `/tenant/${tenantId}/guard-assignments?stationId=${encodeURIComponent(stationId)}&status=active&_=${Date.now()}`,
          ),
          ApiService.get(
            `/tenant/${tenantId}/station/${encodeURIComponent(stationId)}/positions`,
          ),
          ApiService.get(urlDePatrones(tenantId)),
        ]);

        if (!vivo) return;
        const filas = Array.isArray(aRes) ? aRes : (aRes?.rows ?? []);
        const mia =
          filas.find((a: any) => String(a.id) === String(assignmentId)) || null;

        setAsignacion(mia);
        setPositions(Array.isArray(pRes) ? pRes : (pRes?.rows ?? []));
        setEstilos(Array.isArray(rRes) ? rRes : (rRes?.rows ?? []));
        // Una plaza ocupada por OTRO no se puede elegir: dos titulares en la
        // misma plaza es cobertura que el detector cuenta y que no existe.
        setOcupadas(
          new Set(
            filas
              .filter(
                (a: any) =>
                  a.positionId &&
                  String(a.id) !== String(assignmentId) &&
                  (a.role || "holder") === "holder",
              )
              .map((a: any) => String(a.positionId)),
          ),
        );
        setPositionId(mia?.positionId ? String(mia.positionId) : "");
        setSecuencia(mia?.rotationStyleId ? String(mia.rotationStyleId) : "");
        setInicio(String(mia?.startDate || "").slice(0, 10));
        setFin(String(mia?.endDate || "").slice(0, 10));
      } catch (e: any) {
        toast.error(e?.message || t("ui.AsignacionEditModal.noSePudoCargarLaAsignacion", "No se pudo cargar la asignación"));
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [open, assignmentId, stationId]);

  const esRelevo =
    !!asignacion?.isRelief ||
    positions.find((p) => p.id === positionId)?.type === "sacafranco";

  /* Las plazas se llamaban «Vigilante 1/2» y nada más; en una estación partida
     en tramos eso no dice cuál es la de la mañana. Se enseñan las horas. */
  const opcionesPlaza = useMemo(() => {
    const hhmm = (v?: string | null) => String(v || "").slice(0, 5);
    const fijos = positions.filter((p) => (p.type || "fijo") !== "sacafranco");
    const sacas = positions.filter((p) => (p.type || "fijo") === "sacafranco");
    const variasVentanas =
      new Set(fijos.map((p) => `${hhmm(p.startTime)}|${hhmm(p.endTime)}`))
        .size > 1;

    return [
      ...fijos.map((p, i) => ({
        id: String(p.id),
        label: t("ui.AsignacionEditModal.vigilanteN", { defaultValue: "Vigilante {{n}}", n: i + 1 }),
        horas:
          hhmm(p.startTime) && hhmm(p.endTime)
            ? `${hhmm(p.startTime)}–${hhmm(p.endTime)}`
            : "",
        tramo:
          variasVentanas && hhmm(p.startTime)
            ? nombreDeTramo(hhmm(p.startTime))
            : "",
        ocupada: ocupadas.has(String(p.id)),
      })),
      ...sacas.map((p, i) => ({
        id: String(p.id),
        label:
          sacas.length > 1
            ? t("ui.AsignacionEditModal.sacafrancoN", { defaultValue: "Sacafranco {{n}}", n: i + 1 })
            : t("clients.assignGuards.roleSf", "Sacafranco"),
        horas: "",
        tramo: "",
        ocupada: ocupadas.has(String(p.id)),
      })),
    ];
  }, [positions, ocupadas, t]);

  /* Cómo se llaman los dos tramos del ciclo EN LA PLAZA ELEGIDA: el propio y el
     siguiente. En un puesto de 24 h el segundo es la noche; en 07:00–15:00 +
     15:00–23:00 es la tarde, y llamarla noche hacía irreconocible el ciclo. */
  const bloques = useMemo(() => {
    const hhmm = (v?: string | null) => String(v || "").slice(0, 5);
    const vistos = new Map<string, string>();

    for (const f of positions.filter(
      (p) => (p.type || "fijo") !== "sacafranco",
    )) {
      const ini = hhmm(f.startTime);
      const fn = hhmm(f.endTime);

      if (ini && fn) vistos.set(`${ini}|${fn}`, ini);
    }

    return Array.from(vistos.values()).sort();
  }, [positions]);
  const etiquetaPrimerBloque = useMemo(() => {
    if (bloques.length < 2) return t("ui.AsignacionEditModal.dia", "día");
    const p = positions.find((x) => String(x.id) === positionId);

    return nombreDeTramo(String(p?.startTime || bloques[0]).slice(0, 5));
  }, [bloques, positions, positionId]);
  const etiquetaSegundoBloque = useMemo(() => {
    if (bloques.length < 2) return t("ui.AsignacionEditModal.noche", "noche");
    const p = positions.find((x) => String(x.id) === positionId);
    const mio = String(p?.startTime || bloques[0]).slice(0, 5);
    const i = bloques.indexOf(mio);

    return nombreDeTramo(bloques[((i < 0 ? 0 : i) + 1) % bloques.length]);
  }, [bloques, positions, positionId]);

  const patronDeLaEstacion = useMemo(
    () =>
      estilos.find((s) => String(s.id) === String(stationRotationStyleId))
        ?.name || null,
    [estilos, stationRotationStyleId],
  );

  /* La vista previa mira el MISMO ciclo que va a generar el backend: el propio
     si se eligió uno, si no el de la estación. La fase es la fecha de inicio. */
  const vistaDescanso = useMemo(() => {
    if (esRelevo) return null;
    const estilo = estilos.find(
      (s) => String(s.id) === String(secuencia || stationRotationStyleId),
    );

    if (!estilo || !inicio) return null;
    const ciclo = leerCiclo(estilo).largo;

    if (ciclo <= 0) return null;
    const d = new Date(`${inicio}T12:00:00`);

    if (isNaN(d.getTime())) return null;
    const fase = ((rotationDseOf(d) % ciclo) + ciclo) % ciclo;

    /* Las REGLAS y el ANCLA, que es lo que faltaba: con descanso dominical el
       ciclo se corre un día en cada domingo, así que sin pasarlas la vista
       previa prometía francos que el cuadrante no iba a cumplir a partir del
       segundo. Ver `estadoDeRotacionCliente`. */
    const reglas = {
      alternatesDayNight: (estilo as any).alternatesDayNight,
      sundayDoubleRest: (estilo as any).sundayDoubleRest,
    };
    const ancla = rotationDseOf(d);

    return {
      weekday: weeklyRestWeekday(estilo, fase, reglas),
      dates: nextRestDates(
        estilo,
        fase,
        d,
        estilo.restDays >= 2 ? 2 : 1,
        45,
        reglas,
        ancla,
      ),
      startWeekday: d.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
        weekday: "long",
        day: "numeric",
        month: "short",
      }),
    };
  }, [estilos, secuencia, stationRotationStyleId, inicio, esRelevo]);

  const g = asignacion?.guard || asignacion?.user || {};
  const nombre =
    g.fullName ||
    `${g.firstName || ""} ${g.lastName || ""}`.trim() ||
    g.email ||
    t("ui.AsignacionEditModal.esteVigilante", "este vigilante");

  const guardar = async () => {
    if (!assignmentId) return;
    if (!inicio) {
      toast.error(t("ui.AsignacionEditModal.ponLaFechaDeInicioDelTurno", "Pon la fecha de inicio del turno"));

      return;
    }
    setGuardando(true);
    try {
      await ApiService.put(
        `/tenant/${tenantId}/guard-assignment/${encodeURIComponent(assignmentId)}`,
        {
          data: {
            positionId: positionId || null,
            // Vacío = «la de la estación», que es una elección explícita y no un
            // «no dije nada»: el backend distingue las dos.
            rotationStyleId: secuencia || null,
            startDate: inicio,
            endDate: fin || null,
          },
        },
      );
      toast.success(
        t("ui.AsignacionEditModal.turnoActualizado", "Turno actualizado — el cuadrante se rehizo con el cambio"),
      );
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.AsignacionEditModal.noSePudoGuardarElCambio", "No se pudo guardar el cambio"),
      );
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    if (!assignmentId) return;
    if (
      !(await confirmDialog({
        title: t("ui.AsignacionEditModal.quitarVigilante", "Quitar vigilante"),
        message: t("ui.AsignacionEditModal.quitarConfirm", {
          defaultValue:
            "¿Quitar a {{nombre}} de este puesto? Sus turnos futuros se anulan; los ya trabajados se conservan en el historial.",
          nombre,
        }),
        confirmText: t("station.guards.remove", "Quitar"),
        tone: "danger",
      }))
    )
      return;
    setGuardando(true);
    try {
      await ApiService.delete(
        `/tenant/${tenantId}/guard-assignment/${encodeURIComponent(assignmentId)}`,
      );
      toast.success(
        t("ui.AsignacionEditModal.vigilanteQuitado", "Vigilante quitado del puesto — su historial se conserva"),
      );
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t("ui.AsignacionEditModal.noSePudoQuitar", "No se pudo quitar"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      description={
        asignacion
          ? t("ui.AsignacionEditModal.rotacionDeNombre", { defaultValue: "Rotación de {{nombre}} en este puesto", nombre })
          : t("ui.AsignacionEditModal.rotacionDelVigilante", "Rotación del vigilante en este puesto")
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button
            disabled={guardando || cargando || !asignacion}
            onClick={guardar}
          >
            {guardando ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <Pencil size={14} />
            )}{" "}
            {t("comms.save", "Guardar cambios")}
          </Button>
        </>
      }
      icon={<Pencil className="h-5 w-5" />}
      open={open}
      size="md"
      title={t("ui.AsignacionEditModal.editarTurno", "Editar turno")}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      {cargando ? (
        <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader2 className="animate-spin" size={13} />{" "}
          {t("ui.AsignacionEditModal.cargandoLaAsignacion", "Cargando la asignación…")}
        </div>
      ) : !asignacion ? (
        <p className="py-6 text-sm" style={{ color: "var(--warn-text)" }}>
          {t(
            "ui.AsignacionEditModal.noVieneDeRotacion",
            "Este turno no viene de una rotación, así que no hay asignación que editar. Bórralo y vuelve a crearlo desde «Asignar vigilante».",
          )}
        </p>
      ) : (
        <div className="space-y-4">
          <LabeledField label={t("ui.AsignacionEditModal.puesto", "Puesto")}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {opcionesPlaza.map((p) => (
                <button
                  key={p.id}
                  className="cg-focus rounded-xl border px-3 py-2 text-left text-sm font-medium transition-all disabled:cursor-not-allowed"
                  disabled={p.ocupada}
                  style={
                    p.ocupada
                      ? {
                          borderColor: "var(--hairline)",
                          color: "var(--ink-faint)",
                          opacity: 0.5,
                        }
                      : positionId === p.id
                        ? {
                            borderColor: "var(--brand-line)",
                            background: "var(--brand-wash)",
                            color: "var(--brand-text)",
                          }
                        : {
                            borderColor: "var(--hairline)",
                            color: "var(--ink-soft)",
                          }
                  }
                  title={
                    p.ocupada
                      ? t("ui.AsignacionEditModal.puestoOcupadoPorOtro", "Puesto ocupado por otro vigilante")
                      : p.horas || undefined
                  }
                  type="button"
                  onClick={() => setPositionId(p.id)}
                >
                  <span className={p.ocupada ? "line-through" : undefined}>
                    {p.label}
                  </span>
                  {p.ocupada ? ` · ${t("ui.AsignacionEditModal.ocupado", "ocupado")}` : ""}
                  {p.horas && (
                    <span className="mt-0.5 block text-[10px] font-normal tabular-nums opacity-80">
                      {p.horas}
                      {p.tramo ? ` · ${p.tramo}` : ""}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </LabeledField>

          {!esRelevo && (
            <LabeledField label={t("ui.AsignacionEditModal.secuenciaDeEsteVigilante", "Secuencia de este vigilante")}>
              <SecuenciaPropiaSelect
                etiquetaPrimerBloque={etiquetaPrimerBloque}
                etiquetaSegundoBloque={etiquetaSegundoBloque}
                patronDeLaEstacion={patronDeLaEstacion}
                tenantId={tenantId}
                value={secuencia}
                onChange={setSecuencia}
              />
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                {bloques.length > 1
                  ? t("ui.AsignacionEditModal.dejaloConEjemplo", {
                      defaultValue:
                        "Déjalo en «la de la estación» salvo que este vigilante tenga un ciclo distinto al de sus compañeros (por ejemplo 2 de {{primero}} y 3 de {{segundo}}).",
                      primero: etiquetaPrimerBloque,
                      segundo: etiquetaSegundoBloque,
                    })
                  : t(
                      "ui.AsignacionEditModal.dejaloEnLaDeLaEstacion",
                      "Déjalo en «la de la estación» salvo que este vigilante tenga un ciclo distinto al de sus compañeros.",
                    )}
              </p>
            </LabeledField>
          )}

          <LabeledField label={t("ui.AsignacionEditModal.fechaDeInicioDelTurno", "Fecha de inicio del turno")}>
            <input
              className={FIELD_CLS_LG}
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
            {vistaDescanso && (
              <div
                className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2"
                style={{
                  borderColor: "var(--brand-line)",
                  background: "var(--brand-wash)",
                }}
              >
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarRange className="brand-text" size={13} />{" "}
                  {t("ui.AsignacionEditModal.empieza", "Empieza")}{" "}
                  <span className="font-medium capitalize text-foreground">
                    {vistaDescanso.startWeekday}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-xs">
                  <Moon className="brand-text" size={13} />
                  {vistaDescanso.weekday ? (
                    <span className="text-muted-foreground">
                      {t("ui.AsignacionEditModal.descansa", "Descansa:")}{" "}
                      <span className="font-semibold capitalize brand-text">
                        {vistaDescanso.weekday}
                      </span>
                    </span>
                  ) : (
                    <span className="capitalize text-muted-foreground">
                      {t("ui.AsignacionEditModal.descanso", "Descanso:")}{" "}
                      {vistaDescanso.dates.map(shortRestLabel).join(" · ")}
                    </span>
                  )}
                </span>
              </div>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              {t(
                "ui.AsignacionEditModal.fechaInicioDia0",
                "La fecha de inicio es el día 0 del ciclo — muévela para correr el día de descanso.",
              )}
            </p>
          </LabeledField>

          <LabeledField label={t("ui.AsignacionEditModal.hastaOpcional", "Hasta (opcional)")}>
            <input
              className={FIELD_CLS_LG}
              min={inicio}
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
            />
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              {t(
                "ui.AsignacionEditModal.vacioIndefinida",
                "Vacío = asignación indefinida; con fecha, una cobertura temporal.",
              )}
            </p>
          </LabeledField>

          <div
            className="flex flex-wrap items-center justify-end gap-2 border-t pt-3"
            style={{ borderColor: "var(--hairline)" }}
          >
            {!esRelevo &&
              (secuencia || stationRotationStyleId) &&
              // Weekly styles have no cycle to run (the server answers 409).
              !esSemanal(
                estilos.find(
                  (s) =>
                    String(s.id) === String(secuencia || stationRotationStyleId),
                ),
              ) && (
              <Button
                className="mr-auto"
                disabled={guardando}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setCorriendo(true)}
              >
                <MoveHorizontal size={13} />{" "}
                {t("ui.CorrerCiclo.boton", "Correr ciclo…")}
              </Button>
            )}
            <button
              className="cg-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              disabled={guardando}
              style={{
                background: "color-mix(in oklab, var(--bad) 12%, transparent)",
                borderColor: "color-mix(in oklab, var(--bad) 28%, transparent)",
                color: "var(--bad-text)",
              }}
              type="button"
              onClick={() => void quitar()}
            >
              <Trash2 size={12} /> {t("ui.AsignacionEditModal.quitarDelPuesto", "Quitar del puesto")}
            </button>
          </div>
        </div>
      )}
      {corriendo && asignacion && (
        <CorrerCicloModal
          open
          assignmentId={String(asignacion.id)}
          nombre={nombre}
          onClose={() => setCorriendo(false)}
          onDone={() => {
            setCorriendo(false);
            onSaved();
          }}
        />
      )}
    </Modal>
  );
}
