/**
 * QUOTE EDITOR — who it is for (a new prospect or an existing client), the
 * commercial terms, and the priced lines with a live monthly estimate. The
 * preview uses the server's own arithmetic; once saved, the server's numbers
 * are the ones that count. Editing a quote already sent starts a revision.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Building2, Clock, FileSignature, FileText, Moon, Plus, Route, Save, Sun, Trash2, UserPlus, Users, Wrench } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageContainer, PageHeader, Section, SkeletonCards, EmptyState, FormField, FIELD_CLS, InfoNote, Segmented } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import { useMarcas } from "@/hooks/useMarcas";
import CampoDeMarca from "@/components/multimarca/CampoDeMarca";
import { hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";
import clientBillingService, {
  BILLING_CYCLES,
  QUOTE_EDITABLE,
  QUOTE_LINE_KINDS,
  SHIFT_TYPES,
  quoteLineTotals,
  quoteTotalsPreview,
  type BillingCycle,
  type Quote,
  type QuoteInput,
  type QuoteLanguage,
  type QuoteLineKind,
  type QuoteProspect,
  type ShiftType,
} from "@/lib/api/clientBillingService";
import { QK, dinero, nombreDelCliente, useEtiquetasDeFacturacion, useClientesParaFacturar, conModuloDeFacturacion, FilaTotal, avisarError } from "./comun";
import { terminosDeCotizacion } from "../marcas/textosDeMarca";

type Para = "prospecto" | "cliente";

type LineaBorrador = {
  key: string;
  kind: QuoteLineKind;
  description: string;
  siteLabel: string;
  shiftType: ShiftType;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
};

type ProspectoBorrador = Record<Exclude<keyof QuoteProspect, "country">, string>;

let siguienteClave = 0;
const nuevaClave = () => `l${++siguienteClave}`;

const lineaVacia = (kind: QuoteLineKind = "hourly"): LineaBorrador => ({
  key: nuevaClave(), kind, description: "", siteLabel: "", shiftType: "any", quantity: kind === "hourly" ? "40" : "1", unitPrice: "", taxable: true,
});

const prospectoVacio = (): ProspectoBorrador => ({ company: "", contactName: "", title: "", email: "", phone: "", address: "", city: "", state: "", postalCode: "" });

/** «12,5» or «12.5» → 1250 (hundredths / cents). */
const aCentesimas = (s: string): number => Math.max(0, Math.round((Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0) * 100));
const deCentesimas = (n: number | null | undefined): string => {
  const v = (Number(n) || 0) / 100;

  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

const sumarDias = (ymd: string, dias: number): string => {
  const d = new Date(`${ymd}T12:00:00Z`);

  d.setUTCDate(d.getUTCDate() + dias);

  return d.toISOString().slice(0, 10);
};

/**
 * Quick-add lines. Their description is the text the PROSPECT reads, so it is
 * written in the quote's language (en/es), not in the CRM's.
 */
const PRESETS: Array<{ id: string; icon: typeof Clock; kind: QuoteLineKind; shiftType: ShiftType; quantity: string; description: Record<QuoteLanguage, string> }> = [
  { id: "post247", icon: Clock, kind: "hourly", shiftType: "any", quantity: "168", description: { en: "Security officer post — 24/7 coverage", es: "Puesto de vigilancia — cobertura 24/7" } },
  { id: "day12", icon: Sun, kind: "hourly", shiftType: "day", quantity: "84", description: { en: "Security officer — 12-hour day shift, 7 days", es: "Vigilante — turno de día de 12 horas, 7 días" } },
  { id: "night12", icon: Moon, kind: "hourly", shiftType: "night", quantity: "84", description: { en: "Security officer — 12-hour night shift, 7 days", es: "Vigilante — turno de noche de 12 horas, 7 días" } },
  { id: "patrol", icon: Route, kind: "patrol", shiftType: "any", quantity: "30", description: { en: "Mobile patrol visit", es: "Visita de ronda móvil" } },
  { id: "setup", icon: Wrench, kind: "oneTime", shiftType: "any", quantity: "1", description: { en: "Setup and onboarding (one-time)", es: "Instalación y puesta en marcha (pago único)" } },
];

function CotizacionEditorPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const editando = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const etiquetas = useEtiquetasDeFacturacion();
  const clientes = useClientesParaFacturar();
  // The settings (states, default terms, tax table) need billingRead; a seller
  // without it still writes the quote and the server applies the defaults.
  const ajustes = useQuery({ queryKey: [QK, "settings"], queryFn: () => clientBillingService.settings(), enabled: hasPermission("billingRead"), staleTime: 60_000 });
  const existente = useQuery({ queryKey: [QK, "quote", id], queryFn: () => clientBillingService.quote(id), enabled: editando });
  const quote: Quote | undefined = existente.data?.quote;

  const [para, setPara] = useState<Para>("prospecto");
  const [prospecto, setProspecto] = useState<ProspectoBorrador>(prospectoVacio());
  const [clientAccountId, setClientAccountId] = useState("");
  // Multimarca: a client's quote is issued by the client's brand; a prospect's, by the one chosen here.
  const multimarca = useMarcas();
  const [marcaProspecto, setMarcaProspecto] = useState("");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<QuoteLanguage>("en");
  const [validUntil, setValidUntil] = useState("");
  const [startDate, setStartDate] = useState("");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [paymentTermsDays, setPaymentTermsDays] = useState("30");
  const [intro, setIntro] = useState("");
  const [terms, setTerms] = useState("");
  const [termsTocados, setTermsTocados] = useState(false);
  const [lineas, setLineas] = useState<LineaBorrador[]>([lineaVacia()]);
  const [cargado, setCargado] = useState(false);
  const [saving, setSaving] = useState(false);

  // A new quote starts from the company's defaults.
  useEffect(() => {
    if (editando || !ajustes.data) return;
    const s = ajustes.data.settings;

    setBillingCycle(s.defaultBillingCycle || "monthly");
    setPaymentTermsDays(String(s.defaultTermsDays ?? 30));
    setValidUntil((v) => v || sumarDias(hoyEnLaEmpresa(), Number(s.quoteValidityDays || 30)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, ajustes.data]);

  // Module Multimarca (phase 5): the terms are the ISSUING brand's — a brand's
  // own (none = none, never the principal's), the principal's own or the
  // company's. They follow the client / brand chosen until the user types.
  const idMarcaEmisora = para === "cliente"
    ? ((clientes.data ?? []).find((c) => c.id === clientAccountId) as { brandId?: string | null } | undefined)?.brandId ?? null
    : marcaProspecto || null;
  const marcaEmisora = multimarca.activo
    ? multimarca.marcas.find((m) => m.id === idMarcaEmisora) ?? (para === "cliente" && clientAccountId ? multimarca.principal : null)
    : null;

  useEffect(() => {
    if (editando || !ajustes.data || termsTocados) return;
    setTerms(terminosDeCotizacion(marcaEmisora, ajustes.data.settings.quoteTerms));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, ajustes.data, marcaEmisora?.id, marcaEmisora?.billingTexts?.quoteTerms]);

  // An existing quote fills the form once.
  useEffect(() => {
    if (!quote || cargado) return;
    setPara(quote.clientAccountId ? "cliente" : "prospecto");
    setClientAccountId(quote.clientAccountId || "");
    setMarcaProspecto(quote.brandId || "");
    const p = quote.prospect;

    setProspecto({
      company: p?.company || "", contactName: p?.contactName || "", title: p?.title || "", email: p?.email || "", phone: p?.phone || "",
      address: p?.address || "", city: p?.city || "", state: p?.state || "", postalCode: p?.postalCode || "",
    });
    setTitle(quote.title || "");
    setLanguage(quote.language === "es" ? "es" : "en");
    setValidUntil(quote.validUntil || "");
    setStartDate(quote.startDate || "");
    setBillingCycle(quote.billingCycle || "monthly");
    setPaymentTermsDays(String(quote.paymentTermsDays ?? 30));
    setIntro(quote.intro || "");
    setTerms(quote.terms || "");
    setTermsTocados(true);
    setLineas(
      (quote.lines ?? []).length
        ? (quote.lines ?? []).map((l) => ({
            key: nuevaClave(), kind: l.kind, description: l.description || "", siteLabel: l.siteLabel || "", shiftType: (l.shiftType || "any") as ShiftType,
            quantity: deCentesimas(l.quantityHundredths), unitPrice: (Number(l.unitCents) / 100).toFixed(2), taxable: l.taxable !== false,
          }))
        : [lineaVacia()],
    );
    setCargado(true);
  }, [quote, cargado]);

  const setP = (k: keyof ProspectoBorrador, v: string) => setProspecto((p) => ({ ...p, [k]: v }));
  const setLinea = (key: string, patch: Partial<LineaBorrador>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const agregarPreset = (pid: string) => {
    const pr = PRESETS.find((x) => x.id === pid);

    if (!pr) return;
    setLineas((ls) => {
      const sinVacias = ls.filter((l) => l.description.trim() || aCentesimas(l.unitPrice) > 0);

      return [...sinVacias, { ...lineaVacia(pr.kind), shiftType: pr.shiftType, quantity: pr.quantity, description: pr.description[language] }];
    });
  };

  // The client list rows carry the address the tax estimate needs.
  const clienteElegido = (clientes.data ?? []).find((c) => c.id === clientAccountId) as unknown as
    | { state?: string | null; zipCode?: string | null; taxExempt?: boolean | null }
    | undefined;
  const moneda = quote?.currency || ajustes.data?.settings.currency || "USD";
  const lineasValidas = lineas.filter((l) => l.description.trim());
  const cuerpoDeLineas = lineasValidas.map((l) => ({
    kind: l.kind,
    description: l.description.trim(),
    siteLabel: l.siteLabel.trim() || null,
    shiftType: l.kind === "hourly" ? l.shiftType : ("any" as ShiftType),
    quantityHundredths: aCentesimas(l.quantity),
    unitCents: aCentesimas(l.unitPrice),
    taxable: l.taxable,
  }));
  const direccionFiscal = para === "cliente"
    ? { state: clienteElegido?.state ?? quote?.clientAccount?.state ?? null, postalCode: clienteElegido?.zipCode ?? quote?.clientAccount?.zipCode ?? null }
    : { state: prospecto.state || null, postalCode: prospecto.postalCode || null };
  const exento = para === "cliente" && !!(clienteElegido?.taxExempt ?? quote?.clientAccount?.taxExempt);
  const totales = useMemo(
    () => quoteTotalsPreview(cuerpoDeLineas, ajustes.data?.taxRates ?? [], direccionFiscal, exento),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(cuerpoDeLineas), ajustes.data?.taxRates, direccionFiscal.state, direccionFiscal.postalCode, exento],
  );
  const horasSemana = lineasValidas.filter((l) => l.kind === "hourly").reduce((s, l) => s + aCentesimas(l.quantity), 0) / 100;

  const falta = (() => {
    if (para === "prospecto" && !prospecto.company.trim() && !prospecto.contactName.trim()) return t("ui.Cotizaciones.editor.faltaProspecto", "Escribe la empresa o el nombre del contacto.");
    if (para === "cliente" && !clientAccountId) return t("ui.Cotizaciones.editor.faltaCliente", "Elige el cliente.");
    if (para === "prospecto" && multimarca.activo && multimarca.marcas.length && !marcaProspecto) return t("ui.CotizacionEditor.faltaMarca", "Elige la marca que emite la cotización.");
    if (!cuerpoDeLineas.length) return t("ui.Cotizaciones.editor.faltaLineas", "Agrega al menos una línea con descripción.");
    if (editando && !title.trim()) return t("ui.Cotizaciones.editor.faltaTitulo", "La cotización necesita un título.");

    return null;
  })();

  const guardar = async () => {
    if (falta) {
      toast.error(falta);

      return;
    }
    setSaving(true);
    try {
      const prospect = {
        company: prospecto.company.trim(), contactName: prospecto.contactName.trim(), title: prospecto.title.trim(), email: prospecto.email.trim(),
        phone: prospecto.phone.trim(), address: prospecto.address.trim(), city: prospecto.city.trim(), state: prospecto.state.trim().toUpperCase(),
        postalCode: prospecto.postalCode.trim(), country: "US",
      };
      const dias = Number(paymentTermsDays);
      const body: QuoteInput = {
        ...(para === "cliente" ? (editando ? {} : { clientAccountId }) : { prospect }),
        ...(para === "prospecto" && multimarca.activo && marcaProspecto ? { brandId: marcaProspecto } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
        language,
        validUntil: validUntil || (editando ? null : undefined),
        startDate: startDate || null,
        billingCycle,
        paymentTermsDays: Number.isFinite(dias) ? Math.round(dias) : undefined,
        intro: intro.trim() || null,
        ...(editando || termsTocados || ajustes.data ? { terms: terms.trim() || null } : {}),
        lines: cuerpoDeLineas,
      };
      const r = editando ? await clientBillingService.updateQuote(id, body) : await clientBillingService.createQuote(body);

      toast.success(editando ? t("ui.Cotizaciones.editor.guardada", "Cotización guardada") : t("ui.Cotizaciones.editor.creada", "Cotización {{n}} creada", { n: r.quote.number }));
      await qc.invalidateQueries({ queryKey: [QK, "quotes"] });
      await qc.invalidateQueries({ queryKey: [QK, "quote", r.quote.id] });
      navigate(`/facturacion/cotizaciones/${r.quote.id}`, { replace: true });
    } catch (e) {
      avisarError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  if (editando && (existente.isLoading || !quote)) {
    return (
      <AppLayout>
        <PageContainer>
          {existente.isError ? (
            <EmptyState icon={<FileSignature />} title={t("ui.Cotizaciones.detalle.noEncontrada", "No se encontró la cotización")} action={<Button variant="outline" onClick={() => navigate("/facturacion/cotizaciones")}><ArrowLeft size={14} /> {t("ui.Cotizaciones.volver", "Volver a cotizaciones")}</Button>} />
          ) : (
            <SkeletonCards count={4} />
          )}
        </PageContainer>
      </AppLayout>
    );
  }

  const bloqueada = !!quote && !QUOTE_EDITABLE.includes(quote.status);
  const puede = editando ? hasPermission("estimateEdit") : hasPermission("estimateCreate");
  const usStates = ajustes.data?.usStates ?? [];
  const etiquetaCantidad = (k: QuoteLineKind) =>
    k === "hourly" ? t("ui.Cotizaciones.editor.horasPorSemana", "Horas por semana") : k === "oneTime" ? t("ui.Cotizaciones.editor.cantidad", "Cantidad") : t("ui.Cotizaciones.editor.unidadesAlMes", "Unidades al mes");
  const etiquetaPrecio = (k: QuoteLineKind) =>
    k === "hourly" ? t("ui.Cotizaciones.editor.tarifaPorHora", "Tarifa por hora") : t("ui.Cotizaciones.editor.precioUnitario", "Precio por unidad");

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<FileSignature />}
          title={editando ? t("ui.Cotizaciones.editor.tituloEditar", "Editar {{n}}", { n: quote?.number }) : t("ui.Cotizaciones.nueva", "Nueva cotización")}
          subtitle={t("ui.Cotizaciones.editor.subtitulo", "Los importes se estiman al mes: las horas por semana × tarifa × 52 ÷ 12. Los pagos únicos van aparte.")}
          actions={
            <>
              <Button variant="outline" onClick={() => navigate(editando ? `/facturacion/cotizaciones/${id}` : "/facturacion/cotizaciones")}><ArrowLeft size={14} /> {t("ui.Facturacion.cancelar", "Cancelar")}</Button>
              {puede && !bloqueada && (
                <Button disabled={saving} variant="brand" onClick={guardar}><Save size={14} /> {saving ? t("ui.Facturacion.guardando", "Guardando…") : t("ui.Facturacion.guardar", "Guardar")}</Button>
              )}
            </>
          }
        />

        {bloqueada && <InfoNote tone="warn">{t("ui.Cotizaciones.editor.bloqueada", "Esta cotización ya no se puede editar en su estado actual. Duplícala para escribir otra.")}</InfoNote>}
        {quote && quote.status !== "draft" && !bloqueada && (
          <InfoNote tone="warn">{t("ui.Cotizaciones.editor.avisoRevision", "Esta cotización ya se envió: al guardar se crea la revisión {{n}} con un enlace nuevo y el enlace anterior deja de funcionar. Tendrás que enviarla otra vez.", { n: Number(quote.revision) + 1 })}</InfoNote>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Section icon={<Building2 />} title={t("ui.Cotizaciones.editor.para", "Para quién")}>
              {!editando && (
                <Segmented<Para>
                  className="mb-3"
                  options={[
                    { value: "prospecto", label: <span className="flex items-center gap-1.5"><UserPlus size={14} /> {t("ui.Cotizaciones.editor.prospectoNuevo", "Prospecto nuevo")}</span> },
                    { value: "cliente", label: <span className="flex items-center gap-1.5"><Users size={14} /> {t("ui.Cotizaciones.editor.clienteExistente", "Cliente existente")}</span> },
                  ]}
                  value={para}
                  onChange={setPara}
                />
              )}
              {para === "cliente" ? (
                <FormField label={t("ui.Cotizaciones.editor.cliente", "Cliente")} required>
                  <select className={FIELD_CLS} disabled={editando} value={clientAccountId} onChange={(e) => setClientAccountId(e.target.value)}>
                    <option value="">{clientes.isLoading ? t("ui.Facturacion.cargando", "Cargando…") : t("ui.Facturacion.facturas.eligeCliente", "Elige un cliente")}</option>
                    {(clientes.data ?? []).map((c) => <option key={c.id} value={c.id}>{nombreDelCliente(c)}</option>)}
                    {editando && quote?.clientAccount && !(clientes.data ?? []).some((c) => c.id === quote.clientAccountId) && (
                      <option value={quote.clientAccountId || ""}>{nombreDelCliente(quote.clientAccount)}</option>
                    )}
                  </select>
                  {multimarca.activo && clientAccountId && (() => {
                    const idDeMarca = (clientes.data ?? []).find((c) => c.id === clientAccountId)?.brandId ?? quote?.brandId ?? null;
                    const m = multimarca.todas.find((b) => b.id === idDeMarca);

                    return m ? (
                      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                        {t("ui.CotizacionEditor.marcaDelCliente", "La emite {{marca}}, la marca del cliente.", { marca: m.name })}
                      </p>
                    ) : null;
                  })()}
                </FormField>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <CampoDeMarca
                    className="sm:col-span-2"
                    hint={t("ui.CotizacionEditor.marcaAyuda", "La empresa que emite la cotización. Si se acepta, el cliente nace en esta marca.")}
                    id="cotizacion-marca"
                    label={t("ui.CotizacionEditor.marca", "Marca que cotiza")}
                    selectClassName={FIELD_CLS}
                    value={marcaProspecto}
                    onChange={setMarcaProspecto}
                  />
                  <FormField label={t("ui.Cotizaciones.editor.empresa", "Empresa")}>
                    <input className={FIELD_CLS} value={prospecto.company} onChange={(e) => setP("company", e.target.value)} />
                  </FormField>
                  <FormField label={t("ui.Cotizaciones.editor.contacto", "Nombre del contacto")}>
                    <input className={FIELD_CLS} value={prospecto.contactName} onChange={(e) => setP("contactName", e.target.value)} />
                  </FormField>
                  <FormField label={t("ui.Cotizaciones.editor.cargo", "Cargo")}>
                    <input className={FIELD_CLS} value={prospecto.title} onChange={(e) => setP("title", e.target.value)} />
                  </FormField>
                  <FormField label={t("ui.Cotizaciones.editor.correo", "Correo")} hint={t("ui.Cotizaciones.editor.correoHint", "A este correo se envía la cotización para firmar.")}>
                    <input className={FIELD_CLS} type="email" value={prospecto.email} onChange={(e) => setP("email", e.target.value)} />
                  </FormField>
                  <FormField label={t("ui.Cotizaciones.editor.telefono", "Teléfono")}>
                    <input className={FIELD_CLS} type="tel" value={prospecto.phone} onChange={(e) => setP("phone", e.target.value)} />
                  </FormField>
                  <FormField label={t("ui.Cotizaciones.editor.direccion", "Dirección")}>
                    <input className={FIELD_CLS} value={prospecto.address} onChange={(e) => setP("address", e.target.value)} />
                  </FormField>
                  <FormField label={t("ui.Cotizaciones.editor.ciudad", "Ciudad")}>
                    <input className={FIELD_CLS} value={prospecto.city} onChange={(e) => setP("city", e.target.value)} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label={t("ui.Cotizaciones.editor.estado", "Estado")} hint={t("ui.Cotizaciones.editor.estadoHint", "Define el impuesto estimado.")}>
                      {usStates.length ? (
                        <select className={FIELD_CLS} value={prospecto.state} onChange={(e) => setP("state", e.target.value)}>
                          <option value="">—</option>
                          {usStates.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
                        </select>
                      ) : (
                        <input className={FIELD_CLS} maxLength={2} placeholder="TX" value={prospecto.state} onChange={(e) => setP("state", e.target.value.toUpperCase())} />
                      )}
                    </FormField>
                    <FormField label={t("ui.Cotizaciones.editor.codigoPostal", "Código postal")}>
                      <input className={FIELD_CLS} inputMode="numeric" value={prospecto.postalCode} onChange={(e) => setP("postalCode", e.target.value)} />
                    </FormField>
                  </div>
                </div>
              )}
            </Section>

            <Section icon={<FileText />} title={t("ui.Cotizaciones.editor.condiciones", "Condiciones")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField className="sm:col-span-2" label={t("ui.Cotizaciones.editor.titulo", "Título")} hint={editando ? undefined : t("ui.Cotizaciones.editor.tituloHint", "Si lo dejas vacío: «Security services proposal — empresa».")}>
                  <input className={FIELD_CLS} value={title} onChange={(e) => setTitle(e.target.value)} />
                </FormField>
                <FormField label={t("ui.Cotizaciones.editor.idioma", "Idioma del documento")}>
                  <select className={FIELD_CLS} value={language} onChange={(e) => setLanguage(e.target.value as QuoteLanguage)}>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                  </select>
                </FormField>
                <FormField label={t("ui.Cotizaciones.editor.validaHasta", "Válida hasta")}>
                  <input className={FIELD_CLS} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                </FormField>
                <FormField label={t("ui.Cotizaciones.editor.inicio", "Inicio propuesto del servicio")}>
                  <input className={FIELD_CLS} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </FormField>
                <FormField label={t("ui.Cotizaciones.editor.ciclo", "Ciclo de facturación")}>
                  <select className={FIELD_CLS} value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}>
                    {BILLING_CYCLES.map((c) => <option key={c} value={c}>{etiquetas.cycle[c]}</option>)}
                  </select>
                </FormField>
                <FormField label={t("ui.Cotizaciones.editor.terminosDePago", "Términos de pago (días)")}>
                  <input className={FIELD_CLS} max={180} min={0} type="number" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
                </FormField>
              </div>
            </Section>

            <Section
              icon={<Clock />}
              title={t("ui.Cotizaciones.editor.lineas", "Servicios cotizados")}
              action={<Button size="sm" variant="outline" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}><Plus size={14} /> {t("ui.Cotizaciones.editor.agregarLinea", "Agregar línea")}</Button>}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs" style={{ color: "var(--ink-faint)" }}>{t("ui.Cotizaciones.editor.atajos", "Agregar rápido:")}</span>
                {PRESETS.map((p) => (
                  <Button key={p.id} size="sm" variant="outline" onClick={() => agregarPreset(p.id)}>
                    <p.icon size={14} />
                    {p.id === "post247" ? t("ui.Cotizaciones.preset.post247", "Puesto 24/7")
                      : p.id === "day12" ? t("ui.Cotizaciones.preset.day12", "Turno de día 12 h")
                      : p.id === "night12" ? t("ui.Cotizaciones.preset.night12", "Turno de noche 12 h")
                      : p.id === "patrol" ? t("ui.Cotizaciones.preset.patrol", "Ronda móvil")
                      : t("ui.Cotizaciones.preset.setup", "Instalación")}
                  </Button>
                ))}
              </div>
              <div className="space-y-3">
                {lineas.map((l, i) => {
                  const est = quoteLineTotals({ kind: l.kind, quantityHundredths: aCentesimas(l.quantity), unitCents: aCentesimas(l.unitPrice) });

                  return (
                    <div key={l.key} className="glass-flat space-y-3 p-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                        <FormField className="sm:col-span-2" label={t("ui.Cotizaciones.editor.tipo", "Tipo")}>
                          <select className={FIELD_CLS} value={l.kind} onChange={(e) => setLinea(l.key, { kind: e.target.value as QuoteLineKind })}>
                            {QUOTE_LINE_KINDS.map((k) => <option key={k} value={k}>{etiquetas.quoteKind[k]}</option>)}
                          </select>
                        </FormField>
                        <FormField className="sm:col-span-4" label={t("ui.Cotizaciones.editor.descripcion", "Descripción")} required={i === 0}>
                          <input className={FIELD_CLS} value={l.description} onChange={(e) => setLinea(l.key, { description: e.target.value })} />
                        </FormField>
                        <FormField className="sm:col-span-2" label={t("ui.Cotizaciones.editor.sede", "Sede o puesto")}>
                          <input className={FIELD_CLS} value={l.siteLabel} onChange={(e) => setLinea(l.key, { siteLabel: e.target.value })} />
                        </FormField>
                        {l.kind === "hourly" && (
                          <FormField label={t("ui.Cotizaciones.editor.turno", "Turno")}>
                            <select className={FIELD_CLS} value={l.shiftType} onChange={(e) => setLinea(l.key, { shiftType: e.target.value as ShiftType })}>
                              {SHIFT_TYPES.map((s) => <option key={s} value={s}>{etiquetas.shiftType[s]}</option>)}
                            </select>
                          </FormField>
                        )}
                        <FormField label={etiquetaCantidad(l.kind)}>
                          <input className={FIELD_CLS} inputMode="decimal" value={l.quantity} onChange={(e) => setLinea(l.key, { quantity: e.target.value })} />
                        </FormField>
                        <FormField label={etiquetaPrecio(l.kind)}>
                          <input className={FIELD_CLS} inputMode="decimal" placeholder="0.00" value={l.unitPrice} onChange={(e) => setLinea(l.key, { unitPrice: e.target.value })} />
                        </FormField>
                        <FormField className={l.kind === "hourly" ? "" : "sm:col-span-2"} label={t("ui.Cotizaciones.editor.gravable", "Gravable")}>
                          <div className="flex h-9 items-center">
                            <Switch checked={l.taxable} onCheckedChange={(v) => setLinea(l.key, { taxable: v })} />
                          </div>
                        </FormField>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="tabular-nums" style={{ color: "var(--ink-soft)" }}>
                          {l.kind === "oneTime"
                            ? t("ui.Cotizaciones.editor.estimadoUnico", "Pago único: {{v}}", { v: dinero(est.oneTimeCents, moneda) })
                            : t("ui.Cotizaciones.editor.estimadoMensual", "Estimado al mes: {{v}}", { v: dinero(est.monthlyCents, moneda) })}
                        </span>
                        <Button disabled={lineas.length === 1} size="sm" variant="ghost" onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))}>
                          <Trash2 size={14} /> {t("ui.Cotizaciones.editor.quitarLinea", "Quitar")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section icon={<FileText />} title={t("ui.Cotizaciones.editor.textos", "Textos del documento")}>
              <div className="space-y-3">
                <FormField label={t("ui.Cotizaciones.editor.intro", "Introducción")} hint={t("ui.Cotizaciones.editor.introHint", "Va al principio de la propuesta: el alcance, lo que se entendió de la necesidad.")}>
                  <textarea className={`${FIELD_CLS} h-28`} value={intro} onChange={(e) => setIntro(e.target.value)} />
                </FormField>
                <FormField label={t("ui.Cotizaciones.editor.terminos", "Términos y condiciones")} hint={t("ui.Cotizaciones.editor.terminosHint", "Se proponen los de Ajustes de facturación; lo que cambies aquí sólo vale para esta cotización.")}>
                  <textarea className={`${FIELD_CLS} h-40`} value={terms} onChange={(e) => { setTerms(e.target.value); setTermsTocados(true); }} />
                </FormField>
              </div>
            </Section>
          </div>

          <div className="lg:sticky lg:top-4 lg:self-start">
            <Section title={t("ui.Cotizaciones.totales", "Totales")}>
              <dl className="space-y-1.5 text-sm tabular-nums">
                <FilaTotal label={t("ui.Cotizaciones.subtotalMensual", "Subtotal mensual")} value={dinero(totales.monthlySubtotalCents, moneda)} />
                {totales.taxBreakdown.map((r, i) => <FilaTotal key={i} label={`${r.name} (${(r.rateBps / 100).toFixed(2)} %)`} value={dinero(r.taxCents, moneda)} suave />)}
                {!totales.taxBreakdown.length && <FilaTotal label={t("ui.Cotizaciones.impuestoEstimado", "Impuesto estimado")} value={dinero(0, moneda)} suave />}
                <FilaTotal label={t("ui.Cotizaciones.totalMensual", "Total mensual")} value={dinero(totales.monthlyTotalCents, moneda)} fuerte />
                <FilaTotal label={t("ui.Cotizaciones.pagoUnico", "Pago único")} value={dinero(totales.oneTimeCents, moneda)} />
                {horasSemana > 0 && <FilaTotal label={t("ui.Cotizaciones.horasPorSemana", "Horas por semana")} value={String(horasSemana)} suave />}
              </dl>
              <p className="mt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
                {ajustes.data
                  ? t("ui.Cotizaciones.editor.notaTotales", "Estimación con la tabla de impuestos de la empresa en la dirección del prospecto. Al guardar, el servidor recalcula y esas cifras son las que valen.")
                  : t("ui.Cotizaciones.editor.notaTotalesSinImpuestos", "El impuesto lo calcula el servidor al guardar, con la tabla de impuestos de la empresa.")}
              </p>
            </Section>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}

export default conModuloDeFacturacion(CotizacionEditorPage);
