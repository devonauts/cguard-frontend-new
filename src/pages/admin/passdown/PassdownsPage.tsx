import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ClipboardSignature, Repeat } from "lucide-react";

import PassdownDetailModal from "./PassdownDetailModal";
import FiltroDePuesto, { type PuestoElegido } from "./FiltroDePuesto";
import {
  EstadoDelPase,
  SalienteEstabaBadge,
  fmtPase,
  horaDeAceptacion,
  horaDeEntrega,
  metodoDeEntrada,
  quienEntregaYRecibe,
} from "./paseDeTurno";

import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  StatusBadge,
  EmptyState,
  Segmented,
} from "@/components/kit";
import passdownService, {
  type Passdown,
  type PassdownStatus,
} from "@/lib/api/passdownService";

export default function PassdownsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Passdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PassdownStatus | "all">("all");

  /* El puesto va en la URL (`?stationId=…&station=…`): así la pestaña de la
     estación, un aviso o un enlace compartido pueden abrir la página ya
     filtrada, y recargar no lo pierde. */
  const [params, setParams] = useSearchParams();
  const stationId = params.get("stationId") || "";
  const puesto: PuestoElegido | null = stationId
    ? { id: stationId, label: params.get("station") || stationId }
    : null;
  const elegirPuesto = (p: PuestoElegido | null) => {
    const next = new URLSearchParams(params);

    if (p) {
      next.set("stationId", p.id);
      next.set("station", p.label);
    } else {
      next.delete("stationId");
      next.delete("station");
    }
    setParams(next, { replace: true });
  };

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    passdownService
      .list({
        status: filter === "all" ? undefined : filter,
        stationId: stationId || undefined,
        limit: 200,
      })
      .then((r) => setRows(r.rows || []))
      .catch((e: any) =>
        toast.error(
          e?.message ||
            t(
              "passdown.loadError",
              "No se pudieron cargar los pases de turno",
            ),
        ),
      )
      .finally(() => setLoading(false));
  }, [filter, stationId]);
  useEffect(load, [load]);

  const openDetail = (row: Passdown) => {
    setDetailId(row.id);
    setDetailOpen(true);
  };

  const filtros: Array<{ key: PassdownStatus | "all"; label: string }> = [
    { key: "all", label: t("passdown.status.all", "Todos") },
    { key: "open", label: t("passdown.status.open", "Abiertos") },
    { key: "received", label: t("passdown.status.receivedPlural", "Recibidos") },
  ];

  const suave = { color: "var(--ink-soft)" };

  const columns: Column<Passdown>[] = [
    {
      key: "stationName",
      header: t("passdown.col.station", "Puesto"),
      titulo: true,
      render: (_v, r) => (
        <span className="flex items-center gap-1.5 font-semibold">
          {r.stationName ||
            (r.channel === "supervisor"
              ? t("passdown.supervision", "Supervisión")
              : "—")}
          {r.channel === "supervisor" && (
            <StatusBadge dot={false} tone="warn">
              {t("comun.supervisor")}
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      key: "outgoingGuardName",
      header: t("passdown.col.handover", "Entregó → Recibió"),
      render: (_v, r) => (
        <span className="text-xs" style={suave}>
          {quienEntregaYRecibe(r)}
        </span>
      ),
    },
    {
      key: "shiftLabel",
      header: t("comun.turno", "Turno"),
      render: (_v, r) => (
        <span className="text-xs" style={suave}>
          {r.shiftLabel || "—"}
        </span>
      ),
    },
    {
      key: "deliveredAt",
      header: t("passdown.col.delivered", "Entregado"),
      render: (_v, r) => (
        <span className="text-xs tabular-nums" style={suave}>
          {fmtPase(horaDeEntrega(r))}
        </span>
      ),
    },
    {
      key: "acceptedAt",
      header: t("passdown.col.accepted", "Aceptado"),
      render: (_v, r) => (
        <span className="text-xs tabular-nums" style={suave}>
          {horaDeAceptacion(t, r)}
        </span>
      ),
    },
    {
      key: "outgoingPresent",
      header: t("passdown.outgoingPresent.label", "¿Estaba el saliente?"),
      render: (_v, r) => <SalienteEstabaBadge passdown={r} t={t} />,
    },
    {
      key: "incomingPunchMethod",
      header: t("passdown.col.entry", "Entrada del relevo"),
      render: (_v, r) => (
        <span className="text-xs" style={suave}>
          {metodoDeEntrada(t, r.incomingPunchMethod) || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: t("comun.estado", "Estado"),
      render: (_v, r) => <EstadoDelPase passdown={r} t={t} />,
    },
    {
      key: "instructionCount",
      header: t("passdown.col.instructions", "Consignas"),
      numeric: true,
      render: (_v, r) => (
        <span className="text-xs tabular-nums" style={suave}>
          {r.instructionCount ?? 0}
        </span>
      ),
    },
  ];

  return (
    <AppLayout>
      <div>
        <PageContainer width="wide">
          <PageHeader
            icon={<ClipboardSignature />}
            subtitle={t("ui.PassdownsPage.entregasDeTurnoDeLos")}
            title={t("ui.PassdownsPage.pasesDeTurno")}
          />

          <Section
            action={
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
                <FiltroDePuesto value={puesto} onChange={elegirPuesto} />
                <Segmented<PassdownStatus | "all">
                  options={filtros.map((f) => ({
                    value: f.key,
                    label: f.label,
                  }))}
                  value={filter}
                  onChange={setFilter}
                />
              </div>
            }
            icon={<Repeat />}
            title={t("ui.PassdownsPage.pasesDeTurno")}
          >
            {loading ? (
              <SkeletonCards count={4} />
            ) : rows.length === 0 ? (
              <EmptyState
                description={t(
                  "ui.PassdownsPage.cuandoLosVigilantesRegistrenLa",
                )}
                icon={<ClipboardSignature />}
                title={t("ui.PassdownsPage.noHayPasesDeTurno")}
              />
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                onRowClick={openDetail}
              />
            )}
          </Section>
        </PageContainer>
      </div>

      <PassdownDetailModal
        open={detailOpen}
        passdownId={detailId}
        onOpenChange={setDetailOpen}
      />
    </AppLayout>
  );
}
