/**
 * INVOICES — every invoice the company has issued to its clients, with the
 * open balance at a glance and a way to write a manual one (a billing run
 * is the normal road; see CorridasPage).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from "lucide-react";

import {
  QK,
  dinero,
  nombreDelCliente,
  useEtiquetasDeFacturacion,
  useClientesParaFacturar,
  useContratos,
  mensajeDeError,
  conModuloDeFacturacion,
} from "./comun";

import EtiquetaDeSucursal from "@/components/sucursales/EtiquetaDeSucursal";
import { useEtiquetasDeSucursal } from "@/hooks/useEtiquetasDeSucursal";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/table/DataTable";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  Modal,
  FormField,
  FIELD_CLS,
  StatusBadge,
  Toolbar,
  StatsStrip,
  StatCard,
} from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import {
  soloFecha,
  soloFechaCivil,
  hoyEnLaEmpresa,
} from "@/lib/horaDeLaEmpresa";
import clientBillingService, {
  balanceCents,
  INVOICE_STATUSES,
  type Invoice,
  type InvoiceFilterStatus,
  type ManualInvoiceInput,
} from "@/lib/api/clientBillingService";

type Filtro = InvoiceFilterStatus | "all";

function FacturasPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { hasPermission } = usePermissions();
  const etiquetas = useEtiquetasDeFacturacion();
  const clientes = useClientesParaFacturar();
  const [nueva, setNueva] = useState(false);

  const status = (params.get("status") || "all") as Filtro;
  const clientAccountId = params.get("clientAccountId") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);

    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const lista = useQuery({
    queryKey: [QK, "invoices", { status, clientAccountId, from, to }],
    queryFn: async () =>
      (
        await clientBillingService.invoices({
          status: status === "all" ? undefined : status,
          clientAccountId: clientAccountId || undefined,
          from: from || undefined,
          to: to || undefined,
        })
      ).invoices,
  });
  const filas: Invoice[] = lista.data ?? [];
  const moneda = filas[0]?.currency || "USD";

  const resumen = useMemo(() => {
    const mes = hoyEnLaEmpresa().slice(0, 7);
    let abierto = 0;
    let vencido = 0;
    let cobradoMes = 0;

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
      if (i.paidAt && String(i.paidAt).slice(0, 7) === mes)
        cobradoMes += Number(i.paidCents || 0);
    }

    return { abierto, vencido, cobradoMes };
  }, [filas]);

  const etiquetasSuc = useEtiquetasDeSucursal();
  const columnas: Column<Invoice>[] = [
    {
      key: "number",
      header: t("ui.Facturacion.facturas.numero", "Número"),
      titulo: true,
      render: (_v, r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5 font-medium">
          {r.number || t("ui.Facturacion.estadoFactura.draft", "Borrador")}
          {/* Sucursales (vista global): la sucursal que la emite. */}
          {etiquetasSuc.activo && (
            <EtiquetaDeSucursal
              empresa
              sucursal={etiquetasSuc.sucursal(r.branchId)}
            />
          )}
        </span>
      ),
    },
    {
      key: "clientAccount",
      header: t("ui.Facturacion.facturas.cliente", "Cliente"),
      render: (_v, r) => nombreDelCliente(r.clientAccount),
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

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          actions={
            hasPermission("invoiceCreate") ? (
              <Button variant="brand" onClick={() => setNueva(true)}>
                <Plus size={14} />{" "}
                {t(
                  "ui.Facturacion.facturas.nuevaManual",
                  "Nueva factura manual",
                )}
              </Button>
            ) : undefined
          }
          icon={<Receipt />}
          subtitle={t(
            "ui.Facturacion.facturas.subtitulo",
            "Lo que la empresa cobra a sus clientes: emitir, enviar, cobrar y acreditar.",
          )}
          title={t("ui.Facturacion.facturas.titulo", "Facturas")}
        />

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
            label={t(
              "ui.Facturacion.facturas.cobradoEsteMes",
              "Cobrado este mes",
            )}
            value={dinero(resumen.cobradoMes, moneda)}
          />
        </StatsStrip>

        <Toolbar>
          <select
            className="cg-input"
            value={status}
            onChange={(e) =>
              setParam("status", e.target.value === "all" ? "" : e.target.value)
            }
          >
            <option value="all">
              {t("ui.Facturacion.facturas.todas", "Todas")}
            </option>
            <option value="open">
              {t("ui.Facturacion.facturas.abiertas", "Abiertas")}
            </option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {etiquetas.invoiceStatus[s]}
              </option>
            ))}
          </select>
          <select
            className="cg-input"
            value={clientAccountId}
            onChange={(e) => setParam("clientAccountId", e.target.value)}
          >
            <option value="">
              {t(
                "ui.Facturacion.facturas.todosLosClientes",
                "Todos los clientes",
              )}
            </option>
            {(clientes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {nombreDelCliente(c)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <span style={{ color: "var(--ink-faint)" }}>
              {t("ui.Facturacion.facturas.desde", "Emitidas desde")}
            </span>
            <input
              className="cg-input"
              type="date"
              value={from}
              onChange={(e) => setParam("from", e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span style={{ color: "var(--ink-faint)" }}>
              {t("ui.Facturacion.facturas.hasta", "hasta")}
            </span>
            <input
              className="cg-input"
              type="date"
              value={to}
              onChange={(e) => setParam("to", e.target.value)}
            />
          </label>
        </Toolbar>

        <Section bare>
          <DataTable
            columns={columnas}
            data={filas}
            emptyState={
              <EmptyState
                description={t(
                  "ui.Facturacion.facturas.vacioDesc",
                  "Crea una corrida de facturación desde un contrato activo, o escribe una factura manual.",
                )}
                icon={<Receipt />}
                title={t(
                  "ui.Facturacion.facturas.vacio",
                  "Todavía no hay facturas",
                )}
              />
            }
            loading={lista.isLoading}
            onRowClick={(r) => navigate(`/facturacion/facturas/${r.id}`)}
          />
        </Section>

        {nueva && (
          <NuevaFacturaManual
            onClose={() => setNueva(false)}
            onCreated={(inv) => {
              setNueva(false);
              navigate(`/facturacion/facturas/${inv.id}`);
            }}
          />
        )}
      </PageContainer>
    </AppLayout>
  );
}

type LineaBorrador = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
};
const lineaVacia = (): LineaBorrador => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  taxable: true,
});

