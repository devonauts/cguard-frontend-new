/**
 * Development-only switch for the Dobletes demo fake (see
 * `lib/api/dobletesService.ts`). `localStorage["dobletes:demo"] = "1"` turns
 * it on; a production build always answers false.
 */
export function modoDemoDeDobletes(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem("dobletes:demo") === "1";
  } catch {
    return false;
  }
}
