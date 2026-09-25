import { parsePhoneNumberFromString } from "libphonenumber-js";

import { PhoneInput } from "@/components/phone/PhoneInput";

type Props = {
  code: string;
  number: string;
  onCodeChange: (v: string) => void;
  onNumberChange: (v: string) => void;
};

/**
 * The user's phone, stored as two fields (code + number). The input itself is
 * THE phone field of the whole CRM (`components/phone/PhoneInput`); this only
 * joins and splits the two stored halves.
 */
export default function PhoneField({ code, number, onCodeChange, onNumberChange }: Props) {
  const completo = code || number ? `${code}${number}` : "";

  const alCambiar = (v: string) => {
    if (!v) {
      // Emptying the field empties it: no prefix comes back by itself.
      onCodeChange("");
      onNumberChange("");

      return;
    }
    const p = parsePhoneNumberFromString(v);

    if (p) {
      onCodeChange(`+${p.countryCallingCode}`);
      onNumberChange(String(p.nationalNumber));
    } else {
      const m = v.match(/^(\+\d{1,4})(\d*)$/);

      if (m) {
        onCodeChange(m[1]);
        onNumberChange(m[2]);
      }
    }
  };

  return <PhoneInput value={completo} onChange={alCambiar} />;
}
