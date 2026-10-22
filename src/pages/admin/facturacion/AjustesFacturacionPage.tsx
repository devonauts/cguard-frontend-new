/**
 * BILLING SETTINGS — the company's header on the invoice, numbering and
 * terms, premium and late-fee rules, the sales-tax table the company keeps
 * by hand, the payment methods it accepts, and how its invoices and
 * proposals look and read (design + texts, with a live preview).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, CreditCard, FileText, Hash, Palette, Percent, Plus, Scale, Settings2, Trash2, Pencil, Wallet } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { PageContainer, PageHeader, Section, SkeletonCards, Modal, FormField, FIELD_CLS, StatusBadge, TabNav, InfoNote } from "@/components/kit";
import { TabTable, THead, Th, Tr } from "@/pages/admin/clientes/components/_shared/tab-kit";
import { usePermissions } from "@/hooks/usePermissions";
import clientBillingService, { BILLING_CYCLES, isHexColor, type BillingSettings, type DocumentStyle, type TaxJurisdiction, type TaxRate, type UsState } from "@/lib/api/clientBillingService";
import { QK, porcentaje, useEtiquetasDeFacturacion, mensajeDeError, conModuloDeFacturacion } from "./comun";
import { ReglaDeRecargo } from "./ReglaDeRecargo";
import { CobrosGateway } from "./CobrosGateway";
import { MetodosDePagoAjustes, metodoSinNombre } from "./MetodosDePago";
import { DisenoAjustes, TextosAjustes, VistaPrevia, estiloDe, type DocKind } from "./DisenoDeDocumentos";

type Pestana = "empresa" | "numeracion" | "reglas" | "impuestos" | "metodos" | "cobros" | "documento" | "textos";

function AjustesFacturacionPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const etiquetas = useEtiquetasDeFacturacion();
  const canEdit = hasPermission("billingEdit");
  const canTax = hasPermission("taxEdit");
  const [tab, setTab] = useState<Pestana>("empresa");
  const vista = useQuery({ queryKey: [QK, "settings"], queryFn: () => clientBillingService.settings() });
  const [form, setForm] = useState<BillingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [tasa, setTasa] = useState<Partial<TaxRate> | null>(null);
  // Typed as text so «-3, » survives while the person is still typing.
  const [reminderText, setReminderText] = useState("");
  // The preview of the design and texts tabs: which document it draws.
  const [docKind, setDocKind] = useState<DocKind>("invoice");

  useEffect(() => {
    if (vista.data) {
      setForm(vista.data.settings);
      setReminderText((vista.data.settings.reminderDays ?? []).join(", "));
    }
  }, [vista.data]);

  const set = <K extends keyof BillingSettings>(k: K, v: BillingSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setEstilo = (patch: Partial<DocumentStyle>) => setForm((f) => (f ? { ...f, documentStyle: { ...estiloDe(f), ...patch } } : f));
  const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };

  const guardar = async () => {
    if (!form) return;
    if (metodoSinNombre(form.paymentMethods)) {
      setTab("metodos");
      toast.error(t("ui.Facturacion.metodos.nombreObligatorio", "Ponle un nombre a cada método propio."));

      return;
    }
    const estilo = estiloDe(form);

    if (!isHexColor(estilo.accentColor) || !isHexColor(estilo.textColor)) {
      setTab("documento");
      toast.error(t("ui.Facturacion.diseno.colorInvalido", "Usa el formato #RRGGBB."));

      return;
    }
    setSaving(true);
    try {
      const { settings } = await clientBillingService.saveSettings(form);

      setForm(settings);
      toast.success(t("ui.Facturacion.ajustes.guardado", "Ajustes guardados"));
      await qc.invalidateQueries({ queryKey: [QK, "settings"] });
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar")));
    } finally {
      setSaving(false);
    }
  };

  const borrarTasa = async (r: TaxRate) => {
    if (!(await confirmDialog({ title: t("ui.Facturacion.ajustes.eliminarTasa", "Eliminar tasa"), message: t("ui.Facturacion.ajustes.eliminarTasaConfirm", "Las facturas ya emitidas no cambian."), tone: "danger", confirmText: t("ui.Facturacion.ajustes.eliminarTasa", "Eliminar tasa") }))) return;
    try {
      await clientBillingService.deleteTaxRate(r.id);
      toast.success(t("ui.Facturacion.ajustes.tasaEliminada", "Tasa eliminada"));
      await qc.invalidateQueries({ queryKey: [QK, "settings"] });
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar")));
    }
  };

  const pestañas = [
    { value: "empresa" as Pestana, label: t("ui.Facturacion.ajustes.empresa", "Datos de la empresa"), icon: <Building2 /> },
    { value: "numeracion" as Pestana, label: t("ui.Facturacion.ajustes.numeracion", "Numeración y términos"), icon: <Hash /> },
    { value: "reglas" as Pestana, label: t("ui.Facturacion.ajustes.reglas", "Reglas"), icon: <Scale /> },
    { value: "impuestos" as Pestana, label: t("ui.Facturacion.ajustes.impuestos", "Impuestos"), icon: <Percent />, badge: vista.data?.taxRates.length || null },
    { value: "metodos" as Pestana, label: t("ui.Facturacion.metodos.titulo", "Métodos de pago"), icon: <Wallet /> },
    { value: "cobros" as Pestana, label: t("ui.Facturacion.ajustes.cobros", "Cobros"), icon: <CreditCard /> },
    { value: "documento" as Pestana, label: t("ui.Facturacion.diseno.pestanaDiseno", "Diseño de documentos"), icon: <Palette /> },
    { value: "textos" as Pestana, label: t("ui.Facturacion.diseno.pestanaTextos", "Textos"), icon: <FileText /> },
  ];

  const botonGuardar = canEdit && tab !== "impuestos" && tab !== "cobros" ? <Button disabled={saving || !form} variant="brand" onClick={guardar}>{saving ? t("ui.Facturacion.guardando", "Guardando…") : t("ui.Facturacion.guardar", "Guardar")}</Button> : undefined;

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<Settings2 />}
          title={t("ui.Facturacion.ajustes.titulo", "Ajustes de facturación")}
          subtitle={t("ui.Facturacion.ajustes.subtitulo", "Cómo se numeran, se calculan y se presentan las facturas a los clientes. Cada contrato puede afinar sus propias reglas.")}
          actions={botonGuardar}
        />
        <TabNav items={pestañas} value={tab} onChange={setTab} />

        {!form ? (
          <SkeletonCards count={3} />
        ) : tab === "empresa" ? (
          <Section title={t("ui.Facturacion.ajustes.empresa", "Datos de la empresa")} icon={<Building2 />}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={t("ui.Facturacion.ajustes.razonSocial", "Razón social")} hint={t("ui.Facturacion.ajustes.razonSocialHint", "Como debe salir en la cabecera de la factura.")}>
                <input className={FIELD_CLS} disabled={!canEdit} value={form.legalName || ""} onChange={(e) => set("legalName", e.target.value)} />
              </FormField>
              <FormField label={t("ui.Facturacion.ajustes.identificacionFiscal", "Identificación fiscal (EIN)")}>
                <input className={FIELD_CLS} disabled={!canEdit} value={form.taxId || ""} onChange={(e) => set("taxId", e.target.value)} />
              </FormField>
              <FormField label={t("ui.Facturacion.ajustes.direccion", "Dirección")}>
                <input className={FIELD_CLS} disabled={!canEdit} value={form.addressLine1 || ""} onChange={(e) => set("addressLine1", e.target.value)} />
              </FormField>
              <FormField label={t("ui.Facturacion.ajustes.direccion2", "Dirección (línea 2)")}>
                <input className={FIELD_CLS} disabled={!canEdit} value={form.addressLine2 || ""} onChange={(e) => set("addressLine2", e.target.value)} />
              </FormField>
              <FormField label={t("ui.Facturacion.ajustes.ciudad", "Ciudad")}>
                <input className={FIELD_CLS} disabled={!canEdit} value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t("ui.Facturacion.ajustes.estado", "Estado")}>
                  <select className={FIELD_CLS} disabled={!canEdit} value={form.state || ""} onChange={(e) => set("state", e.target.value || null)}>
                    <option value="">—</option>
                    {(vista.data?.usStates ?? []).map((s: UsState) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
                  </select>
                </FormField>
                <FormField label={t("ui.Facturacion.ajustes.codigoPostal", "Código postal")}>
                  <input className={FIELD_CLS} disabled={!canEdit} value={form.postalCode || ""} onChange={(e) => set("postalCode", e.target.value)} />
                </FormField>
              </div>
              <FormField label={t("ui.Facturacion.ajustes.correoDeFacturacion", "Correo de facturación")} hint={t("ui.Facturacion.ajustes.correoDeFacturacionHint", "Remitente de las facturas y a donde responde el cliente.")}>
                <input className={FIELD_CLS} disabled={!canEdit} type="email" value={form.billingEmail || ""} onChange={(e) => set("billingEmail", e.target.value)} />
              </FormField>
              <FormField label={t("ui.Facturacion.ajustes.telefonoDeFacturacion", "Teléfono de facturación")}>
                <input className={FIELD_CLS} disabled={!canEdit} value={form.billingPhone || ""} onChange={(e) => set("billingPhone", e.target.value)} />
              </FormField>
              <FormField className="sm:col-span-2" label={t("ui.Facturacion.ajustes.w9", "Enlace al W-9")} hint={t("ui.Facturacion.ajustes.w9Hint", "Los clientes lo piden al dar de alta un proveedor; se incluye en el portal.")}>
                <input className={FIELD_CLS} disabled={!canEdit} type="url" value={form.w9DocumentUrl || ""} onChange={(e) => set("w9DocumentUrl", e.target.value)} />
              </FormField>
            </div>
          </Section>
        ) : tab === "numeracion" ? (
          <Section title={t("ui.Facturacion.ajustes.numeracion", "Numeración y términos")} icon={<Hash />}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label={t("ui.Facturacion.ajustes.moneda", "Moneda")}>
                <input className={FIELD_CLS} disabled={!canEdit} maxLength={3} value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
              </FormField>
              <FormField label={t("ui.Facturacion.ajustes.prefijoFactura", "Prefijo de factura")} hint={t("ui.Facturacion.ajustes.prefijoFacturaHint", "Ej.: INV-2026-00001")}>
                <input className={FIELD_CLS} disabled={!canEdit} value={form.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} />
              </FormField>
              <FormField label={t("ui.Facturacion.ajustes.relleno", "Dígitos del número")}>
                <input className={FIELD_CLS} disabled={!canEdit} max={8} min={3} type="number" value={form.invoicePadding} onChange={(e) => set("invoicePadding", num(e.target.value))} />
              </FormField>
              <FormField label={t("ui.Facturacion.ajustes.prefijoNotaDeCredito", "Prefijo de nota de crédito")}>
                <input className={FIELD_CLS} disabled={!canEdit} value={form.creditNotePrefix} onChange={(e) => set("creditNotePrefix", e.target.value)} />
              </FormField>
              <FormField label={t("ui.Facturacion.ajustes.terminosDePago", "Términos de pago (días)")} hint={t("ui.Facturacion.ajustes.terminosDePagoHint", "Net 30 = 30. Cada contrato puede cambiarlo.")}>
                <input className={FIELD_CLS} disabled={!canEdit} max={180} min={0} type="number" value={form.defaultTermsDays} onChange={(e) => set("defaultTermsDays", num(e.target.value))} />
              </FormField>
              <FormField label={t("ui.Facturacion.ajustes.cicloPorDefecto", "Ciclo de facturación por defecto")}>
                <select className={FIELD_CLS} disabled={!canEdit} value={form.defaultBillingCycle} onChange={(e) => set("defaultBillingCycle", e.target.value as BillingSettings["defaultBillingCycle"])}>
                  {BILLING_CYCLES.map((c) => <option key={c} value={c}>{etiquetas.cycle[c]}</option>)}
                </select>
              </FormField>
              <FormField label={t("ui.Facturacion.ajustes.redondeo", "Redondeo de minutos")} hint={t("ui.Facturacion.ajustes.redondeoHint", "Las horas facturables se redondean al múltiplo más cercano (15 = cuartos de hora). 0 = sin redondeo.")}>
                <input className={FIELD_CLS} disabled={!canEdit} max={60} min={0} type="number" value={form.roundingMinutes} onChange={(e) => set("roundingMinutes", num(e.target.value))} />
              </FormField>
            </div>
            <div className="cg-eyebrow mb-2 mt-5">{t("ui.Facturacion.ajustes.cotizaciones", "Cotizaciones")}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label={t("ui.Facturacion.ajustes.prefijoCotizacion", "Prefijo de cotización")} hint={t("ui.Facturacion.ajustes.prefijoCotizacionHint", "Ej.: QUO-2026-00001")}>
                <input className={FIELD_CLS} disabled={!canEdit} value={form.quotePrefix ?? ""} onChange={(e) => set("quotePrefix", e.target.value)} />
              </FormField>
              <div className="flex items-end text-xs sm:col-span-2" style={{ color: "var(--ink-soft)" }}>
                <button className="cg-focus text-left underline-offset-2 hover:underline" style={{ color: "var(--brand-text)" }} type="button" onClick={() => { setDocKind("quote"); setTab("textos"); }}>
                  {t("ui.Facturacion.diseno.validezYTerminosMovidos", "La validez, la introducción y los términos de las cotizaciones están en Textos.")}
                </button>
              </div>
            </div>
          </Section>
        ) : tab === "reglas" ? (
          <Section title={t("ui.Facturacion.ajustes.reglas", "Reglas")} icon={<Scale />}>
            <div className="space-y-5">
              <ReglaDeRecargo currency={form.currency} label={t("ui.Facturacion.ajustes.horasExtra", "Horas extra")} value={form.overtimeRule} onChange={(v) => set("overtimeRule", v)} />
              <ReglaDeRecargo currency={form.currency} label={t("ui.Facturacion.ajustes.festivos", "Festivos")} value={form.holidayRule} withPriority onChange={(v) => set("holidayRule", v)} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField label={t("ui.Facturacion.ajustes.recargoPorMora", "Recargo por mora (%)")} hint={t("ui.Facturacion.ajustes.recargoPorMoraHint", "Se aplica una sola vez sobre el saldo vencido. 0 = sin recargo.")}>
                  <input className={FIELD_CLS} disabled={!canEdit} inputMode="decimal" value={(form.lateFeeBps / 100).toFixed(2)} onChange={(e) => set("lateFeeBps", Math.round(num(e.target.value.replace(",", ".")) * 100))} />
                </FormField>
                <FormField label={t("ui.Facturacion.ajustes.diasDeGracia", "Días de gracia")}>
                  <input className={FIELD_CLS} disabled={!canEdit} min={0} type="number" value={form.lateFeeGraceDays} onChange={(e) => set("lateFeeGraceDays", num(e.target.value))} />
                </FormField>
                <FormField label={t("ui.Facturacion.ajustes.recordatorios", "Recordatorios (días)")} hint={t("ui.Facturacion.ajustes.recordatoriosHint", "Separados por comas, respecto al vencimiento: -3 = tres días antes, 7 = una semana después.")}>
                  <input className={FIELD_CLS} disabled={!canEdit} value={reminderText} onChange={(e) => { setReminderText(e.target.value); set("reminderDays", e.target.value.split(",").map((x) => x.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n))); }} />
                </FormField>
              </div>
            </div>
          </Section>
        ) : tab === "impuestos" ? (
          <Section
            title={t("ui.Facturacion.ajustes.impuestos", "Impuestos")}
            icon={<Percent />}
            action={canTax ? <Button variant="brand" onClick={() => setTasa({ jurisdiction: "state", active: true, rateBps: 0 })}><Plus size={14} /> {t("ui.Facturacion.ajustes.nuevaTasa", "Nueva tasa")}</Button> : undefined}
          >
            <InfoNote tone="info" className="mb-3">{t("ui.Facturacion.ajustes.impuestosNota", "La tabla la mantiene la empresa. En cada factura se aplica toda tasa activa cuyo estado o prefijo postal coincida con la sede vigilada; los clientes y contratos exentos no pagan ninguna.")}</InfoNote>
            <TabTable minWidth={720}>
              <THead>
                <Th>{t("ui.Facturacion.ajustes.nombre", "Nombre")}</Th>
                <Th>{t("ui.Facturacion.ajustes.jurisdiccion", "Jurisdicción")}</Th>
                <Th>{t("ui.Facturacion.ajustes.estado", "Estado")}</Th>
                <Th>{t("ui.Facturacion.ajustes.prefijoPostal", "Prefijo postal")}</Th>
                <Th align="right">{t("ui.Facturacion.ajustes.tasa", "Tasa")}</Th>
                <Th>{t("ui.Facturacion.ajustes.activa", "Activa")}</Th>
                <Th />
              </THead>
              <tbody>
                {(vista.data?.taxRates ?? []).map((r) => (
                  <Tr key={r.id}>
                    <td className="px-3 py-2 font-medium">{r.name}{r.notes && <div className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}>{r.notes}</div>}</td>
                    <td className="px-3 py-2">{etiquetas.jurisdiction[r.jurisdiction]}</td>
                    <td className="px-3 py-2">{r.state || "—"}</td>
                    <td className="px-3 py-2">{r.postalCodePrefix || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{porcentaje(r.rateBps)}</td>
                    <td className="px-3 py-2"><StatusBadge tone={r.active ? "ok" : "neutral"}>{r.active ? t("ui.Facturacion.ajustes.si", "Sí") : t("ui.Facturacion.ajustes.no", "No")}</StatusBadge></td>
                    <td className="px-3 py-2 text-right">
                      {canTax && (
                        <span className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" title={t("ui.Facturacion.detalle.editar", "Editar")} onClick={() => setTasa(r)}><Pencil size={14} /></Button>
                          <Button size="icon" variant="ghost" title={t("ui.Facturacion.ajustes.eliminarTasa", "Eliminar tasa")} onClick={() => borrarTasa(r)}><Trash2 size={14} /></Button>
                        </span>
                      )}
                    </td>
                  </Tr>
                ))}
                {!(vista.data?.taxRates ?? []).length && <tr><td className="px-3 py-6 text-center text-sm" colSpan={7} style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.ajustes.sinTasas", "Sin tasas. Sin tabla, las facturas salen sin impuestos.")}</td></tr>}
              </tbody>
            </TabTable>
          </Section>
        ) : tab === "metodos" ? (
          <MetodosDePagoAjustes canEdit={canEdit} value={form.paymentMethods} onChange={(v) => set("paymentMethods", v)} />
        ) : tab === "cobros" ? (
          <CobrosGateway canEdit={canEdit} />
        ) : (
          // Design and texts: the form on the left, the live preview on the right (below it on narrow screens).
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {tab === "documento" ? (
              <DisenoAjustes canEdit={canEdit} logoUrl={vista.data?.logoUrl ?? null} value={estiloDe(form)} onChange={setEstilo} />
            ) : (
              <TextosAjustes canEdit={canEdit} form={form} set={set} setEstilo={setEstilo} onKind={setDocKind} />
            )}
            <div className="xl:sticky xl:top-4">
              <VistaPrevia form={form} kind={docKind} onKind={setDocKind} />
            </div>
          </div>
        )}

        {tasa && (
          <TasaModal
            inicial={tasa}
            usStates={vista.data?.usStates ?? []}
            onClose={() => setTasa(null)}
            onSaved={async () => { setTasa(null); await qc.invalidateQueries({ queryKey: [QK, "settings"] }); }}
          />
        )}
      </PageContainer>
    </AppLayout>
  );
}


function TasaModal({ inicial, usStates, onClose, onSaved }: { inicial: Partial<TaxRate>; usStates: UsState[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const etiquetas = useEtiquetasDeFacturacion();
  const [name, setName] = useState(inicial.name || "");
  const [jurisdiction, setJurisdiction] = useState<TaxJurisdiction>(inicial.jurisdiction || "state");
  const [state, setState] = useState(inicial.state || "");
  const [postalCodePrefix, setPostalCodePrefix] = useState(inicial.postalCodePrefix || "");
  const [rate, setRate] = useState(((inicial.rateBps ?? 0) / 100).toFixed(2));
  const [active, setActive] = useState(inicial.active !== false);
  const [notes, setNotes] = useState(inicial.notes || "");
  const [saving, setSaving] = useState(false);
  const rateBps = Math.round((Number(String(rate).replace(",", ".")) || 0) * 100);
  const listo = !!name.trim() && rateBps >= 0 && (jurisdiction !== "state" || !!state) && (jurisdiction !== "postal" || !!postalCodePrefix.trim());

  const guardar = async () => {
    setSaving(true);
    try {
      const body = { name: name.trim(), jurisdiction, state: state || null, postalCodePrefix: postalCodePrefix.trim() || null, rateBps, active, notes: notes.trim() || null };

      if (inicial.id) await clientBillingService.updateTaxRate(inicial.id, body); else await clientBillingService.createTaxRate(body);
      toast.success(t("ui.Facturacion.ajustes.tasaGuardada", "Tasa guardada"));
      await onSaved();
    } catch (e) {
      toast.error(mensajeDeError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open size="md" title={inicial.id ? t("ui.Facturacion.ajustes.editarTasa", "Editar tasa") : t("ui.Facturacion.ajustes.nuevaTasa", "Nueva tasa")} onOpenChange={(o) => { if (!o) onClose(); }}
      footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={onClose}>{t("ui.Facturacion.cancelar", "Cancelar")}</Button><Button disabled={saving || !listo} variant="brand" onClick={guardar}>{saving ? t("ui.Facturacion.guardando", "Guardando…") : t("ui.Facturacion.guardar", "Guardar")}</Button></div>}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField className="sm:col-span-2" label={t("ui.Facturacion.ajustes.nombre", "Nombre")} hint={t("ui.Facturacion.ajustes.nombreTasaHint", "Como sale en la factura: «Texas sales tax», «Austin city tax»…")} required>
          <input className={FIELD_CLS} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label={t("ui.Facturacion.ajustes.jurisdiccion", "Jurisdicción")} required>
          <select className={FIELD_CLS} value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value as TaxJurisdiction)}>
            {(["state", "postal", "custom"] as TaxJurisdiction[]).map((j) => <option key={j} value={j}>{etiquetas.jurisdiction[j]}</option>)}
          </select>
        </FormField>
        <FormField label={t("ui.Facturacion.ajustes.tasa", "Tasa")} hint="%" required>
          <input className={FIELD_CLS} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </FormField>
        <FormField label={t("ui.Facturacion.ajustes.estado", "Estado")} required={jurisdiction === "state"}>
          <select className={FIELD_CLS} value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">—</option>
            {usStates.map((st) => <option key={st.code} value={st.code}>{st.code} · {st.name}</option>)}
          </select>
        </FormField>
        <FormField label={t("ui.Facturacion.ajustes.prefijoPostal", "Prefijo postal")} hint={t("ui.Facturacion.ajustes.prefijoPostalHint", "Los primeros dígitos del código postal: «787» cubre 78701–78799.")} required={jurisdiction === "postal"}>
          <input className={FIELD_CLS} value={postalCodePrefix} onChange={(e) => setPostalCodePrefix(e.target.value)} />
        </FormField>
        <FormField className="sm:col-span-2" label={t("ui.Facturacion.ajustes.notas", "Notas")}>
          <input className={FIELD_CLS} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Switch checked={active} onCheckedChange={setActive} /> {t("ui.Facturacion.ajustes.activa", "Activa")}
        </label>
      </div>
    </Modal>
  );
}

export default conModuloDeFacturacion(AjustesFacturacionPage);
