/**
 * El campo «Sucursal» de una sede (módulo «Sucursales»).
 *
 * Sólo aparece si la empresa tiene el módulo y alguna sucursal. «Automática»
 * deja que el servidor la coloque: la de su ciudad o, si quien la crea trabaja
 * dentro de una sucursal, esa. El campo dice ANTES a cuál irá, para que nadie
 * se lleve la sorpresa de no encontrarla.
 */
import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSucursales } from "@/hooks/useSucursales";
import { sucursalSugerida } from "@/lib/api/sucursalesService";

const AUTO = "__auto__";

export default function CampoSucursalDeSede({
  value,
  onChange,
  ciudad,
}: {
  value: string | null;
  onChange: (branchId: string | null) => void;
  ciudad?: string | null;
}) {
  const { t } = useTranslation();
  const { activo, lista } = useSucursales();
  const sucursales = lista.data?.sucursales || [];

  if (!activo || !sucursales.length) return null;
  const sugerida = sucursalSugerida(ciudad || null, sucursales);
  const nombreSugerida = sugerida ? sucursales.find((b) => b.id === sugerida)?.name : null;

  return (
    <div className="mt-3">
      <label className="mb-1 block text-xs font-medium text-foreground/70">
        {t("sucursales.sede.campo")}
      </label>
      <Select value={value || AUTO} onValueChange={(v) => onChange(v === AUTO ? null : v)}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO}>{t("sucursales.sede.automatica")}</SelectItem>
          {sucursales.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: b.color || "var(--ink-faint)" }} />
                {b.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!value && (
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-faint)" }}>
          {nombreSugerida
            ? t("sucursales.sede.iraA", { nombre: nombreSugerida })
            : t("sucursales.sede.sinCoincidencia")}
        </p>
      )}
    </div>
  );
}
