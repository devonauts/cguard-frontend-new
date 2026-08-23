"use client";

import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import './PhoneField.css';
import { parsePhoneNumberFromString, getCountries, getCountryCallingCode } from 'libphonenumber-js';
import { useTranslation } from 'react-i18next';

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
      onCodeChange('+593');
      onNumberChange('');
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
        international
        // prefer derived country so the UI shows the correct flag
        country={derivedCountry}
        defaultCountry="EC"
        value={fullNumber}
        onChange={handleChange}
        placeholder={t('settings.phoneField.enterPhonePlaceholder', { defaultValue: 'Ingresa número de teléfono' })}
      />
    </div>
  );
}
