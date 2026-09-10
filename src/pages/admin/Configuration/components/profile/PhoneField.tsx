"use client";

import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import "./PhoneField.css";
import {
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
} from "libphonenumber-js";
import { useTranslation } from "react-i18next";

import { getTenantCountry } from "@/utils/tenantLocation";

/**
 * País con el que arranca el selector cuando el número está vacío.
 *
 * Estaba fijo en "EC": un administrador de cualquier otro país veía la bandera
 * de Ecuador y, al borrar su teléfono, le reaparecía el prefijo +593 escrito.
 * Se toma el país de la empresa (que ya se guarda para esto mismo) y, si no lo
 * hay, la región del idioma del navegador.
 */
function paisPorDefecto(): ReturnType<typeof getCountries>[number] | undefined {
  const paises = getCountries();
  const guardado = (getTenantCountry() || "").trim().toUpperCase();
  const delGuardado = paises.find((c) => c === guardado);

  if (delGuardado) return delGuardado;

  try {
    const region = (navigator?.language || "")
      .match(/[-_]([A-Za-z]{2})\b/)?.[1]
      ?.toUpperCase();

    if (region) return paises.find((c) => c === region);
  } catch {
    /* navegador sin `navigator.language` */
  }

  return undefined;
}

type Props = {
  code: string;
  number: string;
  onCodeChange: (v: string) => void;
  onNumberChange: (v: string) => void;
};

export default function PhoneField({
  code,
  number,
  onCodeChange,
  onNumberChange,
}: Props) {
  const { t } = useTranslation();
  // Combinar código y número para el valor completo
  const fullNumber = `${code}${number}`;

  // Derivar país ISO (ej. 'US') desde el número combinado, si es posible
  const derivedCountry = (() => {
    try {
      const p = parsePhoneNumberFromString(fullNumber);

      if (p && p.country) return p.country;
      // if no country returned, fallthrough to fallback below
    } catch (e) {
      // ignore exception and fallthrough to fallback
    }

    // fallback: try derive from phone code prop (e.g. +1 -> US)
    try {
      const match = String(code).match(/\+(\d+)/);

      if (match) {
        const callingCode = match[1];
        const countries = getCountries();

        for (const c of countries) {
          try {
            if (getCountryCallingCode(c) === callingCode) return c;
          } catch (err) {
            // ignore
          }
        }
      }
    } catch (err) {
      // ignore
    }

    return undefined;
  })();

  const handleChange = (value: string | undefined) => {
    if (!value) {
      // Vaciar el campo tiene que VACIARLO. Antes se reponía '+593' y el
      // administrador extranjero veía reaparecer el prefijo de Ecuador.
      onCodeChange("");
      onNumberChange("");

      return;
    }

    // Extraer el código de país y el número
    const match = value.match(/^(\+\d{1,4})(.*)$/);

    if (match) {
      onCodeChange(match[1]);
      onNumberChange(match[2]);
    }
  };

  return (
    <div className="phone-input-container">
      <PhoneInput
        defaultCountry={paisPorDefecto()}
        placeholder={t('settings.phoneField.enterPhonePlaceholder', { defaultValue: 'Ingresa número de teléfono' })}
        value={fullNumber}
        onChange={handleChange}
        international
        // prefer derived country so the UI shows the correct flag
        country={derivedCountry}
      />
    </div>
  );
}
