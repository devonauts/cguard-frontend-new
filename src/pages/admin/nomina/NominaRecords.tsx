import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { useSearchParams } from "react-router-dom";
import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import attendanceService, { type AttendanceRecord } from "@/lib/api/attendanceService";
import departmentService, { type Department } from "@/lib/api/departmentService";
import GoogleMapEmbed from "@/components/GoogleMap/GoogleMapEmbed";
import StaticMapImage from "@/components/maps/StaticMapImage";
import { useFileUrl } from "@/lib/fileUrl";
import { StatusBadge, ApprovalBadge, STATUS_META, approvalLabel, fmtDateTime, fmtTime, fmtHours } from "./shared";
import { PageContainer, PageHeader, Section, EmptyState, SkeletonCards, Segmented, Toolbar, StatusBadge as ToneBadge, Field } from "@/components/kit";
import { MapPin, ImageOff, ClipboardCheck, ClipboardList, Filter, Download, ChevronLeft, ChevronRight, LogIn, LogOut } from "lucide-react";
import { promptDialog } from "@/components/ui/promptDialog";

import { localeActual } from '@/lib/localeActual'
const STATUS_OPTIONS = [
  "", "on_time", "late", "early_departure", "missed_clockout",
  "no_call_no_show", "overtime", "pending_review", "approved", "rejected",
];

type Period = "day" | "week" | "month";

