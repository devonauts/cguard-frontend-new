/**
 * Cola de mutaciones offline del CRM — la mitad "escritura" del modo offline.
 *
 * Portada del patrón YA PROBADO en las apps móviles (supervisor-app
 * src/lib/offlineQueue.ts), incluida la lección del multi-empresa: cada item se
 * SELLA con el tenant del momento de encolar, y se reproduce contra ese tenant.
 *
 * MODELO DE SEGURIDAD — por qué esto no puede duplicar envíos:
 *   Un item entra a la cola SOLO ante un fallo genuino de red (el servidor
 *   nunca recibió la petición), así que reproducirlo al reconectar es seguro.
 *   Un error del servidor (4xx/5xx) significa que SÍ la procesó → jamás se
 *   encola (el llamador lo muestra). En el replay, un rechazo del servidor se
 *   DESCARTA (no se re-encola) para que un item inválido no envenene la cola.
 *
 * ALCANCE DELIBERADO: solo mutaciones seguras e idempotentes (incidentes,
 * notas, visitas). Nómina, aprobaciones, horarios, RBAC y facturación quedan
 * FUERA a propósito — un conflicto ahí cuesta dinero real; esas piden red.
 */
import { isNetworkFailure } from "./networkStatus";

export interface QueuedMutation {
  id: string;
  kind: string;
  payload: any;
  createdAt: number;
  label?: string;
  /** Empresa sellada al encolar — el replay va contra ESTA, no contra la activa. */
  tenantId?: string;
}

type Replayer = (payload: any, tenantId?: string) => Promise<void>;
const replayers: Record<string, Replayer> = {};

/** Registra la función que reproduce una mutación `kind` al reconectar. */
export function registerReplayer(kind: string, fn: Replayer): void {
  replayers[kind] = fn;
}

const KEY = "crm.offlineQueue.v1";

function load(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(q: QueuedMutation[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* quota */ }
  notify(q.length);
}

/* ---- suscripción al contador (para el banner) ---- */
const subs = new Set<(n: number) => void>();
function notify(n: number): void {
  subs.forEach((cb) => { try { cb(n); } catch { /* ignore */ } });
}
export function subscribePending(cb: (n: number) => void): () => void {
  subs.add(cb);
  try { cb(load().length); } catch { /* ignore */ }
  return () => { subs.delete(cb); };
}
export function pendingCount(): number {
  return load().length;
}
export function pendingItems(): QueuedMutation[] {
  return load();
}

function makeId(): string {
  try {
    const c = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* ignore */ }
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Encola una mutación. Devuelve su id. */
export function enqueue(kind: string, payload: any, label?: string): string {
  let tenantId: string | undefined;
  try { tenantId = localStorage.getItem("tenantId") || undefined; } catch { /* ignore */ }
  const item: QueuedMutation = { id: makeId(), kind, payload, createdAt: Date.now(), label, tenantId };
  const q = load();
  q.push(item);
  save(q);
  return item.id;
}

let flushing = false;

/**
 * Reproduce toda la cola una vez. Protegida contra reentradas (evento online +
 * intervalo + manual no pueden doble-enviar el mismo snapshot). Fallos de red
 * se re-encolan; rechazos del servidor se descartan.
 */
export async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const q = load();
  if (!q.length) return;
  flushing = true;
  const failed: QueuedMutation[] = [];
  try {
    for (const it of q) {
      const fn = replayers[it.kind];
      if (!fn) { failed.push(it); continue; } // kind desconocido (build viejo) — conservar
      try {
        await fn(it.payload, it.tenantId);
      } catch (e) {
        if (isNetworkFailure(e)) failed.push(it); // sigue sin red → siguiente flush
        // si no: el servidor lo rechazó → descartar (reintentar no arregla un inválido)
      }
    }
  } finally {
    flushing = false;
  }
  // Merge contra una lectura fresca: se quitan los procesados (los fallidos se
  // re-encolan) y se conserva lo encolado durante el flush.
  const processed = new Set(q.map((it) => it.id));
  const current = load();
  const remaining = [...failed, ...current.filter((it) => !processed.has(it.id))];
  save(remaining);
}

/**
 * Ejecuta la mutación ya, o la encola si no hay red / la petición nunca llegó.
 * Devuelve { queued } para que el llamador muestre el aviso correcto. Un error
 * DEL SERVIDOR se relanza (el llamador debe mostrarlo — NO quedó encolado).
 */
export async function runOrQueue<T>(
  kind: string,
  payload: any,
  doIt: () => Promise<T>,
  label?: string,
): Promise<{ queued: boolean; result?: T; id?: string }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { queued: true, id: enqueue(kind, payload, label) };
  }
  try {
    const result = await doIt();
    return { queued: false, result };
  } catch (e) {
    if (isNetworkFailure(e)) {
      return { queued: true, id: enqueue(kind, payload, label) };
    }
    throw e;
  }
}

/** Vacía la cola sin reproducirla (cierre de sesión en máquina compartida). */
export function clearQueue(): void {
  save([]);
}

// Reproducir al recuperar red + latido de respaldo cada 45 s (una pestaña que
// nunca dispara 'online' — p. ej. proxy que volvió — igual termina enviando).
if (typeof window !== "undefined" && !(window as any).__crmQueueListeners) {
  (window as any).__crmQueueListeners = true;
  window.addEventListener("online", () => { void flush(); });
  setInterval(() => { void flush(); }, 45_000);
}
