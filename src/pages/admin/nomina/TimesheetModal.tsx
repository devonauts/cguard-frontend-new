import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Modal,
  Field,
  EmptyState,
  TabNav,
  IconTile,
  StatusBadge as ToneBadge,
  InfoNote,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import GoogleMapEmbed from "@/components/GoogleMap/GoogleMapEmbed";
import { useFileUrl } from "@/lib/fileUrl";
import ChipRostro from "@/components/rostro/ChipRostro";
import attendanceService, {
  type AttendanceRecord,
  type TimesheetEvent,
} from "@/lib/api/attendanceService";
import {
  StatusBadge,
  PayrollBadge,
  PAYROLL_FLOW_META,
  PAYROLL_FLOW_NEXT,
  fmtDateTime,
  fmtTime,
  fmtHours,
  fmtDescanso,
  horasDeLaFila,
} from "./shared";
import {
  ImageOff,
  LogIn,
  LogOut,
  Plus,
  Trash2,
  History,
  Pencil,
  FileText,
  Palmtree,
  AlertOctagon,
  ShieldCheck,
} from "lucide-react";
import { getTenantTimezone } from "@/utils/tenantLocation";
import { desdeInputFechaHora } from "@/lib/horaDeLaEmpresa";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA TARJETA DE TIEMPO DE UN DÍA
 *
 * Vivía en un cajón lateral de 28 rem: media ficha quedaba fuera de la pantalla
 * y revisar un turno era desplazarse por un tubo. Es la pieza sobre la que se
 * decide lo que se paga, así que se mira CENTRADA y ancha, con todo a la vista.
 *
 * Tres pestañas, porque son tres preguntas distintas:
 *   · Detalle  — qué registró el reloj (y dónde).
 *   · Corregir — qué hay que arreglar a mano, con su motivo.
 *   · Bitácora — quién lo tocó antes que tú.
 *
 * Y un día SIN fichaje —vacaciones, permiso, falta— no es una tarjeta a medias:
 * es otra cosa, y se ve como otra cosa (ver `FichaDeAusencia`).
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Pestana = "detalle" | "corregir" | "bitacora";

/** Convierte un instante a lo que espera un `<input type="datetime-local">`. */
function aLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const tz = getTenantTimezone();
    const p = new Intl.DateTimeFormat("sv-SE", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
    return p.replace(" ", "T").slice(0, 16);
  } catch {
    return "";
  }
}

/**
 * Y de vuelta. El campo del navegador da hora DE PARED sin zona; hay que
 * anclarla a la de la empresa o una corrección hecha desde otra zona movería el
 * fichaje varias horas sin que nadie lo note.
 */
function deLocalInput(v: string): string | null {
  return desdeInputFechaHora(v) || null;
}

/* ── UN DÍA SIN FICHAJE ─────────────────────────────────────────────────────
   Una falta y unas vacaciones se leen de un vistazo o no sirven: rojo lo que
   hay que resolver, azul lo que ya está resuelto. No llevan fichajes, ni horas,
   ni mapas — enseñarlos vacíos hace pensar que falta un dato. */