/** [start, end] Date bounds for the period containing `anchor` (local time). */
function rangeFor(period: Period, anchor: Date): [Date, Date] {
  const y = anchor.getFullYear(), m = anchor.getMonth(), d = anchor.getDate();
  if (period === "day") {
    return [new Date(y, m, d, 0, 0, 0, 0), new Date(y, m, d, 23, 59, 59, 999)];
  }
  if (period === "week") {
    const dow = (anchor.getDay() + 6) % 7; // Monday = 0
    const start = new Date(y, m, d - dow, 0, 0, 0, 0);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
    return [start, end];
  }
  return [new Date(y, m, 1, 0, 0, 0, 0), new Date(y, m + 1, 0, 23, 59, 59, 999)];
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
  if (period === "day") return s.toLocaleDateString(localeActual(), { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  if (period === "month") return s.toLocaleDateString(localeActual(), { month: "long", year: "numeric" });
  const sameMonth = s.getMonth() === e.getMonth();
  return `${s.toLocaleDateString(localeActual(), { day: "2-digit", month: sameMonth ? undefined : "short" })} – ${e.toLocaleDateString(localeActual(), { day: "2-digit", month: "short", year: "numeric" })}`;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function NominaRecords() {
  const { t } = useTranslation();
  // Deep-link from a clock-in notification: ?focus=<id> auto-opens that record's
  // detail once the list loads (carried over from the old Programador · Asistencia).
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const [focusHandled, setFocusHandled] = useState(false);

  const [rows, setRows] = useState<AttendanceRecord[]>([]);
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

  const [rangeStart, rangeEnd] = useMemo(() => rangeFor(period, anchor), [period, anchor]);
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
        // Day/week/month window — sent as the backend's punchInTimeRange [start, end].
        "filter[punchInTimeRange][0]": rangeStart.toISOString(),
        "filter[punchInTimeRange][1]": rangeEnd.toISOString(),
        limit: 1000,
        orderBy: "punchInTime_DESC",
      })
      .then((r) => setRows(r.rows || []))
      .catch((e) => toast.error(e?.message || "Error al cargar registros"))
      .finally(() => setLoading(false));
  }, [status, departmentId, rangeStart, rangeEnd]);
  useEffect(load, [load]);

  useEffect(() => {
    departmentService
      .list()
      .then((r) => setDepartments(r.rows.filter((d) => d.active)))
      .catch(() => {});
  }, []);

  // Export the current period's records to CSV (UTF-8 BOM so Excel reads accents).
  const exportCsv = () => {
    if (!rows.length) { toast.error(t('comun.noHayRegistrosParaExportar')); return; }
    const headers = [
      "Fecha", "Vigilante", "Puesto", "Programado inicio", "Programado fin",
      "Entrada", "Salida", "Horas", "Tarde (min)", "Extra (min)",
      "Rondas", "Incidentes", "Fuera de geocerca", "Estado", "Aprobación",
    ];
    const body = rows.map((r) => [
      r.punchInTime ? new Date(r.punchInTime).toLocaleDateString(localeActual()) : "",
      r.guardName?.fullName || "",
      r.stationName?.stationName || "",
      fmtTime(r.scheduledStart), fmtTime(r.scheduledEnd),
      r.punchInTime ? new Date(r.punchInTime).toLocaleString(localeActual()) : "",
      r.punchOutTime ? new Date(r.punchOutTime).toLocaleString(localeActual()) : "",
      r.hoursWorked ?? "", r.lateMinutes ?? 0, r.overtimeMinutes ?? 0,
      r.numberOfPatrolsDuringShift ?? 0, r.numberOfIncidentsDurindShift ?? 0,
      r.punchInOutsideGeofence ? "Sí" : "No",
      STATUS_META[r.status]?.label || r.status || "", approvalLabel(r.approvalStatus),
    ]);
    const csv = [headers, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asistencia_${period}_${rangeStart.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} registro(s) exportado(s)`);
  };

  // Once rows are loaded, open the detail for the notification's record (once).
  useEffect(() => {
    if (focusHandled || !focusId || loading) return;
    const match = rows.find((r) => r.id === focusId);
    if (match) {
      setSelected(match);
      attendanceService.find(match.id).then(setSelected).catch(() => {});
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
    attendanceService.findSilent(focusId).then((r) => { if (r) setSelected(r); });
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
        try { setSelected(await attendanceService.find(openId)); } catch { setSelected(null); }
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
      header: "Vigilante",
      render: (_v, r) => (
        <span className="flex items-center gap-1.5">
          {r.guardName?.fullName || "—"}
          {r.role === "supervisor" && <ToneBadge tone="warn" dot={false}>{t('comun.supervisor')}</ToneBadge>}
          {r.role === "administrative" && <ToneBadge tone="info" dot={false}>Administrativo</ToneBadge>}
        </span>
      ),
    },
    { key: "station", header: "Puesto", render: (_v, r) => r.stationName?.stationName || (r.role === "supervisor" ? "Supervisión" : r.role === "administrative" ? "Oficina" : "—") },
    { key: "scheduledStart", header: "Programado", render: (_v, r) => `${fmtTime(r.scheduledStart)} – ${fmtTime(r.scheduledEnd)}` },
    {
      key: "punchInTime",
      header: "Entrada",
      render: (_v, r) => (
        <span>
          {fmtTime(r.punchInTime)}
          {Array.isArray(r.sessions) && r.sessions.length > 1 && (
            <span className="ml-1 text-[10px] font-medium tabular-nums" style={{ color: "var(--ink-faint)" }}>
              ·{r.sessions.length} sesiones
            </span>
          )}
        </span>
      ),
    },
    { key: "punchOutTime", header: "Salida", numeric: true, render: (_v, r) => fmtTime(r.punchOutTime) },
    /* `numeric` no es decoración: alinea la columna Y su cabecera a la derecha
       con `tabular-nums`, que es lo que deja las horas unas debajo de otras.
       Con `render` propio, DataTable ya no lo deduce solo. */
    { key: "hoursWorked", header: "Horas", numeric: true, render: (_v, r) => fmtHours(r.hoursWorked) },
    {
      key: "patrols",
      header: "Rondas",
      numeric: true,
      render: (_v, r) => (
        <span className="font-semibold tabular-nums" style={{ color: "var(--brand-text)" }}>{r.numberOfPatrolsDuringShift ?? 0}</span>
      ),
    },
    {
      key: "incidents",
      header: "Incidentes",
      numeric: true,
      render: (_v, r) =>
        (r.numberOfIncidentsDurindShift ?? 0) > 0 ? (
          <span className="font-bold tabular-nums" style={{ color: "var(--bad-text)" }}>
            {r.numberOfIncidentsDurindShift}
          </span>
        ) : (
          <span className="tabular-nums" style={{ color: "var(--ink-faint)" }}>0</span>
        ),
    },
    {
      key: "geo",
      header: "Ubicación",
      render: (_v, r) =>
        r.punchInOutsideGeofence ? (
          <ToneBadge tone="bad" dot={false}>
            <MapPin size={12} /> <span className="tabular-nums">Fuera ({r.punchInDistanceM ?? "?"} m)</span>
          </ToneBadge>
        ) : (
          <ToneBadge tone="ok" dot={false}>Dentro</ToneBadge>
        ),
    },
    {
      key: "status",
      header: "Estado",
      render: (_v, r) => <StatusBadge status={r.status} approval={r.approvalStatus} />,
    },
    {
      // LA APROBACIÓN, EN LA TABLA.
      //
      // Vivía SÓLO en el panel de detalle: había que abrir registro por registro
      // para saber si estaba aprobado. Como el estado (Tarde / En revisión) se
      // conserva a propósito después de aprobar —la nómina lo necesita—, la
      // lista daba a entender que aprobar no había hecho nada.
      key: "approvalStatus",
      header: "Aprobación",
      render: (_v, r) => <ApprovalBadge status={r.approvalStatus} />,
    },
  ];

  return (
    <AppLayout>
      <PageContainer width="wide" className="p-4 sm:p-6">
        <PageHeader
          icon={<ClipboardCheck />}
          title={t('ui.NominaRecords.registrosDeAsistencia')}
          subtitle="Marcaciones de entrada / salida"
          actions={
            <Button variant="outline" onClick={exportCsv} className="gap-2">
              <Download className="size-4" /> Exportar
            </Button>
          }
        />

        <Toolbar>
          {/* Período: Día / Semana / Mes */}
          <Segmented<Period>
            value={period}
            onChange={setPeriod}
            options={[
              { value: "day", label: "Día" },
              { value: "week", label: "Semana" },
              { value: "month", label: "Mes" },
            ]}
          />

          {/* Navegación de fecha */}
          <div className="glass-sunken inline-flex items-center gap-1 px-1.5 py-1">
            <button
              onClick={() => setAnchor((a) => shiftAnchor(period, a, -1))}
              className="cg-focus cg-btn-ghost rounded-full p-1"
              aria-label={t('kit.pagination.prev')}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              title="Ir a hoy"
              className="cg-focus min-w-[9rem] rounded-full px-2 text-center text-sm font-medium capitalize"
            >
              {rangeLabel(period, anchor)}
            </button>
            <button
              onClick={() => setAnchor((a) => shiftAnchor(period, a, +1))}
              className="cg-focus cg-btn-ghost rounded-full p-1"
              aria-label={t('kit.pagination.next')}
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
                <option key={s} value={s}>{s === "" ? "Todos los estados" : (STATUS_META[s]?.label ?? s)}</option>
              ))}
            </select>
          </label>

          {/* Filtro de departamento (solo si el tenant creó departamentos) */}
          {departments.length > 0 && (
            <label className="glass-sunken flex items-center gap-2 px-3 py-1.5">
              <Filter className="size-4" style={{ color: "var(--ink-faint)" }} />
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="cg-focus bg-transparent text-sm outline-none"
                style={{ color: "var(--ink)" }}
              >
                <option value="">{t('ui.NominaRecords.todosLosDepartamentos')}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          )}
        </Toolbar>

        <Section title="Marcaciones" icon={<ClipboardList />}>
          {!loading && (
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              <span><span className="font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{rows.length}</span> registro(s)</span>
              <span>Horas totales: <span className="font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{fmtHours(rows.reduce((sum, r) => sum + (Number(r.hoursWorked) || 0), 0))}</span></span>
              <span className="capitalize">{rangeLabel(period, anchor)}</span>
            </div>
          )}
          {loading ? (
            <SkeletonCards count={4} />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              onRowClick={(r) => {
                // Open immediately with the lean list row, then hydrate the full
                // record (selfie/photos/device) — the list no longer ships those blobs.
                setSelected(r);
                attendanceService.find(r.id).then(setSelected).catch(() => {});
              }}
              emptyState={
                <EmptyState
                  icon={<ClipboardList />}
                  title={t('comun.sinRegistros')}
                  description={t('ui.NominaRecords.noHayMarcacionesParaLos')}
                />
              }
            />
          )}
        </Section>
      </PageContainer>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.guardName?.fullName || "Vigilante"}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                {/* Clock-in selfie (geo-stamped by the worker app) + timestamp */}
                {(() => {
                  if (!selfieUrl) {
                    return (
                      <EmptyState icon={<ImageOff />} title={t('ui.NominaRecords.sinSelfieDeEntrada')} className="py-8" />
                    );
                  }
                  return (
                    <a
                      href={selfieUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src={selfieUrl}
                        alt="Selfie de entrada"
                        className="glass-flat w-full object-contain"
                      />
                      <p className="mt-1.5 text-center text-xs" style={{ color: "var(--ink-soft)" }}>
                        Entrada · {fmtDateTime(selected.punchInTime)}
                        {selected.punchInAddress ? ` · ${selected.punchInAddress}` : ""}
                      </p>
                    </a>
                  );
                })()}

                <div className="flex items-center justify-between">
                  <StatusBadge status={selected.status} approval={selected.approvalStatus} />
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-soft)" }}>
                    Aprobación: <ApprovalBadge status={selected.approvalStatus} />
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('comun.puesto')} value={selected.stationName?.stationName || "—"} />
                  <Field label="Horas" value={<span className="tabular-nums">{fmtHours(selected.hoursWorked)}</span>} />
                  <Field label="Programado" value={<span className="tabular-nums">{fmtDateTime(selected.scheduledStart)}</span>} />
                  <Field label="Fin programado" value={<span className="tabular-nums">{fmtDateTime(selected.scheduledEnd)}</span>} />
                  <Field label="Entrada" value={<span className="tabular-nums">{fmtDateTime(selected.punchInTime)}</span>} />
                  <Field label="Salida" value={<span className="tabular-nums">{fmtDateTime(selected.punchOutTime)}</span>} />
                  <Field label="Tarde (min)" value={<span className="tabular-nums">{selected.lateMinutes || 0}</span>} />
                  <Field label="Extra (min)" value={<span className="tabular-nums">{selected.overtimeMinutes || 0}</span>} />
                  {selected.shiftSchedule && (
                    <Field label={t('comun.turno')} value={selected.shiftSchedule} />
                  )}
                  <Field label="Rondas" value={<span className="tabular-nums">{selected.numberOfPatrolsDuringShift ?? 0}</span>} />
                  <Field label="Incidentes" value={<span className="tabular-nums">{selected.numberOfIncidentsDurindShift ?? 0}</span>} />
                </div>

                {selected.observations && (
                  <div>
                    <p className="cg-eyebrow">Observaciones</p>
                    <p className="glass-sunken mt-1 whitespace-pre-wrap p-3" style={{ color: "var(--ink)" }}>
                      {selected.observations}
                    </p>
                  </div>
                )}

                {/* Sessions — every clock in/out pair accumulated in this record */}
                {Array.isArray(selected.sessions) && selected.sessions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold">
                      Sesiones ({selected.sessions.length})
                    </p>
                    <div className="glass-flat divide-y overflow-hidden" style={{ borderColor: "var(--hairline)" }}>
                      {selected.sessions.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between px-3 py-2 text-xs"
                          style={{ borderColor: "var(--hairline)" }}
                        >
                          <span className="tabular-nums" style={{ color: "var(--ink-faint)" }}>#{i + 1}</span>
                          <span className="font-medium tabular-nums">
                            {fmtTime(s.in)} → {s.out ? fmtTime(s.out) : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Location on the map for BOTH punches, captured at clock-in and
                    clock-out. Each map is centered on the stored GPS of that punch. */}
                {((selected.punchInLatitude != null && selected.punchInLongitude != null) ||
                  (selected.punchOutLatitude != null && selected.punchOutLongitude != null)) && (
                  <div className="space-y-2">
                    <p className="cg-eyebrow">{t("ui.NominaRecords.ubicacion", "Ubicación")}</p>

                    {/* Clock-in location */}
                    {selected.punchInLatitude != null && selected.punchInLongitude != null && (
                      <div className="glass-flat overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--glass-sunken)" }}>
                          <span className="flex items-center gap-1.5">
                            <LogIn size={13} style={{ color: "var(--ok-text)" }} /> Entrada
                          </span>
                          <span className="font-normal tabular-nums" style={{ color: "var(--ink-soft)" }}>{fmtDateTime(selected.punchInTime)}</span>
                        </div>
                        {/* AHORRO · Revisar nómina es abrir registros en cadena, y
                            cada registro montaba DOS mapas dinámicos ($7/1.000 cada
                            carga): repasar 50 turnos eran 100 cargas facturadas para
                            comprobar de un vistazo si la marcación cayó dentro de la
                            geocerca. La imagen estática ($2/1.000) contesta esa misma
                            pregunta —el pin y el contorno de la geocerca se dibujan
                            igual— y el mapa de verdad sigue a un clic para el caso
                            raro en que haga falta mirar el entorno. */}
                        <StaticMapImage
                          lat={Number(selected.punchInLatitude)}
                          lng={Number(selected.punchInLongitude)}
                          zoom={16}
                          height="200px"
                          alt={t('ui.NominaRecords.ubicacionDeLaMarcacionDe')}
                          polygon={selected.stationName?.geofencePolygon || undefined}
                          radiusMeters={
                            !selected.stationName?.geofencePolygon && selected.stationName?.geofenceRadius
                              ? Number(selected.stationName.geofenceRadius)
                              : null
                          }
                        >
                          <GoogleMapEmbed
                            lat={Number(selected.punchInLatitude)}
                            lng={Number(selected.punchInLongitude)}
                            zoom={16}
                            height="200px"
                            showGeofence={!selected.stationName?.geofencePolygon && !!selected.stationName?.geofenceRadius}
                            geofenceRadius={selected.stationName?.geofenceRadius || 100}
                            polygon={selected.stationName?.geofencePolygon || undefined}
                            markers={[
                              { id: "in", lat: Number(selected.punchInLatitude), lng: Number(selected.punchInLongitude), label: "Entrada" },
                            ]}
                          />
                        </StaticMapImage>
                        {selected.punchInOutsideGeofence && (
                          <p
                            className="px-3 py-2 text-xs font-medium"
                            style={{ background: "color-mix(in oklab, var(--bad) 12%, transparent)", color: "var(--bad-text)" }}
                          >
                            Marcación fuera de geocerca · {selected.punchInDistanceM ?? "?"} m del puesto
                          </p>
                        )}
                      </div>
                    )}

                    {/* Clock-out location */}
                    {selected.punchOutLatitude != null && selected.punchOutLongitude != null ? (
                      <div className="glass-flat overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--glass-sunken)" }}>
                          <span className="flex items-center gap-1.5">
                            <LogOut size={13} style={{ color: "var(--warn-text)" }} /> Salida
                          </span>
                          <span className="font-normal tabular-nums" style={{ color: "var(--ink-soft)" }}>{fmtDateTime(selected.punchOutTime)}</span>
                        </div>
                        <StaticMapImage
                          lat={Number(selected.punchOutLatitude)}
                          lng={Number(selected.punchOutLongitude)}
                          zoom={16}
                          height="200px"
                          alt={t('ui.NominaRecords.ubicacionDeLaMarcacionDe')}
                          polygon={selected.stationName?.geofencePolygon || undefined}
                          radiusMeters={
                            !selected.stationName?.geofencePolygon && selected.stationName?.geofenceRadius
                              ? Number(selected.stationName.geofenceRadius)
                              : null
                          }
                        >
                          <GoogleMapEmbed
                            lat={Number(selected.punchOutLatitude)}
                            lng={Number(selected.punchOutLongitude)}
                            zoom={16}
                            height="200px"
                            showGeofence={!selected.stationName?.geofencePolygon && !!selected.stationName?.geofenceRadius}
                            geofenceRadius={selected.stationName?.geofenceRadius || 100}
                            polygon={selected.stationName?.geofencePolygon || undefined}
                            markers={[
                              { id: "out", lat: Number(selected.punchOutLatitude), lng: Number(selected.punchOutLongitude), label: "Salida" },
                            ]}
                          />
                        </StaticMapImage>
                      </div>
                    ) : selected.punchOutTime ? (
                      <EmptyState title={t("ui.NominaRecords.salidaSinUbicacion", "Salida sin ubicación")} description={t("ui.NominaRecords.marcacionAutomaticaOGpsNo", "Marcación automática o GPS no disponible.")} className="py-6" />
                    ) : null}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {selected.role === "supervisor" || selected.role === "administrative" ? (
                    <p className="w-full text-xs" style={{ color: "var(--ink-soft)" }}>
                      {selected.role === "administrative"
                        ? "Registro administrativo — sin flujo de aprobación."
                        : "Registro de supervisor — sin flujo de aprobación."}
                    </p>
                  ) : (
                    <>
                      {/* Approval is only meaningful when the punch actually needs
                          review (outside geofence → pending_review, or a request left
                          it pending) or was already decided (so it can be reversed). A
                          normal on-time / in-geofence punch needs no approval — showing
                          an "Aprobar" button there was the source of confusion. */}
                      {(() => {
                        const needsReview =
                          selected.status === "pending_review" || selected.approvalStatus === "pending";
                        const wasDecided =
                          selected.approvalStatus === "approved" || selected.approvalStatus === "rejected";
                        if (!needsReview && !wasDecided) {
                          return (
                            <p className="w-full text-xs" style={{ color: "var(--ink-soft)" }}>
                              Sin aprobación requerida — marcación válida.
                            </p>
                          );
                        }
                        return (
                          <>
                            {wasDecided ? (
                              <p className="w-full text-xs" style={{ color: "var(--ink-soft)" }}>
                                {selected.approvalStatus === "approved" ? "Aprobado" : "Rechazado"}
                                {(selected as AttendanceRecord & { approvedAt?: string }).approvedAt ? ` · ${fmtDateTime((selected as AttendanceRecord & { approvedAt?: string }).approvedAt)}` : ""}
                                {" — puedes cambiar la decisión."}
                              </p>
                            ) : (
                              <p className="w-full text-xs font-medium" style={{ color: "var(--warn-text)" }}>
                                {selected.punchInOutsideGeofence
                                  ? "Marcación fuera de la geocerca — requiere aprobación."
                                  : "Marcación pendiente de revisión."}
                              </p>
                            )}
                            {selected.approvalStatus !== "approved" && (
                              <Button
                                disabled={busy}
                                onClick={() => act(() => attendanceService.approve(selected.id), "Aprobado")}
                              >
                                Aprobar
                              </Button>
                            )}
                            {selected.approvalStatus !== "rejected" && (
                              <Button
                                disabled={busy}
                                variant="outline"
                                onClick={() => act(() => attendanceService.reject(selected.id), "Rechazado")}
                              >
                                Rechazar
                              </Button>
                            )}
                          </>
                        );
                      })()}
                      <Button
                        disabled={busy}
                        variant="outline"
                        onClick={async () => {
                          const reason = await promptDialog({ title: "Motivo de la corrección", placeholder: "Ej.: marcó tarde por el tráfico" });
                          if (!reason) return;
                          const value = await promptDialog({ title: "Nueva hora de entrada", message: "Formato ISO, ej. 2026-06-06T13:00:00Z", defaultValue: selected.punchInTime });
                          if (!value) return;
                          act(
                            () => attendanceService.correct(selected.id, { field: "punchInTime", correctedValue: value, reason }),
                            "Corrección enviada",
                          );
                        }}
                      >
                        Corregir
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
