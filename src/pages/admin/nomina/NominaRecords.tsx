import { usePuede } from "@/hooks/usePuede";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { toast } from "sonner";
import attendanceService, {
  type AttendanceRecord,
} from "@/lib/api/attendanceService";
import departmentService, {
  type Department,
} from "@/lib/api/departmentService";
import GoogleMapEmbed from "@/components/GoogleMap/GoogleMapEmbed";
import { useFileUrl } from "@/lib/fileUrl";
import {
  StatusBadge,
  PayrollBadge,
  PAYROLL_FLOW_META,
  PAYROLL_FLOW_NEXT,
  STATUS_META,
  fmtTime,
  fmtHours,
  fmtDescanso,
  horasDeLaFila,
} from "./shared";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  Segmented,
  Toolbar,
  StatusBadge as ToneBadge,
  EmptyState,
} from "@/components/kit";
import {
  ClipboardCheck,
  ClipboardList,
  Filter,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Send,
  Users,
} from "lucide-react";
import { BulkActionsSelect } from "@/components/table/BulkActionsSelect";
import TimesheetModal from "./TimesheetModal";
import ChipRostro from "@/components/rostro/ChipRostro";
import { usePermissions } from "@/hooks/usePermissions";
import { useGusto } from "@/hooks/useGusto";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import ExportMenu from "@/components/reports/ExportMenu";
import type { ExportFormat } from "@/lib/export/reportExport";

import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { MarcaSinSenal } from "@/components/conexion/MarcaSinSenal";
import { useMarcasSinSenal } from "@/hooks/useMarcasSinSenal";

/** ¿La marca sin señal de este turno fue la entrada o la salida? */
function ladoDeLaMarca(m?: { accion?: string | null } | null): "entrada" | "salida" | null {
  if (!m) return null;
  const a = String(m.accion || "").toLowerCase();

  return a.includes("salida") || a.includes("clock-out") || a === "out" ? "salida" : "entrada";
}
/**
 * La marca que NO puso el vigilante con su dedo. Sólo se señalan las que
 * cambian cómo leer la hora: la que registró el teléfono al llegar o irse del
 * puesto, la que marcó el supervisor por él, la que cerró el relevo y la
 * salida anticipada. 'app' y el barrido no llevan etiqueta: la primera es lo
 * normal y el segundo ya lo cuenta el estado («sin marcar salida»).
 */
function MetodoDeMarcaje({
  lado,
  metodo,
}: {
  lado: "entrada" | "salida";
  metodo?: string | null;
}) {
  const { t } = useTranslation();
  let texto: string | null = null;
  let tono: "info" | "warn" = "info";

  if (lado === "entrada") {
    if (metodo === "auto_location")
      texto = t("nomina.punchMethod.autoIn", "Entrada automática");
    else if (metodo === "supervisor")
      texto = t("nomina.punchMethod.supervisorIn", "Marcada por supervisor");
  } else if (metodo === "auto_location")
    texto = t("nomina.punchMethod.autoOut", "Salida automática");
  else if (metodo === "relevo")
    texto = t("nomina.punchMethod.relevoOut", "Cerrada por el relevo");
  else if (metodo === "early_exit") {
    texto = t("nomina.punchMethod.earlyExit", "Salida anticipada");
    tono = "warn";
  } else if (metodo === "supervisor")
    texto = t("nomina.punchMethod.supervisorOut", "Cerrada por supervisor");

  if (!texto) return null;

  return (
    <ToneBadge className="ml-1.5 align-middle" dot={false} tone={tono}>
      {texto}
    </ToneBadge>
  );
}

const STATUS_OPTIONS = [
  "",
  "on_time",
  "late",
  "early_departure",
  "missed_clockout",
  "no_call_no_show",
  "overtime",
  "pending_review",
  "approved",
  "rejected",
  "vacation",
  "permission",
  "absent",
];

type Period = "day" | "week" | "month";

