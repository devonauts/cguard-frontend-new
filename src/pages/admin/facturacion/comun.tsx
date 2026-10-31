/**
 * CLIENT BILLING — shared pieces of the module: the paid-module gate, the
 * closed-set labels and their badge tones, money/hours helpers, the client
 * list, and the «Nueva corrida» modal that both the runs page and the client
 * tab open.
 */
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Receipt } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Modal, FormField, FIELD_CLS, InfoNote, PageContainer, PageHeader, Section } from "@/components/kit";
import { PausedAddonGate } from "@/components/modulos/PausedAddon";
import { useEntitlement } from "@/hooks/useEntitlement";
import { faltaElModulo } from "@/lib/rostro";
import { ADDONS_CHANGED_EVENT } from "@/lib/addonRequired";
import { clientService } from "@/lib/api/clientService";
import { formatMoney } from "@/lib/formatMoney";
import { hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";
import clientBillingService, {
  type BillingCycle,
  type BillingRun,
  type BuiltinPaymentMethod,
  type ClientAccountRef,
  type Contract,
  type ContractStatus,
  type DiscrepancyKind,
  type DiscrepancySeverity,
  type InvoiceEventType,
  type InvoiceStatus,
  type PremiumKind,
  type QuoteEventType,
  type QuoteLineKind,
  type QuoteStatus,
  type RateKind,
  type RateUnit,
  type RuleMode,
  type RunStatus,
  type ShiftType,
  type TaxJurisdiction,
} from "@/lib/api/clientBillingService";

export const QK = "client-billing";

/* ── The paid module ──────────────────────────────────────────────────────── */
/** Everything under /facturacion (and the client tabs) belongs to this module. */
export const MODULO_FACTURACION = "client_billing";

const hay402 = (qc: QueryClient): boolean =>
  qc.getQueryCache().findAll({ queryKey: [QK] }).some((q) => faltaElModulo(q.state.error));

/**
 * Whether the company lacks the module: the entitlement says so up front (no
 * request is made), and a 402 `addon_required` from any billing query says so
 * too (a session older than the purchase or the cancellation).
 */
export function useSinModuloDeFacturacion(): boolean {
  const tiene = useEntitlement(MODULO_FACTURACION);
  const qc = useQueryClient();
  const [dio402, setDio402] = useState(() => hay402(qc));

  useEffect(
    () =>
      qc.getQueryCache().subscribe((ev) => {
        if (ev.type === "updated" && ev.query.queryKey[0] === QK && faltaElModulo(ev.query.state.error)) setDio402(true);
      }),
    [qc],
  );

  /* The company's modules changed (switched back on, gifted…): forget the 402
     and ask again — the refused queries keep their error until refetched. */
  useEffect(() => {
    const onChange = () => {
      setDio402(false);
      void qc.resetQueries({ queryKey: [QK] });
    };

    window.addEventListener(ADDONS_CHANGED_EVENT, onChange);

    return () => window.removeEventListener(ADDONS_CHANGED_EVENT, onChange);
  }, [qc]);

  return !tiene || dio402;
}

/**
 * Without the module: what it does, in three steps, and where to get it.
 * Owned but switched off: how to switch it back on instead.
 */
export function PresentacionDeFacturacion() {
  const { t } = useTranslation();
  const pasos = [
    t("ui.Facturacion.modulo.paso1", "Cotizas a un prospecto y la firma en línea; con un clic pasa a cliente con su contrato y tarifas."),
    t("ui.Facturacion.modulo.paso2", "Los turnos del periodo se convierten en una corrida: revisas las discrepancias y, si el contrato lo pide, el cliente aprueba las horas."),
    t("ui.Facturacion.modulo.paso3", "Emites y envías la factura con su enlace de pago, registras cobros y ves la antigüedad de saldos de cada cliente."),
  ];

  return (
    <PausedAddonGate
      icon={<Receipt />}
      moduleKey={MODULO_FACTURACION}
      name={t("ui.Facturacion.modulo.nombre", "Facturación a clientes")}
    >
      <Section icon={<Receipt />} title={t("ui.Facturacion.modulo.titulo", "El módulo Facturación a clientes no está activo")}>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {t(
            "ui.Facturacion.modulo.desc",
            "Con «Facturación a clientes», lo que tus vigilantes ya trabajan se convierte en cotizaciones, contratos y facturas para tus clientes. Actívalo en Módulos adicionales.",
          )}
        </p>
        <ol className="mt-4 space-y-2">
          {pasos.map((p, i) => (
            <li key={i} className="glass-flat flex items-start gap-3 p-3 text-sm">
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums"
                style={{ background: "var(--brand-wash)", color: "var(--brand-text)" }}
              >
                {i + 1}
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
        <div className="cg-acciones mt-4 justify-end">
          <Button asChild variant="brand">
            <Link to="/modulos-adicionales">{t("ui.Facturacion.modulo.enlace", "Activar en Módulos adicionales")}</Link>
          </Button>
        </div>
      </Section>
    </PausedAddonGate>
  );
}

/**
 * Wraps a billing screen: without the module it shows the presentation
 * instead of the screen, so no request is made and no red error appears.
 * `pagina` = a full page (with the app layout); otherwise a tab inside one.
 */
export function conModuloDeFacturacion<P extends object>(Pantalla: ComponentType<P>, { pagina = true }: { pagina?: boolean } = {}) {
  function ConModuloDeFacturacion(props: P) {
    const { t } = useTranslation();
    const sinModulo = useSinModuloDeFacturacion();

    if (!sinModulo) return <Pantalla {...props} />;
    if (!pagina) return <PresentacionDeFacturacion />;

    return (
      <AppLayout>
        <PageContainer>
          <PageHeader icon={<Receipt />} title={t("ui.Facturacion.modulo.nombre", "Facturación a clientes")} />
          <PresentacionDeFacturacion />
        </PageContainer>
      </AppLayout>
    );
  }

  ConModuloDeFacturacion.displayName = `ConModuloDeFacturacion(${Pantalla.displayName || Pantalla.name || "Pantalla"})`;

  return ConModuloDeFacturacion;
}

/** The name a client is billed under: trade name first, then person name. */
export function nombreDelCliente(c?: ClientAccountRef | { name?: string | null; lastName?: string | null; commercialName?: string | null } | null): string {
  if (!c) return "—";

  return c.commercialName || [c.name, c.lastName].filter(Boolean).join(" ") || "—";
}

/** Who a quote is for: the existing client, else the prospect's company or contact. */
export function destinatarioDeCotizacion(q: { clientAccount?: ClientAccountRef | null; prospect?: { company?: string | null; contactName?: string | null } | null }): string {
  if (q.clientAccount) return nombreDelCliente(q.clientAccount);

  return q.prospect?.company || q.prospect?.contactName || "—";
}

/** One row of a totals card. */
export function FilaTotal({ label, value, fuerte, suave }: { label: string; value: string; fuerte?: boolean; suave?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? "font-semibold" : ""}`} style={suave ? { color: "var(--ink-soft)" } : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export const dinero = (cents: number | null | undefined, currency?: string | null) => formatMoney(cents ?? 0, currency || "USD");

/** Minutes → «12.50 h». */
export const horas = (minutes: number | null | undefined): string => `${((Number(minutes) || 0) / 60).toFixed(2)} h`;

/** Hundredths → «1.50». */
export const cantidad = (hundredths: number | null | undefined): string => ((Number(hundredths) || 0) / 100).toFixed(2);

/** Basis points → «8.25 %». */
export const porcentaje = (bps: number | null | undefined): string => `${((Number(bps) || 0) / 100).toFixed(2)} %`;

export const mensajeDeError = (e: unknown, fallback: string): string => {
  const err = e as { response?: { data?: { message?: string } | string }; message?: string };
  const body = err?.response?.data;

  if (typeof body === "string" && body) return body;
  if (body && typeof body === "object" && body.message) return body.message;

  return err?.message || fallback;
};

/* ── Labels of the closed sets ────────────────────────────────────────────── */
export function useEtiquetasDeFacturacion() {
  const { t } = useTranslation();

  return useMemo(() => {
    const invoiceStatus: Record<InvoiceStatus, string> = {
      draft: t("ui.Facturacion.estadoFactura.draft", "Borrador"),
      issued: t("ui.Facturacion.estadoFactura.issued", "Emitida"),
      sent: t("ui.Facturacion.estadoFactura.sent", "Enviada"),
      viewed: t("ui.Facturacion.estadoFactura.viewed", "Vista"),
      partiallyPaid: t("ui.Facturacion.estadoFactura.partiallyPaid", "Pago parcial"),
      paid: t("ui.Facturacion.estadoFactura.paid", "Pagada"),
      overdue: t("ui.Facturacion.estadoFactura.overdue", "Vencida"),
      void: t("ui.Facturacion.estadoFactura.void", "Anulada"),
      disputed: t("ui.Facturacion.estadoFactura.disputed", "En disputa"),
    };
    const invoiceTone: Record<InvoiceStatus, string> = {
      draft: "neutral", issued: "info", sent: "info", viewed: "info", partiallyPaid: "warn", paid: "ok", overdue: "bad", void: "neutral", disputed: "bad",
    };
    const runStatus: Record<RunStatus, string> = {
      draft: t("ui.Facturacion.estadoCorrida.draft", "Borrador"),
      clientReview: t("ui.Facturacion.estadoCorrida.clientReview", "En revisión del cliente"),
      approved: t("ui.Facturacion.estadoCorrida.approved", "Aprobada"),
      invoiced: t("ui.Facturacion.estadoCorrida.invoiced", "Facturada"),
      cancelled: t("ui.Facturacion.estadoCorrida.cancelled", "Cancelada"),
    };
    const runTone: Record<RunStatus, string> = { draft: "neutral", clientReview: "warn", approved: "ok", invoiced: "info", cancelled: "neutral" };
    const contractStatus: Record<ContractStatus, string> = {
      draft: t("ui.Facturacion.estadoContrato.draft", "Borrador"),
      active: t("ui.Facturacion.estadoContrato.active", "Activo"),
      ended: t("ui.Facturacion.estadoContrato.ended", "Terminado"),
      cancelled: t("ui.Facturacion.estadoContrato.cancelled", "Cancelado"),
    };
    const contractTone: Record<ContractStatus, string> = { draft: "neutral", active: "ok", ended: "neutral", cancelled: "bad" };
    const cycle: Record<BillingCycle, string> = {
      weekly: t("ui.Facturacion.ciclo.weekly", "Semanal"),
      biweekly: t("ui.Facturacion.ciclo.biweekly", "Quincenal (cada 2 semanas)"),
      semimonthly: t("ui.Facturacion.ciclo.semimonthly", "Dos veces al mes (1 y 16)"),
      monthly: t("ui.Facturacion.ciclo.monthly", "Mensual"),
    };
    const rateKind: Record<RateKind, string> = {
      hourly: t("ui.Facturacion.tipoTarifa.hourly", "Por hora"),
      fixed: t("ui.Facturacion.tipoTarifa.fixed", "Fijo"),
      recurring: t("ui.Facturacion.tipoTarifa.recurring", "Recurrente"),
      patrol: t("ui.Facturacion.tipoTarifa.patrol", "Patrulla"),
      dispatch: t("ui.Facturacion.tipoTarifa.dispatch", "Despacho"),
    };
    const shiftType: Record<ShiftType, string> = {
      any: t("ui.Facturacion.tipoTurno.any", "Cualquiera"),
      day: t("ui.Facturacion.tipoTurno.day", "Día"),
      night: t("ui.Facturacion.tipoTurno.night", "Noche (18:00–05:59)"),
      weekend: t("ui.Facturacion.tipoTurno.weekend", "Fin de semana"),
    };
    const unit: Record<RateUnit, string> = {
      hour: t("ui.Facturacion.unidad.hour", "hora"),
      month: t("ui.Facturacion.unidad.month", "mes"),
      week: t("ui.Facturacion.unidad.week", "semana"),
      visit: t("ui.Facturacion.unidad.visit", "visita"),
      each: t("ui.Facturacion.unidad.each", "unidad"),
    };
    const premium: Record<PremiumKind, string> = {
      none: t("ui.Facturacion.recargo.none", "Sin recargo"),
      overtime: t("ui.Facturacion.recargo.overtime", "Horas extra"),
      holiday: t("ui.Facturacion.recargo.holiday", "Festivo"),
      lastMinute: t("ui.Facturacion.recargo.lastMinute", "Cobertura de último minuto"),
    };
    const premiumTone: Record<PremiumKind, string> = { none: "neutral", overtime: "warn", holiday: "info", lastMinute: "brand" };
    const ruleMode: Record<RuleMode, string> = {
      none: t("ui.Facturacion.modoRegla.none", "Sin recargo"),
      multiplier: t("ui.Facturacion.modoRegla.multiplier", "Multiplicador (150 = 1,5×)"),
      amount: t("ui.Facturacion.modoRegla.amount", "Importe por hora añadido"),
    };
    const discrepancy: Record<DiscrepancyKind, string> = {
      noClockIn: t("ui.Facturacion.discrepancia.noClockIn", "Sin fichaje"),
      openShift: t("ui.Facturacion.discrepancia.openShift", "Turno sin cubrir"),
      noRate: t("ui.Facturacion.discrepancia.noRate", "Sin tarifa"),
      missingPo: t("ui.Facturacion.discrepancia.missingPo", "Falta la orden de compra"),
      clientObjection: t("ui.Facturacion.discrepancia.clientObjection", "Objeción del cliente"),
      hoursOver: t("ui.Facturacion.discrepancia.hoursOver", "Más horas de las programadas"),
      hoursUnder: t("ui.Facturacion.discrepancia.hoursUnder", "Menos horas de las programadas"),
      unapprovedShift: t("ui.Facturacion.discrepancia.unapprovedShift", "Turno sin aprobar"),
      unapprovedTimecard: t("ui.Facturacion.discrepancia.unapprovedTimecard", "Tarjeta de horas sin aprobar"),
      overtime: t("ui.Facturacion.discrepancia.overtime", "Horas extra"),
      holiday: t("ui.Facturacion.discrepancia.holiday", "Festivo"),
      lastMinuteCoverage: t("ui.Facturacion.discrepancia.lastMinuteCoverage", "Cobertura de último minuto"),
    };
    const severity: Record<DiscrepancySeverity, string> = {
      block: t("ui.Facturacion.severidad.block", "Bloquea"),
      warn: t("ui.Facturacion.severidad.warn", "Aviso"),
      info: t("ui.Facturacion.severidad.info", "Información"),
    };
    const severityTone: Record<DiscrepancySeverity, string> = { block: "bad", warn: "warn", info: "info" };
    // `ach` and `other` only label payments: `ach` is what older payments carry.
    const paymentMethod: Record<BuiltinPaymentMethod | "ach" | "other", string> = {
      transfer: t("ui.Facturacion.metodoPago.transfer", "Transferencia bancaria"),
      directDeposit: t("ui.Facturacion.metodoPago.directDeposit", "Depósito directo (ACH)"),
      wire: t("ui.Facturacion.metodoPago.wire", "Transferencia electrónica (wire)"),
      check: t("ui.Facturacion.metodoPago.check", "Cheque"),
      card: t("ui.Facturacion.metodoPago.card", "Tarjeta de crédito"),
      cash: t("ui.Facturacion.metodoPago.cash", "Efectivo"),
      ach: t("ui.Facturacion.metodoPago.ach", "ACH"),
      other: t("ui.Facturacion.metodoPago.other", "Otro"),
    };
    const jurisdiction: Record<TaxJurisdiction, string> = {
      state: t("ui.Facturacion.jurisdiccion.state", "Estado"),
      postal: t("ui.Facturacion.jurisdiccion.postal", "Prefijo postal"),
      custom: t("ui.Facturacion.jurisdiccion.custom", "Personalizada"),
    };
    const event: Record<InvoiceEventType, string> = {
      created: t("ui.Facturacion.evento.created", "Creada"),
      edited: t("ui.Facturacion.evento.edited", "Editada"),
      issued: t("ui.Facturacion.evento.issued", "Emitida"),
      sent: t("ui.Facturacion.evento.sent", "Enviada"),
      viewed: t("ui.Facturacion.evento.viewed", "Vista por el cliente"),
      paymentRecorded: t("ui.Facturacion.evento.paymentRecorded", "Pago registrado"),
      creditNote: t("ui.Facturacion.evento.creditNote", "Nota de crédito"),
      voided: t("ui.Facturacion.evento.voided", "Anulada"),
      disputed: t("ui.Facturacion.evento.disputed", "Marcada en disputa"),
      disputeResolved: t("ui.Facturacion.evento.disputeResolved", "Disputa resuelta"),
      overdue: t("ui.Facturacion.evento.overdue", "Vencida"),
      lateFee: t("ui.Facturacion.evento.lateFee", "Recargo por mora"),
      reminderSent: t("ui.Facturacion.evento.reminderSent", "Recordatorio enviado"),
      paymentMethods: t("ui.Facturacion.evento.paymentMethods", "Métodos de pago cambiados"),
    };

    const quoteStatus: Record<QuoteStatus, string> = {
      draft: t("ui.Cotizaciones.estado.draft", "Borrador"),
      sent: t("ui.Cotizaciones.estado.sent", "Enviada"),
      viewed: t("ui.Cotizaciones.estado.viewed", "Vista"),
      accepted: t("ui.Cotizaciones.estado.accepted", "Aceptada"),
      rejected: t("ui.Cotizaciones.estado.rejected", "Rechazada"),
      expired: t("ui.Cotizaciones.estado.expired", "Vencida"),
      converted: t("ui.Cotizaciones.estado.converted", "Convertida"),
      cancelled: t("ui.Cotizaciones.estado.cancelled", "Cancelada"),
    };
    const quoteTone: Record<QuoteStatus, string> = {
      draft: "neutral", sent: "info", viewed: "info", accepted: "ok", converted: "ok", rejected: "bad", expired: "bad", cancelled: "neutral",
    };
    const quoteKind: Record<QuoteLineKind, string> = {
      hourly: t("ui.Cotizaciones.tipoLinea.hourly", "Por hora"),
      fixed: t("ui.Cotizaciones.tipoLinea.fixed", "Cuota mensual"),
      recurring: t("ui.Cotizaciones.tipoLinea.recurring", "Recurrente"),
      patrol: t("ui.Cotizaciones.tipoLinea.patrol", "Ronda"),
      dispatch: t("ui.Cotizaciones.tipoLinea.dispatch", "Despacho"),
      oneTime: t("ui.Cotizaciones.tipoLinea.oneTime", "Único"),
    };
    const quoteEvent: Record<QuoteEventType, string> = {
      created: t("ui.Cotizaciones.evento.created", "Creada"),
      edited: t("ui.Cotizaciones.evento.edited", "Editada"),
      revised: t("ui.Cotizaciones.evento.revised", "Nueva revisión"),
      sent: t("ui.Cotizaciones.evento.sent", "Enviada"),
      viewed: t("ui.Cotizaciones.evento.viewed", "Vista por el prospecto"),
      accepted: t("ui.Cotizaciones.evento.accepted", "Aceptada y firmada"),
      rejected: t("ui.Cotizaciones.evento.rejected", "Rechazada"),
      expired: t("ui.Cotizaciones.evento.expired", "Vencida"),
      cancelled: t("ui.Cotizaciones.evento.cancelled", "Cancelada"),
      converted: t("ui.Cotizaciones.evento.converted", "Convertida en cliente y contrato"),
    };

    return { invoiceStatus, invoiceTone, runStatus, runTone, contractStatus, contractTone, cycle, rateKind, shiftType, unit, premium, premiumTone, ruleMode, discrepancy, severity, severityTone, paymentMethod, jurisdiction, event, quoteStatus, quoteTone, quoteKind, quoteEvent };
  }, [t]);
}

/* ── Data hooks ───────────────────────────────────────────────────────────── */
export function useClientesParaFacturar() {
  return useQuery({
    queryKey: [QK, "clients"],
    queryFn: async () => (await clientService.getClients({ active: true }, { limit: 500, offset: 0 })).rows,
    staleTime: 60_000,
  });
}

export function useContratos(filter: { clientAccountId?: string; status?: ContractStatus } = {}) {
  return useQuery({
    queryKey: [QK, "contracts", filter],
    queryFn: async () => (await clientBillingService.contracts(filter)).contracts,
  });
}

/* ── «Nueva corrida» ──────────────────────────────────────────────────────── */
export function NuevaCorridaModal({
  clientAccountId,
  onClose,
  onCreated,
}: {
  clientAccountId?: string;
  onClose: () => void;
  onCreated: (run: BillingRun) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const etiquetas = useEtiquetasDeFacturacion();
  const contratos = useContratos({ status: "active", ...(clientAccountId ? { clientAccountId } : {}) });
  const [contractId, setContractId] = useState("");
  const [date, setDate] = useState(hoyEnLaEmpresa());
  const [manual, setManual] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const lista: Contract[] = contratos.data ?? [];
  const elegido = lista.find((c) => c.id === contractId);

  const crear = async () => {
    setSaving(true);
    try {
      const { run } = await clientBillingService.createRun(
        manual ? { contractId, periodStart, periodEnd } : { contractId, date },
      );

      toast.success(t("ui.Facturacion.nuevaCorrida.creada", "Corrida {{p}} creada", { p: `${run.periodStart} → ${run.periodEnd}` }));
      await qc.invalidateQueries({ queryKey: [QK, "runs"] });
      onCreated(run);
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar")));
    } finally {
      setSaving(false);
    }
  };

  const listo = !!contractId && (manual ? !!periodStart && !!periodEnd && periodEnd >= periodStart : !!date);

  return (
    <Modal
      open
      size="md"
      title={t("ui.Facturacion.nuevaCorrida.titulo", "Nueva corrida de facturación")}
      description={t("ui.Facturacion.nuevaCorrida.descripcion", "Se toman los turnos del periodo según el contrato y sus tarifas. Las discrepancias se revisan antes de facturar.")}
      onOpenChange={(o) => { if (!o) onClose(); }}
      footer={
        <div className="cg-acciones justify-end">
          <Button variant="outline" onClick={onClose}>{t("ui.Facturacion.cancelar", "Cancelar")}</Button>
          <Button disabled={saving || !listo} variant="brand" onClick={crear}>
            {saving ? t("ui.Facturacion.guardando", "Guardando…") : t("ui.Facturacion.nuevaCorrida.crear", "Crear y calcular")}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField className="sm:col-span-2" label={t("ui.Facturacion.nuevaCorrida.contrato", "Contrato")} required>
          <select className={FIELD_CLS} value={contractId} onChange={(e) => setContractId(e.target.value)}>
            <option value="">{contratos.isLoading ? t("ui.Facturacion.cargando", "Cargando…") : t("ui.Facturacion.nuevaCorrida.eligeContrato", "Elige un contrato activo")}</option>
            {lista.map((c) => (
              <option key={c.id} value={c.id}>
                {clientAccountId ? c.name : `${nombreDelCliente(c.clientAccount)} · ${c.name}`}
                {c.number ? ` (${c.number})` : ""}
              </option>
            ))}
          </select>
        </FormField>
        {!contratos.isLoading && !lista.length && (
          <div className="sm:col-span-2">
            <InfoNote tone="warn">{t("ui.Facturacion.nuevaCorrida.sinContratos", "No hay contratos activos. Activa uno en la pestaña «Contrato y tarifas» del cliente.")}</InfoNote>
          </div>
        )}
        {elegido && (
          <div className="sm:col-span-2 text-xs" style={{ color: "var(--ink-soft)" }}>
            {t("ui.Facturacion.nuevaCorrida.cicloDelContrato", "Ciclo del contrato: {{c}}", { c: etiquetas.cycle[elegido.billingCycle] })}
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input checked={manual} className="cg-focus size-4" style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => setManual(e.target.checked)} />
            {t("ui.Facturacion.nuevaCorrida.periodoManual", "Elegir las fechas del periodo a mano")}
          </label>
        </div>
        {manual ? (
          <>
            <FormField label={t("ui.Facturacion.nuevaCorrida.desde", "El periodo empieza el")} required>
              <input className={FIELD_CLS} type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </FormField>
            <FormField label={t("ui.Facturacion.nuevaCorrida.hasta", "y termina el")} required>
              <input className={FIELD_CLS} type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </FormField>
          </>
        ) : (
          <FormField className="sm:col-span-2" label={t("ui.Facturacion.nuevaCorrida.fechaDeReferencia", "Periodo que contiene el día")} hint={t("ui.Facturacion.nuevaCorrida.fechaDeReferenciaHint", "El periodo se calcula con el ciclo del contrato a partir de este día.")}>
            <input className={FIELD_CLS} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
        )}
      </div>
    </Modal>
  );
}
