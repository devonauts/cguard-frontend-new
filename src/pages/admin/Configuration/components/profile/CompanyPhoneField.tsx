"use client";

import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import './PhoneField.css';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { useTranslation } from 'react-i18next';

type Props = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
};

export default function CompanyPhoneField({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const country = value ? parsePhoneNumberFromString(value)?.country : undefined;

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
        value={value || undefined}
        onChange={handleChange}
        placeholder={t('settings.phoneField.enterPhonePlaceholder', { defaultValue: 'Ingresa número de teléfono' })}
        disabled={disabled}
      />
    </div>
  );
}
