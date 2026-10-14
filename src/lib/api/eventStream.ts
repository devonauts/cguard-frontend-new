import { idiomaElegido } from "@/lib/idiomaElegido";
import { getAuthToken } from "@/lib/api";
import { resolveApiBase } from "@/lib/apiBase";

/**
 * Opens the tenant SSE event stream.
 *
 * NOTE: events routes are mounted at `/api/:tenantId/events/*` (no `/tenant/`
 * segment), unlike the rest of the tenant API.
 *
 * SECURITY (2026-10-14): EventSource cannot send headers, and the session JWT
 * used to travel in `?token=` — straight into proxy access logs. Now a one-time
 * 60 s ticket is fetched with the normal Bearer header and only that ticket goes
 * in the URL. A ticket opens ONE connection, so the browser's own reconnect
 * (which reuses the URL) would fail: on error this handle closes the source and
 * reconnects with a fresh ticket, with backoff.
 *
 * Falls back to `?token=` only if the backend has no ticket endpoint yet (404),
 * so a CRM deployed ahead of the backend keeps working.
 */

type Escucha = (ev: MessageEvent) => void;

export interface StreamDeEventos {
  onopen: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onmessage: Escucha | null;
  addEventListener(tipo: string, escucha: EventListener): void;
  close(): void;
}

const ESPERA_MAXIMA_MS = 30_000;

class StreamConTicket implements StreamDeEventos {
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: Escucha | null = null;

  private es: EventSource | null = null;
  private escuchas: Array<[string, EventListener]> = [];
  private cerrado = false;
  private intentos = 0;
  private reintento: ReturnType<typeof setTimeout> | null = null;

  constructor(private tenantId: string, private base: string) {
    void this.conectar();
  }

  addEventListener(tipo: string, escucha: EventListener): void {
    this.escuchas.push([tipo, escucha]);
    this.es?.addEventListener(tipo, escucha);
  }

  close(): void {
    this.cerrado = true;
    if (this.reintento) clearTimeout(this.reintento);
    this.es?.close();
    this.es = null;
  }

  private async urlDelStream(): Promise<string | null> {
    const token = getAuthToken() || localStorage.getItem("authToken") || "";
    if (!token) return null;
    const raiz = `${this.base}/${encodeURIComponent(this.tenantId)}/events`;
    const lang = `lang=${encodeURIComponent(idiomaElegido())}`;
    const r = await fetch(`${raiz}/stream-ticket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 404) return `${raiz}/stream?token=${encodeURIComponent(token)}&${lang}`;
    if (!r.ok) return null;
    const { ticket } = await r.json();
    return ticket ? `${raiz}/stream?ticket=${encodeURIComponent(ticket)}&${lang}` : null;
  }

  private async conectar(): Promise<void> {
    if (this.cerrado) return;
    let url: string | null = null;
    try {
      url = await this.urlDelStream();
    } catch {
      url = null;
    }
    if (this.cerrado) return;
    if (!url) { this.programarReintento(new Event("error")); return; }

    let es: EventSource;
    try {
      es = new EventSource(url);
    } catch {
      return; // SSE unsupported in this environment: the callers' polling covers it.
    }
    this.es = es;
    es.onopen = (ev) => { this.intentos = 0; this.onopen?.(ev); };
    es.onmessage = (ev) => this.onmessage?.(ev);
    es.onerror = (ev) => {
      es.close();
      if (this.es === es) this.es = null;
      this.programarReintento(ev);
    };
    for (const [tipo, escucha] of this.escuchas) es.addEventListener(tipo, escucha);
  }

  private programarReintento(ev: Event): void {
    this.onerror?.(ev);
    if (this.cerrado) return;
    const espera = Math.min(ESPERA_MAXIMA_MS, 1000 * 2 ** this.intentos);
    this.intentos += 1;
    this.reintento = setTimeout(() => void this.conectar(), espera);
  }
}

/** @returns the stream handle, or null if prerequisites (tenant/token/base/SSE) are missing. */
export function openEventStream(tenantId: string): StreamDeEventos | null {
  const token = getAuthToken() || localStorage.getItem("authToken") || "";
  const base = resolveApiBase() || "";
  if (!tenantId || !token || !base || typeof EventSource === "undefined") return null;
  return new StreamConTicket(tenantId, base);
}
