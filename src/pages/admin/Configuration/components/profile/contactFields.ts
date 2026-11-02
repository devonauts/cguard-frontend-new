import { parsePhoneNumberFromString } from "libphonenumber-js";

/** The number as the server stores it: E.164 when it parses, else as typed. */
export function phoneForServer(code: string, number: string): string {
  const raw = `${code} ${number}`.trim();

  try {
    const parsed = parsePhoneNumberFromString(raw);

    if (parsed && parsed.isValid()) return parsed.number;
  } catch {
    // keep raw value
  }

  return raw;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
