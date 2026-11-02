/**
 * PAYMENT METHODS — how a client may pay. Six built-in methods plus the
 * company's own (Zelle, Venmo, a local bank…), each with a description the
 * client reads (bank details, payee, address) and a note (extra advice).
 * Each invoice may narrow the list down («transfer only»); null = the
 * company's enabled methods. The public page, the PDF and the e-mail print
 * exactly that list.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Section, Modal, FormField, FIELD_CLS, StatusBadge, InfoNote } from "@/components/kit";
import clientBillingService, {
  defaultPaymentMethods,
  isBuiltinPaymentMethod,
  offeredPaymentMethodKeys,
  MAX_CUSTOM_PAYMENT_METHODS,
  type Invoice,
  type PaymentMethodConfig,
} from "@/lib/api/clientBillingService";
import { QK, useEtiquetasDeFacturacion, avisarError } from "./comun";

/**
 * The company's methods. Shares the settings query with the settings page; a
 * user without `billingRead` gets the server's defaults instead of an error.
 */
export function useMetodosDeLaEmpresa(): { metodos: PaymentMethodConfig[]; cargando: boolean } {
  const q = useQuery({ queryKey: [QK, "settings"], queryFn: () => clientBillingService.settings(), retry: false, staleTime: 60_000 });
  const lista = q.data?.settings.paymentMethods;

  return { metodos: lista && lista.length ? lista : defaultPaymentMethods(), cargando: q.isLoading };
}

/** Built-in → its label; the company's own → its name; an unknown key → the key. */
export function useNombreDeMetodo(metodos: PaymentMethodConfig[] = []): (key: string) => string {
  const etiquetas = useEtiquetasDeFacturacion();

  return useCallback(
    (key: string) => {
      if (key in etiquetas.paymentMethod) return etiquetas.paymentMethod[key as keyof typeof etiquetas.paymentMethod];

      return metodos.find((m) => m.method === key)?.label || key;
    },
    [etiquetas, metodos],
  );
}

/** The methods as chips. */
export function ChipsDeMetodos({ keys, nombre }: { keys: string[]; nombre: (k: string) => string }) {
  const { t } = useTranslation();

  if (!keys.length) return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.metodos.ninguno", "Ningún método de pago activo.")}</p>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((k) => <StatusBadge key={k} dot={false} tone="brand">{nombre(k)}</StatusBadge>)}
    </div>
  );
}

/**
 * Pick the methods of one invoice: «the company's» (null) or a list of its
 * own. Choosing a list starts from the company's enabled methods.
 */
export function SelectorDeMetodos({ metodos, value, onChange }: { metodos: PaymentMethodConfig[]; value: string[] | null; onChange: (v: string[] | null) => void }) {
  const { t } = useTranslation();
  const nombre = useNombreDeMetodo(metodos);
  const deLaEmpresa = value === null;
  const activos = metodos.filter((m) => m.enabled).map((m) => m.method);
  const alternar = (k: string, on: boolean) => {
    const actual = value ?? [];
    // Keep the company's order whatever the click order.
    const sig = metodos.map((m) => m.method).filter((m) => (m === k ? on : actual.includes(m)));

    onChange(sig);
  };

  return (
    <div className="space-y-2">
      <label className="glass-flat flex cursor-pointer items-start gap-3 px-3 py-2 text-sm">
        <input checked={deLaEmpresa} className="cg-focus mt-0.5 size-4" name="metodos-de-pago" style={{ accentColor: "var(--brand)" }} type="radio" onChange={() => onChange(null)} />
        <span>
          <span className="block font-medium">{t("ui.Facturacion.metodos.deLaEmpresa", "Los de la empresa")}</span>
          <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>
            {activos.length ? activos.map(nombre).join(" · ") : t("ui.Facturacion.metodos.ninguno", "Ningún método de pago activo.")}
          </span>
        </span>
      </label>
      <label className="glass-flat flex cursor-pointer items-start gap-3 px-3 py-2 text-sm">
        <input checked={!deLaEmpresa} className="cg-focus mt-0.5 size-4" name="metodos-de-pago" style={{ accentColor: "var(--brand)" }} type="radio" onChange={() => onChange(activos)} />
        <span className="block font-medium">{t("ui.Facturacion.metodos.elegir", "Elegir para esta factura")}</span>
      </label>
      {!deLaEmpresa && (
        <div className="grid grid-cols-1 gap-1.5 pl-2 sm:grid-cols-2">
          {metodos.map((m) => (
            <label key={m.method} className="flex cursor-pointer items-center gap-2 text-sm">
              <input checked={value.includes(m.method)} className="cg-focus size-4" style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => alternar(m.method, e.target.checked)} />
              <span>{nombre(m.method)}</span>
              {!m.enabled && <span className="text-xs" style={{ color: "var(--ink-faint)" }}>({t("ui.Facturacion.metodos.desactivado", "desactivado en ajustes")})</span>}
            </label>
          ))}
        </div>
      )}
      {!deLaEmpresa && !value.length && <InfoNote tone="warn">{t("ui.Facturacion.metodos.eligeUno", "Elige al menos un método.")}</InfoNote>}
    </div>
  );
}

