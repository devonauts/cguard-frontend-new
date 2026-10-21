/**
 * AGING — the open balance by how long it has been due, overall and per
 * client. Each client row links to its open invoices.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Hourglass } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { PageContainer, PageHeader, Section, EmptyState, StatsStrip, StatCard, SkeletonCards } from "@/components/kit";
import { soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import clientBillingService, { type AgingBucketKey, type AgingClientRow } from "@/lib/api/clientBillingService";
import { QK, dinero } from "./comun";

export default function AntiguedadPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const informe = useQuery({ queryKey: [QK, "aging"], queryFn: () => clientBillingService.aging() });
  const d = informe.data;
  // DataTable keys its rows by `id`; the report keys clients by account.
  type Fila = AgingClientRow & { id: string };
  const filas = useMemo<Fila[]>(() => (d?.clients ?? []).map((c) => ({ ...c, id: c.clientAccountId })), [d]);

  const cubetas: Array<{ key: AgingBucketKey; label: string; accent: string }> = [
    { key: "current", label: t("ui.Facturacion.antiguedad.corriente", "Al día"), accent: "ok" },
    { key: "d1_30", label: t("ui.Facturacion.antiguedad.d1_30", "1–30 días"), accent: "info" },
    { key: "d31_60", label: t("ui.Facturacion.antiguedad.d31_60", "31–60 días"), accent: "warn" },
    { key: "d61_90", label: t("ui.Facturacion.antiguedad.d61_90", "61–90 días"), accent: "warn" },
    { key: "d90plus", label: t("ui.Facturacion.antiguedad.d90plus", "Más de 90 días"), accent: "bad" },
  ];

  const columnas: Column<Fila>[] = [
    { key: "name", header: t("ui.Facturacion.facturas.cliente", "Cliente"), titulo: true, render: (v) => <span className="font-medium">{v || "—"}</span> },
    { key: "invoices", header: t("ui.Facturacion.antiguedad.facturas", "Facturas"), numeric: true },
    { key: "oldestDueAt", header: t("ui.Facturacion.antiguedad.vencimientoMasAntiguo", "Vencimiento más antiguo"), render: (v) => soloFechaCivil(v) },
    ...cubetas.map<Column<Fila>>((c) => ({ key: c.key, header: c.label, numeric: true, render: (v) => (v ? dinero(v) : <span style={{ color: "var(--ink-faint)" }}>—</span>) })),
    { key: "total", header: t("ui.Facturacion.facturas.total", "Total"), numeric: true, render: (v) => <span className="font-semibold">{dinero(v)}</span> },
  ];

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<Hourglass />}
          title={t("ui.Facturacion.antiguedad.titulo", "Antigüedad de saldos")}
          subtitle={d ? t("ui.Facturacion.antiguedad.subtitulo", "Saldo abierto al {{fecha}}: {{total}}", { fecha: soloFechaCivil(d.asOf), total: dinero(d.totalCents) }) : t("ui.Facturacion.antiguedad.subtituloVacio", "Cuánto deben los clientes y desde cuándo.")}
        />

        {informe.isLoading ? (
          <SkeletonCards count={5} />
        ) : !d ? (
          <EmptyState icon={<Hourglass />} title={t("ui.Facturacion.antiguedad.noDisponible", "No se pudo cargar el informe")} />
        ) : (
          <>
            <StatsStrip className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              {cubetas.map((c) => (
                <StatCard key={c.key} accent={d.buckets[c.key] ? c.accent : "neutral"} label={c.label} value={dinero(d.buckets[c.key])} />
              ))}
            </StatsStrip>

            <Section bare>
              <DataTable
                columns={columnas}
                data={filas}
                onRowClick={(r) => navigate(`/facturacion/facturas?status=open&clientAccountId=${encodeURIComponent(r.clientAccountId)}`)}
                emptyState={<EmptyState icon={<Hourglass />} title={t("ui.Facturacion.antiguedad.sinSaldos", "Nadie debe nada")} description={t("ui.Facturacion.antiguedad.sinSaldosDesc", "No hay facturas con saldo pendiente.")} />}
              />
            </Section>
          </>
        )}
      </PageContainer>
    </AppLayout>
  );
}
