import { usePuede } from "@/hooks/usePuede";
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, LogIn, LogOut, PencilLine, Inbox, Users, MapPin } from "lucide-react";

import { fmtDateTime } from "./shared";

import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import attendanceService from "@/lib/api/attendanceService";
import {
  PageContainer,
  PageHeader,
  Section,
  StatusBadge,
  EmptyState,
  SkeletonCards,
  Pagination,
  Toolbar,
} from "@/components/kit";
import type { TipoDeDecision } from "@/lib/api/attendanceService";
import { SelectorDeFiltro, avisarLote, useFiltrosDeAsistencia, useOpcionesDeFiltro } from "./filtrosAsistencia";

/** Page size of each queue (the server pages; nothing is cut at 100). */
const POR_COLA = 50;

interface Cola<T> {
  rows: T[];
  total: number;
  page: number;
  error: string | null;
}
const colaVacia = <T,>(): Cola<T> => ({ rows: [], total: 0, page: 1, error: null });
import { useSondeoVisible } from "@/hooks/useSondeoVisible";

interface CorrectionRow {
  id: string;
  field: string;
  originalValue: string | null;
  correctedValue: string | null;
  reason: string;
  status: string;
  createdAt: string;
}

interface ClockOutReqRow {
  id: string;
  reason: string | null;
  scheduledEnd: string | null;
  createdAt: string;
  guard?: { fullName?: string } | null;
  station?: { stationName?: string } | null;
}

interface ClockInReqRow {
  id: string;
  status: string;
  reason: string | null;
  scheduledStart: string | null;
  createdAt: string;
  expiresAt: string | null;
  decisionNotes: string | null;
  guard?: { id?: string; fullName?: string } | null;
  station?: { id?: string; stationName?: string } | null;
}

// How late (in minutes) the request was made relative to the scheduled start.
function lateBy(scheduledStart: string | null, createdAt: string): string {
  if (!scheduledStart) return "—";
  const start = new Date(scheduledStart).getTime();
  const made = new Date(createdAt).getTime();

  if (Number.isNaN(start) || Number.isNaN(made)) return "—";
  const mins = Math.round((made - start) / 60000);

  if (mins <= 0) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;

  return m ? `${h} h ${m} min` : `${h} h`;
}

