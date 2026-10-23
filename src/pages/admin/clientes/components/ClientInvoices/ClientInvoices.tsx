/**
 * CLIENT › INVOICES — what this client has been billed and what they still
 * owe, with the shortcuts to bill them again (a run from their contract, or
 * a manual invoice).
 */
import type { Client } from "@/types/client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ClipboardCheck,
  Plus,
  Receipt,
  AlertTriangle,
  Wallet,
  CheckCircle2,
} from "lucide-react";

import { TabLoading } from "../_shared/tab-kit";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/table/DataTable";
import {
  Section,
  EmptyState,
  StatusBadge,
  StatsStrip,
  StatCard,
} from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import { soloFecha, soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import clientBillingService, {
  balanceCents,
  type Invoice,
} from "@/lib/api/clientBillingService";
import {
  QK,
  dinero,
  useEtiquetasDeFacturacion,
  NuevaCorridaModal,
  conModuloDeFacturacion,
} from "@/pages/admin/facturacion/comun";
import { NuevaFacturaManual } from "@/pages/admin/facturacion/FacturasPage";

function ClientInvoices({ client }: { client: Client }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const etiquetas = useEtiquetasDeFacturacion();
  const [corrida, setCorrida] = useState(false);
  const [manual, setManual] = useState(false);
  const lista = useQuery({
    queryKey: [QK, "invoices", { clientAccountId: client.id }],
    queryFn: async () =>
      (await clientBillingService.invoices({ clientAccountId: client.id }))
        .invoices,
  });
  const filas: Invoice[] = lista.data ?? [];
  const moneda = filas[0]?.currency || "USD";

  const resumen = useMemo(() => {
    let abierto = 0;
    let vencido = 0;
    let pagado = 0;

    for (const i of filas) {
      const b = balanceCents(i);

      if (
        [
          "issued",
          "sent",
          "viewed",
          "partiallyPaid",
          "overdue",
          "disputed",
        ].includes(i.status)
      )
        abierto += b;
      if (i.status === "overdue") vencido += b;
      pagado += Number(i.paidCents || 0);
    }

    return { abierto, vencido, pagado };
  }, [filas]);

  const columnas: Column<Invoice>[] = [
    {
      key: "number",
      header: t("ui.Facturacion.facturas.numero", "Número"),
      titulo: true,
      render: (_v, r) => (
        <span className="font-medium">
          {r.number || t("ui.Facturacion.estadoFactura.draft", "Borrador")}
        </span>
      ),
    },
    {
      key: "periodStart",
      header: t("ui.Facturacion.detalle.periodo", "Periodo"),
      render: (_v, r) =>
        r.periodStart
          ? `${soloFechaCivil(r.periodStart)} → ${soloFechaCivil(r.periodEnd)}`
          : "—",
    },
    {
      key: "issuedAt",
      header: t("ui.Facturacion.facturas.emitida", "Emitida"),
      render: (v) => soloFecha(v),
    },
    {
      key: "dueAt",
      header: t("ui.Facturacion.facturas.vence", "Vence"),
      render: (v) => soloFechaCivil(v),
    },
    {
      key: "totalCents",
      header: t("ui.Facturacion.facturas.total", "Total"),
      numeric: true,
      render: (v, r) => dinero(v, r.currency),
    },
    {
      key: "balance",
      header: t("ui.Facturacion.facturas.saldo", "Saldo"),
      numeric: true,
      render: (_v, r) => dinero(balanceCents(r), r.currency),
    },
    {
      key: "status",
      header: t("ui.Facturacion.facturas.estado", "Estado"),
      render: (v: Invoice["status"]) => (
        <StatusBadge tone={etiquetas.invoiceTone[v]}>
          {etiquetas.invoiceStatus[v]}
        </StatusBadge>
      ),
    },
  ];

  if (lista.isLoading) return <TabLoading count={3} />;

  return (
    <div className="space-y-4 p-1">
      <StatsStrip className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          accent="info"
          icon={<Wallet className="h-4 w-4" />}
          label={t("ui.Facturacion.facturas.saldoAbierto", "Saldo abierto")}
          value={dinero(resumen.abierto, moneda)}
        />
        <StatCard
          accent={resumen.vencido ? "bad" : "neutral"}
          icon={<AlertTriangle className="h-4 w-4" />}
          label={t("ui.Facturacion.facturas.vencido", "Vencido")}
          value={dinero(resumen.vencido, moneda)}
        />
        <StatCard
          accent="ok"
          icon={<CheckCircle2 className="h-4 w-4" />}
          label={t("ui.ClientInvoices.pagadoTotal", "Pagado en total")}
          value={dinero(resumen.pagado, moneda)}
        />
      </StatsStrip>

      <Section
        bare
        action={
          <div className="cg-acciones">
            {hasPermission("billingCreate") && (
              <Button variant="brand" onClick={() => setCorrida(true)}>
                <ClipboardCheck size={14} />{" "}
                {t("ui.Facturacion.corridas.nueva", "Nueva corrida")}
              </Button>
            )}
            {hasPermission("invoiceCreate") && (
              <Button variant="outline" onClick={() => setManual(true)}>
                <Plus size={14} />{" "}
                {t(
                  "ui.Facturacion.facturas.nuevaManual",
                  "Nueva factura manual",
                )}
              </Button>
            )}
          </div>
        }
        icon={<Receipt />}
        title={t("ui.ClientInvoices.titulo", "Facturas del cliente")}
      >
        <DataTable
          columns={columnas}
          data={filas}
          emptyState={
            <EmptyState
              description={t(
                "ui.ClientInvoices.vacioDesc",
                "Genera una corrida desde su contrato activo, o escribe una factura manual.",
              )}
              icon={<Receipt />}
              title={t(
                "ui.ClientInvoices.vacio",
                "Este cliente no tiene facturas",
              )}
            />
          }
          onRowClick={(r) => navigate(`/facturacion/facturas/${r.id}`)}
        />
      </Section>

      {corrida && (
        <NuevaCorridaModal
          clientAccountId={client.id}
          onClose={() => setCorrida(false)}
          onCreated={(r) => {
            setCorrida(false);
            navigate(`/facturacion/corridas/${r.id}`);
          }}
        />
      )}
      {manual && (
        <NuevaFacturaManual
          clientAccountId={client.id}
          onClose={() => setManual(false)}
          onCreated={(inv) => {
            setManual(false);
            navigate(`/facturacion/facturas/${inv.id}`);
          }}
        />
      )}
    </div>
  );
}

export default conModuloDeFacturacion(ClientInvoices, { pagina: false });
