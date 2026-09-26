import i18n from "@/i18n";
/** The requirements, in the current language. */
export function passwordPolicyText(): string {
  return i18n.t("auth.passwordRequirements", {
    defaultValue:
      "Debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial.",
  });
}

/** Kept for existing imports; prefer passwordPolicyText(), which follows the language. */
export const PASSWORD_POLICY_TEXT =
  "Debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial.";

export function isStrongPassword(password: string): boolean {
  if (!password || String(password).length < 8) return false;

  return (
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

/**
 * "Too weak" plus WHAT is required, both translated. The requirements used to
 * live only inside a template default, so once the key existed they vanished
 * and the person never learned what the password needed.
 */
export function passwordPolicyMessage(prefix?: string) {
  const base = `${i18n.t("auth.weakPassword", {
    defaultValue: "La contraseña es demasiado débil",
  })}. ${passwordPolicyText()}`;

  return prefix ? `${prefix} ${base}` : base;
}