export default function NominaApprovals() {
  const { t } = useTranslation();
  const aprobar = usePuede("asistencia.aprobarSolicitud");
  const [f, setF] = useFiltrosDeAsistencia();
  const opciones = useOpcionesDeFiltro();
  const [corr, setCorr] = useState<Cola<CorrectionRow>>(colaVacia);
  const [co, setCo] = useState<Cola<ClockOutReqRow>>(colaVacia);
  const [ci, setCi] = useState<Cola<ClockInReqRow>>(colaVacia);
  const rows = corr.rows;
  const coRows = co.rows;
  const ciRows = ci.rows;
  const [paginas, setPaginas] = useState({ corr: 1, co: 1, ci: 1 });
  const [sel, setSel] = useState<{ corr: string[]; co: string[]; ci: string[] }>({ corr: [], co: [], ci: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const filtro = { guardId: f.guard || undefined, stationId: f.station || undefined };
    const leer = <T,>(
      pedir: () => Promise<any>,
      poner: (c: Cola<T>) => void,
      page: number,
    ) =>
      pedir()
        .then((r) => poner({ rows: r?.rows || [], total: Number(r?.count) || 0, page, error: null }))
        // A queue that failed says so; it never reads as «todo al día».
        .catch((e) => poner({ rows: [], total: 0, page, error: e?.message || t("ui.Asistencia.noSeCargo", "No se pudo cargar") }));

    Promise.all([
      leer<CorrectionRow>(
        () => attendanceService.corrections({
          "filter[status]": "pending",
          "filter[guardId]": filtro.guardId,
          "filter[stationId]": filtro.stationId,
          limit: POR_COLA,
          offset: (paginas.corr - 1) * POR_COLA,
        }),
        setCorr,
        paginas.corr,
      ),
      leer<ClockOutReqRow>(
        () => attendanceService.clockOutRequests({ status: "pending", ...filtro, limit: POR_COLA, offset: (paginas.co - 1) * POR_COLA }),
        setCo,
        paginas.co,
      ),
      leer<ClockInReqRow>(
        () => attendanceService.clockInRequests({ status: "pending", ...filtro, limit: POR_COLA, offset: (paginas.ci - 1) * POR_COLA }),
        setCi,
        paginas.ci,
      ),
    ]).finally(() => {
      if (!opts?.silent) setLoading(false);
    });
  }, [f.guard, f.station, paginas]);

  useEffect(() => setSel({ corr: [], co: [], ci: [] }), [f.guard, f.station, paginas]);

  /** Approve or reject everything selected in one queue, each on its own. */
  const decidirSeleccion = async (cola: "corr" | "co" | "ci", accion: "approve" | "reject") => {
    const ids = sel[cola];
    if (!ids.length) return;
    const kind: TipoDeDecision = cola === "corr" ? "correction" : cola === "co" ? "clockOut" : "clockIn";
    setBusy(true);
    try {
      const r = await attendanceService.decisions(ids.map((id) => ({ kind, id, action: accion })));
      avisarLote(t, r);
      setSel((p) => ({ ...p, [cola]: [] }));
      load();
    } catch (e: any) {
      toast.error(e?.message || t("ui.Asistencia.lote.error", "error"));
    } finally {
      setBusy(false);
    }
  };

  /** Selection props + batch bar + pager of one queue's table. */
  const tablaDe = <T extends { id: string }>(cola: "corr" | "co" | "ci", c: Cola<T>) => ({
    ...(aprobar.puede
      ? {
          selectedIds: sel[cola],
          onSelectOne: (id: string, checked: boolean) =>
            setSel((p) => ({ ...p, [cola]: checked ? [...p[cola], id] : p[cola].filter((x) => x !== id) })),
          onSelectAll: (checked: boolean) => setSel((p) => ({ ...p, [cola]: checked ? c.rows.map((r) => r.id) : [] })),
          toolbar:
            sel[cola].length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {t("ui.NominaRecords.seleccionadas", { count: sel[cola].length, defaultValue: "{{count}} seleccionada(s)" })}
                </span>
                <Button disabled={busy} size="sm" onClick={() => decidirSeleccion(cola, "approve")}>
                  {t("ui.DocumentPacketPublic.approveButton", "Aprobar")}
                </Button>
                <Button disabled={busy} size="sm" variant="outline" onClick={() => decidirSeleccion(cola, "reject")}>
                  {t("revision.rechazar", "Rechazar")}
                </Button>
              </div>
            ) : undefined,
        }
      : {}),
    footer:
      c.total > POR_COLA ? (
        <Pagination
          page={c.page}
          pageSize={POR_COLA}
          total={c.total}
          onPageChange={(n) => setPaginas((p) => ({ ...p, [cola]: n }))}
        />
      ) : undefined,
  });

  const avisoDeError = (c: Cola<unknown>) =>
    c.error ? (
      <div
        className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
        role="alert"
        style={{ background: "color-mix(in oklab, var(--bad) 12%, transparent)", color: "var(--bad-text)" }}
      >
        <span>{c.error}</span>
        <Button size="sm" variant="outline" onClick={() => load()}>
          {t("ui.Asistencia.reintentar", "Reintentar")}
        </Button>
      </div>
    ) : null;

  useEffect(() => {
    load();
  }, [load]);

  // Live queue: the guard app polls its request every 6s, but this page used to
  // load only on mount — a supervisor sitting here never saw newly-arriving
  // requests. Refresh silently every 30s (no spinner, no flicker).
  //
  // Sólo con la pestaña a la vista: cada tic son TRES peticiones (correcciones,
  // entradas y salidas pendientes), así que una pantalla de aprobaciones dejada
  // abierta toda la noche eran 8.640 peticiones que no miraba nadie.
  useSondeoVisible(() => load({ silent: true }), 30_000);

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setBusy(true);
    try {
      await attendanceService.approveCorrection(id, { decision });
      toast.success(
        decision === "approved"
          ? t("ui.NominaApprovals.correccionAplicada", "Corrección aplicada")
          : t("ui.NominaApprovals.correccionRechazada", "Corrección rechazada"),
      );
      load();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const decideClockOut = async (
    id: string,
    status: "approved" | "rejected",
  ) => {
    setBusy(true);
    try {
      await attendanceService.decideClockOutRequest(id, { status });
      toast.success(
        status === "approved"
          ? t("ui.NominaApprovals.salidaAprobada", "Salida aprobada")
          : t("ui.NominaApprovals.salidaRechazada", "Salida rechazada"),
      );
      load();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const decideClockIn = async (id: string, status: "approved" | "rejected") => {
    setBusy(true);
    try {
      const r: any = await attendanceService.decideClockInRequest(id, {
        status,
      });

      if (status !== "approved") {
        toast.success(t("ui.NominaApprovals.entradaRechazada", "Entrada rechazada"));
      } else if (r?.autoClockIn?.registrada) {
        // Aprobar YA registra la entrada con la selfie y el GPS que el vigilante
        // tomó al llegar. Decirlo importa: quien aprueba tiene que saber si el
        // turno quedó abierto o si la persona todavía tiene que marcar.
        toast.success(
          t(
            "ui.NominaApprovals.entradaAprobadaYRegistrada",
            "Entrada aprobada y registrada — el vigilante ya está en turno",
          ),
        );
      } else {
        toast.success(
          t(
            "ui.NominaApprovals.entradaAprobadaElVigilanteDebeMarcar",
            "Entrada aprobada. El vigilante debe marcar su entrada en la app",
          ),
        );
      }
      load();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const ciColumns: Column<ClockInReqRow>[] = [
    {
      key: "guard",
      header: t("dashboard.table.headers.guard", "Vigilante"),
      render: (_v, r) => (
        <span className="font-semibold">{r.guard?.fullName || "—"}</span>
      ),
    },
    {
      key: "station",
      header: t("incidents.columns.postSite", "Puesto"),
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.station?.stationName || "—"}
        </span>
      ),
    },
    {
      key: "scheduledStart",
      header: t("ui.NominaApprovals.inicioDeTurno", "Inicio de turno"),
      render: (_v, r) =>
        r.scheduledStart ? (
          <span
            className="text-xs tabular-nums"
            style={{ color: "var(--ink-soft)" }}
          >
            {fmtDateTime(r.scheduledStart)}
          </span>
        ) : (
          <span
            className="text-xs tabular-nums"
            style={{ color: "var(--ink-soft)" }}
          >
            {fmtDateTime(r.createdAt)}{" "}
            <span className="opacity-60">
              {t("ui.NominaApprovals.sinTurnoProgramado")}
            </span>
          </span>
        ),
    },
    {
      key: "lateBy",
      header: t("ui.NominaApprovals.retraso", "Retraso"),
      render: (_v, r) => (
        <span
          className="text-xs font-semibold tabular-nums"
          style={{ color: "var(--warn-text)" }}
        >
          {lateBy(r.scheduledStart, r.createdAt)}
        </span>
      ),
    },
    {
      key: "reason",
      header: t("comun.motivo", "Motivo"),
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.reason || "—"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: t("ui.NominaApprovals.solicitado", "Solicitado"),
      render: (_v, r) => fmtDateTime(r.createdAt),
    },
    {
      key: "actions",
      header: "",
      // Only who can decide sees the buttons (lib/reglasDeAcciones).
      render: (_v, r) => !aprobar.puede ? (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }} title={aprobar.porQueNo}>
          {t("ui.puede.soloLectura", "Solo lectura")}
        </span>
      ) : (
        <div className="flex gap-2">
          <Button
            disabled={busy}
            size="sm"
            onClick={() => decideClockIn(r.id, "approved")}
          >
            {t("ui.DocumentPacketPublic.approveButton", "Aprobar")}
          </Button>
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={() => decideClockIn(r.id, "rejected")}
          >
            {t("revision.rechazar", "Rechazar")}
          </Button>
        </div>
      ),
    },
  ];

  const coColumns: Column<ClockOutReqRow>[] = [
    {
      key: "guard",
      header: t("dashboard.table.headers.guard", "Vigilante"),
      render: (_v, r) => (
        <span className="font-semibold">{r.guard?.fullName || "—"}</span>
      ),
    },
    {
      key: "station",
      header: t("incidents.columns.postSite", "Puesto"),
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.station?.stationName || "—"}
        </span>
      ),
    },
    {
      key: "scheduledEnd",
      header: t("ui.NominaApprovals.finDeTurno", "Fin de turno"),
      render: (_v, r) => (
        <span
          className="text-xs tabular-nums"
          style={{ color: "var(--ink-soft)" }}
        >
          {r.scheduledEnd ? fmtDateTime(r.scheduledEnd) : "—"}
        </span>
      ),
    },
    {
      key: "reason",
      header: t("comun.motivo", "Motivo"),
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.reason || "—"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: t("ui.NominaApprovals.solicitado", "Solicitado"),
      render: (_v, r) => fmtDateTime(r.createdAt),
    },
    {
      key: "actions",
      header: "",
      // Only who can decide sees the buttons (lib/reglasDeAcciones).
      render: (_v, r) => !aprobar.puede ? (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }} title={aprobar.porQueNo}>
          {t("ui.puede.soloLectura", "Solo lectura")}
        </span>
      ) : (
        <div className="flex gap-2">
          <Button
            disabled={busy}
            size="sm"
            onClick={() => decideClockOut(r.id, "approved")}
          >
            {t("ui.DocumentPacketPublic.approveButton", "Aprobar")}
          </Button>
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={() => decideClockOut(r.id, "rejected")}
          >
            {t("revision.rechazar", "Rechazar")}
          </Button>
        </div>
      ),
    },
  ];

  const columns: Column<CorrectionRow>[] = [
    { key: "field", header: t("ui.NominaApprovals.campo", "Campo") },
    {
      key: "originalValue",
      header: t("ui.NominaApprovals.original", "Original"),
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.originalValue || "—"}
        </span>
      ),
    },
    {
      key: "correctedValue",
      header: t("ui.NominaApprovals.corregido", "Corregido"),
      render: (_v, r) => (
        <span className="text-xs font-semibold tabular-nums">
          {r.correctedValue || "—"}
        </span>
      ),
    },
    {
      key: "reason",
      header: t("comun.motivo", "Motivo"),
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.reason}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: t("ui.NominaApprovals.solicitado", "Solicitado"),
      render: (_v, r) => fmtDateTime(r.createdAt),
    },
    {
      key: "actions",
      header: "",
      // Only who can decide sees the buttons (lib/reglasDeAcciones).
      render: (_v, r) => !aprobar.puede ? (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }} title={aprobar.porQueNo}>
          {t("ui.puede.soloLectura", "Solo lectura")}
        </span>
      ) : (
        <div className="flex gap-2">
          <Button
            disabled={busy}
            size="sm"
            onClick={() => decide(r.id, "approved")}
          >
            {t("ui.DocumentPacketPublic.approveButton", "Aprobar")}
          </Button>
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={() => decide(r.id, "rejected")}
          >
            {t("revision.rechazar", "Rechazar")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          badges={
            !loading && (
              <StatusBadge
                tone={
                  ci.error || co.error || corr.error
                    ? "bad"
                    : ci.total + co.total + corr.total > 0
                      ? "warn"
                      : "ok"
                }
              >
                {ci.error || co.error || corr.error
                  ? t("ui.Asistencia.noSeCargo", "No se pudo cargar")
                  : ci.total + co.total + corr.total > 0
                    ? t("ui.NominaApprovals.enEspera", {
                        count: ci.total + co.total + corr.total,
                        defaultValue: "{{count}} en espera",
                      })
                    : t("ui.NominaApprovals.todoAlDia", "Todo al día")}
              </StatusBadge>
            )
          }
          icon={<CheckCircle2 />}
          subtitle={t("ui.NominaApprovals.entradasTardiasSalidasAnticipadasY")}
          title={t("sidebar.asistencia.aprobaciones", "Aprobaciones")}
        />

        <Toolbar>
          <SelectorDeFiltro
            ariaLabel={t("comun.vigilante", "Vigilante")}
            icono={<Users className="size-4" style={{ color: "var(--ink-faint)" }} />}
            options={opciones.guards}
            todos={t("ui.NominaRecords.todosLosTrabajadores", "Todos los trabajadores")}
            value={f.guard}
            onChange={(v) => {
              setPaginas({ corr: 1, co: 1, ci: 1 });
              setF({ guard: v });
            }}
          />
          <SelectorDeFiltro
            ariaLabel={t("comun.estacion", "Estación")}
            icono={<MapPin className="size-4" style={{ color: "var(--ink-faint)" }} />}
            options={opciones.stations}
            todos={t("ui.Asistencia.todosLosPuestos", "Todas las estaciones")}
            value={f.station}
            onChange={(v) => {
              setPaginas({ corr: 1, co: 1, ci: 1 });
              setF({ station: v });
            }}
          />
        </Toolbar>

        {loading ? (
          <SkeletonCards count={6} />
        ) : (
          <div className="space-y-6">
            {/* Late clock-in requests */}
            <Section
              action={
                ci.total > 0 && (
                  <StatusBadge dot={false} tone="warn">
                    {t("ui.NominaApprovals.pendientes", {
                      count: ci.total,
                      defaultValue: "{{count}} pendiente(s)",
                    })}
                  </StatusBadge>
                )
              }
              icon={<LogIn />}
              title={t(
                "ui.NominaApprovals.entradasTardias",
                "Entradas tardías",
              )}
            >
              {avisoDeError(ci)}
              <DataTable
                {...tablaDe("ci", ci)}
                columns={ciColumns}
                data={ciRows}
                emptyState={
                  <EmptyState
                    description={t(
                      "ui.NominaApprovals.lasSolicitudesDeEntradaFuera",
                    )}
                    icon={<Inbox />}
                    title={t(
                      "ui.NominaApprovals.sinSolicitudesDeEntradaTardia",
                      "Sin solicitudes de entrada tardía",
                    )}
                  />
                }
              />
            </Section>

            {/* Early clock-out requests */}
            <Section
              action={
                co.total > 0 && (
                  <StatusBadge dot={false} tone="warn">
                    {t("ui.NominaApprovals.pendientes", {
                      count: co.total,
                      defaultValue: "{{count}} pendiente(s)",
                    })}
                  </StatusBadge>
                )
              }
              icon={<LogOut />}
              title={t("ui.NominaApprovals.salidasAnticipadas", "Salidas anticipadas")}
            >
              {avisoDeError(co)}
              <DataTable
                {...tablaDe("co", co)}
                columns={coColumns}
                data={coRows}
                emptyState={
                  <EmptyState
                    description={t(
                      "ui.NominaApprovals.lasSolicitudesDeSalidaAntes",
                    )}
                    icon={<Inbox />}
                    title={t(
                      "ui.NominaApprovals.sinSolicitudesDeSalidaAnticipada",
                    )}
                  />
                }
              />
            </Section>

            {/* Manual corrections */}
            <Section
              action={
                corr.total > 0 && (
                  <StatusBadge dot={false} tone="brand">
                    {t("ui.NominaApprovals.pendientes", {
                      count: corr.total,
                      defaultValue: "{{count}} pendiente(s)",
                    })}
                  </StatusBadge>
                )
              }
              icon={<PencilLine />}
              title={t("ui.NominaApprovals.correccionesManuales", "Correcciones manuales")}
            >
              {avisoDeError(corr)}
              <DataTable
                {...tablaDe("corr", corr)}
                columns={columns}
                data={rows}
                emptyState={
                  <EmptyState
                    description={t(
                      "ui.NominaApprovals.lasCorreccionesDeMarcacionesEnviadas",
                    )}
                    icon={<Inbox />}
                    title={t("ui.NominaApprovals.sinCorreccionesPendientes")}
                  />
                }
              />
            </Section>
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}
