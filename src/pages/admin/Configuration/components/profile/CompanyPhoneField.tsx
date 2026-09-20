"use client";

import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import "./PhoneField.css";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { useTranslation } from "react-i18next";

type Props = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
};

export default function CompanyPhoneField({
  value,
  onChange,
  disabled,
}: Props) {
  const { t } = useTranslation();
  /* `PhoneInput` exige E.164 (sin espacios). El teléfono guardado del inquilino
     venía como «+52 55 5080 0100» y el componente lo rechazaba con un aviso en
     consola, dejando el campo sin bandera ni formato. Se normaliza aquí, que es
     donde se sabe que lo que entra es texto de la base y no del teclado. */
  const parsed = value ? parsePhoneNumberFromString(value) : undefined;
  const country = parsed?.country;
  const e164 = parsed?.number || (value ? value.replace(/(?!^\+)\D/g, "") : "");

  const handleChange = (val: string | undefined) => {
    if (!val) {
      onChange("");

      return;
    }
    onChange(val);
  };

  return (
    <div className="phone-input-container">
      <PhoneInput
        international
        country={country}
        disabled={disabled}
        placeholder={t("settings.phoneField.enterPhonePlaceholder", {
          defaultValue: "Ingresa número de teléfono",
        })}
        value={e164 || undefined}
        onChange={handleChange}
      />
    </div>
  );
}