/** [start, end] Date bounds for the period containing `anchor` (local time). */
function rangeFor(period: Period, anchor: Date): [Date, Date] {
  const y = anchor.getFullYear(),
    m = anchor.getMonth(),
    d = anchor.getDate();
  if (period === "day") {
    return [new Date(y, m, d, 0, 0, 0, 0), new Date(y, m, d, 23, 59, 59, 999)];
  }
  if (period === "week") {
    const dow = (anchor.getDay() + 6) % 7; // Monday = 0
    const start = new Date(y, m, d - dow, 0, 0, 0, 0);
    const end = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 6,
      23,
      59,
      59,
      999,
    );
    return [start, end];
  }
  return [
    new Date(y, m, 1, 0, 0, 0, 0),
    new Date(y, m + 1, 0, 23, 59, 59, 999),
  ];
}

/** Shift the anchor by ±1 of the period unit. */
function shiftAnchor(period: Period, anchor: Date, dir: number): Date {
  const d = new Date(anchor);
  if (period === "day") d.setDate(d.getDate() + dir);
  else if (period === "week") d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  return d;
}

function rangeLabel(period: Period, anchor: Date): string {
  const [s, e] = rangeFor(period, anchor);
  if (period === "day")
    return s.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  if (period === "month")
    return s.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
      month: "long",
      year: "numeric",
    });
  const sameMonth = s.getMonth() === e.getMonth();
  return `${s.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(), day: "2-digit", month: sameMonth ? undefined : "short" })} – ${e.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(), day: "2-digit", month: "short", year: "numeric" })}`;
}

