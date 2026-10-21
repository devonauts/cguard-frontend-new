/**
 * INVOICE DETAIL — the document, its money, what happened to it and every
 * action its status allows: edit (draft), issue, send, PDF, record a
 * payment, credit, void, dispute, public link, delete draft.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Ban, CheckCircle2, CreditCard, Download, FileText, Link2, Pencil, Plus, Receipt, Send, ShieldAlert, Trash2 } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { PageContainer, PageHeader, Section, SkeletonCards, EmptyState, Modal, FormField, FIELD_CLS, StatusBadge, Field, InfoNote, ListRow } from "@/components/kit";
import { TabTable, THead, Th, Tr } from "@/pages/admin/clientes/components/_shared/tab-kit";
import { usePermissions } from "@/hooks/usePermissions";
import { fechaYHora, soloFecha, soloFechaCivil, hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { localeActual } from "@/lib/localeActual";
import clientBillingService, { balanceCents, PAYMENT_METHODS, type Invoice, type InvoiceLine, type PaymentMethod } from "@/lib/api/clientBillingService";
import { QK, dinero, cantidad, nombreDelCliente, useEtiquetasDeFacturacion, mensajeDeError } from "./comun";

type Modal_ = null | "enviar" | "pago" | "credito" | "anular" | "disputa";

export default function FacturaDetallePage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const etiquetas = useEtiquetasDeFacturacion();
  const [modal, setModal] = useState<Modal_>(null);
  const [editando, setEditando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const detalle = useQuery({ queryKey: [QK, "invoice", id], queryFn: () => clientBillingService.invoice(id), enabled: !!id });
  const inv = detalle.data?.invoice;
  const publicUrl = detalle.data?.publicUrl ?? null;

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: [QK, "invoice", id] });
    await qc.invalidateQueries({ queryKey: [QK, "invoices"] });
    await qc.invalidateQueries({ queryKey: [QK, "aging"] });
  };

  const correr = async (fn: () => Promise<unknown>, ok: string) => {
    setTrabajando(true);
    try {
      await fn();
      toast.success(ok);
      await refrescar();
      setModal(null);

      return true;
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar")));

      return false;
    } finally {
      setTrabajando(false);
    }
  };

  const emitir = async () => {
    if (!inv) return;
    if (!(await confirmDialog({ title: t("ui.Facturacion.detalle.emitir", "Emitir"), message: t("ui.Facturacion.detalle.emitirConfirm", "Se asigna el número de factura y se calculan los impuestos. Después ya no se puede editar: los cambios van por nota de crédito."), confirmText: t("ui.Facturacion.detalle.emitir", "Emitir") }))) return;
    await correr(() => clientBillingService.issueInvoice(inv.id), t("ui.Facturacion.detalle.emitida", "Factura emitida"));
  };

  const eliminar = async () => {
    if (!inv) return;
    if (!(await confirmDialog({ title: t("ui.Facturacion.detalle.eliminarBorrador", "Eliminar borrador"), message: t("ui.Facturacion.detalle.eliminarConfirm", "El borrador se elimina y no se puede recuperar."), tone: "danger", confirmText: t("ui.Facturacion.detalle.eliminarBorrador", "Eliminar borrador") }))) return;
    setTrabajando(true);
    try {
      await clientBillingService.deleteInvoice(inv.id);
      toast.success(t("ui.Facturacion.detalle.borradorEliminado", "Borrador eliminado"));
      await qc.invalidateQueries({ queryKey: [QK, "invoices"] });
      navigate("/facturacion/facturas");
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar")));
    } finally {
      setTrabajando(false);
    }
  };

  const descargar = async () => {
    if (!inv) return;
    try {
      await clientBillingService.downloadPdf(inv, localeActual().slice(0, 2));
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.detalle.noSePudoDescargar", "No se pudo descargar el PDF")));
    }
  };

  const copiarEnlace = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success(t("ui.Facturacion.detalle.enlaceCopiado", "Enlace copiado"));
    } catch {
      window.prompt(t("ui.Facturacion.detalle.copiaElEnlace", "Copia el enlace"), publicUrl);
    }
  };

  const resolverDisputa = async () => {
    if (!inv) return;
    if (!(await confirmDialog({ title: t("ui.Facturacion.detalle.resolverDisputa", "Resolver disputa"), message: t("ui.Facturacion.detalle.resolverDisputaConfirm", "La factura vuelve a su estado según lo pagado y su vencimiento."), confirmText: t("ui.Facturacion.detalle.resolverDisputa", "Resolver disputa") }))) return;
    await correr(() => clientBillingService.setDisputed(inv.id, false, ""), t("ui.Facturacion.detalle.disputaResuelta", "Disputa resuelta"));
  };

  if (detalle.isLoading || !inv) {
    return (
      <AppLayout>
        <PageContainer>
          {detalle.isError ? (
            <EmptyState icon={<Receipt />} title={t("ui.Facturacion.detalle.noEncontrada", "No se encontró la factura")} action={<Button variant="outline" onClick={() => navigate("/facturacion/facturas")}><ArrowLeft size={14} /> {t("ui.Facturacion.detalle.volver", "Volver a facturas")}</Button>} />
          ) : (
            <SkeletonCards count={4} />
          )}
        </PageContainer>
      </AppLayout>
    );
  }

  const esBorrador = inv.status === "draft";
  const abierta = ["issued", "sent", "viewed", "partiallyPaid", "overdue", "disputed"].includes(inv.status);
  const saldo = balanceCents(inv);
  // The public link is where the client pays once the invoice is out.
  const cobrable = ["issued", "sent", "viewed", "partiallyPaid", "overdue"].includes(inv.status);
  const canEdit = hasPermission("invoiceEdit");
  const canSend = hasPermission("invoiceSend");
  const canDestroy = hasPermission("invoiceDestroy");

  const acciones = (
    <>
      <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> {t("ui.Facturacion.detalle.atras", "Atrás")}</Button>
      <Button variant="outline" onClick={descargar}><Download size={14} /> PDF</Button>
      {publicUrl && (cobrable
        ? <Button variant="outline" onClick={copiarEnlace}><CreditCard size={14} /> {t("ui.Facturacion.detalle.copiarEnlaceDePago", "Copiar enlace de pago")}</Button>
        : <Button variant="outline" onClick={copiarEnlace}><Link2 size={14} /> {t("ui.Facturacion.detalle.copiarEnlace", "Copiar enlace público")}</Button>)}
      {esBorrador && canEdit && !editando && <Button variant="outline" onClick={() => setEditando(true)}><Pencil size={14} /> {t("ui.Facturacion.detalle.editar", "Editar")}</Button>}
      {esBorrador && canEdit && <Button disabled={trabajando} variant="brand" onClick={emitir}><CheckCircle2 size={14} /> {t("ui.Facturacion.detalle.emitir", "Emitir")}</Button>}
      {(esBorrador || abierta) && canSend && <Button disabled={trabajando} variant={esBorrador ? "outline" : "brand"} onClick={() => setModal("enviar")}><Send size={14} /> {t("ui.Facturacion.detalle.enviar", "Enviar")}</Button>}
      {abierta && canEdit && saldo > 0 && <Button disabled={trabajando} variant="outline" onClick={() => setModal("pago")}><CreditCard size={14} /> {t("ui.Facturacion.detalle.registrarPago", "Registrar pago")}</Button>}
      {(abierta || inv.status === "paid") && canEdit && <Button disabled={trabajando} variant="outline" onClick={() => setModal("credito")}><FileText size={14} /> {t("ui.Facturacion.detalle.notaDeCredito", "Nota de crédito")}</Button>}
      {abierta && canEdit && (inv.status === "disputed"
        ? <Button disabled={trabajando} variant="outline" onClick={resolverDisputa}><ShieldAlert size={14} /> {t("ui.Facturacion.detalle.resolverDisputa", "Resolver disputa")}</Button>
        : <Button disabled={trabajando} variant="outline" onClick={() => setModal("disputa")}><ShieldAlert size={14} /> {t("ui.Facturacion.detalle.marcarEnDisputa", "Marcar en disputa")}</Button>)}
      {abierta && canDestroy && Number(inv.paidCents) === 0 && <Button disabled={trabajando} variant="outline" onClick={() => setModal("anular")}><Ban size={14} /> {t("ui.Facturacion.detalle.anular", "Anular")}</Button>}
      {esBorrador && canDestroy && <Button disabled={trabajando} variant="destructive" onClick={eliminar}><Trash2 size={14} /> {t("ui.Facturacion.detalle.eliminarBorrador", "Eliminar borrador")}</Button>}
    </>
  );

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<Receipt />}
          title={inv.number || t("ui.Facturacion.detalle.borradorSinNumero", "Borrador (sin número)")}
          subtitle={
            <span>
              <Link className="underline-offset-2 hover:underline" to={`/clients/${inv.clientAccountId}/invoices`}>{nombreDelCliente(inv.clientAccount)}</Link>
              {inv.contract ? ` · ${inv.contract.name}` : ""}
            </span>
          }
          badges={<StatusBadge tone={etiquetas.invoiceTone[inv.status]}>{etiquetas.invoiceStatus[inv.status]}</StatusBadge>}
          actions={acciones}
        />

        {inv.status === "void" && inv.voidReason && <InfoNote tone="neutral" title={t("ui.Facturacion.detalle.anulada", "Anulada")}>{inv.voidReason}</InfoNote>}
        {cobrable && publicUrl && (
          <InfoNote tone="brand" icon={<CreditCard />} title={t("ui.Facturacion.detalle.enlaceDePago", "Enlace de pago")}>
            <div className="flex flex-wrap items-center gap-2">
              <span>{t("ui.Facturacion.detalle.enlaceDePagoDesc", "El cliente ve la factura y paga en línea desde este enlace (es el mismo que va en el correo).")}</span>
              <code className="break-all text-xs">{publicUrl}</code>
              <Button size="sm" variant="outline" onClick={copiarEnlace}><CreditCard size={14} /> {t("ui.Facturacion.detalle.copiarEnlaceDePago", "Copiar enlace de pago")}</Button>
            </div>
          </InfoNote>
        )}
        {inv.status === "disputed" && <InfoNote tone="bad" title={t("ui.Facturacion.detalle.enDisputa", "En disputa")}>{t("ui.Facturacion.detalle.enDisputaDesc", "El cliente objetó esta factura. Mientras esté en disputa no corren recordatorios ni recargos.")}</InfoNote>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Section className="lg:col-span-2" title={t("ui.Facturacion.detalle.datos", "Datos")}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label={t("ui.Facturacion.facturas.emitida", "Emitida")} value={soloFecha(inv.issuedAt)} />
              <Field label={t("ui.Facturacion.facturas.vence", "Vence")} value={soloFechaCivil(inv.dueAt)} />
              <Field label={t("ui.Facturacion.facturas.ordenDeCompra", "Orden de compra (PO)")} value={inv.poNumber || "—"} />
              <Field label={t("ui.Facturacion.detalle.periodo", "Periodo")} value={inv.periodStart ? `${soloFechaCivil(inv.periodStart)} → ${soloFechaCivil(inv.periodEnd)}` : "—"} />
              <Field label={t("ui.Facturacion.detalle.enviada", "Enviada")} value={fechaYHora(inv.sentAt)} />
              <Field label={t("ui.Facturacion.detalle.vista", "Vista por el cliente")} value={fechaYHora(inv.viewedAt)} />
              {inv.billingRunId && (
                <Field label={t("ui.Facturacion.detalle.corrida", "Corrida")} value={<Link className="underline-offset-2 hover:underline" to={`/facturacion/corridas/${inv.billingRunId}`}>{t("ui.Facturacion.detalle.verCorrida", "Ver corrida")}</Link>} />
              )}
            </div>
            {inv.billTo && (
              <div className="mt-4">
                <div className="cg-eyebrow mb-1">{t("ui.Facturacion.detalle.facturarA", "Facturar a")}</div>
                <div className="text-sm">
                  <div className="font-medium">{inv.billTo.name}</div>
                  {inv.billTo.attention && <div>{t("ui.Facturacion.detalle.atencion", "Atención")}: {inv.billTo.attention}</div>}
                  {inv.billTo.email && <div>{inv.billTo.email}</div>}
                  <div style={{ color: "var(--ink-soft)" }}>{[inv.billTo.address, inv.billTo.city, inv.billTo.state, inv.billTo.postalCode].filter(Boolean).join(", ")}</div>
                </div>
              </div>
            )}
            {inv.notes && (
              <div className="mt-4">
                <div className="cg-eyebrow mb-1">{t("ui.Facturacion.facturas.notas", "Notas para el cliente")}</div>
                <div className="whitespace-pre-wrap text-sm">{inv.notes}</div>
              </div>
            )}
          </Section>

          <Section title={t("ui.Facturacion.detalle.totales", "Totales")}>
            <dl className="space-y-1.5 text-sm tabular-nums">
              <Fila label={t("ui.Facturacion.facturas.subtotal", "Subtotal")} value={dinero(inv.subtotalCents, inv.currency)} />
              {(inv.taxBreakdown ?? []).map((r, i) => <Fila key={i} label={`${r.name} (${(r.rateBps / 100).toFixed(2)} %)`} value={dinero(r.taxCents, inv.currency)} suave />)}
              {!inv.taxBreakdown?.length && <Fila label={t("ui.Facturacion.detalle.impuestos", "Impuestos")} value={dinero(inv.taxCents, inv.currency)} suave />}
              {Number(inv.lateFeeCents) > 0 && <Fila label={t("ui.Facturacion.detalle.recargoPorMora", "Recargo por mora")} value={dinero(inv.lateFeeCents, inv.currency)} />}
              <Fila label={t("ui.Facturacion.facturas.total", "Total")} value={dinero(inv.totalCents, inv.currency)} fuerte />
              <Fila label={t("ui.Facturacion.detalle.pagado", "Pagado")} value={`− ${dinero(inv.paidCents, inv.currency)}`} suave />
              <Fila label={t("ui.Facturacion.detalle.acreditado", "Acreditado")} value={`− ${dinero(inv.creditedCents, inv.currency)}`} suave />
              <Fila label={t("ui.Facturacion.facturas.saldo", "Saldo")} value={dinero(saldo, inv.currency)} fuerte />
            </dl>
          </Section>
        </div>

        {editando && esBorrador ? (
          <EditorDeBorrador inv={inv} onClose={() => setEditando(false)} onSaved={async () => { setEditando(false); await refrescar(); }} />
        ) : (
          <Section title={t("ui.Facturacion.facturas.lineas", "Líneas")} bare>
            <TabTable minWidth={720}>
              <THead>
                <Th>{t("ui.Facturacion.facturas.descripcion", "Descripción")}</Th>
                <Th>{t("ui.Facturacion.detalle.fecha", "Fecha")}</Th>
                <Th align="right">{t("ui.Facturacion.facturas.cantidad", "Cant.")}</Th>
                <Th align="right">{t("ui.Facturacion.facturas.precioUnitario", "Precio")}</Th>
                <Th>{t("ui.Facturacion.detalle.recargo", "Recargo")}</Th>
                <Th align="right">{t("ui.Facturacion.detalle.importe", "Importe")}</Th>
              </THead>
              <tbody>
                {(inv.lines ?? []).map((l, i) => (
                  <Tr key={l.id || i}>
                    <td className="px-3 py-2">{l.description}{l.taxable === false && <span className="ml-1 text-xs" style={{ color: "var(--ink-faint)" }}>({t("ui.Facturacion.detalle.exento", "exento")})</span>}</td>
                    <td className="px-3 py-2">{soloFechaCivil(l.date)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cantidad(l.quantityHundredths)} {l.unit ? etiquetas.unit[l.unit as keyof typeof etiquetas.unit] || l.unit : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dinero(l.unitCents, inv.currency)}</td>
                    <td className="px-3 py-2">{l.premiumKind && l.premiumKind !== "none" ? <StatusBadge tone={etiquetas.premiumTone[l.premiumKind]}>{etiquetas.premium[l.premiumKind]}</StatusBadge> : null}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dinero(l.amountCents ?? Math.round((l.quantityHundredths * l.unitCents) / 100), inv.currency)}</td>
                  </Tr>
                ))}
              </tbody>
            </TabTable>
          </Section>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title={t("ui.Facturacion.detalle.pagos", "Pagos")}>
            {(inv.payments ?? []).length ? (
              <div className="space-y-2">
                {(inv.payments ?? []).map((p) => (
                  <ListRow key={p.id} title={dinero(p.amountCents, p.currency || inv.currency)} subtitle={[etiquetas.paymentMethod[p.method] || p.method, p.reference, p.note].filter(Boolean).join(" · ")} meta={soloFecha(p.receivedAt || p.createdAt)} />
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.detalle.sinPagos", "Sin pagos registrados.")}</p>
            )}
          </Section>
          <Section title={t("ui.Facturacion.detalle.notasDeCredito", "Notas de crédito")}>
            {(inv.creditNotes ?? []).length ? (
              <div className="space-y-2">
                {(inv.creditNotes ?? []).map((c) => (
                  <ListRow key={c.id} title={`${c.number} · ${dinero(c.amountCents, inv.currency)}`} subtitle={c.reason || undefined} meta={soloFecha(c.issuedAt || c.createdAt)} />
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.detalle.sinNotasDeCredito", "Sin notas de crédito.")}</p>
            )}
          </Section>
        </div>

        <Section title={t("ui.Facturacion.detalle.historial", "Historial")}>
          <ol className="space-y-2 text-sm">
            {(inv.events ?? []).map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="tabular-nums" style={{ color: "var(--ink-faint)" }}>{fechaYHora(ev.createdAt)}</span>
                <span className="font-medium">{etiquetas.event[ev.type as keyof typeof etiquetas.event] || ev.type}</span>
                <span style={{ color: "var(--ink-soft)" }}>{detalleDeEvento(ev.detail, inv.currency)}</span>
                {ev.actorType === "client" && <StatusBadge tone="info">{t("ui.Facturacion.detalle.cliente", "Cliente")}</StatusBadge>}
                {ev.actorType === "system" && <StatusBadge tone="neutral">{t("ui.Facturacion.detalle.automatico", "Automático")}</StatusBadge>}
              </li>
            ))}
            {!(inv.events ?? []).length && <li style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.detalle.sinHistorial", "Sin movimientos todavía.")}</li>}
          </ol>
        </Section>

        {modal === "enviar" && <EnviarModal inv={inv} trabajando={trabajando} onClose={() => setModal(null)} onSend={(to, message) => correr(async () => {
          const r = await clientBillingService.sendInvoice(inv.id, { to, message, lang: localeActual().slice(0, 2) });

          if (!r.sent) throw new Error(r.reason || t("ui.Facturacion.detalle.noSeEnvio", "No se pudo enviar el correo. Revisa los destinatarios."));
        }, t("ui.Facturacion.detalle.enviadaOk", "Factura enviada"))} />}
        {modal === "pago" && <PagoModal inv={inv} saldo={saldo} trabajando={trabajando} onClose={() => setModal(null)} onSave={(body) => correr(() => clientBillingService.recordPayment(inv.id, body), t("ui.Facturacion.detalle.pagoRegistrado", "Pago registrado"))} />}
        {modal === "credito" && <CreditoModal inv={inv} saldo={saldo} trabajando={trabajando} onClose={() => setModal(null)} onSave={(amountCents, reason) => correr(() => clientBillingService.creditNote(inv.id, { amountCents, reason }), t("ui.Facturacion.detalle.notaDeCreditoEmitida", "Nota de crédito emitida"))} />}
        {modal === "anular" && <MotivoModal titulo={t("ui.Facturacion.detalle.anular", "Anular")} descripcion={t("ui.Facturacion.detalle.anularDesc", "La factura queda anulada y deja de contar en el saldo del cliente. Si ya tiene pagos, usa una nota de crédito.")} trabajando={trabajando} tono="danger" onClose={() => setModal(null)} onSave={(reason) => correr(() => clientBillingService.voidInvoice(inv.id, reason), t("ui.Facturacion.detalle.anuladaOk", "Factura anulada"))} />}
        {modal === "disputa" && <MotivoModal titulo={t("ui.Facturacion.detalle.marcarEnDisputa", "Marcar en disputa")} descripcion={t("ui.Facturacion.detalle.disputaDesc", "Anota qué objeta el cliente. Mientras esté en disputa no corren recordatorios ni recargos.")} trabajando={trabajando} onClose={() => setModal(null)} onSave={(note) => correr(() => clientBillingService.setDisputed(inv.id, true, note), t("ui.Facturacion.detalle.marcadaEnDisputa", "Factura marcada en disputa"))} />}
      </PageContainer>
    </AppLayout>
  );
}

function Fila({ label, value, fuerte, suave }: { label: string; value: string; fuerte?: boolean; suave?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? "font-semibold" : ""}`} style={suave ? { color: "var(--ink-soft)" } : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function detalleDeEvento(detail: Record<string, unknown> | null, currency: string): string {
  if (!detail) return "";
  const partes: string[] = [];

  if (typeof detail.number === "string") partes.push(detail.number);
  if (typeof detail.amountCents === "number") partes.push(dinero(detail.amountCents, currency));
  if (typeof detail.method === "string") partes.push(detail.method);
  if (Array.isArray(detail.to)) partes.push((detail.to as string[]).join(", "));
  if (typeof detail.reason === "string" && detail.reason) partes.push(detail.reason);
  if (typeof detail.note === "string" && detail.note) partes.push(detail.note);
  if (typeof detail.days === "number") partes.push(`${detail.days} d`);

  return partes.join(" · ");
}

/* ── Draft editor: lines, due date, PO, notes → PUT ───────────────────────── */
type LineaEditable = { id?: string; description: string; quantity: string; unitPrice: string; taxable: boolean; date: string };

