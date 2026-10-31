import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, LogIn, LogOut, PencilLine, Inbox } from "lucide-react";

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
} from "@/components/kit";
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
    ]).finally(() => {
      if (!opts?.silent) setLoading(false);
    });
  }, []);

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
      render: (_v, r) => (
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
      render: (_v, r) => (
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
      render: (_v, r) => (
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
                  ciRows.length + coRows.length + rows.length > 0
                    ? "warn"
                    : "ok"
                }
              >
                {ciRows.length + coRows.length + rows.length > 0
                  ? t("ui.NominaApprovals.enEspera", {
                      count: ciRows.length + coRows.length + rows.length,
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

        {loading ? (
          <SkeletonCards count={6} />
        ) : (
          <div className="space-y-6">
            {/* Late clock-in requests */}
            <Section
              action={
                ciRows.length > 0 && (
                  <StatusBadge dot={false} tone="warn">
                    {t("ui.NominaApprovals.pendientes", {
                      count: ciRows.length,
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
              <DataTable
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
                coRows.length > 0 && (
                  <StatusBadge dot={false} tone="warn">
                    {t("ui.NominaApprovals.pendientes", {
                      count: coRows.length,
                      defaultValue: "{{count}} pendiente(s)",
                    })}
                  </StatusBadge>
                )
              }
              icon={<LogOut />}
              title={t("ui.NominaApprovals.salidasAnticipadas", "Salidas anticipadas")}
            >
              <DataTable
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
                rows.length > 0 && (
                  <StatusBadge dot={false} tone="brand">
                    {t("ui.NominaApprovals.pendientes", {
                      count: rows.length,
                      defaultValue: "{{count}} pendiente(s)",
                    })}
                  </StatusBadge>
                )
              }
              icon={<PencilLine />}
              title={t("ui.NominaApprovals.correccionesManuales", "Correcciones manuales")}
            >
              <DataTable
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
