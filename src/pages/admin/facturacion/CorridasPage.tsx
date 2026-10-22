/**
 * BILLING RUNS — one per contract and period: the shifts of the period turned
 * into billable lines, with the discrepancies that must be settled before a
 * draft invoice can be written.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardCheck, Plus } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/table/DataTable";
import { PageContainer, PageHeader, Section, EmptyState, StatusBadge, Toolbar } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import { soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import clientBillingService, { type BillingRun, type RunStatus } from "@/lib/api/clientBillingService";
import { QK, dinero, nombreDelCliente, useEtiquetasDeFacturacion, useClientesParaFacturar, NuevaCorridaModal, conModuloDeFacturacion } from "./comun";

const ESTADOS: RunStatus[] = ["draft", "clientReview", "approved", "invoiced", "cancelled"];

function CorridasPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { hasPermission } = usePermissions();
  const etiquetas = useEtiquetasDeFacturacion();
  const clientes = useClientesParaFacturar();
  const [nueva, setNueva] = useState(false);
  const status = (params.get("status") || "") as RunStatus | "";
  const clientAccountId = params.get("clientAccountId") || "";
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);

    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };

  const lista = useQuery({
    queryKey: [QK, "runs", { status, clientAccountId }],
    queryFn: async () => (await clientBillingService.runs({ status: status || undefined, clientAccountId: clientAccountId || undefined })).runs,
  });
  const filas: BillingRun[] = lista.data ?? [];

  const columnas: Column<BillingRun>[] = [
    { key: "periodStart", header: t("ui.Facturacion.corridas.periodo", "Periodo"), titulo: true, render: (_v, r) => <span className="font-medium tabular-nums">{soloFechaCivil(r.periodStart)} → {soloFechaCivil(r.periodEnd)}</span> },
    { key: "clientAccount", header: t("ui.Facturacion.facturas.cliente", "Cliente"), render: (_v, r) => nombreDelCliente(r.clientAccount) },
    { key: "contract", header: t("ui.Facturacion.facturas.contrato", "Contrato"), render: (_v, r) => r.contract ? `${r.contract.name}${r.contract.number ? ` (${r.contract.number})` : ""}` : "—" },
    { key: "status", header: t("ui.Facturacion.facturas.estado", "Estado"), render: (v: RunStatus) => <StatusBadge tone={etiquetas.runTone[v]}>{etiquetas.runStatus[v]}</StatusBadge> },
    { key: "subtotal", header: t("ui.Facturacion.facturas.subtotal", "Subtotal"), numeric: true, render: (_v, r) => dinero(r.summary?.subtotalCents ?? 0, r.contract?.currency) },
    {
      key: "discrepancias", header: t("ui.Facturacion.corridas.discrepancias", "Discrepancias"), render: (_v, r) => (
        <span className="flex flex-wrap gap-1">
          {r.summary?.blocking ? <StatusBadge tone="bad" dot>{t("ui.Facturacion.corridas.bloqueanN", "{{n}} bloquean", { n: r.summary.blocking })}</StatusBadge> : null}
          {r.summary?.warnings ? <StatusBadge tone="warn" dot>{t("ui.Facturacion.corridas.avisosN", "{{n}} avisos", { n: r.summary.warnings })}</StatusBadge> : null}
          {!r.summary?.blocking && !r.summary?.warnings ? <span style={{ color: "var(--ink-faint)" }}>—</span> : null}
        </span>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<ClipboardCheck />}
          title={t("ui.Facturacion.corridas.titulo", "Corridas de facturación")}
          subtitle={t("ui.Facturacion.corridas.subtitulo", "De los turnos del periodo a una factura: se revisan las discrepancias, el cliente aprueba las horas si el contrato lo pide, y se factura.")}
          actions={hasPermission("billingCreate") ? <Button variant="brand" onClick={() => setNueva(true)}><Plus size={14} /> {t("ui.Facturacion.corridas.nueva", "Nueva corrida")}</Button> : undefined}
        />

        <Toolbar>
          <select className="cg-input" value={status} onChange={(e) => setParam("status", e.target.value)}>
            <option value="">{t("ui.Facturacion.corridas.todosLosEstados", "Todos los estados")}</option>
            {ESTADOS.map((s) => <option key={s} value={s}>{etiquetas.runStatus[s]}</option>)}
          </select>
          <select className="cg-input" value={clientAccountId} onChange={(e) => setParam("clientAccountId", e.target.value)}>
            <option value="">{t("ui.Facturacion.facturas.todosLosClientes", "Todos los clientes")}</option>
            {(clientes.data ?? []).map((c) => <option key={c.id} value={c.id}>{nombreDelCliente(c)}</option>)}
          </select>
        </Toolbar>

        <Section bare>
          <DataTable
            columns={columnas}
            data={filas}
            loading={lista.isLoading}
            onRowClick={(r) => navigate(`/facturacion/corridas/${r.id}`)}
            emptyState={<EmptyState icon={<ClipboardCheck />} title={t("ui.Facturacion.corridas.vacio", "Todavía no hay corridas")} description={t("ui.Facturacion.corridas.vacioDesc", "Crea la primera desde un contrato activo: el periodo sale del ciclo de facturación del contrato.")} action={hasPermission("billingCreate") ? <Button variant="brand" onClick={() => setNueva(true)}>{t("ui.Facturacion.corridas.nueva", "Nueva corrida")}</Button> : undefined} />}
          />
        </Section>

        {nueva && <NuevaCorridaModal onClose={() => setNueva(false)} onCreated={(r) => { setNueva(false); navigate(`/facturacion/corridas/${r.id}`); }} />}
      </PageContainer>
    </AppLayout>
  );
}

export default conModuloDeFacturacion(CorridasPage);
