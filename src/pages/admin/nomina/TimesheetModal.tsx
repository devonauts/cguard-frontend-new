import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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

import {
  StatusBadge,
  PayrollBadge,
  PAYROLL_FLOW_META,
  PAYROLL_FLOW_NEXT,
  fmtDateTime,
  fmtTime,
  fmtHours,
} from "./shared";

import {
  Modal,
  Field,
  EmptyState,
  TabNav,
  StatusBadge as ToneBadge,
  InfoNote,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import GoogleMapEmbed from "@/components/GoogleMap/GoogleMapEmbed";
import StaticMapImage from "@/components/maps/StaticMapImage";
import { useFileUrl } from "@/lib/fileUrl";
import attendanceService, {
  type AttendanceRecord,
  type TimesheetEvent,
} from "@/lib/api/attendanceService";
import { getTenantTimezone } from "@/utils/tenantLocation";

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
  if (!v) return null;
  const tz = getTenantTimezone();
  const [f, h] = v.split("T");

  if (!f || !h) return null;
  // Se busca el desfase real de ESA fecha (respeta horario de verano).
  const tentativa = new Date(`${f}T${h}:00Z`);
  const enTz = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(tentativa);
  const leido = new Date(`${enTz.replace(" ", "T")}:00Z`).getTime();
  const desfase = leido - tentativa.getTime();

  return new Date(tentativa.getTime() - desfase).toISOString();
}

/* ── UN DÍA SIN FICHAJE ─────────────────────────────────────────────────────
   Una falta y unas vacaciones se leen de un vistazo o no sirven: rojo lo que
   hay que resolver, azul lo que ya está resuelto. No llevan fichajes, ni horas,
   ni mapas — enseñarlos vacíos hace pensar que falta un dato. */
