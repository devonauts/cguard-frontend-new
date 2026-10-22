/**
 * HOW THE COMPANY'S INVOICES AND PROPOSALS LOOK — and what they say.
 *
 * Two tabs of the billing settings share this file:
 *   · «Diseño»: colours, header layout, font, logo, what is printed, titles;
 *   · «Textos»: the default notes, terms, intro, closing and footers.
 * Next to both, a live preview: a sample invoice or proposal (fictitious
 * client) drawn by the server with the company's real header and the form AS
 * IT IS NOW, unsaved. The page's own «Guardar» stores everything.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlertTriangle, Eye, ExternalLink, FileText, ImageOff, LayoutTemplate, Loader2, Palette, ScrollText, Type } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { Section, FormField, FIELD_CLS, Segmented, InfoNote } from "@/components/kit";
import { cn } from "@/lib/utils";
import clientBillingService, {
  DEFAULT_DOCUMENT_STYLE,
  DOCUMENT_TEXT_LIMITS,
  isHexColor,
  type BillingSettings,
  type DocFont,
  type DocumentStyle,
  type HeaderStyle,
} from "@/lib/api/clientBillingService";
import { mensajeDeError } from "./comun";

export type DocKind = "invoice" | "quote";

/** The style of the form, complete even if the server sent an older shape. */
export const estiloDe = (form: BillingSettings | null | undefined): DocumentStyle => ({ ...DEFAULT_DOCUMENT_STYLE, ...(form?.documentStyle || {}) });

const ACENTOS = ["#0d5c63", "#1e3a8a", "#0f172a", "#7f1d1d", "#166534", "#a16207", "#6d28d9", "#be123c"];
const TINTAS = ["#0f172a", "#111827", "#1f2937", "#334155", "#3f3f46"];
const FAMILIA_CSS: Record<DocFont, string> = {
  helvetica: "Helvetica, Arial, sans-serif",
  times: "'Times New Roman', Times, serif",
  courier: "'Courier New', Courier, monospace",
};

