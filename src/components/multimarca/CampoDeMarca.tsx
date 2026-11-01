import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { marcaPorDefecto, useMarcas } from "@/hooks/useMarcas";

/**
 * A «Marca» select for forms (client, quote prospect, person, payroll run).
 * Renders nothing without the Multimarca module. When the value is empty and
 * `autoDefault` is on, it fills itself with the brand chosen in the top bar
 * (if it is a real one), else the principal — the same rule the server
 * applies when a create path sends no brand.
 */
export default function CampoDeMarca({
  id,
  value,
  onChange,
  label,
  hint,
  error,
  required = true,
  autoDefault = true,
  disabled = false,
  placeholder,
  className = "",
  labelClassName = "block text-sm font-medium",
  selectClassName = "cg-input cg-focus flex h-10 w-full px-3 text-sm",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  autoDefault?: boolean;
  disabled?: boolean;
  /** An empty first option (only when the field is not required). */
  placeholder?: string;
  className?: string;
  labelClassName?: string;
  selectClassName?: string;
}) {
  const { t } = useTranslation();
  const { activo, marcas, todas, principal, lista } = useMarcas();
  const listas = lista.isSuccess;

  useEffect(() => {
    if (!activo || !listas || !autoDefault || value) return;
    const d = marcaPorDefecto(marcas, principal);

    if (d) onChange(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, listas, autoDefault, value]);

  if (!activo || !marcas.length) return null;
  // A record that belongs to an archived brand still shows it.
  const actual = value ? todas.find((b) => b.id === value) : undefined;
  const opciones =
    actual && actual.archivedAt ? [...marcas, actual] : marcas;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className={labelClassName} htmlFor={id}>
        {label ?? t("ui.CampoDeMarca.marca", "Marca")}
        {required && (
          <span aria-hidden style={{ color: "var(--brand-text)" }}>
            {" "}
            *
          </span>
        )}
      </label>
      <select
        aria-invalid={!!error || undefined}
        aria-required={required || undefined}
        className={selectClassName}
        disabled={disabled}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {(!required || !value) && (
          <option disabled={required} value="">
            {placeholder ?? t("ui.CampoDeMarca.elige", "Elige la marca")}
          </option>
        )}
        {opciones.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.isPrincipal
              ? ` · ${t("ui.Multimarca.principal", "Principal")}`
              : ""}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-xs" role="alert" style={{ color: "var(--bad-text)" }}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
