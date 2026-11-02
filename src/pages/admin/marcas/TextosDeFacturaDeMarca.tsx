/**
 * «TEXTOS DE FACTURA» — the brand editor's section (Multimarca phase 5).
 * Every company-level text a document of this brand prints: invoice title,
 * default notes, terms and footer; how to pay (instructions and bank details
 * per method); the quote's title, opening, terms, closing and footer; the
 * client reports' footer. See `textosDeMarca.ts` for the rules.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";

import { LIMITES_DE_TEXTO, type MetodoBase, type TextosBorrador } from "./textosDeMarca";

import { Switch } from "@/components/ui/switch";
import { FIELD_CLS, FormField, Segmented } from "@/components/kit";
import type { ClaveDeTexto } from "@/lib/api/marcasService";

type Pestana = "facturas" | "cobro" | "cotizaciones" | "informes";

export default function TextosDeFacturaDeMarca({
  valor,
  onChange,
  principal,
}: {
  valor: TextosBorrador;
  onChange: (v: TextosBorrador) => void;
  /** The principal falls back to the company's texts; any other brand prints only its own. */
  principal: boolean;
}) {
  const { t } = useTranslation();
  const [pestana, setPestana] = useState<Pestana>("facturas");
  const vacio = principal
    ? t("ui.TextosDeMarca.vacioPrincipal", "Vacío: el texto de la empresa")
    : t("ui.TextosDeMarca.vacioMarca", "Vacío: no se imprime");
  const nombreDeMetodo: Record<MetodoBase, string> = {
    transfer: t("ui.Facturacion.metodoPago.transfer", "Transferencia bancaria"),
    directDeposit: t("ui.Facturacion.metodoPago.directDeposit", "Depósito directo (ACH)"),
    wire: t("ui.Facturacion.metodoPago.wire", "Transferencia electrónica (wire)"),
    check: t("ui.Facturacion.metodoPago.check", "Cheque"),
    card: t("ui.Facturacion.metodoPago.card", "Tarjeta de crédito"),
    cash: t("ui.Facturacion.metodoPago.cash", "Efectivo"),
  };

  const poner = (k: ClaveDeTexto) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...valor, [k]: e.target.value });

  const campo = (k: ClaveDeTexto, etiqueta: string, ayuda?: string) => {
    const linea = LIMITES_DE_TEXTO[k] <= 40;
    const id = `marca-texto-${k}`;

    return (
      <FormField key={k} hint={ayuda} htmlFor={id} label={etiqueta}>
        {linea ? (
          <input
            className={FIELD_CLS}
            id={id}
            maxLength={LIMITES_DE_TEXTO[k]}
            placeholder={vacio}
            value={valor[k]}
            onChange={poner(k)}
          />
        ) : (
          <textarea
            className={`${FIELD_CLS} min-h-[64px]`}
            id={id}
            maxLength={LIMITES_DE_TEXTO[k]}
            placeholder={vacio}
            rows={2}
            value={valor[k]}
            onChange={poner(k)}
          />
        )}
      </FormField>
    );
  };

  const metodo = (i: number, patch: Record<string, unknown>) =>
    onChange({ ...valor, metodos: valor.metodos.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  return (
    <div
      className="space-y-3 rounded-xl border p-3"
      data-testid="textos-de-factura"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 size-4 shrink-0" style={{ color: "var(--ink-soft)" }} />
        <div>
          <div className="text-sm font-medium">{t("ui.TextosDeMarca.titulo", "Textos de factura")}</div>
          <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
            {principal
              ? t(
                  "ui.TextosDeMarca.ayudaPrincipal",
                  "Lo que escribas aquí reemplaza el texto de la empresa en los documentos de la marca principal. Vacío: se usa el de Facturación › Diseño de documentos.",
                )
              : t(
                  "ui.TextosDeMarca.ayudaMarca",
                  "Sus facturas, cotizaciones, correos e informes imprimen solo estos textos. Un texto vacío no aparece: nunca se usa el de la empresa principal.",
                )}
          </p>
        </div>
      </div>

      <Segmented
        expandir
        options={[
          { value: "facturas", label: t("ui.TextosDeMarca.facturas", "Facturas") },
          { value: "cobro", label: t("ui.TextosDeMarca.cobro", "Cobro") },
          { value: "cotizaciones", label: t("ui.TextosDeMarca.cotizaciones", "Cotizaciones") },
          { value: "informes", label: t("ui.TextosDeMarca.informes", "Informes") },
        ]}
        value={pestana}
        onChange={(v) => setPestana(v as Pestana)}
      />

      {pestana === "facturas" && (
        <div className="grid grid-cols-1 gap-3">
          {campo("invoiceTitle", t("ui.TextosDeMarca.invoiceTitle", "Título de la factura"))}
          {campo(
            "invoiceDefaultNotes",
            t("ui.TextosDeMarca.invoiceDefaultNotes", "Notas con las que empieza cada factura"),
          )}
          {campo("invoiceTerms", t("ui.TextosDeMarca.invoiceTerms", "Condiciones"))}
          {campo("invoiceFooter", t("ui.TextosDeMarca.invoiceFooter", "Pie de página"))}
        </div>
      )}

      {pestana === "cobro" && (
        <div className="space-y-3">
          {campo(
            "paymentInstructions",
            t("ui.TextosDeMarca.paymentInstructions", "Instrucciones de pago"),
            t(
              "ui.TextosDeMarca.paymentInstructionsAyuda",
              "Se imprimen cuando la factura no ofrece formas de pago.",
            ),
          )}
          <div className="space-y-2">
            <div className="text-sm font-medium">
              {t("ui.TextosDeMarca.metodos", "Formas de pago y datos bancarios")}
            </div>
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {principal
                ? t(
                    "ui.TextosDeMarca.metodosAyudaPrincipal",
                    "Sin ninguna marcada se usan las de la empresa.",
                  )
                : t(
                    "ui.TextosDeMarca.metodosAyudaMarca",
                    "Sin ninguna marcada, sus facturas ofrecen las formas de pago de la empresa sin datos bancarios.",
                  )}
            </p>
            {valor.metodos.map((m, i) => {
              const id = `marca-metodo-${m.method}`;
              const nombre = (nombreDeMetodo as Record<string, string>)[m.method] || m.label || m.method;

              return (
                <div
                  key={m.method}
                  className="space-y-2 rounded-lg border p-2.5"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <label className="flex cursor-pointer items-center justify-between gap-2 text-sm" htmlFor={id}>
                    <span className="font-medium">{nombre}</span>
                    <Switch checked={!!m.enabled} id={id} onCheckedChange={(v) => metodo(i, { enabled: v })} />
                  </label>
                  {m.enabled && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <textarea
                        aria-label={t("ui.TextosDeMarca.datosDe", "Datos de {{metodo}}", { metodo: nombre })}
                        className={`${FIELD_CLS} min-h-[56px]`}
                        maxLength={2000}
                        placeholder={t("ui.TextosDeMarca.datosEjemplo", "Banco, cuenta, titular…")}
                        rows={2}
                        value={m.description || ""}
                        onChange={(e) => metodo(i, { description: e.target.value })}
                      />
                      <textarea
                        aria-label={t("ui.TextosDeMarca.notaDe", "Nota de {{metodo}}", { metodo: nombre })}
                        className={`${FIELD_CLS} min-h-[56px]`}
                        maxLength={1000}
                        placeholder={t("ui.TextosDeMarca.notaEjemplo", "Ej.: escribe el número de factura en la referencia")}
                        rows={2}
                        value={m.note || ""}
                        onChange={(e) => metodo(i, { note: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pestana === "cotizaciones" && (
        <div className="grid grid-cols-1 gap-3">
          {campo("quoteTitle", t("ui.TextosDeMarca.quoteTitle", "Título de la cotización"))}
          {campo("quoteDefaultIntro", t("ui.TextosDeMarca.quoteDefaultIntro", "Presentación"))}
          {campo("quoteTerms", t("ui.TextosDeMarca.quoteTerms", "Términos y condiciones"))}
          {campo("quoteClosing", t("ui.TextosDeMarca.quoteClosing", "Cierre"))}
          {campo("quoteFooter", t("ui.TextosDeMarca.quoteFooter", "Pie de página"))}
        </div>
      )}

      {pestana === "informes" && (
        <div className="grid grid-cols-1 gap-3">
          {campo(
            "reportFooterText",
            t("ui.TextosDeMarca.reportFooterText", "Pie de los informes a sus clientes"),
          )}
        </div>
      )}
    </div>
  );
}