function FichaDeAusencia({ r }: { r: AttendanceRecord }) {
  const esFalta = r.status === "absent";
  const tono = esFalta ? "bad" : "info";
  const titulo = esFalta
    ? "Falta"
    : r.status === "permission"
      ? "Permiso"
      : "Vacaciones";
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
            {r.guardName?.fullName || "Trabajador"} —{" "}
            {fmtDateTime(r.scheduledStart)}
          </p>
        </div>
      </div>

      <InfoNote tone={esFalta ? "bad" : "info"}>
        {esFalta
          ? "Este día quedó registrado como FALTA: el puesto estaba programado y la persona no se presentó. El turno se conserva marcado como ausencia (es la constancia de que estaba programada) y el hueco queda abierto en Cobertura para que alguien lo tape. Si se justifica después, cámbialo a Permiso desde el Horario."
          : "Ausencia aprobada. El turno de ese día queda marcado como ausencia y el hueco se abre en Cobertura para asignar un relevo. No cuenta como falta ni descuenta en desempeño."}
      </InfoNote>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Trabajador" value={r.guardName?.fullName || "—"} />
        <Field
          label="Día"
          value={
            <span className="tabular-nums">
              {fmtDateTime(r.scheduledStart)}
            </span>
          }
        />
        <Field label="Qué pasó" value={<StatusBadge status={r.status} />} />
      </div>

      {r.observations && (
        <div>
          <p className="cg-eyebrow">Nota</p>
          <p className="glass-sunken mt-1 whitespace-pre-wrap p-3 text-sm">
            {r.observations}
          </p>
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
        Un día sin fichaje no se aprueba ni se paga desde aquí: se informa. Sale
        en los reportes y en las exportaciones junto al resto del periodo.
      </p>
    </div>
  );
}

/* ── LA BITÁCORA ────────────────────────────────────────────────────────────
   Mismo lenguaje visual que el historial de un cliente: un carril con un nodo
   por movimiento. Aquí lo que importa es QUIÉN, así que el autor va en negrita
   y la hora a la derecha. */
function Bitacora({ id }: { id: string }) {
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
        Cargando…
      </p>
    );
  if (!rows.length) {
    return (
      <EmptyState
        className="py-10"
        description="Nadie ha corregido ni movido esta tarjeta."
        icon={<History />}
        title="Sin movimientos"
      />
    );
  }

  const ETIQUETA: Record<string, string> = {
    create: "Se creó el registro",
    update: "Se modificó",
    delete: "Se eliminó",
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
              {e.detail || ETIQUETA[String(e.action)] || "Movimiento"}
            </p>
            <span
              className="text-xs tabular-nums"
              style={{ color: "var(--ink-faint)" }}
            >
              {fmtDateTime(e.at)}
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {e.actor || "Sistema"}
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
  const [tab, setTab] = useState<Pestana>("detalle");
  const [busy, setBusy] = useState(false);
  const selfieUrl = useFileUrl(record?.punchInPhoto ?? null);

  // Borrador de la corrección. Se reinicia con cada ficha que se abre.
  const [entrada, setEntrada] = useState("");
  const [salida, setSalida] = useState("");
  const [descansos, setDescansos] = useState<
    { kind: string; start: string; end: string }[]
  >([]);
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");

  useEffect(() => {
    setTab("detalle");
    setMotivo("");
    if (!record) return;
    setEntrada(aLocalInput(record.punchInTime));
    setSalida(aLocalInput(record.punchOutTime));
    setObs(record.observations || "");
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
      toast.error("Escribe el motivo de la corrección");

      return;
    }
    setBusy(true);
    try {
      await attendanceService.editTimes(record.id, {
        punchInTime: deLocalInput(entrada),
        punchOutTime: deLocalInput(salida),
        breaks: descansos
          .filter((d) => d.start)
          .map((d) => ({
            kind: d.kind,
            start: deLocalInput(d.start)!,
            end: deLocalInput(d.end),
          })),
        observations: obs || null,
        reason: motivo.trim(),
      });
      toast.success("Corregida — vuelve a espera de revisión");
      onChanged();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar la corrección");
    } finally {
      setBusy(false);
    }
  }, [record, entrada, salida, descansos, obs, motivo, onChanged, onClose]);

  const mover = useCallback(
    async (destino: string) => {
      if (!record) return;
      setBusy(true);
      try {
        await attendanceService.setStatus(record.id, destino);
        toast.success(`Ahora: ${PAYROLL_FLOW_META[destino]?.label || destino}`);
        onChanged();
      } catch (e: any) {
        toast.error(e?.message || "No se pudo cambiar el estado");
      } finally {
        setBusy(false);
      }
    },
    [record, onChanged],
  );

  if (!record) return null;

  const horas = record.hoursWorked == null ? null : Number(record.hoursWorked);
  const desc = Number(record.breakMinutes || 0);
  const siguientes =
    PAYROLL_FLOW_NEXT[String(record.payrollStatus || "pending_review")] || [];

  return (
    <Modal
      open
      description={
        esAusencia
          ? "Día sin fichaje"
          : `${record.stationName?.stationName || "Sin puesto"} · ${fmtDateTime(record.punchInTime || record.scheduledStart)}`
      }
      footer={
        esAusencia || !record.payrollStatus ? (
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            Un día sin fichaje se informa; no pasa por el ciclo de pago.
          </p>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span
              className="flex items-center gap-2 text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              Estado: <PayrollBadge status={record.payrollStatus} />
            </span>
            {puedeAprobar ? (
              <div className="flex flex-wrap gap-2">
                {siguientes.map((s) => (
                  <Button
                    key={s}
                    disabled={busy}
                    size="sm"
                    variant={s === "rejected" ? "outline" : "default"}
                    onClick={() => void mover(s)}
                  >
                    {PAYROLL_FLOW_META[s]?.label || s}
                  </Button>
                ))}
              </div>
            ) : (
              <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
                No tienes permiso para mover el estado.
              </span>
            )}
          </div>
        )
      }
      icon={<FileText />}
      size="xl"
      title={record.guardName?.fullName || "Trabajador"}
      onOpenChange={(o) => !o && onClose()}
    >
      {esAusencia ? (
        <FichaDeAusencia r={record} />
      ) : (
        <>
          <TabNav<Pestana>
            className="-mt-1 mb-4"
            items={[
              { value: "detalle", label: "Detalle", icon: <FileText /> },
              ...(puedeEditar
                ? [
                    {
                      value: "corregir" as Pestana,
                      label: "Corregir",
                      icon: <Pencil />,
                    },
                  ]
                : []),
              { value: "bitacora", label: "Bitácora", icon: <History /> },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === "detalle" && (
            <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge
                    approval={record.approvalStatus}
                    status={record.status}
                  />
                  <PayrollBadge status={record.payrollStatus} />
                  {record.punchInOutsideGeofence && (
                    <ToneBadge tone="bad">Fuera de geocerca</ToneBadge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field
                    label="Puesto"
                    value={record.stationName?.stationName || "—"}
                  />
                  <Field label="Turno" value={record.shiftSchedule || "—"} />
                  <Field
                    label="Programado"
                    value={
                      <span className="tabular-nums">
                        {fmtTime(record.scheduledStart)} –{" "}
                        {fmtTime(record.scheduledEnd)}
                      </span>
                    }
                  />
                  <Field
                    numeric
                    label={esOtroReloj ? "Horas (netas)" : "Horas en el puesto"}
                    value={
                      <span className="tabular-nums">{fmtHours(horas)}</span>
                    }
                  />
                  <Field
                    label="Entrada"
                    value={
                      <span className="tabular-nums">
                        {fmtDateTime(record.punchInTime)}
                      </span>
                    }
                  />
                  <Field
                    label="Salida"
                    value={
                      <span className="tabular-nums">
                        {fmtDateTime(record.punchOutTime)}
                      </span>
                    }
                  />
                  <Field
                    numeric
                    label="Descanso"
                    value={
                      <span className="tabular-nums">
                        {desc ? `${desc} min` : "—"}
                      </span>
                    }
                  />
                  {/* En un vigilante `hoursWorked` es tiempo EN EL PUESTO y el
                      descanso va aparte; en supervisión y oficina el propio
                      reloj ya lo descontó al cerrar. Restarlo otra vez aquí le
                      quitaría el almuerzo dos veces. */}
                  {!esOtroReloj && (
                    <Field
                      numeric
                      label="Netas"
                      value={
                        <span className="tabular-nums">
                          {horas == null
                            ? "—"
                            : fmtHours(Math.max(0, horas - desc / 60))}
                        </span>
                      }
                    />
                  )}
                  <Field
                    numeric
                    label="Tarde"
                    value={
                      <span className="tabular-nums">
                        {record.lateMinutes || 0} min
                      </span>
                    }
                  />
                  <Field
                    numeric
                    label="Extra"
                    value={
                      <span className="tabular-nums">
                        {record.overtimeMinutes || 0} min
                      </span>
                    }
                  />
                  <Field
                    numeric
                    label="Rondas"
                    value={
                      <span className="tabular-nums">
                        {record.numberOfPatrolsDuringShift ?? 0}
                      </span>
                    }
                  />
                  <Field
                    numeric
                    label="Incidentes"
                    value={
                      <span className="tabular-nums">
                        {record.numberOfIncidentsDurindShift ?? 0}
                      </span>
                    }
                  />
                </div>

                {Array.isArray(record.breaks) && record.breaks.length > 0 && (
                  <div>
                    <p className="cg-eyebrow mb-1">Descansos</p>
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
                            {b.kind === "lunch" ? "Almuerzo" : "Descanso"}
                          </span>
                          <span className="font-medium tabular-nums">
                            {fmtTime(b.start)} →{" "}
                            {b.end ? fmtTime(b.end) : "en curso"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {record.observations && (
                  <div>
                    <p className="cg-eyebrow">Observaciones</p>
                    <p className="glass-sunken mt-1 whitespace-pre-wrap p-3 text-sm">
                      {record.observations}
                    </p>
                  </div>
                )}

                {Array.isArray(record.sessions) &&
                  record.sessions.length > 0 && (
                    <div>
                      <p className="cg-eyebrow mb-1">
                        Sesiones ({record.sessions.length})
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
                              Entrada
                            </span>
                            <span
                              className="font-normal tabular-nums"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {fmtTime(record.punchInTime)}
                            </span>
                          </div>
                          <StaticMapImage
                            alt="Ubicación de la marcación de entrada"
                            height="170px"
                            lat={Number(record.punchInLatitude)}
                            lng={Number(record.punchInLongitude)}
                            polygon={
                              record.stationName?.geofencePolygon || undefined
                            }
                            radiusMeters={
                              !record.stationName?.geofencePolygon &&
                              record.stationName?.geofenceRadius
                                ? Number(record.stationName.geofenceRadius)
                                : null
                            }
                            zoom={16}
                          >
                            <GoogleMapEmbed
                              geofenceRadius={
                                record.stationName?.geofenceRadius || 100
                              }
                              height="170px"
                              lat={Number(record.punchInLatitude)}
                              lng={Number(record.punchInLongitude)}
                              markers={[
                                {
                                  id: "in",
                                  lat: Number(record.punchInLatitude),
                                  lng: Number(record.punchInLongitude),
                                  label: "Entrada",
                                },
                              ]}
                              polygon={
                                record.stationName?.geofencePolygon || undefined
                              }
                              showGeofence={
                                !record.stationName?.geofencePolygon &&
                                !!record.stationName?.geofenceRadius
                              }
                              zoom={16}
                            />
                          </StaticMapImage>
                          {record.punchInOutsideGeofence && (
                            <p
                              className="px-3 py-2 text-xs font-medium"
                              style={{
                                background:
                                  "color-mix(in oklab, var(--bad) 12%, transparent)",
                                color: "var(--bad-text)",
                              }}
                            >
                              Fuera de geocerca ·{" "}
                              {record.punchInDistanceM ?? "?"} m del puesto
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
                              Salida
                            </span>
                            <span
                              className="font-normal tabular-nums"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {fmtTime(record.punchOutTime)}
                            </span>
                          </div>
                          <StaticMapImage
                            alt="Ubicación de la marcación de salida"
                            height="170px"
                            lat={Number(record.punchOutLatitude)}
                            lng={Number(record.punchOutLongitude)}
                            polygon={
                              record.stationName?.geofencePolygon || undefined
                            }
                            radiusMeters={
                              !record.stationName?.geofencePolygon &&
                              record.stationName?.geofenceRadius
                                ? Number(record.stationName.geofenceRadius)
                                : null
                            }
                            zoom={16}
                          >
                            <GoogleMapEmbed
                              geofenceRadius={
                                record.stationName?.geofenceRadius || 100
                              }
                              height="170px"
                              lat={Number(record.punchOutLatitude)}
                              lng={Number(record.punchOutLongitude)}
                              markers={[
                                {
                                  id: "out",
                                  lat: Number(record.punchOutLatitude),
                                  lng: Number(record.punchOutLongitude),
                                  label: "Salida",
                                },
                              ]}
                              polygon={
                                record.stationName?.geofencePolygon || undefined
                              }
                              showGeofence={
                                !record.stationName?.geofencePolygon &&
                                !!record.stationName?.geofenceRadius
                              }
                              zoom={16}
                            />
                          </StaticMapImage>
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* Selfie del fichaje: la columna estrecha, para que no empuje los datos */}
              <div>
                <p className="cg-eyebrow mb-1">Selfie de entrada</p>
                {selfieUrl ? (
                  <a
                    className="block"
                    href={selfieUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <img
                      alt="Selfie de entrada"
                      className="glass-flat w-full object-contain"
                      src={selfieUrl}
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
                    className="py-8"
                    icon={<ImageOff />}
                    title="Sin selfie"
                  />
                )}
              </div>
            </div>
          )}

          {tab === "corregir" && (
            <div className="space-y-4">
              <InfoNote tone="warn">
                Al guardar, la tarjeta vuelve a <b>espera de revisión</b> y las
                horas se recalculan solas — no se escriben a mano. Queda
                registrado quién corrigió y por qué.
                {esOtroReloj &&
                  " En supervisión y oficina las horas se guardan ya netas de descansos, como al cerrar el turno."}
              </InfoNote>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="cg-eyebrow mb-1 block">Entrada</span>
                  <input
                    className="cg-input cg-focus w-full px-3 py-2 text-sm tabular-nums"
                    type="datetime-local"
                    value={entrada}
                    onChange={(e) => setEntrada(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="cg-eyebrow mb-1 block">Salida</span>
                  <input
                    className="cg-input cg-focus w-full px-3 py-2 text-sm tabular-nums"
                    type="datetime-local"
                    value={salida}
                    onChange={(e) => setSalida(e.target.value)}
                  />
                </label>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="cg-eyebrow">
                    Descansos y almuerzo
                    {minutosDescanso ? ` · ${minutosDescanso} min` : ""}
                  </span>
                  <Button
                    className="rounded-full"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDescansos((p) => [
                        ...p,
                        { kind: "break", start: entrada, end: "" },
                      ])
                    }
                  >
                    <Plus size={14} /> Agregar
                  </Button>
                </div>
                {descansos.length === 0 && (
                  <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                    {esOtroReloj
                      ? "Sin descansos registrados. Se descuentan de las horas al recalcular."
                      : "Sin descansos registrados. Se descuentan de las horas netas, no de las horas en el puesto."}
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
                          setDescansos((p) =>
                            p.map((x, j) =>
                              j === i ? { ...x, kind: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <option value="break">Descanso</option>
                        <option value="lunch">Almuerzo</option>
                      </select>
                      <input
                        className="cg-input cg-focus px-2 py-2 text-sm tabular-nums"
                        type="datetime-local"
                        value={d.start}
                        onChange={(e) =>
                          setDescansos((p) =>
                            p.map((x, j) =>
                              j === i ? { ...x, start: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <input
                        className="cg-input cg-focus px-2 py-2 text-sm tabular-nums"
                        type="datetime-local"
                        value={d.end}
                        onChange={(e) =>
                          setDescansos((p) =>
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
                          setDescansos((p) => p.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="cg-eyebrow mb-1 block">Observaciones</span>
                <textarea
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                  maxLength={500}
                  rows={2}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="cg-eyebrow mb-1 block">
                  Motivo de la corrección *
                </span>
                <input
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                  placeholder="Ej.: el reloj no registró la salida; se confirmó con el supervisor"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>

              <div className="flex justify-end gap-2">
                <Button disabled={busy} variant="ghost" onClick={onClose}>
                  Cancelar
                </Button>
                <Button
                  disabled={busy || !motivo.trim()}
                  onClick={() => void guardar()}
                >
                  Guardar corrección
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
