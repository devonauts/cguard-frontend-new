import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listaDePaises } from "@/lib/paisDeLaEmpresa";
import {
  taxIdLabelFor,
  validateTaxNumberForCountry,
} from "@/lib/validators/id";

/**
 * IDENTIDAD PROPIA DE UNA SUCURSAL (Sucursales 2.0, fase 1).
 *
 * Opcional: vacío = la sucursal usa la razón social y el identificador fiscal
 * de la empresa. Si tiene otra (otra sociedad, otro país, otro número de
 * establecimiento), se pone aquí. Vale para cualquier país: la etiqueta del
 * identificador sale del país elegido («RUC», «RFC», «NIF»…) y la validación es
 * el espejo de la del servidor (ante la duda, se acepta).
 */
export interface Identidad {
  legalName: string;
  taxId: string;
  country: string;
  establishmentCode: string;
  address: string;
  email: string;
}

export const IDENTIDAD_VACIA: Identidad = {
  legalName: "",
  taxId: "",
  country: "",
  establishmentCode: "",
  address: "",
  email: "",
};

export function identidadValida(
  d: Identidad,
  paisDeLaEmpresa: string,
): boolean {
  const t = d.taxId.trim();

  return !t || validateTaxNumberForCountry(t, d.country || paisDeLaEmpresa);
}

export function IdentidadDeSucursal({
  valor,
  onCambio,
  paisDeLaEmpresa,
}: {
  valor: Identidad;
  onCambio: (v: Identidad) => void;
  paisDeLaEmpresa: string;
}) {
  const { t, i18n } = useTranslation();
  const pais = valor.country || paisDeLaEmpresa;
  const etiquetaFiscal =
    taxIdLabelFor(pais) || t("sucursales.identidad.identificador");
  const malo = !identidadValida(valor, paisDeLaEmpresa);
  const poner =
    (k: keyof Identidad) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onCambio({ ...valor, [k]: e.target.value });

  return (
    <div
      className="space-y-3 rounded-xl border p-3"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div>
        <div className="text-sm font-medium">
          {t("sucursales.identidad.titulo")}
        </div>
        <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
          {t("sucursales.identidad.ayuda")}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="suc-razon">
          {t("sucursales.identidad.razonSocial")}
        </Label>
        <Input
          id="suc-razon"
          maxLength={200}
          value={valor.legalName}
          onChange={poner("legalName")}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="suc-pais">{t("sucursales.identidad.pais")}</Label>
          <select
            className="cg-input cg-focus flex h-10 w-full px-3 text-sm"
            id="suc-pais"
            value={valor.country}
            onChange={poner("country")}
          >
            <option value="">
              {t("sucursales.identidad.paisDeLaEmpresa")}
            </option>
            {/* In the reader's language and alphabetical (the static list was
                English and opened with US, Canada and India). */}
            {listaDePaises(i18n.language).map((c) => (
              <option key={c.code} value={c.code}>
                {c.bandera} {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="suc-fiscal">{etiquetaFiscal}</Label>
          <Input
            aria-invalid={malo || undefined}
            id="suc-fiscal"
            maxLength={40}
            value={valor.taxId}
            onChange={poner("taxId")}
          />
          {malo && (
            <p className="text-xs" style={{ color: "var(--bad)" }}>
              {t("sucursales.identidad.identificadorMalo", {
                documento: etiquetaFiscal,
              })}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="suc-estab">
            {t("sucursales.identidad.establecimiento")}
          </Label>
          <Input
            id="suc-estab"
            maxLength={20}
            placeholder="002"
            value={valor.establishmentCode}
            onChange={poner("establishmentCode")}
          />
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t("sucursales.identidad.establecimientoAyuda")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="suc-correo">{t("sucursales.identidad.correo")}</Label>
          <Input
            id="suc-correo"
            maxLength={160}
            type="email"
            value={valor.email}
            onChange={poner("email")}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="suc-dir">{t("sucursales.identidad.direccion")}</Label>
        <Input
          id="suc-dir"
          maxLength={255}
          value={valor.address}
          onChange={poner("address")}
        />
      </div>
    </div>
  );
}
