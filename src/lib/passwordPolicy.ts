export const PASSWORD_POLICY_TEXT =
  "mínimo 8 caracteres y contener al menos una letra mayúscula, una letra minúscula, un número y un carácter especial.";

export function isStrongPassword(password: string): boolean {
  if (!password || String(password).length < 8) return false;

  return (
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function passwordPolicyMessage(prefix?: string) {
  const base = `La contraseña es muy débil. Requisitos: ${PASSWORD_POLICY_TEXT}`;

  return prefix ? `${prefix} ${base}` : base;
}
