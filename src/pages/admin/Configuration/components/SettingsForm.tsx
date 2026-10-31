/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — PIEZAS DE UN FORMULARIO DE AJUSTES
 *
 * Configuración tiene ~62 páginas y casi todas son la misma forma: grupos de
 * ajustes dentro de una `Section`, cada ajuste una fila con «qué hace» a la
 * izquierda y su control a la derecha, y un botón de guardar al final.
 *
 * Esa fila estaba escrita CINCO veces —`ToggleRow` en ReportSettingsForm, otro
 * `ToggleRow` en OtherSettingsForm, `ToggleRow`+`NumberRow` en
 * RondaSettingsForm, `RuleRow` en GuardsGlobalSettingsPage y otro `RuleRow` en
 * PostingGlobalPage— con paddings distintos (`py-3.5` frente a `py-4`) y dos
 * jerarquías tipográficas distintas para el mismo texto. Cinco páginas de
 * ajustes que se ven como cinco productos.
 *
 * ── LA REGLA DE LA FILA ────────────────────────────────────────────────────
 * Las filas de un mismo grupo se separan con un FILO, nunca con una caja por
 * fila: son ajustes de la misma familia, no tarjetas sueltas. Por eso los
 * grupos llevan `contentClassName="divide-y"` y la fila no trae fondo propio.
 *
 * ── PROMOVER AL KIT ────────────────────────────────────────────────────────
 * `SettingRow`, `ToggleRow`, `NumberRow` y `SaveBar` no tienen nada específico
 * de Configuración — Nómina y Asistencia tienen la misma forma. Su sitio final
 * es `@/components/kit`.
 * ════════════════════════════════════════════════════════════════════════════
 */
import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { esRutaDeReglaDeEmpresa } from "@/components/sucursales/reglasDeEmpresa";
import { useEsGerenteDeSucursal } from "@/hooks/useGerenteDeSucursal";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { IconTile } from "@/components/kit";
import { cn } from "@/lib/utils";

/**
 * Fila de ajuste. Título y explicación a la izquierda, el control a la derecha.
 * `children` es lo que se despliega DEBAJO cuando el ajuste está activo (el
 * umbral de minutos, el radio en metros…), así que queda dentro de la misma
 * fila y no como un bloque suelto que parece otro ajuste.
 */
export function SettingRow({
  label,
  hint,
  control,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  control: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">{label}</div>
          {hint && (
            <p className="mt-0.5 text-sm" style={{ color: "var(--ink-soft)" }}>
              {hint}
            </p>
          )}
        </div>
        <div className="shrink-0">{control}</div>
      </div>
      {children}
    </div>
  );
}

/**
 * Fila con conmutador.
 *
 * Acepta `checked` (controlado) o `defaultChecked` (no controlado). Los dos,
 * porque las páginas de ajustes están a medio cablear: donde ya hay estado se
 * pasa `checked`, y donde todavía no lo hay `defaultChecked` mantiene el
 * conmutador ACCIONABLE. Pasar `checked` sin `onCheckedChange` congelaría el
 * control y el usuario vería un interruptor que no se mueve.
 */
export function ToggleRow({
  label,
  hint,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <SettingRow
      control={
        <Switch
          {...(checked === undefined ? { defaultChecked } : { checked })}
          aria-label={label}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
        />
      }
      hint={hint}
      label={label}
    >
      {children}
    </SettingRow>
  );
}

/** Fila con un número y su unidad. El campo va a la derecha, alineado. */
export function NumberRow({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max,
  suffix,
  disabled,
}: {
  label: string;
  hint?: React.ReactNode;
  value: number | null;
  onChange: (n: number | null) => void;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <SettingRow
      control={
        <div className="flex items-center gap-2">
          <Input
            aria-label={label}
            className="w-24 text-right"
            disabled={disabled}
            max={max}
            min={min}
            type="number"
            value={value ?? ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
          />
          {suffix && (
            <span
              className="w-16 text-xs"
              style={{ color: "var(--ink-faint)" }}
            >
              {suffix}
            </span>
          )}
        </div>
      }
      hint={hint}
      label={label}
    />
  );
}

/**
 * El pozo que se despliega bajo una fila cuando su ajuste está activo — el
 * umbral, el radio, los días de antelación. Hundido y no elevado: es un detalle
 * DE la fila, no otro ajuste al mismo nivel.
 */
export function SettingDetail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass-sunken mt-3 flex flex-wrap items-center gap-3 p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Barra de guardado. Siempre al pie, siempre a la derecha, siempre con el
 * mismo texto y el mismo estado ocupado — dos de las cinco páginas decían
 * «Guardando…» y las otras tres no daban ninguna señal de que algo estaba
 * pasando.
 */
export function SaveBar({
  onSave,
  saving,
  disabled,
  label,
  type = "button",
  children,
}: {
  onSave?: () => void;
  saving?: boolean;
  disabled?: boolean;
  label?: string;
  /** `submit` para los formularios de react-hook-form, que guardan por evento. */
  type?: "button" | "submit";
  /** Secundarios a la izquierda del botón (Cancelar, Restablecer…). */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const gerente = useEsGerenteDeSucursal();

  // Company-wide rules: a branch manager reads them, headquarters saves them
  // (the server refuses it anyway). The notice above the page says why.
  if (
    gerente &&
    (esRutaDeReglaDeEmpresa(pathname) || /^\/dobletes(\/|$)/.test(pathname))
  ) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {children}
      <Button
        className="px-6"
        disabled={disabled || saving}
        type={type}
        variant="brand"
        onClick={onSave}
      >
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {saving
          ? t("common.saving", "Guardando…")
          : (label ?? t("settings.form.saveConfig", "Guardar configuración"))}
      </Button>
    </div>
  );
}

/**
 * Atajo a un ajuste que vive en otra página — no se duplica, se enlaza.
 * Estaba copiado carácter a carácter en GuardsGlobalSettingsPage y
 * PostingGlobalPage.
 */
export function SettingsLinkCard({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      className="glass-flat glass-hover cg-focus flex h-full items-start gap-3 p-4"
      to={to}
    >
      <IconTile size="sm">{icon}</IconTile>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          {title}
          <ExternalLink
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: "var(--ink-faint)" }}
          />
        </div>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-soft)" }}>
          {description}
        </p>
      </div>
    </Link>
  );
}

/** Rejilla de atajos. Dos columnas a partir de `sm`, como en las dos páginas
 *  que ya la traían. */
export function SettingsLinkGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}