/** The same list, or both «the company's». */
export const mismosMetodos = (a: string[] | null | undefined, b: string[] | null | undefined): boolean => {
  const x = a && a.length ? a : null;
  const y = b && b.length ? b : null;

  if (!x || !y) return x === y;

  return x.length === y.length && x.every((k, i) => k === y[i]);
};

/* ── Invoice detail: what this invoice offers, and changing it ─────────────── */
export function MetodosDeLaFactura({ inv, canEdit, onSaved }: { inv: Invoice; canEdit: boolean; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const { metodos } = useMetodosDeLaEmpresa();
  const nombre = useNombreDeMetodo(metodos);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const propios = inv.paymentMethods && inv.paymentMethods.length ? inv.paymentMethods : null;
  const keys = offeredPaymentMethodKeys(metodos, propios);

  const abrir = () => { setValor(propios); setEditando(true); };
  const guardar = async () => {
    setSaving(true);
    try {
      await clientBillingService.setInvoicePaymentMethods(inv.id, valor);
      toast.success(t("ui.Facturacion.metodos.guardados", "Métodos de pago actualizados"));
      setEditando(false);
      await onSaved();
    } catch (e) {
      avisarError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      icon={<Wallet />}
      title={t("ui.Facturacion.metodos.titulo", "Métodos de pago")}
      action={canEdit && inv.status !== "void" ? <Button size="sm" variant="outline" onClick={abrir}><Pencil size={14} /> {t("ui.Facturacion.metodos.cambiar", "Cambiar")}</Button> : undefined}
    >
      <ChipsDeMetodos keys={keys} nombre={nombre} />
      <p className="mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
        {propios ? t("ui.Facturacion.metodos.soloEstaFactura", "Elegidos para esta factura.") : t("ui.Facturacion.metodos.usaLosDeLaEmpresa", "Usa los métodos activos de la empresa.")}
      </p>
      {editando && (
        <Modal open size="md" title={t("ui.Facturacion.metodos.modalTitulo", "Métodos de pago de esta factura")} description={t("ui.Facturacion.metodos.modalDesc", "Aparecen en la página pública, el PDF y el correo. Por ejemplo, «solo transferencia».")} onOpenChange={(o) => { if (!o) setEditando(false); }}
          footer={<div className="cg-acciones justify-end"><Button variant="outline" onClick={() => setEditando(false)}>{t("ui.Facturacion.cancelar", "Cancelar")}</Button><Button disabled={saving || (valor !== null && !valor.length)} variant="brand" onClick={guardar}>{saving ? t("ui.Facturacion.guardando", "Guardando…") : t("ui.Facturacion.guardar", "Guardar")}</Button></div>}
        >
          <SelectorDeMetodos metodos={metodos} value={valor} onChange={setValor} />
        </Modal>
      )}
    </Section>
  );
}

/* ── Settings tab: the company's list ─────────────────────────────────────── */
const nuevoMetodo = (): PaymentMethodConfig => ({ method: "", builtin: false, label: "", enabled: true, description: null, note: null });

/** A custom method without a name: the server refuses it, so say so first. */
export const metodoSinNombre = (lista: PaymentMethodConfig[] | undefined): boolean => (lista ?? []).some((m) => !m.builtin && !(m.label || "").trim());

export function MetodosDePagoAjustes({ value, canEdit, onChange }: { value: PaymentMethodConfig[] | undefined; canEdit: boolean; onChange: (v: PaymentMethodConfig[]) => void }) {
  const { t } = useTranslation();
  const lista = value && value.length ? value : defaultPaymentMethods();
  const nombre = useNombreDeMetodo(lista);
  const incorporados = lista.filter((m) => m.builtin && isBuiltinPaymentMethod(m.method));
  const propios = lista.filter((m) => !m.builtin);
  const cambiar = (m: PaymentMethodConfig, patch: Partial<PaymentMethodConfig>) => onChange(lista.map((x) => (x === m ? { ...x, ...patch } : x)));
  const quitar = (m: PaymentMethodConfig) => onChange(lista.filter((x) => x !== m));
  const anadir = () => onChange([...lista, nuevoMetodo()]);

  const fila = (m: PaymentMethodConfig, i: number) => (
    <div key={m.method || `nuevo-${i}`} className="glass-flat space-y-3 p-3">
      <div className="flex items-center justify-between gap-3">
        {m.builtin ? (
          <span className="text-sm font-medium">{nombre(m.method)}</span>
        ) : (
          <input
            aria-label={t("ui.Facturacion.metodos.nombre", "Nombre")}
            className={`${FIELD_CLS} max-w-xs font-medium`}
            disabled={!canEdit}
            maxLength={60}
            placeholder={t("ui.Facturacion.metodos.nombrePlaceholder", "Ej.: Zelle")}
            value={m.label || ""}
            onChange={(e) => cambiar(m, { label: e.target.value })}
          />
        )}
        <span className="inline-flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--ink-soft)" }}>
            {t("ui.Facturacion.metodos.activo", "Activo")}
            <Switch checked={m.enabled} disabled={!canEdit} onCheckedChange={(v) => cambiar(m, { enabled: v })} />
          </label>
          {!m.builtin && canEdit && (
            <Button size="icon" title={t("ui.Facturacion.metodos.eliminar", "Eliminar método")} variant="ghost" onClick={() => quitar(m)}><Trash2 size={14} /></Button>
          )}
        </span>
      </div>
      {m.method === "card" && <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.metodos.tarjetaEnLinea", "Con Stripe conectado (pestaña Cobros), el cliente paga la tarjeta en línea desde la factura.")}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={t("ui.Facturacion.metodos.descripcion", "Descripción")}>
          <textarea className={`${FIELD_CLS} h-24`} disabled={!canEdit} maxLength={2000} placeholder={t("ui.Facturacion.metodos.descripcionPlaceholder", "Banco, titular, número de cuenta, routing…")} value={m.description || ""} onChange={(e) => cambiar(m, { description: e.target.value || null })} />
        </FormField>
        <FormField label={t("ui.Facturacion.metodos.nota", "Nota")}>
          <input className={FIELD_CLS} disabled={!canEdit} maxLength={1000} placeholder={t("ui.Facturacion.metodos.notaPlaceholder", "Ej.: escribe el número de factura en la referencia.")} value={m.note || ""} onChange={(e) => cambiar(m, { note: e.target.value || null })} />
        </FormField>
      </div>
    </div>
  );

  return (
    <Section title={t("ui.Facturacion.metodos.titulo", "Métodos de pago")} icon={<Wallet />}>
      <InfoNote tone="info" className="mb-3">
        {t(
          "ui.Facturacion.metodos.ayuda",
          "Los métodos activos salen en cada factura: en la página pública, el PDF y el correo. La descripción es lo que ve el cliente (banco, titular, cuenta, dirección para cheques…); la nota es un consejo adicional, como «escribe el número de factura en la referencia». Cada factura puede limitarlos.",
        )}
      </InfoNote>
      <div className="space-y-3">
        {incorporados.map(fila)}
      </div>
      <div className="mb-2 mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="cg-eyebrow">{t("ui.Facturacion.metodos.propios", "Métodos propios")}</div>
          <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.metodos.propiosHint", "Zelle, Venmo, un banco local… Hasta {{n}}.", { n: MAX_CUSTOM_PAYMENT_METHODS })}</div>
        </div>
        {canEdit && (
          <Button disabled={propios.length >= MAX_CUSTOM_PAYMENT_METHODS} size="sm" variant="outline" onClick={anadir}><Plus size={14} /> {t("ui.Facturacion.metodos.anadir", "Añadir método de pago")}</Button>
        )}
      </div>
      <div className="space-y-3">
        {propios.map((m, i) => fila(m, i))}
        {!propios.length && <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.metodos.sinPropios", "Todavía no has creado métodos propios.")}</p>}
      </div>
    </Section>
  );
}