/** A manual invoice: lines typed by hand, outside any billing run. */
export function NuevaFacturaManual({
  clientAccountId: fijo,
  onClose,
  onCreated,
}: {
  clientAccountId?: string;
  onClose: () => void;
  onCreated: (inv: Invoice) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const clientes = useClientesParaFacturar();
  const [clientAccountId, setClientAccountId] = useState(fijo || "");
  const contratos = useContratos(clientAccountId ? { clientAccountId } : {});
  const [contractId, setContractId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [lineas, setLineas] = useState<LineaBorrador[]>([lineaVacia()]);
  const [saving, setSaving] = useState(false);

  const setLinea = (i: number, patch: Partial<LineaBorrador>) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const aCentavos = (s: string) =>
    Math.round((Number(String(s).replace(",", ".")) || 0) * 100);
  const total = lineas.reduce(
    (s, l) =>
      s + Math.round((aCentavos(l.quantity) * aCentavos(l.unitPrice)) / 100),
    0,
  );
  const validas = lineas.filter(
    (l) => l.description.trim() && aCentavos(l.quantity) > 0,
  );
  const listo = !!clientAccountId && validas.length > 0;

  const crear = async () => {
    setSaving(true);
    try {
      const body: ManualInvoiceInput = {
        clientAccountId,
        contractId: contractId || undefined,
        poNumber: poNumber || undefined,
        notes: notes || undefined,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
        lines: validas.map((l) => ({
          description: l.description.trim(),
          quantityHundredths: aCentavos(l.quantity),
          unitCents: aCentavos(l.unitPrice),
          taxable: l.taxable,
          unit: "each",
        })),
      };
      const { invoice } = await clientBillingService.createInvoice(body);

      toast.success(
        t(
          "ui.Facturacion.facturas.borradorCreado",
          "Borrador de factura creado",
        ),
      );
      await qc.invalidateQueries({ queryKey: [QK, "invoices"] });
      onCreated(invoice);
    } catch (e) {
      toast.error(
        mensajeDeError(
          e,
          t("ui.Facturacion.errorAlGuardar", "No se pudo guardar"),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      description={t(
        "ui.Facturacion.facturas.nuevaManualDesc",
        "Queda en borrador: puedes revisarla antes de emitirla. Los impuestos se calculan al emitir según la tabla de la empresa.",
      )}
      footer={
        <div className="cg-acciones w-full items-center justify-between">
          <span
            className="text-sm tabular-nums"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("ui.Facturacion.facturas.subtotal", "Subtotal")}:{" "}
            <strong>{dinero(total)}</strong>
          </span>
          <div className="cg-acciones">
            <Button variant="outline" onClick={onClose}>
              {t("ui.Facturacion.cancelar", "Cancelar")}
            </Button>
            <Button disabled={saving || !listo} variant="brand" onClick={crear}>
              {saving
                ? t("ui.Facturacion.guardando", "Guardando…")
                : t("ui.Facturacion.facturas.crearBorrador", "Crear borrador")}
            </Button>
          </div>
        </div>
      }
      size="lg"
      title={t("ui.Facturacion.facturas.nuevaManual", "Nueva factura manual")}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          required
          label={t("ui.Facturacion.facturas.cliente", "Cliente")}
        >
          <select
            className={FIELD_CLS}
            disabled={!!fijo}
            value={clientAccountId}
            onChange={(e) => {
              setClientAccountId(e.target.value);
              setContractId("");
            }}
          >
            <option value="">
              {t("ui.Facturacion.facturas.eligeCliente", "Elige un cliente")}
            </option>
            {(clientes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {nombreDelCliente(c)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          hint={t(
            "ui.Facturacion.facturas.contratoHint",
            "Opcional: toma sus términos de pago y su exención fiscal.",
          )}
          label={t("ui.Facturacion.facturas.contrato", "Contrato")}
        >
          <select
            className={FIELD_CLS}
            disabled={!clientAccountId}
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
          >
            <option value="">
              {t("ui.Facturacion.facturas.sinContrato", "Sin contrato")}
            </option>
            {(contratos.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.number ? ` (${c.number})` : ""}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label={t(
            "ui.Facturacion.facturas.ordenDeCompra",
            "Orden de compra (PO)",
          )}
        >
          <input
            className={FIELD_CLS}
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label={t("ui.Facturacion.facturas.periodoDesde", "Periodo desde")}
          >
            <input
              className={FIELD_CLS}
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </FormField>
          <FormField label={t("ui.Facturacion.facturas.periodoHasta", "hasta")}>
            <input
              className={FIELD_CLS}
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </FormField>
        </div>

        <div className="sm:col-span-2">
          <div className="cg-eyebrow mb-1">
            {t("ui.Facturacion.facturas.lineas", "Líneas")}
          </div>
          <div className="space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <input
                  className={`${FIELD_CLS} col-span-12 sm:col-span-6`}
                  placeholder={t(
                    "ui.Facturacion.facturas.descripcion",
                    "Descripción",
                  )}
                  value={l.description}
                  onChange={(e) => setLinea(i, { description: e.target.value })}
                />
                <input
                  className={`${FIELD_CLS} col-span-4 sm:col-span-2`}
                  inputMode="decimal"
                  placeholder={t("ui.Facturacion.facturas.cantidad", "Cant.")}
                  value={l.quantity}
                  onChange={(e) => setLinea(i, { quantity: e.target.value })}
                />
                <input
                  className={`${FIELD_CLS} col-span-5 sm:col-span-2`}
                  inputMode="decimal"
                  placeholder={t(
                    "ui.Facturacion.facturas.precioUnitario",
                    "Precio",
                  )}
                  value={l.unitPrice}
                  onChange={(e) => setLinea(i, { unitPrice: e.target.value })}
                />
                <label
                  className="col-span-2 flex items-center gap-1 text-xs sm:col-span-1"
                  title={t("ui.Facturacion.facturas.gravable", "Gravable")}
                >
                  <input
                    checked={l.taxable}
                    className="cg-focus size-4"
                    style={{ accentColor: "var(--brand)" }}
                    type="checkbox"
                    onChange={(e) => setLinea(i, { taxable: e.target.checked })}
                  />
                  {t("ui.Facturacion.facturas.impuestoAbrev", "Imp.")}
                </label>
                <Button
                  className="col-span-1"
                  disabled={lineas.length === 1}
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setLineas((ls) => ls.filter((_, j) => j !== i))
                  }
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            onClick={() => setLineas((ls) => [...ls, lineaVacia()])}
          >
            <Plus size={14} />{" "}
            {t("ui.Facturacion.facturas.agregarLinea", "Agregar línea")}
          </Button>
        </div>

        <FormField
          className="sm:col-span-2"
          label={t("ui.Facturacion.facturas.notas", "Notas para el cliente")}
        >
          <textarea
            className={`${FIELD_CLS} h-20`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  );
}

export default conModuloDeFacturacion(FacturasPage);
