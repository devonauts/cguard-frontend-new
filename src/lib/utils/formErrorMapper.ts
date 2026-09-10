export function applyValidationErrorsToForm(
  err: any,
  setError?: (name: string, error: any) => void,
) {
  const backendErrors =
    err?.response?.data?.errors ||
    err?.response?.data?.user?.errors ||
    err?.response?.data ||
    null;
  const messages: string[] = [];
  const fieldErrors: Record<string, string> = {};

  if (!backendErrors) return { messages, fieldErrors };

  if (backendErrors.invalidClientIds) {
    const msg = `Clientes inválidos: ${JSON.stringify(backendErrors.invalidClientIds)}`;

    fieldErrors.clientIds = msg;
    try {
      setError?.("clientIds", { type: "server", message: msg });
    } catch (_) {}
    messages.push("Clientes inválidos en la asignación");
  }

  if (backendErrors.invalidPostSiteIds) {
    const msg = `Sitios inválidos: ${JSON.stringify(backendErrors.invalidPostSiteIds)}`;

    fieldErrors.postSiteIds = msg;
    try {
      setError?.("postSiteIds", { type: "server", message: msg });
    } catch (_) {}
    messages.push("Sitios inválidos en la asignación");
  }

  // Generic mapping for other fields if backend returns { fieldName: ['msg', ...] }
  if (typeof backendErrors === "object" && !Array.isArray(backendErrors)) {
    for (const key of Object.keys(backendErrors)) {
      if (key === "invalidClientIds" || key === "invalidPostSiteIds") continue;
      const val = backendErrors[key];

      if (!val) continue;
      const text = Array.isArray(val) ? val.join(", ") : String(val);

      fieldErrors[key] = text;
      try {
        setError?.(key, { type: "server", message: text });
      } catch (_) {}
      messages.push(`${key}: ${text}`);
    }
  }

  return { messages, fieldErrors };
}