function FichaDeAusencia({ r }: { r: AttendanceRecord }) {
  const { t } = useTranslation();
  const esFalta = r.status === "absent";
  const tono = esFalta ? "bad" : "info";
  const titulo = esFalta
    ? t("ui.TimesheetModal.falta", "Falta")
    : r.status === "permission"
      ? t("ui.TimesheetModal.permiso", "Permiso")
      : t("ui.TimesheetModal.vacaciones", "Vacaciones");
  const icono = esFalta ? (
    <AlertOctagon />
  ) : r.status === "permission" ? (
    <ShieldCheck />
  ) : (
    <Palmtree />
  );
  const fondo = `color-mix(in oklab, var(--${tono}) 10%, transparent)`;
  const borde = `color-mix(in oklab, var(--${tono}) 32%, transparent)`;

  return (
    <div className="space-y-4">
      <div
        className="flex items-start gap-3 rounded-xl p-4"
        style={{ background: fondo, border: `1px solid ${borde}` }}
      >
        <span
          className="[&_svg]:size-6"
          style={{ color: `var(--${tono}-text)` }}
        >
          {icono}
        </span>
        <div className="min-w-0">
          <p
            className="text-base font-semibold"
            style={{ color: `var(--${tono}-text)` }}
          >
            {titulo}
          </p>
          <p className="mt-0.5 text-sm" style={{ color: "var(--ink-soft)" }}>
            {r.guardName?.fullName || t("ui.NominaRecords.trabajador", "Trabajador")} —{" "}
            {fmtDateTime(r.scheduledStart)}
          </p>
        </div>
      </div>

      <InfoNote tone={esFalta ? "bad" : "info"}>
        {esFalta
          ? t(
              "ui.TimesheetModal.esteDiaQuedoRegistradoComoFalta",
              "Este día quedó registrado como FALTA: el puesto estaba programado y la persona no se presentó. El turno se conserva marcado como ausencia (es la constancia de que estaba programada) y el hueco queda abierto en Cobertura para que alguien lo tape. Si se justifica después, cámbialo a Permiso desde el Horario.",
            )
          : t(
              "ui.TimesheetModal.ausenciaAprobada",
              "Ausencia aprobada. El turno de ese día queda marcado como ausencia y el hueco se abre en Cobertura para asignar un relevo. No cuenta como falta ni descuenta en desempeño.",
            )}
      </InfoNote>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field
          label={t("ui.NominaRecords.trabajador", "Trabajador")}
          value={r.guardName?.fullName || "—"} />
        <Field
          label={t("ui.TimesheetModal.dia", "Día")}
          value={
            <span className="tabular-nums">
              {fmtDateTime(r.scheduledStart)}
            </span>
          }
        />
        <Field
          label={t("ui.TimesheetModal.quePaso", "Qué pasó")}
          value={<StatusBadge status={r.status} />} />
      </div>

      {r.observations && (
        <div>
          <p className="cg-eyebrow">{t("ui.TimesheetModal.nota", "Nota")}</p>
          <p className="glass-sunken mt-1 whitespace-pre-wrap p-3 text-sm">
            {r.observations}
          </p>
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
        {t(
          "ui.TimesheetModal.unDiaSinFichajeNoSeAprueba",
          "Un día sin fichaje no se aprueba ni se paga desde aquí: se informa. Sale en los reportes y en las exportaciones junto al resto del periodo.",
        )}
      </p>
    </div>
  );
}

/* ── LA BITÁCORA ────────────────────────────────────────────────────────────
   Mismo lenguaje visual que el historial de un cliente: un carril con un nodo
   por movimiento. Aquí lo que importa es QUIÉN, así que el autor va en negrita
   y la hora a la derecha. */
function Bitacora({ id }: { id: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<TimesheetEvent[] | null>(null);
  useEffect(() => {
    let vivo = true;
    attendanceService
      .history(id)
      .then((r) => {
        if (vivo) setRows(r.rows || []);
      })
      .catch(() => {
        if (vivo) setRows([]);
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  if (rows === null)
    return (
      <p
        className="py-8 text-center text-sm"
        style={{ color: "var(--ink-soft)" }}
      >
        {t("ui.NominaExceptions.cargando", "Cargando…")}
      </p>
    );
  if (!rows.length) {
    return (
      <EmptyState
        icon={<History />}
        title={t("ui.TimesheetModal.sinMovimientos", "Sin movimientos")}
        description={t(
          "ui.TimesheetModal.nadieHaCorregidoNiMovido",
          "Nadie ha corregido ni movido esta tarjeta.",
        )}
        className="py-10"
      />
    );
  }

  const ETIQUETA: Record<string, string> = {
    create: t("ui.TimesheetModal.seCreoElRegistro", "Se creó el registro"),
    update: t("ui.TimesheetModal.seModifico", "Se modificó"),
    delete: t("ui.TimesheetModal.seElimino", "Se eliminó"),
  };

  return (
    <ol
      className="relative space-y-4 border-l pl-5"
      style={{ borderColor: "var(--hairline)" }}
    >
      {rows.map((e) => (
        <li key={e.id} className="relative">
          <span
            className="absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full"
            style={{
              background:
                e.kind === "correction_rejected"
                  ? "var(--bad)"
                  : e.kind.startsWith("correction")
                    ? "var(--info)"
                    : "var(--brand)",
              boxShadow: "0 0 0 4px var(--canvas)",
            }}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-medium">
              {e.detail ||
                ETIQUETA[String(e.action)] ||
                t("ui.TimesheetModal.movimiento", "Movimiento")}
            </p>
            <span
              className="text-xs tabular-nums"
              style={{ color: "var(--ink-faint)" }}
            >
              {fmtDateTime(e.at)}
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {e.actor || t("ui.TimesheetModal.sistema", "Sistema")}
          </p>
          {e.data && Object.keys(e.data).length > 0 && (
            <pre
              className="glass-sunken mt-1.5 overflow-x-auto p-2 text-[11px] leading-relaxed"
              style={{ color: "var(--ink-soft)" }}
            >
              {JSON.stringify(e.data, null, 1)}
            </pre>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function TimesheetModal({
  record,
  onClose,
  onChanged,
  puedeEditar,
  puedeAprobar,
}: {
  record: AttendanceRecord | null;
  onClose: () => void;
  onChanged: () => void;
  puedeEditar: boolean;
  puedeAprobar: boolean;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Pestana>("detalle");
  const [busy, setBusy] = useState(false);
  const selfieUrl = useFileUrl(record?.punchInPhoto ?? null);

  // Borrador de la corrección. Se reinicia con cada ficha que se abre.
  const [entrada, setEntrada] = useState("");
  const [salida, setSalida] = useState("");
  const [descansos, setDescansos] = useState<
    { kind: string; start: string; end: string }[]
  >([]);
  /* ¿Se tocaron los descansos en el borrador? Si no, la corrección NO los
     manda: un fichaje con minutos de descanso anotados pero sin horario
     (`breakMinutes` sin `breaks`) se quedaba sin descanso al corregir sólo la
     salida —se mandaba `breaks: []`— y las horas netas subían solas. */
  const [descansosTocados, setDescansosTocados] = useState(false);
  const editarDescansos: typeof setDescansos = (v) => {
    setDescansosTocados(true);
    setDescansos(v);
  };
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    setTab("detalle");
    setMotivo("");
    if (!record) return;
    setEntrada(aLocalInput(record.punchInTime));
    setSalida(aLocalInput(record.punchOutTime));
    setObs(record.observations || "");
    setDescansosTocados(false);
    setDescansos(
      (record.breaks || []).map((b) => ({
        kind: b.kind || "break",
        start: aLocalInput(b.start),
        end: aLocalInput(b.end || null),
      })),
    );
  }, [record]);

  const esAusencia =
    !!record &&
    ["vacation", "permission", "absent"].includes(String(record.status));
  /* Supervisión y oficina fichan en otro reloj, pero van por el MISMO
     timesheet: se corrigen y se aprueban igual. Lo único que cambia es la
     aritmética de las horas, y de eso se encarga el servidor. */
  const esOtroReloj =
    record?.role === "supervisor" || record?.role === "administrative";

  const minutosDescanso = useMemo(
    () =>
      descansos.reduce((n, d) => {
        if (!d.start || !d.end) return n;
        const m = Math.round(
          (new Date(d.end).getTime() - new Date(d.start).getTime()) / 60000,
        );
        return n + (m > 0 ? m : 0);
      }, 0),
    [descansos],
  );

  const guardar = useCallback(async () => {
    if (!record) return;
    if (!motivo.trim()) {
      toast.error(
        t("ui.TimesheetModal.escribeElMotivoDeLaCorreccion", "Escribe el motivo de la corrección"),
      );
      return;
    }
    setBusy(true);
    try {
      await attendanceService.editTimes(record.id, {
        punchInTime: deLocalInput(entrada),
        punchOutTime: deLocalInput(salida),
        ...(descansosTocados
          ? {
              breaks: descansos
                .filter((d) => d.start)
                .map((d) => ({
                  kind: d.kind,
                  start: deLocalInput(d.start)!,
                  end: deLocalInput(d.end),
                })),
            }
          : {}),
        observations: obs || null,
        reason: motivo.trim(),
      });
      toast.success(
        t("ui.TimesheetModal.corregidaVuelveAEsperaDeRevision", "Corregida — vuelve a espera de revisión"),
      );
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("ui.TimesheetModal.noSePudoGuardarLaCorreccion", "No se pudo guardar la corrección"),
      );
    } finally {
      setBusy(false);
    }
  }, [
    record,
    entrada,
    salida,
    descansos,
    descansosTocados,
    obs,
    motivo,
    onChanged,
    onClose,
    t,
  ]);

  const mover = useCallback(
    async (destino: string) => {
      if (!record) return;
      setBusy(true);
      try {
        await attendanceService.setStatus(record.id, destino);
        toast.success(
          t("ui.NominaRecords.ahoraEstado", {
            estado: PAYROLL_FLOW_META[destino]?.label || destino,
            defaultValue: "Ahora: {{estado}}",
          }),
        );
        onChanged();
      } catch (e: any) {
        toast.error(
          e?.message ||
            t("ui.NominaRecords.noSePudoCambiarElEstado", "No se pudo cambiar el estado"),
        );
      } finally {
        setBusy(false);
      }
    },
    [record, onChanged, t],
  );

  if (!record) return null;

  /* Las tres cifras salen del SERVIDOR con la regla de la nómina: en el
     puesto, descanso y netas (lo que se paga). Así esta hoja dice lo mismo que
     las tarjetas de nómina, el evento y Gusto. */
  const desglose = horasDeLaFila(record);
  const siguientes =
    PAYROLL_FLOW_NEXT[String(record.payrollStatus || "pending_review")] || [];

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="xl"
      icon={<FileText />}
      title={
        record.guardName?.fullName ||
        t("ui.NominaRecords.trabajador", "Trabajador")
      }
      description={
        esAusencia
          ? t("ui.TimesheetModal.diaSinFichaje", "Día sin fichaje")
          : `${record.stationName?.stationName || t("ui.TimesheetModal.sinPuesto", "Sin puesto")} · ${fmtDateTime(record.punchInTime || record.scheduledStart)}`
      }
      footer={
        esAusencia || !record.payrollStatus ? (
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t(
              "ui.TimesheetModal.unDiaSinFichajeSeInforma",
              "Un día sin fichaje se informa; no pasa por el ciclo de pago.",
            )}
          </p>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span
              className="flex items-center gap-2 text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              {t("ui.TimesheetModal.estadoLabel", "Estado:")}{" "}
              <PayrollBadge status={record.payrollStatus} />
            </span>
            {puedeAprobar ? (
              <div className="flex flex-wrap gap-2">
                {siguientes.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={s === "rejected" ? "outline" : "default"}
                    disabled={busy}
                    onClick={() => void mover(s)}
                  >
                    {PAYROLL_FLOW_META[s]?.label || s}
                  </Button>
                ))}
              </div>
            ) : (
              <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.TimesheetModal.noTienesPermisoParaMoverElEstado",
                  "No tienes permiso para mover el estado.",
                )}
              </span>
            )}
          </div>
        )
      }
    >
      {esAusencia ? (
        <FichaDeAusencia r={record} />
      ) : (
        <>
          <TabNav<Pestana>
            className="-mt-1 mb-4"
            value={tab}
            onChange={setTab}
            items={[
              {
                value: "detalle",
                label: t("ui.TimesheetModal.detalle", "Detalle"),
                icon: <FileText />,
              },
              ...(puedeEditar
                ? [
                    {
                      value: "corregir" as Pestana,
                      label: t("ui.TimesheetModal.corregir", "Corregir"),
                      icon: <Pencil />,
                    },
                  ]
                : []),
              {
                value: "bitacora",
                label: t("ui.TimesheetModal.bitacora", "Bitácora"),
                icon: <History />,
              },
            ]}
          />

          {tab === "detalle" && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[1fr_18rem]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge
                    status={record.status}
                    approval={record.approvalStatus}
                  />
                  <PayrollBadge status={record.payrollStatus} />
                  {record.punchInOutsideGeofence && (
                    <ToneBadge tone="bad">
                      {t("ui.TimesheetModal.fueraDeGeocerca", "Fuera de geocerca")}
                    </ToneBadge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field
                    label={t("comun.puesto", "Puesto")}
                    value={record.stationName?.stationName || "—"}
                  />
                  <Field
                    label={t("comun.turno", "Turno")}
                    value={record.shiftSchedule || "—"} />
                  <Field
                    label={t("ui.NominaRecords.programado", "Programado")}
                    value={
                      <span className="tabular-nums">
                        {fmtTime(record.scheduledStart)} –{" "}
                        {fmtTime(record.scheduledEnd)}
                      </span>
                    }
                  />
                  <Field
                    label={t("ui.TimesheetModal.horasEnElPuesto", "Horas en el puesto")}
                    value={
                      <span className="tabular-nums">{fmtHours(desglose.enElPuesto)}</span>
                    }
                    numeric
                  />
                  <Field
                    label={t("ui.NominaRecords.entrada", "Entrada")}
                    value={
                      <span className="tabular-nums">
                        {fmtDateTime(record.punchInTime)}
                      </span>
                    }
                  />
                  <Field
                    label={t("ui.NominaRecords.salida", "Salida")}
                    value={
                      <span className="tabular-nums">
                        {fmtDateTime(record.punchOutTime)}
                      </span>
                    }
                  />
                  <Field
                    label={t("ui.TimesheetModal.descanso", "Descanso")}
                    value={
                      <span className="tabular-nums">
                        {fmtDescanso(desglose.descansoMinutos)}
                      </span>
                    }
                    numeric
                  />
                  {/* Lo que se paga: en el puesto menos descanso. En supervisión
                      y oficina el reloj ya lo descontó al cerrar; el servidor lo
                      sabe y no lo resta dos veces. */}
                  <Field
                    label={t("ui.TimesheetModal.netasSePagan", "Netas (se pagan)")}
                    value={
                      desglose.cubreElTurno ? (
                        <ToneBadge tone="warn">
                          {t("ui.NominaRecords.sinResolver", "Sin resolver")}
                        </ToneBadge>
                      ) : (
                        <span className="tabular-nums">
                          {fmtHours(desglose.netas)}
                        </span>
                      )
                    }
                    numeric
                  />
                  <Field
                    label={t("ui.TimesheetModal.tarde", "Tarde")}
                    value={
                      <span className="tabular-nums">
                        {record.lateMinutes || 0} min
                      </span>
                    }
                    numeric
                  />
                  <Field
                    label={t("ui.NominaTimecards.extra", "Extra")}
                    value={
                      <span className="tabular-nums">
                        {record.overtimeMinutes || 0} min
                      </span>
                    }
                    numeric
                  />
                  <Field
                    label={t("postSites.tabs.tours", "Rondas")}
                    value={
                      <span className="tabular-nums">
                        {record.numberOfPatrolsDuringShift ?? 0}
                      </span>
                    }
                    numeric
                  />
                  <Field
                    label={t("ui.NominaRecords.incidentes", "Incidentes")}
                    value={
                      <span className="tabular-nums">
                        {record.numberOfIncidentsDurindShift ?? 0}
                      </span>
                    }
                    numeric
                  />
                </div>

                {desglose.cubreElTurno && (
                  <InfoNote tone="warn">
                    {t(
                      "ui.TimesheetModal.descansoCubreElTurno",
                      "El descanso cubre todo el turno, así que no queda nada que pagar. No se paga ni se aprueba hasta corregir el descanso en «Corregir».",
                    )}
                  </InfoNote>
                )}

                {Array.isArray(record.breaks) && record.breaks.length > 0 && (
                  <div>
                    <p className="cg-eyebrow mb-1">
                      {t("ui.TimesheetModal.descansos", "Descansos")}
                    </p>
                    <div
                      className="glass-flat divide-y overflow-hidden"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      {record.breaks.map((b, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-3 py-2 text-xs"
                        >
                          <span style={{ color: "var(--ink-soft)" }}>
                            {b.kind === "lunch"
                              ? t("ui.TimesheetModal.almuerzo", "Almuerzo")
                              : t("ui.TimesheetModal.descanso", "Descanso")}
                          </span>
                          <span className="font-medium tabular-nums">
                            {fmtTime(b.start)} →{" "}
                            {b.end ? fmtTime(b.end) : t("ui.TimesheetModal.enCurso", "en curso")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {record.observations && (
                  <div>
                    <p className="cg-eyebrow">
                      {t("ui.TimesheetModal.observaciones", "Observaciones")}
                    </p>
                    <p className="glass-sunken mt-1 whitespace-pre-wrap p-3 text-sm">
                      {record.observations}
                    </p>
                  </div>
                )}

                {Array.isArray(record.sessions) &&
                  record.sessions.length > 0 && (
                    <div>
                      <p className="cg-eyebrow mb-1">
                        {t("ui.TimesheetModal.sesionesN", {
                          count: record.sessions.length,
                          defaultValue: "Sesiones ({{count}})",
                        })}
                      </p>
                      <div
                        className="glass-flat divide-y overflow-hidden"
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {record.sessions.map((s, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between px-3 py-2 text-xs"
                          >
                            <span style={{ color: "var(--ink-faint)" }}>
                              #{i + 1}
                            </span>
                            <span className="font-medium tabular-nums">
                              {fmtTime(s.in)} → {s.out ? fmtTime(s.out) : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Ubicación de cada marcación. Imagen estática por defecto: cada
                    mapa dinámico es una carga facturable y revisar nómina es abrir
                    fichas en cadena. El mapa de verdad sigue a un clic. */}
                {(record.punchInLatitude != null ||
                  record.punchOutLatitude != null) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {record.punchInLatitude != null &&
                      record.punchInLongitude != null && (
                        <div className="glass-flat overflow-hidden">
                          <div
                            className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold"
                            style={{ background: "var(--glass-sunken)" }}
                          >
                            <span className="flex items-center gap-1.5">
                              <LogIn
                                size={13}
                                style={{ color: "var(--ok-text)" }}
                              />{" "}
                              {t("ui.NominaRecords.entrada", "Entrada")}
                            </span>
                            <span
                              className="font-normal tabular-nums"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {fmtTime(record.punchInTime)}
                            </span>
                          </div>
                          <GoogleMapEmbed
                              area="timesheet"
                              lat={Number(record.punchInLatitude)}
                              lng={Number(record.punchInLongitude)}
                              zoom={16}
                              height="170px"
                              showGeofence={
                                !record.stationName?.geofencePolygon &&
                                !!record.stationName?.geofenceRadius
                              }
                              geofenceRadius={
                                record.stationName?.geofenceRadius || 100
                              }
                              polygon={
                                record.stationName?.geofencePolygon || undefined
                              }
                              markers={[
                                {
                                  id: "in",
                                  lat: Number(record.punchInLatitude),
                                  lng: Number(record.punchInLongitude),
                                  label: t("ui.NominaRecords.entrada", "Entrada"),
                                },
                              ]}
                            />
                          {record.punchInOutsideGeofence && (
                            <p
                              className="px-3 py-2 text-xs font-medium"
                              style={{
                                background:
                                  "color-mix(in oklab, var(--bad) 12%, transparent)",
                                color: "var(--bad-text)",
                              }}
                            >
                              {t("ui.TimesheetModal.fueraDeGeocercaDistancia", {
                                distancia: record.punchInDistanceM ?? "?",
                                defaultValue:
                                  "Fuera de geocerca · {{distancia}} m del puesto",
                              })}
                            </p>
                          )}
                        </div>
                      )}
                    {record.punchOutLatitude != null &&
                      record.punchOutLongitude != null && (
                        <div className="glass-flat overflow-hidden">
                          <div
                            className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold"
                            style={{ background: "var(--glass-sunken)" }}
                          >
                            <span className="flex items-center gap-1.5">
                              <LogOut
                                size={13}
                                style={{ color: "var(--warn-text)" }}
                              />{" "}
                              {t("ui.NominaRecords.salida", "Salida")}
                            </span>
                            <span
                              className="font-normal tabular-nums"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {fmtTime(record.punchOutTime)}
                            </span>
                          </div>
                          <GoogleMapEmbed
                              area="timesheet"
                              lat={Number(record.punchOutLatitude)}
                              lng={Number(record.punchOutLongitude)}
                              zoom={16}
                              height="170px"
                              showGeofence={
                                !record.stationName?.geofencePolygon &&
                                !!record.stationName?.geofenceRadius
                              }
                              geofenceRadius={
                                record.stationName?.geofenceRadius || 100
                              }
                              polygon={
                                record.stationName?.geofencePolygon || undefined
                              }
                              markers={[
                                {
                                  id: "out",
                                  lat: Number(record.punchOutLatitude),
                                  lng: Number(record.punchOutLongitude),
                                  label: t("ui.NominaRecords.salida", "Salida"),
                                },
                              ]}
                            />
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* Selfie del fichaje: la columna estrecha, para que no empuje los datos */}
              <div>
                <p className="cg-eyebrow mb-1">
                  {t("ui.TimesheetModal.selfieDeEntrada", "Selfie de entrada")}
                </p>
                {/* Reconocimiento facial: ¿la cara de la selfie es la suya? */}
                <ChipRostro
                  className="mb-2 inline-block"
                  puntuacion={record.rostroPuntuacion}
                  resultado={record.rostroResultado}
                />
                {selfieUrl ? (
                  <a
                    href={selfieUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={selfieUrl}
                      alt={t("ui.TimesheetModal.selfieDeEntrada", "Selfie de entrada")}
                      className="glass-flat w-full object-contain"
                    />
                    {record.punchInAddress && (
                      <p
                        className="mt-1.5 text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {record.punchInAddress}
                      </p>
                    )}
                  </a>
                ) : (
                  <EmptyState
                    icon={<ImageOff />}
                    title={t("ui.TimesheetModal.sinSelfie", "Sin selfie")}
                    className="py-8"
                  />
                )}
              </div>
            </div>
          )}

          {tab === "corregir" && (
            <div className="space-y-4">
              <InfoNote tone="warn">
                {t("ui.TimesheetModal.alGuardarLaTarjetaVuelveA", "Al guardar, la tarjeta vuelve a")}{" "}
                <b>{t("ui.TimesheetModal.esperaDeRevision", "espera de revisión")}</b>{" "}
                {t(
                  "ui.TimesheetModal.yLasHorasSeRecalculanSolas",
                  "y las horas se recalculan solas — no se escriben a mano. Queda registrado quién corrigió y por qué.",
                )}
                {esOtroReloj &&
                  " " +
                    t(
                      "ui.TimesheetModal.enSupervisionYOficinaLasHoras",
                      "En supervisión y oficina las horas se guardan ya netas de descansos, como al cerrar el turno.",
                    )}
              </InfoNote>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="cg-eyebrow mb-1 block">
                    {t("ui.NominaRecords.entrada", "Entrada")}
                  </span>
                  <input
                    type="datetime-local"
                    className="cg-input cg-focus w-full px-3 py-2 text-sm tabular-nums"
                    value={entrada}
                    onChange={(e) => setEntrada(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="cg-eyebrow mb-1 block">
                    {t("ui.NominaRecords.salida", "Salida")}
                  </span>
                  <input
                    type="datetime-local"
                    className="cg-input cg-focus w-full px-3 py-2 text-sm tabular-nums"
                    value={salida}
                    onChange={(e) => setSalida(e.target.value)}
                  />
                </label>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="cg-eyebrow">
                    {t("ui.TimesheetModal.descansosYAlmuerzo", "Descansos y almuerzo")}
                    {minutosDescanso ? ` · ${minutosDescanso} min` : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() =>
                      editarDescansos((p) => [
                        ...p,
                        { kind: "break", start: entrada, end: "" },
                      ])
                    }
                  >
                    <Plus size={14} /> {t("ui.TimesheetModal.agregar", "Agregar")}
                  </Button>
                </div>
                {descansos.length === 0 && (
                  <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                    {/* Minutos anotados sin horario (los pone el reloj o una
                        importación): se dicen y se conservan, no «sin
                        descansos». Sólo cambian si se agregan aquí. */}
                    {!descansosTocados && Number(record.breakMinutes) > 0
                      ? t("ui.TimesheetModal.descansoAnotadoSinHorario", {
                          min: Math.round(Number(record.breakMinutes)),
                          defaultValue:
                            "{{min}} min de descanso anotados, sin horario. Se conservan al guardar; si agregas descansos aquí, mandan los que agregues.",
                        })
                      : esOtroReloj
                      ? t(
                          "ui.TimesheetModal.sinDescansosRegistradosRecalcular",
                          "Sin descansos registrados. Se descuentan de las horas al recalcular.",
                        )
                      : t(
                          "ui.TimesheetModal.sinDescansosRegistradosNetas",
                          "Sin descansos registrados. Se descuentan de las horas netas, no de las horas en el puesto.",
                        )}
                  </p>
                )}
                <div className="space-y-2">
                  {descansos.map((d, i) => (
                    <div
                      key={i}
                      className="grid items-end gap-2"
                      style={{ gridTemplateColumns: "8rem 1fr 1fr auto" }}
                    >
                      <select
                        className="cg-input cg-focus px-2 py-2 text-sm"
                        value={d.kind}
                        onChange={(e) =>
                          editarDescansos((p) =>
                            p.map((x, j) =>
                              j === i ? { ...x, kind: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <option value="break">{t("ui.TimesheetModal.descanso", "Descanso")}</option>
                        <option value="lunch">{t("ui.TimesheetModal.almuerzo", "Almuerzo")}</option>
                      </select>
                      <input
                        type="datetime-local"
                        className="cg-input cg-focus px-2 py-2 text-sm tabular-nums"
                        value={d.start}
                        onChange={(e) =>
                          editarDescansos((p) =>
                            p.map((x, j) =>
                              j === i ? { ...x, start: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <input
                        type="datetime-local"
                        className="cg-input cg-focus px-2 py-2 text-sm tabular-nums"
                        value={d.end}
                        onChange={(e) =>
                          editarDescansos((p) =>
                            p.map((x, j) =>
                              j === i ? { ...x, end: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          editarDescansos((p) => p.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="cg-eyebrow mb-1 block">
                  {t("ui.TimesheetModal.observaciones", "Observaciones")}
                </span>
                <textarea
                  rows={2}
                  maxLength={500}
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="cg-eyebrow mb-1 block">
                  {t("ui.TimesheetModal.motivoDeLaCorreccionReq", "Motivo de la corrección *")}
                </span>
                <input
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                  value={motivo}
                  placeholder={t(
                    "ui.TimesheetModal.ejElRelojNoRegistroLaSalida",
                    "Ej.: el reloj no registró la salida; se confirmó con el supervisor",
                  )}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose} disabled={busy}>
                  {t("ui.TimesheetModal.cancelar", "Cancelar")}
                </Button>
                <Button
                  onClick={() => void guardar()}
                  disabled={busy || !motivo.trim()}
                >
                  {t("ui.TimesheetModal.guardarCorreccion", "Guardar corrección")}
                </Button>
              </div>
            </div>
          )}

          {tab === "bitacora" && <Bitacora id={record.id} />}
        </>
      )}
    </Modal>
  );
}
