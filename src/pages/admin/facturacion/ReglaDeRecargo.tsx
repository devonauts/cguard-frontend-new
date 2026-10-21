/**
 * PREMIUM RULE EDITOR — overtime / holiday / last-minute coverage. The server
 * keeps multipliers in hundredths (150 = 1.5×) and amounts in cents per hour;
 * the person types «1.5» or «4.00» and this converts both ways.
 */
import { useTranslation } from "react-i18next";

import { FormField, FIELD_CLS } from "@/components/kit";
import { type PremiumRule, type RuleMode } from "@/lib/api/clientBillingService";
import { useEtiquetasDeFacturacion } from "./comun";

export function ReglaDeRecargo({
  label,
  value,
  onChange,
  allowDefault,
  withPriority,
  currency = "USD",
}: {
  label: string;
  /** `null` = the company default (only when `allowDefault`). */
  value: PremiumRule | null;
  onChange: (v: PremiumRule | null) => void;
  /** On a contract: offer «Usar el valor de la empresa». */
  allowDefault?: boolean;
  /** Holiday: «wins over overtime». */
  withPriority?: boolean;
  currency?: string;
}) {
  const { t } = useTranslation();
  const etiquetas = useEtiquetasDeFacturacion();
  const mode: RuleMode | "default" = value ? value.mode : allowDefault ? "default" : "none";
  const shown = value ? (value.mode === "multiplier" ? (value.value / 100).toFixed(2) : value.mode === "amount" ? (value.value / 100).toFixed(2) : "") : "";

  const setMode = (m: string) => {
    if (m === "default") return onChange(null);
    if (m === "none") return onChange({ mode: "none", value: 0, ...(withPriority && value?.priority != null ? { priority: value.priority } : {}) });
    onChange({ mode: m as RuleMode, value: value?.value && value.mode === m ? value.value : m === "multiplier" ? 150 : 0, ...(withPriority ? { priority: value?.priority ?? true } : {}) });
  };
  const setValue = (s: string) => {
    if (!value) return;
    const n = Number(String(s).replace(",", "."));

    onChange({ ...value, value: Number.isFinite(n) ? Math.round(n * 100) : 0 });
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <FormField label={label}>
        <select className={FIELD_CLS} value={mode} onChange={(e) => setMode(e.target.value)}>
          {allowDefault && <option value="default">{t("ui.Facturacion.regla.usarElDeLaEmpresa", "Usar el valor de la empresa")}</option>}
          {(["none", "multiplier", "amount"] as RuleMode[]).map((m) => <option key={m} value={m}>{etiquetas.ruleMode[m]}</option>)}
        </select>
      </FormField>
      {value && value.mode !== "none" && (
        <FormField label={value.mode === "multiplier" ? t("ui.Facturacion.regla.multiplicador", "Multiplicador (×)") : t("ui.Facturacion.regla.importePorHora", "Importe por hora ({{c}})", { c: currency })}>
          <input className={FIELD_CLS} inputMode="decimal" value={shown} onChange={(e) => setValue(e.target.value)} />
        </FormField>
      )}
      {withPriority && value && value.mode !== "none" && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input checked={value.priority !== false} className="cg-focus size-4" style={{ accentColor: "var(--brand)" }} type="checkbox" onChange={(e) => onChange({ ...value, priority: e.target.checked })} />
          {t("ui.Facturacion.regla.ganaSobreHorasExtra", "Gana sobre las horas extra")}
        </label>
      )}
    </div>
  );
}
