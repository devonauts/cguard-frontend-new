/**
 * BILLING RUN DETAIL — discrepancies first (they are what stands between the
 * shifts and the invoice), then the lines with inline fixes, then the actions
 * the status allows: client review, approve, cancel, invoice.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Ban, CheckCircle2, ClipboardCheck, Clock, Link2, Pencil, Receipt, Send, Timer, Wallet } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { PageContainer, PageHeader, Section, SkeletonCards, EmptyState, Modal, FormField, FIELD_CLS, StatusBadge, InfoNote, MetricTile, Stagger } from "@/components/kit";
import { TabTable, THead, Th, Tr } from "@/pages/admin/clientes/components/_shared/tab-kit";
import { usePermissions } from "@/hooks/usePermissions";
import { soloFechaCivil, fechaYHora } from "@/lib/horaDeLaEmpresa";
import clientBillingService, { type BillingRun, type Discrepancy, type DiscrepancySeverity, type RunItem } from "@/lib/api/clientBillingService";
import { QK, dinero, horas, cantidad, nombreDelCliente, useEtiquetasDeFacturacion, mensajeDeError } from "./comun";

export default function CorridaDetallePage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const etiquetas = useEtiquetasDeFacturacion();
  const [trabajando, setTrabajando] = useState(false);
  const [resolviendo, setResolviendo] = useState<Discrepancy | null>(null);
  const [editando, setEditando] = useState<RunItem | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  const detalle = useQuery({ queryKey: [QK, "run", id], queryFn: () => clientBillingService.run(id), enabled: !!id });
  const run = detalle.data?.run;
  const moneda = run?.contract?.currency;
  const canEdit = hasPermission("billingEdit");
  const canInvoice = hasPermission("invoiceCreate");

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: [QK, "run", id] });
    await qc.invalidateQueries({ queryKey: [QK, "runs"] });
  };

  const correr = async (fn: () => Promise<unknown>, ok: string) => {
    setTrabajando(true);
    try {
      await fn();
      toast.success(ok);
      await refrescar();

      return true;
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar")));

      return false;
    } finally {
      setTrabajando(false);
    }
  };

  const grupos = useMemo(() => {
    const out: Record<DiscrepancySeverity, Discrepancy[]> = { block: [], warn: [], info: [] };

    for (const d of run?.discrepancies ?? []) out[d.severity]?.push(d);

    return out;
  }, [run?.discrepancies]);
  const pendientes = (run?.discrepancies ?? []).filter((d) => d.resolution === "pending");
  const bloqueantes = pendientes.filter((d) => d.severity === "block").length;
  const itemsPorId = useMemo(() => new Map((run?.items ?? []).map((i) => [i.id, i])), [run?.items]);

  const enviarARevision = async () => {
    if (!run) return;
    setTrabajando(true);
    try {
      const r = await clientBillingService.sendToClientReview(run.id);

      setReviewUrl(r.reviewUrl);
      toast.success(t("ui.Facturacion.corridaDetalle.enviadaARevision", "Corrida enviada a revisión del cliente"));
      await refrescar();
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar")));
    } finally {
      setTrabajando(false);
    }
  };

  const aprobar = async () => {
    if (!run) return;
    if (!(await confirmDialog({ title: t("ui.Facturacion.corridaDetalle.aprobar", "Aprobar"), message: t("ui.Facturacion.corridaDetalle.aprobarConfirm", "Las líneas quedan cerradas y la corrida lista para facturar."), confirmText: t("ui.Facturacion.corridaDetalle.aprobar", "Aprobar") }))) return;
    await correr(() => clientBillingService.approveRun(run.id), t("ui.Facturacion.corridaDetalle.aprobada", "Corrida aprobada"));
  };

  const cancelar = async () => {
    if (!run) return;
    if (!(await confirmDialog({ title: t("ui.Facturacion.corridaDetalle.cancelar", "Cancelar corrida"), message: t("ui.Facturacion.corridaDetalle.cancelarConfirm", "La corrida se descarta. Podrás generar otra del mismo periodo."), tone: "danger", confirmText: t("ui.Facturacion.corridaDetalle.cancelar", "Cancelar corrida") }))) return;
    await correr(() => clientBillingService.cancelRun(run.id), t("ui.Facturacion.corridaDetalle.cancelada", "Corrida cancelada"));
  };

  const facturar = async () => {
    if (!run) return;
    setTrabajando(true);
    try {
      const { invoice } = await clientBillingService.invoiceRun(run.id);

      toast.success(t("ui.Facturacion.corridaDetalle.facturaCreada", "Borrador de factura creado"));
      await refrescar();
      await qc.invalidateQueries({ queryKey: [QK, "invoices"] });
      navigate(`/facturacion/facturas/${invoice.id}`);
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar")));
    } finally {
      setTrabajando(false);
    }
  };

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("ui.Facturacion.detalle.enlaceCopiado", "Enlace copiado"));
    } catch {
      window.prompt(t("ui.Facturacion.detalle.copiaElEnlace", "Copia el enlace"), url);
    }
  };

  if (detalle.isLoading || !run) {
    return (
      <AppLayout>
        <PageContainer>
          {detalle.isError ? (
            <EmptyState icon={<ClipboardCheck />} title={t("ui.Facturacion.corridaDetalle.noEncontrada", "No se encontró la corrida")} action={<Button variant="outline" onClick={() => navigate("/facturacion/corridas")}><ArrowLeft size={14} /> {t("ui.Facturacion.corridaDetalle.volver", "Volver a corridas")}</Button>} />
          ) : (
            <SkeletonCards count={4} />
          )}
        </PageContainer>
      </AppLayout>
    );
  }

  const editable = canEdit && (run.status === "draft" || run.status === "clientReview");
  const resumen = run.summary ?? {};

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<ClipboardCheck />}
          title={`${soloFechaCivil(run.periodStart)} → ${soloFechaCivil(run.periodEnd)}`}
          subtitle={<span><Link className="underline-offset-2 hover:underline" to={`/clients/${run.clientAccountId}/billing-contract`}>{nombreDelCliente(run.clientAccount)}</Link>{run.contract ? ` · ${run.contract.name}` : ""}</span>}
          badges={<StatusBadge tone={etiquetas.runTone[run.status]}>{etiquetas.runStatus[run.status]}</StatusBadge>}
          actions={
            <>
              <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft size={14} /> {t("ui.Facturacion.detalle.atras", "Atrás")}</Button>
              {run.status === "draft" && canEdit && <Button disabled={trabajando} variant="outline" onClick={enviarARevision}><Send size={14} /> {t("ui.Facturacion.corridaDetalle.enviarARevision", "Enviar a revisión del cliente")}</Button>}
              {(run.status === "draft" || run.status === "clientReview") && canEdit && (
                <Button disabled={trabajando || bloqueantes > 0} title={bloqueantes > 0 ? t("ui.Facturacion.corridaDetalle.noSePuedeAprobar", "Resuelve las {{n}} discrepancias que bloquean antes de aprobar", { n: bloqueantes }) : undefined} variant="brand" onClick={aprobar}>
                  <CheckCircle2 size={14} /> {t("ui.Facturacion.corridaDetalle.aprobar", "Aprobar")}
                </Button>
              )}
              {run.status === "approved" && canInvoice && <Button disabled={trabajando} variant="brand" onClick={facturar}><Receipt size={14} /> {t("ui.Facturacion.corridaDetalle.crearFactura", "Crear factura")}</Button>}
              {run.status === "invoiced" && run.invoiceId && <Button variant="outline" onClick={() => navigate(`/facturacion/facturas/${run.invoiceId}`)}><Receipt size={14} /> {t("ui.Facturacion.corridaDetalle.verFactura", "Ver factura")}</Button>}
              {(run.status === "draft" || run.status === "clientReview" || run.status === "approved") && canEdit && <Button disabled={trabajando} variant="outline" onClick={cancelar}><Ban size={14} /> {t("ui.Facturacion.corridaDetalle.cancelar", "Cancelar corrida")}</Button>}
            </>
          }
        />

        {bloqueantes > 0 && (run.status === "draft" || run.status === "clientReview") && (
          <InfoNote tone="bad" title={t("ui.Facturacion.corridaDetalle.bloqueada", "No se puede aprobar todavía")}>
            {t("ui.Facturacion.corridaDetalle.bloqueadaDesc", "Hay {{n}} discrepancias que bloquean. Acepta, corrige o excluye cada una.", { n: bloqueantes })}
          </InfoNote>
        )}
        {run.status === "clientReview" && (
          <InfoNote tone="warn" title={t("ui.Facturacion.corridaDetalle.enRevision", "En revisión del cliente")} icon={<Link2 />}>
            <div className="flex flex-wrap items-center gap-2">
              <span>{resumen.clientApproved === true ? t("ui.Facturacion.corridaDetalle.clienteAprobo", "El cliente aprobó las horas.") : resumen.clientApproved === false ? t("ui.Facturacion.corridaDetalle.clienteObjeto", "El cliente objetó las horas; revisa la discrepancia «Objeción del cliente».") : t("ui.Facturacion.corridaDetalle.esperandoAlCliente", "Esperando la respuesta del cliente.")}</span>
              {reviewUrl && <Button size="sm" variant="outline" onClick={() => copiar(reviewUrl)}><Link2 size={14} /> {t("ui.Facturacion.corridaDetalle.copiarEnlaceDeRevision", "Copiar enlace de revisión")}</Button>}
              {run.clientReviewedAt && <span style={{ color: "var(--ink-soft)" }}>{fechaYHora(run.clientReviewedAt)}</span>}
            </div>
            {run.clientReviewNote && <div className="mt-1 whitespace-pre-wrap text-sm">{run.clientReviewNote}</div>}
          </InfoNote>
        )}

        <Stagger>
          <MetricTile icon={<Clock />} label={t("ui.Facturacion.corridaDetalle.turnos", "Turnos")} value={resumen.shifts ?? 0} />
          <MetricTile icon={<Timer />} label={t("ui.Facturacion.corridaDetalle.horasFacturables", "Horas facturables")} value={horas(resumen.billableMinutes)} hint={t("ui.Facturacion.corridaDetalle.trabajadas", "Trabajadas: {{h}}", { h: horas(resumen.workedMinutes) })} />
          <MetricTile label={t("ui.Facturacion.corridaDetalle.horasConRecargo", "Horas con recargo")} value={horas(resumen.premiumMinutes)} />
          <MetricTile icon={<Wallet />} label={t("ui.Facturacion.facturas.subtotal", "Subtotal")} value={dinero(resumen.subtotalCents ?? 0, moneda)} />
        </Stagger>

        {(run.discrepancies ?? []).length > 0 && (
          <Section title={t("ui.Facturacion.corridas.discrepancias", "Discrepancias")} icon={<ClipboardCheck />}>
            <div className="space-y-4">
              {(["block", "warn", "info"] as DiscrepancySeverity[]).map((sev) => grupos[sev].length ? (
                <div key={sev}>
                  <div className="mb-2 flex items-center gap-2">
                    <StatusBadge tone={etiquetas.severityTone[sev]} dot>{etiquetas.severity[sev]}</StatusBadge>
                    <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.corridaDetalle.pendientesDeN", "{{p}} pendientes de {{n}}", { p: grupos[sev].filter((d) => d.resolution === "pending").length, n: grupos[sev].length })}</span>
                  </div>
                  <div className="space-y-2">
                    {grupos[sev].map((d) => {
                      const item = d.itemId ? itemsPorId.get(d.itemId) : undefined;

                      return (
                        <div key={d.id} className="glass-flat flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium">{etiquetas.discrepancy[d.kind] || d.kind}{item ? <span className="font-normal" style={{ color: "var(--ink-soft)" }}> · {soloFechaCivil(item.date)} · {item.guardName || "—"} · {item.siteName || "—"}</span> : null}</div>
                            {d.detail && <div style={{ color: "var(--ink-soft)" }}>{d.detail}</div>}
                            {d.note && <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{d.note}</div>}
                          </div>
                          {d.resolution === "pending" ? (
                            editable ? (
                              <div className="cg-acciones">
                                <Button size="sm" variant="outline" onClick={() => setResolviendo(d)}>{t("ui.Facturacion.corridaDetalle.resolver", "Resolver")}</Button>
                              </div>
                            ) : <StatusBadge tone="warn">{t("ui.Facturacion.corridaDetalle.pendiente", "Pendiente")}</StatusBadge>
                          ) : (
                            <StatusBadge tone={d.resolution === "excluded" ? "neutral" : "ok"}>{d.resolution === "accepted" ? t("ui.Facturacion.corridaDetalle.aceptada", "Aceptada") : d.resolution === "corrected" ? t("ui.Facturacion.corridaDetalle.corregida", "Corregida") : t("ui.Facturacion.corridaDetalle.excluida", "Excluida")}</StatusBadge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null)}
            </div>
          </Section>
        )}

        <Section title={t("ui.Facturacion.facturas.lineas", "Líneas")} bare>
          <TabTable minWidth={1000}>
            <THead>
              <Th>{t("ui.Facturacion.detalle.fecha", "Fecha")}</Th>
              <Th>{t("ui.Facturacion.corridaDetalle.sede", "Sede")}</Th>
              <Th>{t("ui.Facturacion.corridaDetalle.vigilante", "Vigilante")}</Th>
              <Th align="right">{t("ui.Facturacion.corridaDetalle.programadas", "Prog.")}</Th>
              <Th align="right">{t("ui.Facturacion.corridaDetalle.trabajadasAbrev", "Trab.")}</Th>
              <Th align="right">{t("ui.Facturacion.corridaDetalle.facturables", "Fact.")}</Th>
              <Th align="right">{t("ui.Facturacion.corridaDetalle.tarifa", "Tarifa")}</Th>
              <Th>{t("ui.Facturacion.detalle.recargo", "Recargo")}</Th>
              <Th align="right">{t("ui.Facturacion.detalle.importe", "Importe")}</Th>
              <Th />
            </THead>
            <tbody>
              {(run.items ?? []).map((it) => (
                <Tr key={it.id} className={it.excluded ? "opacity-50" : undefined}>
                  <td className="px-3 py-2 tabular-nums">{soloFechaCivil(it.date)}</td>
                  <td className="px-3 py-2">{it.siteName || "—"}{it.description && it.kind !== "shift" ? <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{it.description}</div> : null}</td>
                  <td className="px-3 py-2">{it.guardName || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.kind === "shift" ? horas(it.scheduledMinutes) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.kind === "shift" ? horas(it.workedMinutes) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.kind === "shift" ? horas(it.billableMinutes) : `${cantidad(it.quantityHundredths)} ${etiquetas.unit[it.unit] || it.unit}`}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{dinero(it.unitCents, moneda)}</td>
                  <td className="px-3 py-2">{it.premiumKind !== "none" ? <StatusBadge tone={etiquetas.premiumTone[it.premiumKind]}>{etiquetas.premium[it.premiumKind]}</StatusBadge> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{it.excluded ? <span className="line-through">{dinero(it.amountCents, moneda)}</span> : dinero(it.amountCents, moneda)}</td>
                  <td className="px-3 py-2 text-right">
                    {it.excluded && <StatusBadge tone="neutral">{t("ui.Facturacion.corridaDetalle.excluida", "Excluida")}</StatusBadge>}
                    {editable && <Button size="icon" variant="ghost" title={t("ui.Facturacion.detalle.editar", "Editar")} onClick={() => setEditando(it)}><Pencil size={14} /></Button>}
                  </td>
                </Tr>
              ))}
              {!(run.items ?? []).length && <tr><td className="px-3 py-6 text-center text-sm" colSpan={10} style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.corridaDetalle.sinLineas", "El periodo no tiene turnos facturables.")}</td></tr>}
            </tbody>
          </TabTable>
        </Section>

        {resolviendo && (
          <ResolverModal
            discrepancia={resolviendo}
            item={resolviendo.itemId ? itemsPorId.get(resolviendo.itemId) : undefined}
            trabajando={trabajando}
            onClose={() => setResolviendo(null)}
            onSave={async (body) => { if (await correr(() => clientBillingService.resolveDiscrepancy(run.id, resolviendo.id, body), t("ui.Facturacion.corridaDetalle.discrepanciaResuelta", "Discrepancia resuelta"))) setResolviendo(null); }}
          />
        )}
        {editando && (
          <EditarLineaModal
            item={editando}
            moneda={moneda}
            trabajando={trabajando}
            onClose={() => setEditando(null)}
            onSave={async (body) => { if (await correr(() => clientBillingService.updateItem(run.id, editando.id, body), t("ui.Facturacion.corridaDetalle.lineaGuardada", "Línea guardada"))) setEditando(null); }}
          />
        )}
      </PageContainer>
    </AppLayout>
  );
}

type Resolucion = "accepted" | "corrected" | "excluded";

function ResolverModal({ discrepancia, item, trabajando, onClose, onSave }: { discrepancia: Discrepancy; item?: RunItem; trabajando: boolean; onClose: () => void; onSave: (body: { resolution: Resolucion; note?: string; billableMinutes?: number }) => void }) {
  const { t } = useTranslation();
  const etiquetas = useEtiquetasDeFacturacion();
  const [resolution, setResolution] = useState<Resolucion>("accepted");
  const [minutos, setMinutos] = useState(String(item?.billableMinutes ?? item?.scheduledMinutes ?? 0));
  const [note, setNote] = useState("");
  const n = Number(minutos);
  const listo = resolution !== "corrected" || (Number.isFinite(n) && n >= 0);

  return (
    <Modal open size="md" title={etiquetas.discrepancy[discrepancia.kind] || discrepancia.kind} description={discrepancia.detail || undefined} onOpenChange={(o) => { if (!o) onClose(); }}
      footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={onClose}>{t("ui.Facturacion.cancelar", "Cancelar")}</Button><Button disabled={trabajando || !listo} variant="brand" onClick={() => onSave({ resolution, note: note || undefined, ...(resolution === "corrected" ? { billableMinutes: Math.round(n) } : {}) })}>{t("ui.Facturacion.guardar", "Guardar")}</Button></div>}
    >
      <div className="space-y-3">
        {item && (
          <div className="glass-flat px-3 py-2 text-sm">
            <div>{soloFechaCivil(item.date)} · {item.guardName || "—"} · {item.siteName || "—"}</div>
            <div style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.corridaDetalle.programadas", "Prog.")} {horas(item.scheduledMinutes)} · {t("ui.Facturacion.corridaDetalle.trabajadasAbrev", "Trab.")} {horas(item.workedMinutes)} · {t("ui.Facturacion.corridaDetalle.facturables", "Fact.")} {horas(item.billableMinutes)}</div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            ["accepted", t("ui.Facturacion.corridaDetalle.aceptar", "Aceptar"), t("ui.Facturacion.corridaDetalle.aceptarHint", "Se factura tal cual (sin fichaje: las horas programadas).")],
            ["corrected", t("ui.Facturacion.corridaDetalle.corregir", "Corregir"), t("ui.Facturacion.corridaDetalle.corregirHint", "Pones los minutos facturables a mano.")],
            ["excluded", t("ui.Facturacion.corridaDetalle.excluir", "Excluir"), t("ui.Facturacion.corridaDetalle.excluirHint", "La línea no se factura.")],
          ] as Array<[Resolucion, string, string]>).map(([v, label, hint]) => (
            <label key={v} className="glass-flat flex cursor-pointer flex-col gap-0.5 px-3 py-2 text-sm" style={resolution === v ? { outline: "2px solid var(--brand)", outlineOffset: -2 } : undefined}>
              <span className="flex items-center gap-2 font-medium"><input checked={resolution === v} className="cg-focus" name="resolution" style={{ accentColor: "var(--brand)" }} type="radio" onChange={() => setResolution(v)} /> {label}</span>
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{hint}</span>
            </label>
          ))}
        </div>
        {resolution === "corrected" && (
          <FormField label={t("ui.Facturacion.corridaDetalle.minutosFacturables", "Minutos facturables")} required>
            <input className={FIELD_CLS} inputMode="numeric" min={0} type="number" value={minutos} onChange={(e) => setMinutos(e.target.value)} />
          </FormField>
        )}
        <FormField label={t("ui.Facturacion.detalle.nota", "Nota")}>
          <textarea className={`${FIELD_CLS} h-16`} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

function EditarLineaModal({ item, moneda, trabajando, onClose, onSave }: { item: RunItem; moneda?: string | null; trabajando: boolean; onClose: () => void; onSave: (body: { excluded?: boolean; billableMinutes?: number; unitCents?: number; note?: string }) => void }) {
  const { t } = useTranslation();
  const [minutos, setMinutos] = useState(String(item.billableMinutes));
  const [precio, setPrecio] = useState((item.unitCents / 100).toFixed(2));
  const [excluded, setExcluded] = useState(item.excluded);
  const [note, setNote] = useState(item.note || "");
  const unitCents = Math.round((Number(String(precio).replace(",", ".")) || 0) * 100);

  return (
    <Modal open size="md" title={t("ui.Facturacion.corridaDetalle.editarLinea", "Editar línea")} description={`${soloFechaCivil(item.date)} · ${item.guardName || "—"} · ${item.siteName || "—"}`} onOpenChange={(o) => { if (!o) onClose(); }}
      footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={onClose}>{t("ui.Facturacion.cancelar", "Cancelar")}</Button><Button disabled={trabajando} variant="brand" onClick={() => onSave({ excluded, note: note || undefined, ...(item.kind === "shift" ? { billableMinutes: Math.max(0, Math.round(Number(minutos) || 0)) } : {}), unitCents })}>{t("ui.Facturacion.guardar", "Guardar")}</Button></div>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {item.kind === "shift" && (
          <FormField label={t("ui.Facturacion.corridaDetalle.minutosFacturables", "Minutos facturables")} hint={t("ui.Facturacion.corridaDetalle.minutosHint", "Programados: {{p}} · trabajados: {{w}}", { p: item.scheduledMinutes, w: item.workedMinutes })}>
            <input className={FIELD_CLS} inputMode="numeric" min={0} type="number" value={minutos} onChange={(e) => setMinutos(e.target.value)} />
          </FormField>
        )}
        <FormField label={t("ui.Facturacion.corridaDetalle.tarifa", "Tarifa")} hint={dinero(unitCents, moneda)}>
          <input className={FIELD_CLS} inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </FormField>
        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input checked={excluded} className="cg-focus size-4" style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => setExcluded(e.target.checked)} />
            {t("ui.Facturacion.corridaDetalle.excluirDeLaFactura", "Excluir de la factura")}
          </label>
        </div>
        <FormField className="sm:col-span-2" label={t("ui.Facturacion.detalle.nota", "Nota")}>
          <input className={FIELD_CLS} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