/* ── Colour ─────────────────────────────────────────────────────────────── */
function CampoDeColor({ label, value, presets, disabled, onChange }: { label: string; value: string; presets: string[]; disabled: boolean; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  // Typed as text: «#1e3» survives while the person is still writing it.
  const [texto, setTexto] = useState(value);

  useEffect(() => setTexto(value), [value]);
  const valido = isHexColor(texto);

  return (
    <FormField label={label} error={!valido ? t("ui.Facturacion.diseno.colorInvalido", "Usa el formato #RRGGBB.") : undefined}>
      <div className="flex items-center gap-2">
        <input
          aria-label={label}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:cursor-not-allowed"
          disabled={disabled}
          type="color"
          value={isHexColor(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
        />
        <input
          className={cn(FIELD_CLS, "font-mono uppercase")}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          value={texto}
          onChange={(e) => {
            const v = e.target.value.trim();

            setTexto(v);
            if (isHexColor(v)) onChange(v.toLowerCase());
          }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((c) => (
          <button
            key={c}
            aria-label={c}
            className={cn("cg-focus h-6 w-6 rounded-full border transition-transform hover:scale-110 disabled:cursor-not-allowed", value === c && "ring-2 ring-offset-2")}
            disabled={disabled}
            style={{ background: c, borderColor: "var(--line)" }}
            title={c}
            type="button"
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </FormField>
  );
}

/* ── Header layout cards: a tiny drawing of each ───────────────────────── */
function MiniCabecera({ estilo, acento }: { estilo: HeaderStyle; acento: string }) {
  const barra = (w: string, c = "var(--ink-faint)", h = 4) => <div className="rounded-sm" style={{ width: w, height: h, background: c, opacity: 0.55 }} />;

  if (estilo === "band") {
    return (
      <div className="overflow-hidden rounded-md border bg-white" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center justify-between px-2 py-2" style={{ background: acento }}>
          <div className="flex items-center gap-1"><div className="h-3 w-3 rounded-sm bg-white" />{barra("28px", "#ffffff", 4)}</div>
          {barra("22px", "#ffffff", 5)}
        </div>
        <div className="flex justify-between px-2 py-2"><div className="space-y-1">{barra("30px")}{barra("24px")}</div><div className="space-y-1">{barra("26px")}{barra("26px")}</div></div>
      </div>
    );
  }
  if (estilo === "minimal") {
    return (
      <div className="rounded-md border bg-white px-2 py-2" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center justify-between">{barra("34px", "#0f172a", 4)}{barra("20px", "#0f172a", 3)}</div>
        <div className="my-1.5 h-px" style={{ background: acento }} />
        <div className="flex justify-between"><div className="space-y-1">{barra("30px")}{barra("24px")}</div><div className="space-y-1">{barra("26px")}{barra("26px")}</div></div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-white px-2 py-2" style={{ borderColor: "var(--line)" }}>
      <div className="flex justify-between">
        <div className="space-y-1">{barra("38px", "#0f172a", 5)}{barra("30px")}{barra("24px")}</div>
        <div className="flex flex-col items-end space-y-1">{barra("30px", acento, 7)}{barra("26px")}{barra("26px")}</div>
      </div>
    </div>
  );
}

/* ── «Diseño» ───────────────────────────────────────────────────────────── */
export function DisenoAjustes({ value, onChange, canEdit, logoUrl }: { value: DocumentStyle; onChange: (patch: Partial<DocumentStyle>) => void; canEdit: boolean; logoUrl: string | null }) {
  const { t } = useTranslation();
  const [logoRoto, setLogoRoto] = useState(false);

  useEffect(() => setLogoRoto(false), [logoUrl]);

  const encabezados: Array<{ value: HeaderStyle; label: string; hint: string }> = [
    { value: "classic", label: t("ui.Facturacion.diseno.clasico", "Clásico"), hint: t("ui.Facturacion.diseno.clasicoHint", "Nombre a la izquierda, título en color a la derecha.") },
    { value: "band", label: t("ui.Facturacion.diseno.banda", "Banda de color"), hint: t("ui.Facturacion.diseno.bandaHint", "Franja superior con tu color, nombre y logo en blanco.") },
    { value: "minimal", label: t("ui.Facturacion.diseno.minimalista", "Minimalista"), hint: t("ui.Facturacion.diseno.minimalistaHint", "Sobrio: una línea fina de color bajo la cabecera.") },
  ];
  const fuentes: Array<{ value: DocFont; label: string }> = [
    { value: "helvetica", label: t("ui.Facturacion.diseno.fuenteHelvetica", "Helvetica (moderna)") },
    { value: "times", label: t("ui.Facturacion.diseno.fuenteTimes", "Times (clásica)") },
    { value: "courier", label: t("ui.Facturacion.diseno.fuenteCourier", "Courier (máquina de escribir)") },
  ];
  const interruptores: Array<{ key: keyof DocumentStyle; label: string; hint: string }> = [
    { key: "showTaxId", label: t("ui.Facturacion.diseno.mostrarIdFiscal", "Identificación fiscal de la empresa"), hint: t("ui.Facturacion.diseno.mostrarIdFiscalHint", "En el pie de cada página.") },
    { key: "showPoNumber", label: t("ui.Facturacion.diseno.mostrarOrdenDeCompra", "Orden de compra"), hint: t("ui.Facturacion.diseno.mostrarOrdenDeCompraHint", "Cuando el contrato o la factura la tienen.") },
    { key: "showServicePeriod", label: t("ui.Facturacion.diseno.mostrarPeriodo", "Período de servicio"), hint: t("ui.Facturacion.diseno.mostrarPeriodoHint", "Las fechas que cubre la factura.") },
    { key: "showPaymentMethods", label: t("ui.Facturacion.diseno.mostrarMetodos", "Cómo pagar"), hint: t("ui.Facturacion.diseno.mostrarMetodosHint", "Los métodos de pago con sus datos. Apagado, sale el texto de instrucciones de pago.") },
    { key: "showSignatureLines", label: t("ui.Facturacion.diseno.mostrarFirmas", "Líneas de firma"), hint: t("ui.Facturacion.diseno.mostrarFirmasHint", "Para firmar la copia impresa. En la cotización sólo si no se aceptó en línea.") },
    { key: "showPageNumbers", label: t("ui.Facturacion.diseno.mostrarPaginas", "Número de página"), hint: t("ui.Facturacion.diseno.mostrarPaginasHint", "«Página 1», «Página 2»… en el pie.") },
  ];

  return (
    <div className="space-y-4">
      <Section icon={<Palette />} title={t("ui.Facturacion.diseno.colores", "Colores")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoDeColor disabled={!canEdit} label={t("ui.Facturacion.diseno.colorAcento", "Color principal")} presets={ACENTOS} value={value.accentColor} onChange={(v) => onChange({ accentColor: v })} />
          <CampoDeColor disabled={!canEdit} label={t("ui.Facturacion.diseno.colorTexto", "Color del texto")} presets={TINTAS} value={value.textColor} onChange={(v) => onChange({ textColor: v })} />
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--ink-faint)" }}>{t("ui.Facturacion.diseno.coloresHint", "El color principal se usa en el título, la banda y los encabezados, y también en los correos de facturas y cotizaciones.")}</p>
      </Section>

      <Section icon={<LayoutTemplate />} title={t("ui.Facturacion.diseno.encabezado", "Encabezado")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup">
          {encabezados.map((o) => {
            const activo = value.headerStyle === o.value;

            return (
              <button
                key={o.value}
                aria-checked={activo}
                className={cn("cg-focus rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed", activo ? "glass-sunken" : "hover:bg-[var(--glass-sunken)]")}
                disabled={!canEdit}
                role="radio"
                style={{ borderColor: activo ? value.accentColor : "var(--line)", borderWidth: activo ? 2 : 1 }}
                type="button"
                onClick={() => onChange({ headerStyle: o.value })}
              >
                <MiniCabecera acento={value.accentColor} estilo={o.value} />
                <div className="mt-2 text-sm font-semibold">{o.label}</div>
                <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{o.hint}</div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section icon={<Type />} title={t("ui.Facturacion.diseno.letraYLogo", "Letra y logo")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t("ui.Facturacion.diseno.fuente", "Tipo de letra")}>
            <select className={FIELD_CLS} disabled={!canEdit} style={{ fontFamily: FAMILIA_CSS[value.font] }} value={value.font} onChange={(e) => onChange({ font: e.target.value as DocFont })}>
              {fuentes.map((f) => <option key={f.value} style={{ fontFamily: FAMILIA_CSS[f.value] }} value={f.value}>{f.label}</option>)}
            </select>
          </FormField>
          <div className="space-y-2">
            <div className="text-sm font-medium">{t("ui.Facturacion.diseno.logo", "Logo")}</div>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white p-1" style={{ borderColor: "var(--line)" }}>
                {logoUrl && !logoRoto
                  ? <img alt={t("ui.Facturacion.diseno.logo", "Logo")} className="max-h-full max-w-full object-contain" src={logoUrl} onError={() => setLogoRoto(true)} />
                  : <ImageOff size={18} style={{ color: "var(--ink-faint)" }} />}
              </div>
              <div className="min-w-0 text-xs" style={{ color: "var(--ink-soft)" }}>
                {logoUrl ? t("ui.Facturacion.diseno.logoDeLaEmpresa", "El logo de tu empresa.") : t("ui.Facturacion.diseno.sinLogo", "Tu empresa aún no tiene logo.")}{" "}
                <Link className="font-medium underline-offset-2 hover:underline" style={{ color: "var(--brand-text)" }} to="/setting/company-profile">{t("ui.Facturacion.diseno.cambiarLogo", "Cambiarlo en el perfil de la empresa")}</Link>
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{t("ui.Facturacion.diseno.mostrarLogo", "Mostrar el logo")}</span>
              <Switch checked={value.showLogo} disabled={!canEdit} onCheckedChange={(v) => onChange({ showLogo: v })} />
            </label>
            {value.showLogo && (
              <Segmented
                options={[{ value: "left", label: t("ui.Facturacion.diseno.logoIzquierda", "A la izquierda") }, { value: "right", label: t("ui.Facturacion.diseno.logoDerecha", "A la derecha") }]}
                value={value.logoPosition}
                onChange={(v) => canEdit && onChange({ logoPosition: v })}
              />
            )}
          </div>
        </div>
      </Section>

      <Section icon={<Eye />} title={t("ui.Facturacion.diseno.queSeMuestra", "Qué se muestra")}>
        <div className="divide-y" style={{ borderColor: "var(--line)" }}>
          {interruptores.map((s) => (
            <label key={s.key} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
              <span className="min-w-0">
                <span className="block font-medium">{s.label}</span>
                <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>{s.hint}</span>
              </span>
              <Switch checked={!!value[s.key]} disabled={!canEdit} onCheckedChange={(v) => onChange({ [s.key]: v } as Partial<DocumentStyle>)} />
            </label>
          ))}
        </div>
      </Section>

      <Section icon={<FileText />} title={t("ui.Facturacion.diseno.titulos", "Títulos")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField hint={t("ui.Facturacion.diseno.tituloHint", "Vacío = el de siempre, en el idioma del documento.")} label={t("ui.Facturacion.diseno.tituloFactura", "Título de la factura")}>
            <input className={FIELD_CLS} disabled={!canEdit} maxLength={DOCUMENT_TEXT_LIMITS.title} placeholder={t("ui.Facturacion.diseno.tituloFacturaDefecto", "FACTURA")} value={value.invoiceTitle} onChange={(e) => onChange({ invoiceTitle: e.target.value })} />
          </FormField>
          <FormField hint={t("ui.Facturacion.diseno.tituloHint", "Vacío = el de siempre, en el idioma del documento.")} label={t("ui.Facturacion.diseno.tituloCotizacion", "Título de la cotización")}>
            <input className={FIELD_CLS} disabled={!canEdit} maxLength={DOCUMENT_TEXT_LIMITS.title} placeholder={t("ui.Facturacion.diseno.tituloCotizacionDefecto", "COTIZACIÓN")} value={value.quoteTitle} onChange={(e) => onChange({ quoteTitle: e.target.value })} />
          </FormField>
        </div>
      </Section>
    </div>
  );
}

/* ── «Textos» ───────────────────────────────────────────────────────────── */
function AreaDeTexto({ label, hint, value, disabled, alto = "h-24", max = DOCUMENT_TEXT_LIMITS.text, onChange }: { label: string; hint?: string; value: string; disabled: boolean; alto?: string; max?: number; onChange: (v: string) => void }) {
  return (
    <FormField hint={hint} label={<span className="flex items-baseline justify-between gap-2"><span>{label}</span><span className="text-[11px] font-normal tabular-nums" style={{ color: "var(--ink-faint)" }}>{value.length}/{max}</span></span>}>
      <textarea className={cn(FIELD_CLS, alto, "py-2")} disabled={disabled} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    </FormField>
  );
}

export function TextosAjustes({ form, set, setEstilo, canEdit, onKind }: {
  form: BillingSettings;
  set: <K extends keyof BillingSettings>(k: K, v: BillingSettings[K]) => void;
  setEstilo: (patch: Partial<DocumentStyle>) => void;
  canEdit: boolean;
  /** The preview follows the document being written. */
  onKind: (k: DocKind) => void;
}) {
  const { t } = useTranslation();
  const st = estiloDe(form);
  const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };

  return (
    <div className="space-y-4">
      <div onFocusCapture={() => onKind("invoice")}>
        <Section icon={<FileText />} title={t("ui.Facturacion.diseno.textosFactura", "Facturas")}>
          <div className="space-y-3">
            <AreaDeTexto disabled={!canEdit} hint={t("ui.Facturacion.diseno.notasPorDefectoHint", "Se copian en cada factura nueva que no traiga notas (también las de las corridas). Puedes cambiarlas en cada una.")} label={t("ui.Facturacion.diseno.notasPorDefecto", "Notas por defecto")} value={st.invoiceDefaultNotes} onChange={(v) => setEstilo({ invoiceDefaultNotes: v })} />
            <AreaDeTexto alto="h-32" disabled={!canEdit} hint={t("ui.Facturacion.diseno.terminosFacturaHint", "Sale en todas las facturas bajo «Términos y condiciones»: plazos, recargos, cláusulas.")} label={t("ui.Facturacion.diseno.terminosFactura", "Términos y condiciones")} value={st.invoiceTerms} onChange={(v) => setEstilo({ invoiceTerms: v })} />
            <AreaDeTexto disabled={!canEdit} hint={t("ui.Facturacion.diseno.instruccionesHint", "Sólo sale cuando la factura no muestra métodos de pago (o los ocultaste en Diseño).")} label={t("ui.Facturacion.ajustes.instruccionesDePago", "Instrucciones de pago")} value={form.paymentInstructions || ""} onChange={(v) => set("paymentInstructions", v)} />
            <AreaDeTexto alto="h-20" disabled={!canEdit} hint={t("ui.Facturacion.diseno.pieFacturaHint", "La última línea del documento: un agradecimiento, la licencia, una dirección postal…")} label={t("ui.Facturacion.ajustes.pieDeFactura", "Pie de la factura")} value={form.invoiceFooter || ""} onChange={(v) => set("invoiceFooter", v)} />
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="block font-medium">{t("ui.Facturacion.ajustes.adjuntarDetalle", "Adjuntar el detalle de turnos al PDF")}</span>
                <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.ajustes.adjuntarDetalleHint", "Fecha, sede, vigilante y horas de cada turno facturado, como anexo.")}</span>
              </span>
              <Switch checked={form.attachShiftDetail} disabled={!canEdit} onCheckedChange={(v) => set("attachShiftDetail", v)} />
            </label>
          </div>
        </Section>
      </div>

      <div onFocusCapture={() => onKind("quote")}>
        <Section icon={<ScrollText />} title={t("ui.Facturacion.diseno.textosCotizacion", "Cotizaciones")}>
          <div className="space-y-3">
            <FormField className="sm:max-w-xs" hint={t("ui.Facturacion.ajustes.validezCotizacionHint", "Pasado ese plazo sin firma, la cotización vence sola.")} label={t("ui.Facturacion.ajustes.validezCotizacion", "Validez de la cotización (días)")}>
              <input className={FIELD_CLS} disabled={!canEdit} max={365} min={1} type="number" value={form.quoteValidityDays ?? 30} onChange={(e) => set("quoteValidityDays", num(e.target.value))} />
            </FormField>
            <AreaDeTexto disabled={!canEdit} hint={t("ui.Facturacion.diseno.introPorDefectoHint", "El saludo con el que empieza cada cotización nueva. Puedes cambiarlo en cada una.")} label={t("ui.Facturacion.diseno.introPorDefecto", "Introducción por defecto")} value={st.quoteDefaultIntro} onChange={(v) => setEstilo({ quoteDefaultIntro: v })} />
            <AreaDeTexto alto="h-32" disabled={!canEdit} hint={t("ui.Facturacion.ajustes.terminosCotizacionHint", "Se copian en cada cotización nueva; puedes cambiarlos en cada una.")} label={t("ui.Facturacion.ajustes.terminosCotizacion", "Términos por defecto de las cotizaciones")} max={12000} value={form.quoteTerms ?? ""} onChange={(v) => set("quoteTerms", v)} />
            <AreaDeTexto alto="h-20" disabled={!canEdit} hint={t("ui.Facturacion.diseno.cierreHint", "Sale después de los totales: «Quedamos atentos a sus comentarios…».")} label={t("ui.Facturacion.diseno.cierre", "Texto de cierre")} value={st.quoteClosing} onChange={(v) => setEstilo({ quoteClosing: v })} />
            <AreaDeTexto alto="h-20" disabled={!canEdit} hint={t("ui.Facturacion.diseno.pieCotizacionHint", "La última línea de la cotización: licencias, certificaciones, datos de contacto…")} label={t("ui.Facturacion.diseno.pieCotizacion", "Pie de la cotización")} value={st.quoteFooter} onChange={(v) => setEstilo({ quoteFooter: v })} />
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ── The live preview ───────────────────────────────────────────────────── */

/** What of the form changes the document (the rest would only re-draw it for nothing). */
function loQueSeDibuja(form: BillingSettings): Partial<BillingSettings> {
  return {
    documentStyle: estiloDe(form),
    invoiceFooter: form.invoiceFooter, paymentInstructions: form.paymentInstructions, quoteTerms: form.quoteTerms, quoteValidityDays: form.quoteValidityDays,
    paymentMethods: form.paymentMethods, currency: form.currency, invoicePrefix: form.invoicePrefix, invoicePadding: form.invoicePadding, quotePrefix: form.quotePrefix,
    defaultTermsDays: form.defaultTermsDays, defaultBillingCycle: form.defaultBillingCycle,
    legalName: form.legalName, taxId: form.taxId, addressLine1: form.addressLine1, addressLine2: form.addressLine2, city: form.city, state: form.state,
    postalCode: form.postalCode, billingEmail: form.billingEmail, billingPhone: form.billingPhone,
  };
}

export function VistaPrevia({ form, kind, onKind }: { form: BillingSettings; kind: DocKind; onKind: (k: DocKind) => void }) {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<"es" | "en">(String(i18n.language || "es").startsWith("es") ? "es" : "en");
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const ultimoCuerpo = useRef<string | null>(null);
  const cuerpo = useMemo(() => loQueSeDibuja(form), [form]);
  const cuerpoJson = useMemo(() => JSON.stringify(cuerpo), [cuerpo]);
  const clave = `${kind}|${lang}|${cuerpoJson}`;

  useEffect(() => {
    const ctrl = new AbortController();
    // The first drawing and a switch of document or language at once; an edit waits until the person stops typing.
    const espera = ultimoCuerpo.current === null || ultimoCuerpo.current === cuerpoJson ? 0 : 800;

    ultimoCuerpo.current = cuerpoJson;
    const timer = window.setTimeout(async () => {
      setCargando(true);
      try {
        const blob = await clientBillingService.previewDocument(kind, cuerpo, lang, ctrl.signal);

        if (ctrl.signal.aborted) return;
        const nueva = URL.createObjectURL(blob);

        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = nueva;
        setUrl(nueva);
        setError(null);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError(mensajeDeError(e, t("ui.Facturacion.diseno.errorVistaPrevia", "No se pudo dibujar la vista previa.")));
      } finally {
        if (!ctrl.signal.aborted) setCargando(false);
      }
    }, espera);

    return () => { window.clearTimeout(timer); ctrl.abort(); };
    // `clave` captures kind, lang and every drawn field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // The last blob URL goes with the panel.
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  return (
    <Section
      action={url ? <a className="inline-flex items-center gap-1 text-xs font-medium" href={url} rel="noreferrer" style={{ color: "var(--brand-text)" }} target="_blank"><ExternalLink size={13} /> {t("ui.Facturacion.diseno.abrir", "Abrir")}</a> : undefined}
      icon={<Eye />}
      title={t("ui.Facturacion.diseno.vistaPrevia", "Vista previa")}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          options={[{ value: "invoice", label: t("ui.Facturacion.diseno.factura", "Factura") }, { value: "quote", label: t("ui.Facturacion.diseno.cotizacion", "Cotización") }]}
          value={kind}
          onChange={onKind}
        />
        <Segmented options={[{ value: "es", label: "ES" }, { value: "en", label: "EN" }]} value={lang} onChange={setLang} />
      </div>
      <div className="relative overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--line)", aspectRatio: "8.5 / 11" }}>
        {url && <iframe className="h-full w-full" src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={t("ui.Facturacion.diseno.vistaPrevia", "Vista previa")} />}
        {cargando && (
          <div className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs shadow" style={{ background: "var(--glass-solid)", color: "var(--ink-soft)" }}>
            <Loader2 className="animate-spin" size={13} /> {t("ui.Facturacion.diseno.actualizando", "Actualizando…")}
          </div>
        )}
        {!url && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "var(--ink-faint)" }}><Loader2 className="mr-2 animate-spin" size={16} /> {t("ui.Facturacion.diseno.dibujando", "Dibujando el documento…")}</div>
        )}
        {error && (
          <div className="absolute inset-x-2 bottom-2">
            <InfoNote tone="warn"><span className="inline-flex items-start gap-1.5"><AlertTriangle className="mt-0.5 shrink-0" size={14} /> {error}</span></InfoNote>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>{t("ui.Facturacion.diseno.vistaPreviaHint", "Datos de ejemplo con tu cabecera real y los cambios sin guardar. Nada se guarda hasta que pulses Guardar.")}</p>
    </Section>
  );
}