export default function NominaRecords() {
  const { t } = useTranslation();
  const gusto = useGusto();
  // Deep-link from a clock-in notification: ?focus=<id> auto-opens that record's
  // detail once the list loads (carried over from the old Programador · Asistencia).
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const [focusHandled, setFocusHandled] = useState(false);

  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  // Entradas/salidas marcadas sin señal: una consulta por página.
  const marcasSinSenal = useMarcasSinSenal(rows.map((r: any) => r.id));
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [period, setPeriod] = useState<Period>("week");
  // El aviso trae también `?date=<AAAA-MM-DD>`: el día del fichaje. Sin usarlo, la
  // lista abría SIEMPRE la semana actual, y un enlace a una entrada de hace ocho
  // días caía fuera del rango — la ficha no se abría nunca y el enlace parecía
  // roto. Se ancla el periodo en ese día.
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = searchParams.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split("-").map(Number);
      const parsed = new Date(y, m - 1, day);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);
  const [busy, setBusy] = useState(false);
  /** Filtro por trabajador. La lista de opciones sale de lo cargado SIN filtro:
   *  si saliera de las filas ya filtradas, elegir a alguien dejaría el
   *  desplegable con una sola opción y no habría vuelta atrás. */
  const [guardId, setGuardId] = useState("");
  const [guardOptions, setGuardOptions] = useState<
    { id: string; label: string }[]
  >([]);
  const [payrollStatus, setPayrollStatus] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkKey, setBulkKey] = useState(0);
  const { hasPermission } = usePermissions();
  const puedeAprobar = hasPermission("attendanceApprove");
  const puedeEditar = hasPermission("attendanceEdit");
  /* Money moves follow the server's payroll gate AND the payroll module
     (lib/reglasDeAcciones): a supervisor or a company without Roles de pago /
     Gusto no longer sees «Aprobar y enviar a pago» only to get an error. */
  const paraPago = usePuede("asistencia.aprobarParaPago");
  const pagado = usePuede("asistencia.marcarPagado");
  const puedeExportar = usePuede("asistencia.exportar");
  /** The payroll moves this person can make from `actual` (the server's rule). */
  const movimientosPermitidos = (actual: string, siguientes: string[]) => {
    const dineroAntes = actual === "approved" || actual === "paid";
    return siguientes.filter((destino) => {
      if (dineroAntes) return pagado.puede; // leaving approved/paid releases money
      if (destino === "approved") return paraPago.puede;
      if (destino === "paid") return pagado.puede;
      return true;
    });
  };

  const [rangeStart, rangeEnd] = useMemo(
    () => rangeFor(period, anchor),
    [period, anchor],
  );
  // Token-based selfie URL for the open record. punchInPhoto is a raw
  // privateUrl string (no companion downloadUrl), so resolve a token here at the
  // component top level (hooks rules) rather than inside the JSX IIFE below.
  const selfieUrl = useFileUrl(selected?.punchInPhoto ?? null);

  const load = useCallback(() => {
    setLoading(true);
    attendanceService
      .list({
        "filter[status]": status || undefined,
        "filter[departmentId]": departmentId || undefined,
        "filter[guardName]": guardId || undefined,
        // Day/week/month window — sent as the backend's punchInTimeRange [start, end].
        "filter[punchInTimeRange][0]": rangeStart.toISOString(),
        "filter[punchInTimeRange][1]": rangeEnd.toISOString(),
        limit: 1000,
        orderBy: "punchInTime_DESC",
      })
      .then((r) => {
        const filas = r.rows || [];
        setRows(filas);
        // Se refresca el catálogo de trabajadores sólo cuando NO hay filtro:
        // ver la nota en `guardOptions`.
        if (!guardId) {
          const m = new Map<string, string>();
          for (const f of filas) {
            const id = f.guardName?.id;
            if (id) m.set(String(id), f.guardName?.fullName || t("ui.NominaRecords.trabajador", "Trabajador"));
          }
          setGuardOptions(
            [...m.entries()]
              .map(([id, label]) => ({ id, label }))
              .sort((a, b) => a.label.localeCompare(b.label)),
          );
        }
      })
      .catch((e) => toast.error(
          e?.message || t("ui.NominaRecords.errorAlCargarRegistros", "Error al cargar registros"),
        ))
      .finally(() => setLoading(false));
  }, [status, departmentId, guardId, rangeStart, rangeEnd]);
  useEffect(load, [load]);
  // Una selección que sobrevive a un cambio de filtro actúa sobre filas que ya
  // no están en pantalla — exactamente lo que nadie espera de un botón «aplicar
  // a lo seleccionado».
  useEffect(() => {
    setSelectedIds([]);
  }, [status, departmentId, guardId, rangeStart, rangeEnd]);

  useEffect(() => {
    departmentService
      .list()
      .then((r) => setDepartments(r.rows.filter((d) => d.active)))
      .catch(() => {});
  }, []);

  /** Filtro por estado de nómina. Va en el cliente porque la lista ya viene
   *  entera del periodo y así no se paga otra ida al servidor por un desplegable. */
  const visibles = useMemo(
    () =>
      payrollStatus
        ? rows.filter((r) => String(r.payrollStatus || "") === payrollStatus)
        : rows,
    [rows, payrollStatus],
  );

  // Once rows are loaded, open the detail for the notification's record (once).
  useEffect(() => {
    if (focusHandled || !focusId || loading) return;
    const match = rows.find((r) => r.id === focusId);
    if (match) {
      setSelected(match);
      attendanceService
        .find(match.id)
        .then(setSelected)
        .catch(() => {});
      setFocusHandled(true);
      return;
    }
    // ── SI LA FILA NO ESTÁ EN LA LISTA, SE PIDE — EN SILENCIO ───────────────
    // El enlace del aviso trae un día, y si ese día no es el que la fila ocupa
    // —un turno nocturno, un periodo distinto guardado de la última visita—
    // aquí no se encontraba nada y el aviso no abría NADA.
    //
    // Pero el identificador del aviso NO SIEMPRE es el de un registro de
    // asistencia: cada tipo de aviso trae el suyo (una solicitud de entrada, un
    // aviso de geocerca, el propio evento). Pedirlo con el `find` normal soltaba
    // un «Extraviado» a pantalla completa — un error de sistema para decir «este
    // aviso no apuntaba a una ficha», que no es un error de nadie. Se pide en
    // silencio: si no es una ficha, el usuario se queda en el día correcto, que
    // es la mitad útil del viaje.
    setFocusHandled(true);
    attendanceService.findSilent(focusId).then((r) => {
      if (r) setSelected(r);
    });
  }, [focusId, focusHandled, loading, rows]);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    const openId = selected?.id;
    try {
      await fn();
      toast.success(okMsg);
      // Refresh the open record IN PLACE so its approval badge + action buttons
      // reflect the new state immediately (previously the sheet closed, so an
      // already-approved record kept offering "Aprobar" when reopened).
      if (openId) {
        try {
          setSelected(await attendanceService.find(openId));
        } catch {
          setSelected(null);
        }
      }
      load();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<AttendanceRecord>[] = [
    {
      key: "guard",
      header: t("comun.vigilante", "Vigilante"),
      render: (_v, r) => (
        <span className="flex items-center gap-1.5">
          {r.guardName?.fullName || "—"}
          {r.role === "supervisor" && (
            <ToneBadge tone="warn" dot={false}>
              {t("comun.supervisor")}
            </ToneBadge>
          )}
          {r.role === "administrative" && (
            <ToneBadge tone="info" dot={false}>
              {t("ui.NominaShared.administrativo", "Administrativo")}
            </ToneBadge>
          )}
          <ChipRostro
            puntuacion={r.rostroPuntuacion}
            resultado={r.rostroResultado}
          />
        </span>
      ),
    },
    {
      key: "station",
      header: t("comun.puesto", "Puesto"),
      render: (_v, r) =>
        r.stationName?.stationName ||
        (r.role === "supervisor"
          ? t("ui.SupervisionSection.supervision", "Supervisión")
          : r.role === "administrative"
            ? t("ui.NominaRecords.oficina", "Oficina")
            : "—"),
    },
    {
      key: "scheduledStart",
      header: t("ui.NominaRecords.programado", "Programado"),
      render: (_v, r) =>
        `${fmtTime(r.scheduledStart)} – ${fmtTime(r.scheduledEnd)}`,
    },
    {
      key: "punchInTime",
      header: t("ui.NominaRecords.entrada", "Entrada"),
      render: (_v, r) => (
        <span>
          {fmtTime(r.punchInTime)}
          <MetodoDeMarcaje lado="entrada" metodo={r.punchInMethod} />
          {/* Marcada sin señal: la hora es la real; llegó después. */}
          {ladoDeLaMarca(marcasSinSenal[String(r.id)]) !== "salida" && (
            <MarcaSinSenal className="ml-1" marca={marcasSinSenal[String(r.id)]} />
          )}
          {Array.isArray(r.sessions) && r.sessions.length > 1 && (
            <span
              className="ml-1 text-[10px] font-medium tabular-nums"
              style={{ color: "var(--ink-faint)" }}
            >
              ·
              {t("ui.NominaRecords.sesiones", {
                count: r.sessions.length,
                defaultValue: "{{count}} sesiones",
              })}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "punchOutTime",
      header: t("ui.NominaRecords.salida", "Salida"),
      numeric: true,
      render: (_v, r) => (
        <span>
          {fmtTime(r.punchOutTime)}
          {r.punchOutTime && (
            <MetodoDeMarcaje lado="salida" metodo={r.punchOutMethod} />
          )}
          {ladoDeLaMarca(marcasSinSenal[String(r.id)]) === "salida" && (
            <MarcaSinSenal className="ml-1" marca={marcasSinSenal[String(r.id)]} />
          )}
        </span>
      ),
    },
    /* `numeric` no es decoración: alinea la columna Y su cabecera a la derecha
       con `tabular-nums`, que es lo que deja las horas unas debajo de otras.
       Con `render` propio, DataTable ya no lo deduce solo. */
    /* «Los descansos en días» (dueño, 2026-10-14): el descanso de CADA día, y
       las horas que se pagan —en el puesto menos descanso—, que son las mismas
       que salen en las tarjetas de nómina, el evento y Gusto. Debajo, en
       pequeño, el tiempo en el puesto cuando hubo descanso. */
    {
      key: "descansoMinutos",
      header: t("ui.NominaRecords.descanso", "Descanso"),
      numeric: true,
      render: (_v, r) =>
        r.esJornadaSinFichaje ? "—" : fmtDescanso(horasDeLaFila(r).descansoMinutos),
    },
    {
      key: "hoursWorked",
      header: t("ui.NominaRecords.horasNetas", "Horas netas"),
      numeric: true,
      render: (_v, r) => {
        const h = horasDeLaFila(r);

        /* El descanso cubre todo el turno: un «0.00 h» callado parecía un
           turno sin trabajo. No se paga ni se aprueba hasta corregirlo. */
        if (h.cubreElTurno)
          return (
            <span
              title={t(
                "ui.NominaRecords.descansoCubreElTurnoAyuda",
                "El descanso cubre todo el turno: corrige el descanso para que se pague.",
              )}
            >
              <ToneBadge tone="warn">
                {t("ui.NominaRecords.sinResolver", "Sin resolver")}
              </ToneBadge>
            </span>
          );

        return (
          <span>
            {fmtHours(h.netas)}
            {h.descansoMinutos > 0 && h.enElPuesto != null && (
              <span
                className="block text-[10px] tabular-nums"
                style={{ color: "var(--ink-faint)" }}
              >
                {t("ui.NominaRecords.deEnElPuesto", {
                  horas: fmtHours(h.enElPuesto),
                  defaultValue: "de {{horas}} en el puesto",
                })}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "patrols",
      header: t("postSites.tabs.tours", "Rondas"),
      numeric: true,
      render: (_v, r) => (
        <span
          className="font-semibold tabular-nums"
          style={{ color: "var(--brand-text)" }}
        >
          {r.numberOfPatrolsDuringShift ?? 0}
        </span>
      ),
    },
    {
      key: "incidents",
      header: t("ui.NominaRecords.incidentes", "Incidentes"),
      numeric: true,
      render: (_v, r) =>
        (r.numberOfIncidentsDurindShift ?? 0) > 0 ? (
          <span
            className="font-bold tabular-nums"
            style={{ color: "var(--bad-text)" }}
          >
            {r.numberOfIncidentsDurindShift}
          </span>
        ) : (
          <span className="tabular-nums" style={{ color: "var(--ink-faint)" }}>
            0
          </span>
        ),
    },
    {
      key: "geo",
      header: t("ui.NominaRecords.ubicacion", "Ubicación"),
      render: (_v, r) =>
        r.punchInOutsideGeofence ? (
          <ToneBadge tone="bad" dot={false}>
            <MapPin size={12} />{" "}
            <span className="tabular-nums">
              {t("ui.NominaRecords.fueraDistancia", {
                distancia: r.punchInDistanceM ?? "?",
                defaultValue: "Fuera ({{distancia}} m)",
              })}
            </span>
          </ToneBadge>
        ) : (
          <ToneBadge tone="ok" dot={false}>
            {t("ui.NominaRecords.dentro", "Dentro")}
          </ToneBadge>
        ),
    },
    {
      key: "status",
      header: t("comun.estado", "Estado"),
      render: (_v, r) => (
        <StatusBadge status={r.status} approval={r.approvalStatus} />
      ),
    },
    {
      /* EL CICLO HASTA EL PAGO, EN LA TABLA — Y EDITABLE DESDE AQUÍ.
         Vivía sólo en el detalle: había que abrir registro por registro para
         saber dónde estaba cada uno, y mover diez tarjetas eran diez fichas.
         El desplegable ofrece SÓLO las transiciones válidas, las mismas que el
         servidor acepta, así que no se puede llegar a «pagada» sin pasar por la
         revisión. */
      key: "payrollStatus",
      header: t("ui.NominaRecords.estadoDeNomina", "Estado de nómina"),
      render: (_v, r) => {
        const actual = String(r.payrollStatus || "");
        const siguientes = movimientosPermitidos(actual, PAYROLL_FLOW_NEXT[actual] || []);
        if (!actual || !puedeAprobar || !siguientes.length)
          return <PayrollBadge status={r.payrollStatus} />;
        return (
          <select
            className="cg-input cg-focus max-w-[13rem] px-2 py-1 text-xs"
            value={actual}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              const destino = e.target.value;
              if (destino === actual) return;
              void act(
                () => attendanceService.setStatus(r.id, destino),
                t("ui.NominaRecords.ahoraEstado", {
                  estado: PAYROLL_FLOW_META[destino]?.label || destino,
                  defaultValue: "Ahora: {{estado}}",
                }),
              );
            }}
          >
            <option value={actual}>
              {PAYROLL_FLOW_META[actual]?.label || actual}
            </option>
            {siguientes.map((sx) => (
              <option key={sx} value={sx}>
                → {PAYROLL_FLOW_META[sx]?.label || sx}
              </option>
            ))}
          </select>
        );
      },
    },
  ];

  /** Mover en bloque lo seleccionado. */
  const bulk = async (destino: string) => {
    setBulkKey((k) => k + 1);
    if (!selectedIds.length) {
      toast.error(t("ui.NominaRecords.noHayTarjetasSeleccionadas", "No hay tarjetas seleccionadas"));
      return;
    }
    const etiqueta = PAYROLL_FLOW_META[destino]?.label || destino;
    const ok = await confirmDialog({
      title: t("ui.NominaRecords.cambiarElEstado", "Cambiar el estado"),
      message: t("ui.NominaRecords.confirmarCambioEnBloque", {
        count: selectedIds.length,
        etiqueta,
        defaultValue:
          "Se pondrán {{count}} tarjeta(s) en «{{etiqueta}}». Las que no admitan ese paso se quedan como están y te digo cuáles.",
      }),
      confirmText: t("ui.NominaRecords.cambiar", "Cambiar"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await attendanceService.bulkSetStatus(selectedIds, destino);
      if (r.fallidas?.length)
        toast.warning(
          t("ui.NominaRecords.actualizadasYFallidas", {
            count: r.actualizadas,
            fallidas: r.fallidas.length,
            defaultValue:
              "{{count}} actualizada(s); {{fallidas}} no admitían ese paso",
          }),
        );
      else
        toast.success(
          t("ui.NominaRecords.tarjetasEnEstado", {
            count: r.actualizadas,
            etiqueta,
            defaultValue: "{{count}} tarjeta(s) en «{{etiqueta}}»",
          }),
        );
      setSelectedIds([]);
      load();
    } catch (e: any) {
      toast.error(
        e?.message || t("ui.NominaRecords.noSePudoCambiarElEstado", "No se pudo cambiar el estado"),
      );
    } finally {
      setBusy(false);
    }
  };

  /** Descarga del servidor: el navegador sólo tiene lo que cargó. */
  const exportar = async (formato: ExportFormat) => {
    setBusy(true);
    try {
      await attendanceService.exportRecords({
        format: formato,
        "filter[status]": status || undefined,
        "filter[departmentId]": departmentId || undefined,
        "filter[guardName]": guardId || undefined,
        "filter[punchInTimeRange][0]": rangeStart.toISOString(),
        "filter[punchInTimeRange][1]": rangeEnd.toISOString(),
        ids: selectedIds.length ? selectedIds.join(",") : undefined,
      });
      toast.success(
        selectedIds.length
          ? t("ui.NominaRecords.registrosExportados", {
              count: selectedIds.length,
              defaultValue: "{{count}} registro(s) exportado(s)",
            })
          : t("ui.NominaRecords.registroExportado", "Registro exportado"),
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("ui.NominaShared.noSePudoGenerarElArchivo", "No se pudo generar el archivo"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<ClipboardCheck />}
          title={t("sidebar.asistencia.marcaciones", "Marcaciones")}
          subtitle={t("ui.NominaRecords.marcacionesDeEntradaSalida", "Marcaciones de entrada / salida")}
          actions={
            /* Tres formatos y UNA fuente: el archivo lo arma el servidor con el
               mismo filtro que la pantalla, así que incluye también los días de
               vacaciones y falta —que no son fichajes— y no se queda en las mil
               filas que el navegador alcanzó a cargar. Con filas marcadas,
               exporta sólo esas. */
            /* Un solo control. Antes había DOS: un `<select>` nativo (que en
               iOS abre la rueda del sistema y no se parece a nada del CRM) y,
               al lado, un botón «CSV» que exportaba OTRA cosa —sólo las filas
               que el navegador había alcanzado a cargar—. Dos botones de
               exportar que daban archivos distintos era la peor parte. */
            <div className="flex flex-wrap items-center gap-2">
            {/* Empresas de EE. UU. con Gusto: lo aprobado aquí se manda desde Nómina › Gusto. */}
            {gusto.conectado && (
              <Button asChild variant="outline">
                <Link to="/nomina/gusto">
                  <Send /> {t("ui.NominaRecords.enviarAGusto", "Enviar a Gusto")}
                </Link>
              </Button>
            )}
            {puedeExportar.puede && (
            <ExportMenu
              onExport={exportar}
              busy={busy}
              label={
                selectedIds.length
                  ? t("ui.NominaRecords.exportarN", {
                      count: selectedIds.length,
                      defaultValue: "Exportar {{count}}",
                    })
                  : t("ui.NominaRecords.exportar", "Exportar")
              }
            />
            )}
            </div>
          }
        />

        <Toolbar>
          {/* Trabajador — la pregunta más frecuente de esta pantalla es «¿qué
              hizo esta persona este mes?», y hasta hoy había que buscarla a ojo
              entre mil filas. */}
          <label className="inline-flex items-center gap-2">
            <Users className="size-4" style={{ color: "var(--ink-soft)" }} />
            <select
              className="cg-input cg-focus max-w-[16rem] px-3 py-2 text-sm"
              value={guardId}
              onChange={(e) => setGuardId(e.target.value)}
            >
              <option value="">
                {t("ui.NominaRecords.todosLosTrabajadores", "Todos los trabajadores")}
              </option>
              {guardOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          {/* Estado de nómina */}
          <select
            className="cg-input cg-focus px-3 py-2 text-sm"
            value={payrollStatus}
            onChange={(e) => setPayrollStatus(e.target.value)}
          >
            <option value="">
              {t("ui.NominaRecords.cualquierEstadoDeNomina", "Cualquier estado de nómina")}
            </option>
            {Object.entries(PAYROLL_FLOW_META).map(([k, m]) => (
              <option key={k} value={k}>
                {m.label}
              </option>
            ))}
          </select>

          {/* Período: Día / Semana / Mes */}
          <Segmented<Period>
            value={period}
            onChange={setPeriod}
            options={[
              { value: "day", label: t("comun.periodo.dia", "Día") },
              { value: "week", label: t("ui.NominaRecords.semana", "Semana") },
              { value: "month", label: t("ui.NominaRecords.mes", "Mes") },
            ]}
          />

          {/* Navegación de fecha */}
          <div className="glass-sunken inline-flex items-center gap-1 px-1.5 py-1">
            <button
              onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))}
              className="cg-focus cg-btn-ghost rounded-full p-1"
              aria-label={t("kit.pagination.prev")}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              title={t("ui.NominaRecords.irAHoy", "Ir a hoy")}
              className="cg-focus min-w-[9rem] rounded-full px-2 text-center text-sm font-medium capitalize"
            >
              {rangeLabel(period, anchor)}
            </button>
            <button
              onClick={() => setAnchor((a) => shiftAnchor(period, a, +1))}
              className="cg-focus cg-btn-ghost rounded-full p-1"
              aria-label={t("kit.pagination.next")}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Filtro de estado */}
          <label className="glass-sunken flex items-center gap-2 px-3 py-1.5">
            <Filter className="size-4" style={{ color: "var(--ink-faint)" }} />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="cg-focus bg-transparent text-sm outline-none"
              style={{ color: "var(--ink)" }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === ""
                    ? t("comun.todosLosEstados", "Todos los estados")
                    : (STATUS_META[s]?.label ?? s)}
                </option>
              ))}
            </select>
          </label>

          {/* Filtro de departamento (solo si el tenant creó departamentos) */}
          {departments.length > 0 && (
            <label className="glass-sunken flex items-center gap-2 px-3 py-1.5">
              <Filter
                className="size-4"
                style={{ color: "var(--ink-faint)" }}
              />
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="cg-focus bg-transparent text-sm outline-none"
                style={{ color: "var(--ink)" }}
              >
                <option value="">
                  {t("ui.NominaRecords.todosLosDepartamentos")}
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Toolbar>

        <Section
          title={t("ui.NominaRecords.marcaciones", "Marcaciones")}
          icon={<ClipboardList />}>
          {!loading && (
            <div
              className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              <span>
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: "var(--ink)" }}
                >
                  {rows.length}
                </span>{" "}
                {t("ui.NominaRecords.registrosSufijo", {
                  count: rows.length,
                  defaultValue: "registro(s)",
                })}
              </span>
              <span>
                {t("ui.NominaRecords.horasNetasTotales", "Horas netas:")}{" "}
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: "var(--ink)" }}
                >
                  {fmtHours(
                    rows.reduce(
                      (sum, r) => sum + (Number(horasDeLaFila(r).netas) || 0),
                      0,
                    ),
                  )}
                </span>
              </span>
              <span className="capitalize">{rangeLabel(period, anchor)}</span>
            </div>
          )}
          {loading ? (
            <SkeletonCards count={4} />
          ) : (
            <DataTable
              columns={columns}
              data={visibles}
              selectedIds={selectedIds}
              onSelectOne={(id, checked) =>
                setSelectedIds((p) =>
                  checked ? [...p, id] : p.filter((x) => x !== id),
                )
              }
              onSelectAll={(checked) =>
                setSelectedIds(checked ? visibles.map((r) => r.id) : [])
              }
              toolbar={
                puedeAprobar && selectedIds.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <ToneBadge tone="brand">
                      {t("ui.NominaRecords.seleccionadas", {
                        count: selectedIds.length,
                        defaultValue: "{{count}} seleccionada(s)",
                      })}
                    </ToneBadge>
                    <BulkActionsSelect
                      key={bulkKey}
                      actions={[
                        {
                          value: "reviewed",
                          label: t("ui.NominaRecords.marcarRevisadas", "Marcar revisadas"),
                        },
                        { value: "rejected", label: t("revision.rechazar", "Rechazar") },
                        {
                          value: "pending_review",
                          label: t("ui.NominaRecords.devolverARevision", "Devolver a revisión"),
                        },
                      ]}
                      onChange={(v) => void bulk(v)}
                    />
                    {/* ONE approval flow: pay is approved on the person's card. */}
                    <a className="text-xs underline" href="/nomina/timecards" style={{ color: "var(--ink-soft)" }}>
                      {t("ui.NominaRecords.aprobarEnHoras", "Aprobar para pago en Horas del periodo")} →
                    </a>
                  </div>
                ) : undefined
              }
              onRowClick={(r) => {
                // Open immediately with the lean list row, then hydrate the full
                // record (selfie/photos/device) — the list no longer ships those blobs.
                setSelected(r);
                attendanceService
                  .find(r.id)
                  .then(setSelected)
                  .catch(() => {});
              }}
              emptyState={
                <EmptyState
                  icon={<ClipboardList />}
                  title={t("comun.sinRegistros")}
                  description={t("ui.NominaRecords.noHayMarcacionesParaLos")}
                />
              }
            />
          )}
        </Section>
      </PageContainer>

      {/* La ficha del día, CENTRADA. Antes era un cajón de 28 rem y media
          tarjeta quedaba fuera de pantalla: es la pieza sobre la que se decide
          lo que se paga, así que se mira entera. */}
      <TimesheetModal
        record={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          load();
          if (selected)
            attendanceService
              .find(selected.id)
              .then(setSelected)
              .catch(() => {});
        }}
        puedeEditar={puedeEditar}
        puedeAprobar={puedeAprobar}
      />
    </AppLayout>
  );
}
