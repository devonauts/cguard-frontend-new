import { parsePhoneNumberFromString } from "libphonenumber-js";

import { PhoneInput } from "@/components/phone/PhoneInput";

type Props = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
};

/**
 * The company's phone. The stored value may carry spaces ("+52 55 5080 0100");
 * it is normalised to E.164 for THE phone field of the CRM.
 */
export default function CompanyPhoneField({ value, onChange, disabled }: Props) {
  const e164 = value ? parsePhoneNumberFromString(value)?.number ?? value.replace(/(?!^\+)\D/g, "") : "";

  return <PhoneInput disabled={disabled} value={e164} onChange={onChange} />;
}
