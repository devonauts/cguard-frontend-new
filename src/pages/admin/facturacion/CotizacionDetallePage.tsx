/**
 * QUOTE DETAIL — the proposal, its money, the signature when the prospect
 * accepted it, what happened to it, and every action its status allows:
 * edit (a sent one becomes a new revision), send, share the link, PDF,
 * duplicate, cancel and — once accepted — convert into client + contract.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Ban, CheckCircle2, Copy, Download, FileSignature, Link2, Pencil, Receipt, Send, ShieldCheck, UserCheck, XCircle } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { PageContainer, PageHeader, Section, SkeletonCards, EmptyState, Modal, FormField, FIELD_CLS, StatusBadge, Field, InfoNote } from "@/components/kit";
import { TabTable, THead, Th, Tr } from "@/pages/admin/clientes/components/_shared/tab-kit";
import { usePermissions } from "@/hooks/usePermissions";
import { fechaYHora, soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import clientBillingService, { QUOTE_EDITABLE, type Quote, type QuoteLine } from "@/lib/api/clientBillingService";
import { QK, dinero, cantidad, nombreDelCliente, destinatarioDeCotizacion, FilaTotal, useEtiquetasDeFacturacion, mensajeDeError, conModuloDeFacturacion } from "./comun";

function CotizacionDetallePage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const etiquetas = useEtiquetasDeFacturacion();
  const [enviar, setEnviar] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const detalle = useQuery({ queryKey: [QK, "quote", id], queryFn: () => clientBillingService.quote(id), enabled: !!id });
  const quote = detalle.data?.quote;
  const publicUrl = detalle.data?.publicUrl ?? null;

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: [QK, "quote", id] });
    await qc.invalidateQueries({ queryKey: [QK, "quotes"] });
  };

  const correr = async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | null> => {
    setTrabajando(true);
    try {
      const r = await fn();

      if (ok) toast.success(ok);
      await refrescar();

      return r;
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar")));

      return null;
    } finally {
      setTrabajando(false);
    }
  };

  const copiar = async (url: string | null) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("ui.Cotizaciones.detalle.enlaceCopiado", "Enlace copiado: compártelo con el prospecto para que firme"));
    } catch {
      window.prompt(t("ui.Facturacion.detalle.copiaElEnlace", "Copia el enlace"), url);
    }
  };

  if (detalle.isLoading || !quote) {
    return (
      <AppLayout>
        <PageContainer>
          {detalle.isError ? (
            <EmptyState icon={<FileSignature />} title={t("ui.Cotizaciones.detalle.noEncontrada", "No se encontró la cotización")} action={<Button variant="outline" onClick={() => navigate("/facturacion/cotizaciones")}><ArrowLeft size={14} /> {t("ui.Cotizaciones.volver", "Volver a cotizaciones")}</Button>} />
          ) : (
            <SkeletonCards count={4} />
          )}
        </PageContainer>
      </AppLayout>
    );
  }

  const q: Quote = quote;
  const canEdit = hasPermission("estimateEdit");
  const canSend = hasPermission("estimateSend");
  const canCreate = hasPermission("estimateCreate");
  const canConvert = hasPermission("estimateConvert");
  const editable = QUOTE_EDITABLE.includes(q.status);
  const abierta = ["draft", "sent", "viewed"].includes(q.status);
  const compartible = !!publicUrl && ["sent", "viewed", "accepted", "converted"].includes(q.status);
  const cancelable = !["accepted", "converted", "cancelled"].includes(q.status);

  const editar = async () => {
    if (q.status !== "draft") {
      const ok = await confirmDialog({
        title: t("ui.Cotizaciones.detalle.editarEnviadaTitulo", "¿Crear una revisión?"),
        message: t("ui.Cotizaciones.detalle.editarEnviadaMsg", "Esta cotización ya salió. Al guardar los cambios se crea la revisión {{n}} con un enlace nuevo: el enlace que tiene el prospecto deja de funcionar y habrá que enviarla otra vez.", { n: Number(q.revision) + 1 }),
        confirmText: t("ui.Cotizaciones.detalle.editarIgual", "Editar y crear revisión"),
      });

      if (!ok) return;
    }
    navigate(`/facturacion/cotizaciones/${q.id}/editar`);
  };

  const marcarEnviada = async () => {
    const r = await correr(() => clientBillingService.markQuoteSent(q.id), t("ui.Cotizaciones.detalle.marcadaEnviada", "Marcada como enviada"));

    if (r?.publicUrl) await copiar(r.publicUrl);
  };

  const duplicar = async () => {
    const r = await correr(() => clientBillingService.duplicateQuote(q.id), t("ui.Cotizaciones.detalle.duplicada", "Cotización duplicada"));

    if (r?.quote) navigate(`/facturacion/cotizaciones/${r.quote.id}`);
  };

  const cancelar = async () => {
    const ok = await confirmDialog({
      title: t("ui.Cotizaciones.detalle.cancelar", "Cancelar cotización"),
      message: t("ui.Cotizaciones.detalle.cancelarMsg", "La cotización queda cancelada y su enlace deja de funcionar. No se puede deshacer; puedes duplicarla después."),
      tone: "danger",
      confirmText: t("ui.Cotizaciones.detalle.cancelar", "Cancelar cotización"),
    });

    if (ok) await correr(() => clientBillingService.cancelQuote(q.id), t("ui.Cotizaciones.detalle.cancelada", "Cotización cancelada"));
  };

  const convertir = async () => {
    const ok = await confirmDialog({
      title: t("ui.Cotizaciones.detalle.convertir", "Convertir en cliente y contrato"),
      message: q.clientAccountId
        ? t("ui.Cotizaciones.detalle.convertirMsgCliente", "Se crea un contrato en borrador con las tarifas cotizadas y, si hay pagos únicos, una factura en borrador. Revísalos y actívalos desde la ficha del cliente.")
        : t("ui.Cotizaciones.detalle.convertirMsgProspecto", "Se da de alta al prospecto como cliente, se crea un contrato en borrador con las tarifas cotizadas y, si hay pagos únicos, una factura en borrador. Revísalos y actívalos desde la ficha del cliente."),
      confirmText: t("ui.Cotizaciones.detalle.convertir", "Convertir en cliente y contrato"),
    });

    if (!ok) return;
    const r = await correr(() => clientBillingService.convertQuote(q.id));

    if (!r) return;
    toast.success(t("ui.Cotizaciones.detalle.convertida", "Listo: cliente y contrato en borrador creados"), {
      action: { label: t("ui.Cotizaciones.detalle.verContrato", "Ver contrato"), onClick: () => navigate(`/clients/${r.clientAccountId}/billing-contract`) },
    });
  };

  const descargar = async () => {
    try {
      await clientBillingService.downloadQuotePdf(q);
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.detalle.noSePudoDescargar", "No se pudo descargar el PDF")));
    }
  };

  const acciones = (
    <>
      <Button variant="outline" onClick={() => navigate("/facturacion/cotizaciones")}><ArrowLeft size={14} /> {t("ui.Facturacion.detalle.atras", "Atrás")}</Button>
      {q.status === "accepted" && canConvert && (
        <Button disabled={trabajando} variant="brand" onClick={convertir}><UserCheck size={14} /> {t("ui.Cotizaciones.detalle.convertir", "Convertir en cliente y contrato")}</Button>
      )}
      {abierta && canSend && (
        <Button disabled={trabajando} variant={q.status === "draft" ? "brand" : "outline"} onClick={() => setEnviar(true)}><Send size={14} /> {t("ui.Cotizaciones.detalle.enviarPorCorreo", "Enviar por correo")}</Button>
      )}
      {q.status === "draft" && canSend && (
        <Button disabled={trabajando} variant="outline" onClick={marcarEnviada}><Link2 size={14} /> {t("ui.Cotizaciones.detalle.marcarEnviada", "Marcar como enviada y copiar enlace")}</Button>
      )}
      {compartible && <Button variant="outline" onClick={() => copiar(publicUrl)}><Link2 size={14} /> {t("ui.Cotizaciones.detalle.copiarEnlace", "Copiar enlace")}</Button>}
      {editable && canEdit && <Button disabled={trabajando} variant="outline" onClick={editar}><Pencil size={14} /> {t("ui.Cotizaciones.detalle.editar", "Editar")}</Button>}
      <Button variant="outline" onClick={descargar}><Download size={14} /> PDF</Button>
      {canCreate && <Button disabled={trabajando} variant="outline" onClick={duplicar}><Copy size={14} /> {t("ui.Cotizaciones.detalle.duplicar", "Duplicar")}</Button>}
      {cancelable && canEdit && <Button disabled={trabajando} variant="outline" onClick={cancelar}><Ban size={14} /> {t("ui.Cotizaciones.detalle.cancelarCorto", "Cancelar")}</Button>}
    </>
  );

  const p = q.prospect;
  const lineas: QuoteLine[] = q.lines ?? [];

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<FileSignature />}
          title={
            <span>
              {q.number}
              {Number(q.revision) > 1 && <span className="ml-2 text-base font-normal" style={{ color: "var(--ink-soft)" }}>{t("ui.Cotizaciones.revision", "Revisión {{n}}", { n: q.revision })}</span>}
            </span>
          }
          subtitle={<span>{destinatarioDeCotizacion(q)} · {q.title}</span>}
          badges={<StatusBadge tone={etiquetas.quoteTone[q.status]}>{etiquetas.quoteStatus[q.status] || q.status}</StatusBadge>}
          actions={acciones}
        />

        {q.status === "accepted" && (
          <InfoNote tone="ok" icon={<CheckCircle2 />} title={t("ui.Cotizaciones.detalle.aceptadaTitulo", "El prospecto aceptó y firmó")}>
            {canConvert
              ? t("ui.Cotizaciones.detalle.aceptadaDesc", "Conviértela en cliente y contrato para empezar a programar y facturar el servicio.")
              : t("ui.Cotizaciones.detalle.aceptadaSinPermiso", "Pide a quien tenga el permiso de convertir cotizaciones que la pase a cliente y contrato.")}
          </InfoNote>
        )}
        {q.status === "converted" && (
          <InfoNote tone="ok" icon={<UserCheck />} title={t("ui.Cotizaciones.detalle.convertidaTitulo", "Convertida en cliente y contrato")}>
            <div className="flex flex-wrap items-center gap-2">
              {q.clientAccountId && q.contractId && (
                <Button asChild size="sm" variant="outline"><Link to={`/clients/${q.clientAccountId}/billing-contract`}><FileSignature size={14} /> {t("ui.Cotizaciones.detalle.verContrato", "Ver contrato")}</Link></Button>
              )}
              {q.setupInvoiceId && (
                <Button asChild size="sm" variant="outline"><Link to={`/facturacion/facturas/${q.setupInvoiceId}`}><Receipt size={14} /> {t("ui.Cotizaciones.detalle.verFacturaInicial", "Ver factura de pagos únicos")}</Link></Button>
              )}
              {q.convertedAt && <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{fechaYHora(q.convertedAt)}</span>}
            </div>
          </InfoNote>
        )}
        {q.status === "rejected" && (
          <InfoNote tone="bad" icon={<XCircle />} title={t("ui.Cotizaciones.detalle.rechazadaTitulo", "El prospecto la rechazó")}>
            {q.rejectReason || t("ui.Cotizaciones.detalle.sinMotivo", "No dejó motivo.")}
            {q.rejectedAt ? ` · ${fechaYHora(q.rejectedAt)}` : ""}
          </InfoNote>
        )}
        {q.status === "expired" && <InfoNote tone="warn">{t("ui.Cotizaciones.detalle.vencidaDesc", "Pasó su fecha de validez sin firma. Edítala (con una fecha nueva) para volver a enviarla.")}</InfoNote>}
        {compartible && abierta && publicUrl && (
          <InfoNote tone="brand" icon={<Link2 />} title={t("ui.Cotizaciones.detalle.enlaceDeFirma", "Enlace de firma")}>
            <div className="flex flex-wrap items-center gap-2">
              <span>{t("ui.Cotizaciones.detalle.enlaceDeFirmaDesc", "El prospecto ve la propuesta y la firma en línea desde este enlace (es el mismo que va en el correo).")}</span>
              <code className="break-all text-xs">{publicUrl}</code>
            </div>
          </InfoNote>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Section className="lg:col-span-2" title={q.clientAccountId ? t("ui.Cotizaciones.detalle.cliente", "Cliente") : t("ui.Cotizaciones.detalle.prospecto", "Prospecto")}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {q.clientAccountId && q.clientAccount ? (
                <Field label={t("ui.Cotizaciones.detalle.cliente", "Cliente")} value={<Link className="underline-offset-2 hover:underline" to={`/clients/${q.clientAccountId}/overview`}>{nombreDelCliente(q.clientAccount)}</Link>} />
              ) : (
                <Field label={t("ui.Cotizaciones.editor.empresa", "Empresa")} value={p?.company || "—"} />
              )}
              <Field label={t("ui.Cotizaciones.editor.contacto", "Nombre del contacto")} value={[p?.contactName, p?.title].filter(Boolean).join(" · ") || "—"} />
              <Field label={t("ui.Cotizaciones.editor.correo", "Correo")} value={p?.email || q.clientAccount?.email || "—"} />
              <Field label={t("ui.Cotizaciones.editor.telefono", "Teléfono")} value={p?.phone || "—"} />
              <Field label={t("ui.Cotizaciones.editor.direccion", "Dirección")} value={[p?.address, p?.city, p?.state, p?.postalCode].filter(Boolean).join(", ") || "—"} />
              <Field label={t("ui.Cotizaciones.editor.idioma", "Idioma del documento")} value={q.language === "es" ? "Español" : "English"} />
              <Field label={t("ui.Cotizaciones.editor.validaHasta", "Válida hasta")} value={soloFechaCivil(q.validUntil)} />
              <Field label={t("ui.Cotizaciones.editor.inicio", "Inicio propuesto del servicio")} value={soloFechaCivil(q.startDate)} />
              <Field label={t("ui.Cotizaciones.editor.ciclo", "Ciclo de facturación")} value={etiquetas.cycle[q.billingCycle] || q.billingCycle} />
              <Field label={t("ui.Cotizaciones.editor.terminosDePago", "Términos de pago (días)")} value={String(q.paymentTermsDays ?? "—")} />
              <Field label={t("ui.Cotizaciones.detalle.enviada", "Enviada")} value={fechaYHora(q.sentAt)} />
              <Field label={t("ui.Cotizaciones.detalle.vista", "Vista por el prospecto")} value={fechaYHora(q.viewedAt)} />
            </div>
            {q.intro && (
              <div className="mt-4">
                <div className="cg-eyebrow mb-1">{t("ui.Cotizaciones.editor.intro", "Introducción")}</div>
                <div className="whitespace-pre-wrap text-sm">{q.intro}</div>
              </div>
            )}
          </Section>

          <Section title={t("ui.Cotizaciones.totales", "Totales")}>
            <dl className="space-y-1.5 text-sm tabular-nums">
              <FilaTotal label={t("ui.Cotizaciones.subtotalMensual", "Subtotal mensual")} value={dinero(Number(q.monthlySubtotalCents), q.currency)} />
              {(q.taxBreakdown ?? []).map((r, i) => <FilaTotal key={i} label={`${r.name} (${(r.rateBps / 100).toFixed(2)} %)`} value={dinero(r.taxCents, q.currency)} suave />)}
              {!q.taxBreakdown?.length && <FilaTotal label={t("ui.Cotizaciones.impuestoEstimado", "Impuesto estimado")} value={dinero(Number(q.taxCents), q.currency)} suave />}
              <FilaTotal label={t("ui.Cotizaciones.totalMensual", "Total mensual")} value={dinero(Number(q.monthlyTotalCents), q.currency)} fuerte />
              <FilaTotal label={t("ui.Cotizaciones.pagoUnico", "Pago único")} value={dinero(Number(q.oneTimeCents), q.currency)} />
            </dl>
          </Section>
        </div>

        <Section title={t("ui.Cotizaciones.editor.lineas", "Servicios cotizados")} bare>
          <TabTable minWidth={820}>
            <THead>
              <Th>{t("ui.Cotizaciones.editor.tipo", "Tipo")}</Th>
              <Th>{t("ui.Cotizaciones.editor.descripcion", "Descripción")}</Th>
              <Th>{t("ui.Cotizaciones.editor.sede", "Sede o puesto")}</Th>
              <Th>{t("ui.Cotizaciones.detalle.horario", "Horario / cantidad")}</Th>
              <Th align="right">{t("ui.Cotizaciones.detalle.tarifa", "Tarifa")}</Th>
              <Th align="right">{t("ui.Cotizaciones.detalle.mensual", "Mensual")}</Th>
              <Th align="right">{t("ui.Cotizaciones.pagoUnico", "Pago único")}</Th>
            </THead>
            <tbody>
              {lineas.map((l, i) => (
                <Tr key={l.id || i}>
                  <td className="px-3 py-2">{etiquetas.quoteKind[l.kind] || l.kind}</td>
                  <td className="px-3 py-2">{l.description}{l.taxable === false && <span className="ml-1 text-xs" style={{ color: "var(--ink-faint)" }}>({t("ui.Facturacion.detalle.exento", "exento")})</span>}</td>
                  <td className="px-3 py-2">{l.siteLabel || "—"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {l.kind === "hourly"
                      ? `${t("ui.Cotizaciones.detalle.horasSemana", "{{h}} h/semana", { h: cantidad(l.quantityHundredths) })}${l.shiftType && l.shiftType !== "any" ? ` · ${etiquetas.shiftType[l.shiftType]}` : ""}`
                      : l.kind === "oneTime"
                        ? `× ${cantidad(l.quantityHundredths)}`
                        : t("ui.Cotizaciones.detalle.unidadesMes", "{{n}} al mes", { n: cantidad(l.quantityHundredths) })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{dinero(Number(l.unitCents), q.currency)}{l.kind === "hourly" ? t("ui.Cotizaciones.detalle.porHora", "/h") : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.kind === "oneTime" ? "—" : dinero(Number(l.monthlyCents ?? 0), q.currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.kind === "oneTime" ? dinero(Number(l.oneTimeCents ?? 0), q.currency) : "—"}</td>
                </Tr>
              ))}
            </tbody>
          </TabTable>
        </Section>

        {(q.status === "accepted" || q.status === "converted") && q.signerName && <FirmaCard q={q} />}

        {q.terms && (
          <Section title={t("ui.Cotizaciones.editor.terminos", "Términos y condiciones")}>
            <div className="whitespace-pre-wrap text-sm" style={{ color: "var(--ink-soft)" }}>{q.terms}</div>
          </Section>
        )}

        <Section title={t("ui.Facturacion.detalle.historial", "Historial")}>
          <ol className="space-y-2 text-sm">
            {(q.events ?? []).map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="tabular-nums" style={{ color: "var(--ink-faint)" }}>{fechaYHora(ev.createdAt)}</span>
                <span className="font-medium">{etiquetas.quoteEvent[ev.type as keyof typeof etiquetas.quoteEvent] || ev.type}</span>
                <span style={{ color: "var(--ink-soft)" }}>{detalleDeEvento(ev.detail)}</span>
                {ev.actorType === "client" && <StatusBadge tone="info">{t("ui.Cotizaciones.detalle.prospecto", "Prospecto")}</StatusBadge>}
                {ev.actorType === "system" && <StatusBadge tone="neutral">{t("ui.Facturacion.detalle.automatico", "Automático")}</StatusBadge>}
              </li>
            ))}
            {!(q.events ?? []).length && <li style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.detalle.sinHistorial", "Sin movimientos todavía.")}</li>}
          </ol>
        </Section>

        {enviar && (
          <EnviarCotizacionModal
            q={q}
            trabajando={trabajando}
            onClose={() => setEnviar(false)}
            onSend={async (to, message) => {
              const r = await correr(async () => {
                const res = await clientBillingService.sendQuote(q.id, { to, message: message || undefined });

                if (!res.sent) throw new Error(res.reason || t("ui.Cotizaciones.detalle.noSeEnvio", "No se pudo enviar el correo. Revisa los destinatarios."));

                return res;
              }, t("ui.Cotizaciones.detalle.enviadaOk", "Cotización enviada"));

              if (r) setEnviar(false);
            }}
          />
        )}
      </PageContainer>
    </AppLayout>
  );
}

/** The signed acceptance: who signed, when, the drawn signature and the hash of what was signed. */
function FirmaCard({ q }: { q: Quote }) {
  const { t } = useTranslation();
  const copiarHash = async () => {
    if (!q.contentHash) return;
    try {
      await navigator.clipboard.writeText(q.contentHash);
      toast.success(t("ui.Cotizaciones.firma.hashCopiado", "Huella copiada"));
    } catch {
      window.prompt("SHA-256", q.contentHash);
    }
  };

  return (
    <Section icon={<ShieldCheck />} title={t("ui.Cotizaciones.firma.titulo", "Firma del prospecto")}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="glass-flat grid min-h-[8rem] place-items-center rounded-lg p-3" style={{ background: "#fff" }}>
          {q.signature ? (
            <img alt={t("ui.Cotizaciones.firma.alt", "Firma de {{n}}", { n: q.signerName || "" })} className="max-h-40 w-auto object-contain" src={q.signature} />
          ) : (
            <span className="text-sm" style={{ color: "var(--ink-faint)" }}>—</span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Field label={t("ui.Cotizaciones.firma.firmante", "Firmó")} value={[q.signerName, q.signerTitle].filter(Boolean).join(" · ") || "—"} />
          <Field label={t("ui.Cotizaciones.editor.correo", "Correo")} value={q.signerEmail || "—"} />
          <Field label={t("ui.Cotizaciones.firma.fecha", "Aceptada el")} value={fechaYHora(q.acceptedAt)} />
          {q.contentHash && (
            <Field
              label={t("ui.Cotizaciones.firma.huella", "Huella de lo firmado (SHA-256)")}
              value={
                <span className="flex items-center gap-2">
                  <code className="text-xs" title={q.contentHash}>{q.contentHash.slice(0, 12)}…{q.contentHash.slice(-6)}</code>
                  <Button aria-label={t("ui.Cotizaciones.firma.copiarHuella", "Copiar huella")} size="icon" variant="ghost" onClick={copiarHash}><Copy size={14} /></Button>
                </span>
              }
            />
          )}
        </div>
      </div>
    </Section>
  );
}

function detalleDeEvento(detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  const partes: string[] = [];

  if (typeof detail.number === "string") partes.push(detail.number);
  if (typeof detail.revision === "number") partes.push(`rev. ${detail.revision}`);
  if (Array.isArray(detail.to) && detail.to.length) partes.push((detail.to as string[]).join(", "));
  if (typeof detail.signerName === "string") partes.push([detail.signerName, detail.signerTitle].filter(Boolean).join(", "));
  if (typeof detail.reason === "string" && detail.reason) partes.push(detail.reason);

  return partes.join(" · ");
}

function EnviarCotizacionModal({ q, trabajando, onClose, onSend }: { q: Quote; trabajando: boolean; onClose: () => void; onSend: (to: string[], message: string) => void }) {
  const { t } = useTranslation();
  const [to, setTo] = useState(q.prospect?.email || q.clientAccount?.email || "");
  const [message, setMessage] = useState("");
  const destinatarios = to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);

  return (
    <Modal
      open
      size="md"
      title={t("ui.Cotizaciones.detalle.enviarPorCorreo", "Enviar por correo")}
      description={t("ui.Cotizaciones.detalle.enviarDesc", "Se envía el PDF y el enlace para firmar en línea. La cotización queda como enviada.")}
      onOpenChange={(o) => { if (!o) onClose(); }}
      footer={
        <div className="cg-acciones justify-end">
          <Button variant="outline" onClick={onClose}>{t("ui.Facturacion.cancelar", "Cancelar")}</Button>
          <Button disabled={trabajando || !destinatarios.length} variant="brand" onClick={() => onSend(destinatarios, message.trim())}><Send size={14} /> {t("ui.Cotizaciones.detalle.enviar", "Enviar")}</Button>
        </div>
      }
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

export default conModuloDeFacturacion(CotizacionDetallePage);
