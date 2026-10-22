import { useTranslation } from "react-i18next";
import { Globe2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEspacio } from "@/hooks/useEspacio";
import { abrirSelectorDeEspacio } from "@/lib/sucursalElegida";

/**
 * El ESPACIO de trabajo en la barra superior (módulo «Sucursales»).
 *
 * Va junto al de empresa porque hace lo mismo a menor escala: cambia el
 * significado de TODO lo que hay en pantalla. «Vista global» = todas las que
 * la persona ve; una sucursal acota cada listado, informe y exportación a ella.
 *
 * Sucursales 2.0 (fase 2): el cambio se guarda también en la cuenta, la
 * principal va marcada, y el cambio recarga EN LA MISMA RUTA (no se pierde la
 * pantalla). En el teléfono la barra no tiene sitio para el desplegable: va
 * una pastilla con el código de la sucursal que abre el selector grande.
 *
 * Quien ve una sola sucursal no elige nada: la barra le enseña dónde está.
 */
export default function SelectorDeSucursal({
  compacto = false,
}: {
  compacto?: boolean;
}) {
  const { t } = useTranslation();
  const { activo, opciones, actual, entrar } = useEspacio();

  if (!activo || !actual) return null;

  const etiqueta = actual.global
    ? t("sucursales.espacio.global")
    : actual.nombre;
  const color = actual.global
    ? "var(--brand)"
    : actual.color || "var(--ink-faint)";

  // Teléfono, o una sola opción: una pastilla (que abre el selector si hay a dónde ir).
  if (compacto || opciones.length < 2) {
    const puede = opciones.length >= 2;

    return (
      <button
        aria-label={puede ? t("sucursales.barra.elegir") : etiqueta}
        className="cg-focus inline-flex h-9 max-w-[9rem] items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold"
        disabled={!puede}
        style={{
          borderColor: `color-mix(in oklab, ${color} 45%, var(--hairline))`,
          color: "var(--ink)",
        }}
        title={etiqueta}
        type="button"
        onClick={abrirSelectorDeEspacio}
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="truncate">
          {actual.global
            ? t("sucursales.espacio.globalCorto")
            : actual.codigo || actual.nombre}
        </span>
      </button>
    );
  }

  return (
    <Select value={actual.id} onValueChange={(v) => entrar(v)}>
      <SelectTrigger
        aria-label={t("sucursales.barra.elegir")}
        className="h-9 max-w-[220px] gap-1.5 text-sm"
      >
        {actual.global ? (
          <Globe2 className="size-4 shrink-0" />
        ) : (
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: color }}
          />
        )}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <span className="inline-flex items-center gap-2">
              {o.global ? (
                <Globe2 className="size-3.5" />
              ) : (
                <span
                  className="size-2 rounded-full"
                  style={{ background: o.color || "var(--ink-faint)" }}
                />
              )}
              {o.global ? t("sucursales.espacio.global") : o.nombre}
              {o.principal && (
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: "var(--brand-text, var(--brand))" }}
                >
                  · {t("sucursales.principal")}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * La LÍNEA de color al pie de la cabecera: el color de la sucursal en la que se
 * trabaja, para saber siempre dónde se está sin leer nada. Va en posición
 * absoluta: no toca el alto de la cabecera (el armazón depende de él).
 */
export function LineaDeEspacio() {
  const { activo, actual, opciones } = useEspacio();

  if (!activo || !actual || actual.global || opciones.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px]"
      style={{
        background: `linear-gradient(90deg, ${actual.color || "var(--brand)"}, color-mix(in oklab, ${actual.color || "var(--brand)"} 35%, transparent))`,
      }}
    />
  );
}
