/**
 * Estado de red del CRM — una sola fuente de verdad, fuera de React.
 *
 * `navigator.onLine` solo sabe si hay interfaz de red, no si el backend
 * responde (el wifi de la oficina puede estar "conectado" con el internet
 * caído). Por eso el estado combina dos señales:
 *   · los eventos online/offline del navegador (baratos, inmediatos), y
 *   · el resultado real de las peticiones — cualquier capa puede reportar
 *     reportRequestOk() / reportNetworkFailure() y el estado se corrige solo.
 *
 * Consumidores: el banner global (components/OfflineBanner), la cola de
 * mutaciones (offlineQueue) y cualquier pantalla que quiera degradarse con
 * elegancia en vez de reventar.
 */

export type NetStatus = "online" | "offline" | "reconnecting";

let status: NetStatus = typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online";
let failStreak = 0;
const subs = new Set<(s: NetStatus) => void>();

function setStatus(next: NetStatus): void {
  if (next === status) return;
  status = next;
  subs.forEach((f) => { try { f(next); } catch { /* ignore */ } });
}

export function getNetworkStatus(): NetStatus {
  return status;
}

export function subscribeNetworkStatus(f: (s: NetStatus) => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

/** Una petición llegó al servidor (da igual el código HTTP: hubo RED). */
export function reportRequestOk(): void {
  failStreak = 0;
  setStatus("online");
}

/** Una petición no llegó (timeout, DNS, sin respuesta). Dos seguidas = offline;
 *  una sola puede ser un blip y se marca "reconnecting". */
export function reportNetworkFailure(): void {
  failStreak += 1;
  setStatus(failStreak >= 2 ? "offline" : "reconnecting");
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => setStatus("reconnecting"));
  window.addEventListener("offline", () => { failStreak = 2; setStatus("offline"); });
}

/**
 * ¿Este error de axios/fetch es un fallo de RED (no llegó al servidor)?
 * Un 4xx/5xx significa que el servidor SÍ procesó la petición: eso jamás se
 * encola ni se reintenta a ciegas.
 */
export function isNetworkFailure(err: any): boolean {
  if (!err) return false;
  // axios: sin `response` = no llegó respuesta (red caída, timeout, CORS).
  if (err.isAxiosError || err.config || err.request) return !err.response;
  // fetch nativo lanza TypeError en fallos de red.
  if (err instanceof TypeError) return true;
  // Formas propias del CRM (ApiError con status numérico).
  if (typeof err.status === "number") return err.status === 0;
  return false;
}