function EditorDeBorrador({ inv, onClose, onSaved }: { inv: Invoice; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [dueAt, setDueAt] = useState(inv.dueAt || "");
  const [poNumber, setPoNumber] = useState(inv.poNumber || "");
  const [notes, setNotes] = useState(inv.notes || "");
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLineas((inv.lines ?? []).map((l) => ({ id: l.id, description: l.description, quantity: (l.quantityHundredths / 100).toFixed(2), unitPrice: (l.unitCents / 100).toFixed(2), taxable: l.taxable !== false, date: l.date || "" })));
  }, [inv.id, inv.updatedAt]);

  const aCentavos = (s: string) => Math.round((Number(String(s).replace(",", ".")) || 0) * 100);
  const setLinea = (i: number, patch: Partial<LineaEditable>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const guardar = async () => {
    setSaving(true);
    try {
      const lines: InvoiceLine[] = lineas
        .filter((l) => l.description.trim() && aCentavos(l.quantity) > 0)
        .map((l) => ({ id: l.id, description: l.description.trim(), quantityHundredths: aCentavos(l.quantity), unitCents: aCentavos(l.unitPrice), taxable: l.taxable, date: l.date || null, unit: "each" }));

      await clientBillingService.updateInvoice(inv.id, { dueAt: dueAt || null, poNumber: poNumber || null, notes: notes || null, lines });
      toast.success(t("ui.Facturacion.detalle.borradorGuardado", "Borrador guardado"));
      await onSaved();
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title={t("ui.Facturacion.detalle.editarBorrador", "Editar borrador")}
      action={
        <div className="cg-acciones">
          <Button variant="outline" onClick={onClose}>{t("ui.Facturacion.cancelar", "Cancelar")}</Button>
          <Button disabled={saving} variant="brand" onClick={guardar}>{saving ? t("ui.Facturacion.guardando", "Guardando…") : t("ui.Facturacion.guardar", "Guardar")}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label={t("ui.Facturacion.facturas.vence", "Vence")}>
          <input className={FIELD_CLS} type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </FormField>
        <FormField label={t("ui.Facturacion.facturas.ordenDeCompra", "Orden de compra (PO)")}>
          <input className={FIELD_CLS} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
        </FormField>
      </div>
      <div className="mt-3 space-y-2">
        <div className="cg-eyebrow">{t("ui.Facturacion.facturas.lineas", "Líneas")}</div>
        {lineas.map((l, i) => (
          <div key={l.id || i} className="grid grid-cols-12 items-center gap-2">
            <input className={`${FIELD_CLS} col-span-12 sm:col-span-5`} placeholder={t("ui.Facturacion.facturas.descripcion", "Descripción")} value={l.description} onChange={(e) => setLinea(i, { description: e.target.value })} />
            <input className={`${FIELD_CLS} col-span-4 sm:col-span-2`} type="date" value={l.date} onChange={(e) => setLinea(i, { date: e.target.value })} />
            <input className={`${FIELD_CLS} col-span-3 sm:col-span-1`} inputMode="decimal" value={l.quantity} onChange={(e) => setLinea(i, { quantity: e.target.value })} />
            <input className={`${FIELD_CLS} col-span-3 sm:col-span-2`} inputMode="decimal" value={l.unitPrice} onChange={(e) => setLinea(i, { unitPrice: e.target.value })} />
            <label className="col-span-1 flex items-center gap-1 text-xs" title={t("ui.Facturacion.facturas.gravable", "Gravable")}>
              <input checked={l.taxable} className="cg-focus size-4" style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => setLinea(i, { taxable: e.target.checked })} />
              {t("ui.Facturacion.facturas.impuestoAbrev", "Imp.")}
            </label>
            <Button className="col-span-1" size="icon" variant="ghost" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setLineas((ls) => [...ls, { description: "", quantity: "1", unitPrice: "", taxable: true, date: "" }])}><Plus size={14} /> {t("ui.Facturacion.facturas.agregarLinea", "Agregar línea")}</Button>
      </div>
      <FormField className="mt-3" label={t("ui.Facturacion.facturas.notas", "Notas para el cliente")}>
        <textarea className={`${FIELD_CLS} h-20`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>
    </Section>
  );
}

/* ── Modals ───────────────────────────────────────────────────────────────── */
function EnviarModal({ inv, trabajando, onClose, onSend }: { inv: Invoice; trabajando: boolean; onClose: () => void; onSend: (to: string[], message: string) => void }) {
  const { t } = useTranslation();
  const [to, setTo] = useState(inv.billTo?.email || "");
  const [message, setMessage] = useState("");
  const destinatarios = to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);

  return (
    <Modal open size="md" title={t("ui.Facturacion.detalle.enviar", "Enviar")} description={inv.status === "draft" ? t("ui.Facturacion.detalle.enviarBorradorDesc", "El borrador se emite primero (se le asigna número) y luego se envía por correo con el PDF y el enlace público.") : t("ui.Facturacion.detalle.enviarDesc", "Se envía por correo el PDF y el enlace público de la factura.")} onOpenChange={(o) => { if (!o) onClose(); }}
      footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={onClose}>{t("ui.Facturacion.cancelar", "Cancelar")}</Button><Button disabled={trabajando || !destinatarios.length} variant="brand" onClick={() => onSend(destinatarios, message)}><Send size={14} /> {t("ui.Facturacion.detalle.enviar", "Enviar")}</Button></div>}
    >
      <div className="space-y-3">
        <FormField label={t("ui.Facturacion.detalle.destinatarios", "Destinatarios")} hint={t("ui.Facturacion.detalle.destinatariosHint", "Separa varios correos con comas.")} required>
          <input className={FIELD_CLS} value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
        <FormField label={t("ui.Facturacion.detalle.mensaje", "Mensaje")}>
          <textarea className={`${FIELD_CLS} h-24`} value={message} onChange={(e) => setMessage(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

function PagoModal({ inv, saldo, trabajando, onClose, onSave }: { inv: Invoice; saldo: number; trabajando: boolean; onClose: () => void; onSave: (body: { amountCents: number; method: PaymentMethod; receivedAt?: string; reference?: string; note?: string }) => void }) {
  const { t } = useTranslation();
  const etiquetas = useEtiquetasDeFacturacion();
  const [amount, setAmount] = useState((saldo / 100).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>("ach");
  const [receivedAt, setReceivedAt] = useState(hoyEnLaEmpresa());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const cents = Math.round((Number(String(amount).replace(",", ".")) || 0) * 100);

  return (
    <Modal open size="md" title={t("ui.Facturacion.detalle.registrarPago", "Registrar pago")} description={t("ui.Facturacion.detalle.registrarPagoDesc", "Saldo pendiente: {{s}}", { s: dinero(saldo, inv.currency) })} onOpenChange={(o) => { if (!o) onClose(); }}
      footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={onClose}>{t("ui.Facturacion.cancelar", "Cancelar")}</Button><Button disabled={trabajando || cents <= 0} variant="brand" onClick={() => onSave({ amountCents: cents, method, receivedAt: receivedAt || undefined, reference: reference || undefined, note: note || undefined })}>{t("ui.Facturacion.guardar", "Guardar")}</Button></div>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("ui.Facturacion.detalle.importe", "Importe")} required>
          <input className={FIELD_CLS} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField label={t("ui.Facturacion.detalle.metodo", "Método")} required>
          <select className={FIELD_CLS} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{etiquetas.paymentMethod[m]}</option>)}
          </select>
        </FormField>
        <FormField label={t("ui.Facturacion.detalle.fechaDeRecepcion", "Recibido el")}>
          <input className={FIELD_CLS} type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        </FormField>
        <FormField label={t("ui.Facturacion.detalle.referencia", "Referencia")}>
          <input className={FIELD_CLS} value={reference} onChange={(e) => setReference(e.target.value)} />
        </FormField>
        <FormField className="sm:col-span-2" label={t("ui.Facturacion.detalle.nota", "Nota")}>
          <input className={FIELD_CLS} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

function CreditoModal({ inv, saldo, trabajando, onClose, onSave }: { inv: Invoice; saldo: number; trabajando: boolean; onClose: () => void; onSave: (amountCents: number, reason: string) => void }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState((saldo / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const cents = Math.round((Number(String(amount).replace(",", ".")) || 0) * 100);

  return (
    <Modal open size="md" title={t("ui.Facturacion.detalle.notaDeCredito", "Nota de crédito")} description={t("ui.Facturacion.detalle.notaDeCreditoDesc", "Reduce lo que el cliente debe sin tocar la factura emitida. Saldo actual: {{s}}", { s: dinero(saldo, inv.currency) })} onOpenChange={(o) => { if (!o) onClose(); }}
      footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={onClose}>{t("ui.Facturacion.cancelar", "Cancelar")}</Button><Button disabled={trabajando || cents <= 0 || !reason.trim()} variant="brand" onClick={() => onSave(cents, reason.trim())}>{t("ui.Facturacion.detalle.emitirNota", "Emitir nota")}</Button></div>}
    >
      <div className="space-y-3">
        <FormField label={t("ui.Facturacion.detalle.importe", "Importe")} required>
          <input className={FIELD_CLS} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <FormField label={t("ui.Facturacion.detalle.motivo", "Motivo")} required>
          <textarea className={`${FIELD_CLS} h-20`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

function MotivoModal({ titulo, descripcion, trabajando, tono, onClose, onSave }: { titulo: string; descripcion: string; trabajando: boolean; tono?: "danger"; onClose: () => void; onSave: (reason: string) => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");

  return (
    <Modal open size="sm" title={titulo} description={descripcion} onOpenChange={(o) => { if (!o) onClose(); }}
      footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={onClose}>{t("ui.Facturacion.cancelar", "Cancelar")}</Button><Button disabled={trabajando || !reason.trim()} variant={tono === "danger" ? "destructive" : "brand"} onClick={() => onSave(reason.trim())}>{titulo}</Button></div>}
    >
      <FormField label={t("ui.Facturacion.detalle.motivo", "Motivo")} required>
        <textarea className={`${FIELD_CLS} h-20`} value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
    </Modal>
  );
}
