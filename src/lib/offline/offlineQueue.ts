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

/* ── Candado entre PESTAÑAS ──────────────────────────────────────────────────
 * El flag `flushing` protege dentro de UNA pestaña, pero la cola vive en
 * localStorage compartido: dos pestañas del CRM reproduciendo a la vez = el
 * mismo incidente enviado dos veces (auditoría 2026-08-18). Candado best-effort
 * en localStorage con token propio y vencimiento — si la pestaña dueña muere a
 * mitad, el candado caduca solo y otra retoma. */
const LOCK_KEY = "crm.offlineQueue.lock";
const LOCK_TTL_MS = 60_000;
const lockToken = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function acquireLock(): boolean {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (raw) {
      const cur = JSON.parse(raw);
      if (cur && cur.token !== lockToken && Date.now() - (cur.at || 0) < LOCK_TTL_MS) return false;
    }
    localStorage.setItem(LOCK_KEY, JSON.stringify({ token: lockToken, at: Date.now() }));
    // Releer: si dos pestañas escribieron a la vez, gana la última escritura.
    const check = JSON.parse(localStorage.getItem(LOCK_KEY) || "null");
    return check?.token === lockToken;
  } catch {
    return true; // sin localStorage no hay segunda pestaña que proteger
  }
}
function releaseLock(): void {
  try {
    const cur = JSON.parse(localStorage.getItem(LOCK_KEY) || "null");
    if (cur?.token === lockToken) localStorage.removeItem(LOCK_KEY);
  } catch { /* ignore */ }
}

/** Quita UN item de la cola persistida (lectura fresca, conserva lo demás). */
function removeItem(id: string): void {
  const cur = load();
  save(cur.filter((it) => it.id !== id));
}

/**
 * Reproduce toda la cola una vez. Protegida contra reentradas (evento online +
 * intervalo + manual) Y contra otras pestañas (candado). Fallos de red se
 * conservan; rechazos del servidor se descartan. El progreso se PERSISTE item
 * por item — un cierre o recarga a mitad del flush no re-envía lo ya enviado.
 */
export async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const q = load();
  if (!q.length) return;
  if (!acquireLock()) return; // otra pestaña está reproduciendo
  flushing = true;
  try {
    for (const it of q) {
      const fn = replayers[it.kind];
      if (!fn) continue; // kind desconocido (build viejo) — conservar en cola
      try {
        await fn(it.payload, it.tenantId);
        removeItem(it.id); // enviado → fuera YA (no al final del lote)
      } catch (e) {
        if (!isNetworkFailure(e)) removeItem(it.id); // rechazo del servidor → descartar
        // fallo de red → se conserva para el siguiente flush
      }
    }
  } finally {
    flushing = false;
    releaseLock();
  }
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
  opts?: {
    /**
     * Encolar TAMBIÉN los timeouts (status 408/ECONNABORTED). Solo es seguro
     * cuando el payload lleva clave de idempotencia: un timeout significa
     * "no sé si llegó", y sin clave el reintento duplicaría el registro si SÍ
     * llegó. El incidente la lleva; las visitas todavía no.
     */
    queueTimeouts?: boolean;
  },
): Promise<{ queued: boolean; result?: T; id?: string }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { queued: true, id: enqueue(kind, payload, label) };
  }
  try {
    const result = await doIt();
    return { queued: false, result };
  } catch (e: any) {
    const timeout = e?.status === 408 || e?.code === "ECONNABORTED";
    if (isNetworkFailure(e) || (timeout && opts?.queueTimeouts)) {
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
