import { useEffect, useState, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import attendanceService from "@/lib/api/attendanceService";
import { fmtDateTime } from "./shared";
import { PageContainer, PageHeader, Section, StatusBadge, EmptyState, SkeletonCards } from "@/components/kit";
import { CheckCircle2, LogIn, LogOut, PencilLine, Inbox } from "lucide-react";

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
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [coRows, setCoRows] = useState<ClockOutReqRow[]>([]);
  const [ciRows, setCiRows] = useState<ClockInReqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    Promise.all([
      attendanceService
        .corrections({ "filter[status]": "pending", limit: 100 })
        .then((r) => setRows(r.rows || []))
        .catch(() => {}),
      attendanceService
        .clockOutRequests({ status: "pending", limit: 100 })
        .then((r) => setCoRows(r.rows || []))
        .catch(() => {}),
      attendanceService
        .clockInRequests({ status: "pending", limit: 100 })
        .then((r) => setCiRows(r.rows || []))
        .catch(() => {}),
    ]).finally(() => { if (!opts?.silent) setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  // Live queue: the guard app polls its request every 6s, but this page used to
  // load only on mount — a supervisor sitting here never saw newly-arriving
  // requests. Refresh silently every 30s (no spinner, no flicker).
  useEffect(() => {
    const t = setInterval(() => load({ silent: true }), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setBusy(true);
    try {
      await attendanceService.approveCorrection(id, { decision });
      toast.success(decision === "approved" ? "Corrección aplicada" : "Corrección rechazada");
      load();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const decideClockOut = async (id: string, status: "approved" | "rejected") => {
    setBusy(true);
    try {
      await attendanceService.decideClockOutRequest(id, { status });
      toast.success(status === "approved" ? "Salida aprobada" : "Salida rechazada");
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
      await attendanceService.decideClockInRequest(id, { status });
      toast.success(status === "approved" ? "Entrada aprobada" : "Entrada rechazada");
      load();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const ciColumns: Column<ClockInReqRow>[] = [
    { key: "guard", header: "Vigilante", render: (_v, r) => <span className="font-semibold">{r.guard?.fullName || "—"}</span> },
    { key: "station", header: "Puesto", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.station?.stationName || "—"}</span> },
    { key: "scheduledStart", header: "Inicio de turno", render: (_v, r) => (
      r.scheduledStart
        ? <span className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>{fmtDateTime(r.scheduledStart)}</span>
        : <span className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>{fmtDateTime(r.createdAt)} <span className="opacity-60">{t('ui.NominaApprovals.sinTurnoProgramado')}</span></span>
    ) },
    { key: "lateBy", header: "Retraso", render: (_v, r) => <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--warn-text)" }}>{lateBy(r.scheduledStart, r.createdAt)}</span> },
    { key: "reason", header: "Motivo", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.reason || "—"}</span> },
    { key: "createdAt", header: "Solicitado", render: (_v, r) => fmtDateTime(r.createdAt) },
    {
      key: "actions",
      header: "",
      render: (_v, r) => (
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => decideClockIn(r.id, "approved")}>
            Aprobar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decideClockIn(r.id, "rejected")}>
            Rechazar
          </Button>
        </div>
      ),
    },
  ];

  const coColumns: Column<ClockOutReqRow>[] = [
    { key: "guard", header: "Vigilante", render: (_v, r) => <span className="font-semibold">{r.guard?.fullName || "—"}</span> },
    { key: "station", header: "Puesto", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.station?.stationName || "—"}</span> },
    { key: "scheduledEnd", header: "Fin de turno", render: (_v, r) => <span className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>{r.scheduledEnd ? fmtDateTime(r.scheduledEnd) : "—"}</span> },
    { key: "reason", header: "Motivo", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.reason || "—"}</span> },
    { key: "createdAt", header: "Solicitado", render: (_v, r) => fmtDateTime(r.createdAt) },
    {
      key: "actions",
      header: "",
      render: (_v, r) => (
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => decideClockOut(r.id, "approved")}>
            Aprobar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decideClockOut(r.id, "rejected")}>
            Rechazar
          </Button>
        </div>
      ),
    },
  ];

  const columns: Column<CorrectionRow>[] = [
    { key: "field", header: "Campo" },
    { key: "originalValue", header: "Original", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.originalValue || "—"}</span> },
    { key: "correctedValue", header: "Corregido", render: (_v, r) => <span className="text-xs font-semibold tabular-nums">{r.correctedValue || "—"}</span> },
    { key: "reason", header: "Motivo", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.reason}</span> },
    { key: "createdAt", header: "Solicitado", render: (_v, r) => fmtDateTime(r.createdAt) },
    {
      key: "actions",
      header: "",
      render: (_v, r) => (
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => decide(r.id, "approved")}>
            Aprobar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(r.id, "rejected")}>
            Rechazar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageContainer width="wide" className="p-4 sm:p-6">
        <PageHeader
          icon={<CheckCircle2 />}
          title="Aprobaciones"
          subtitle={t('ui.NominaApprovals.entradasTardiasSalidasAnticipadasY')}
          badges={
            !loading && (
              <StatusBadge tone={ciRows.length + coRows.length + rows.length > 0 ? "warn" : "ok"}>
                {ciRows.length + coRows.length + rows.length > 0
                  ? `${ciRows.length + coRows.length + rows.length} en espera`
                  : "Todo al día"}
              </StatusBadge>
            )
          }
        />

        {loading ? (
          <SkeletonCards count={6} />
        ) : (
          <div className="space-y-6">
            {/* Late clock-in requests */}
            <Section
              title={t("ui.NominaApprovals.entradasTardias", "Entradas tardías")}
              icon={<LogIn />}
              action={ciRows.length > 0 && <StatusBadge tone="warn" dot={false}>{ciRows.length} pendiente(s)</StatusBadge>}
            >
              <DataTable
                columns={ciColumns}
                data={ciRows}
                emptyState={
                  <EmptyState
                    icon={<Inbox />}
                    title={t("ui.NominaApprovals.sinSolicitudesDeEntradaTardia", "Sin solicitudes de entrada tardía")}
                    description={t('ui.NominaApprovals.lasSolicitudesDeEntradaFuera')}
                  />
                }
              />
            </Section>

            {/* Early clock-out requests */}
            <Section
              title="Salidas anticipadas"
              icon={<LogOut />}
              action={coRows.length > 0 && <StatusBadge tone="warn" dot={false}>{coRows.length} pendiente(s)</StatusBadge>}
            >
              <DataTable
                columns={coColumns}
                data={coRows}
                emptyState={
                  <EmptyState
                    icon={<Inbox />}
                    title={t('ui.NominaApprovals.sinSolicitudesDeSalidaAnticipada')}
                    description={t('ui.NominaApprovals.lasSolicitudesDeSalidaAntes')}
                  />
                }
              />
            </Section>

            {/* Manual corrections */}
            <Section
              title="Correcciones manuales"
              icon={<PencilLine />}
              action={rows.length > 0 && <StatusBadge tone="brand" dot={false}>{rows.length} pendiente(s)</StatusBadge>}
            >
              <DataTable
                columns={columns}
                data={rows}
                emptyState={
                  <EmptyState
                    icon={<Inbox />}
                    title={t('ui.NominaApprovals.sinCorreccionesPendientes')}
                    description={t('ui.NominaApprovals.lasCorreccionesDeMarcacionesEnviadas')}
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
