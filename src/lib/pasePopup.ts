/**
 * Qué pase de novedades tiene abierto el panel en vivo (`RadioPasePopup`).
 *
 * Vive FUERA de React por lo mismo que `radioVoiceManager`: el CRM monta el
 * layout por página, así que un estado de componente se perdería al navegar y
 * el panel del pase desaparecería a mitad de un pase en curso. Se guarda además
 * en `sessionStorage` para sobrevivir a una recarga de la pestaña.
 */
const KEY = "radioPasePopup";

export type PaseSnapshot = {
  /** El pase que se está siguiendo, o null si no hay ninguno. */
  sessionId: string | null;
  /** Recogido en la pastilla: el pase sigue, el panel no estorba. */
  oculto: boolean;
};

function guardado(): PaseSnapshot {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || "null");

    if (v && typeof v.sessionId === "string")
      return { sessionId: v.sessionId, oculto: !!v.oculto };
  } catch {
    /* ignore */
  }

  return { sessionId: null, oculto: false };
}

let snap: PaseSnapshot = guardado();
const listeners = new Set<() => void>();

function set(p: PaseSnapshot) {
  snap = p;
  try {
    if (p.sessionId) sessionStorage.setItem(KEY, JSON.stringify(p));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

export function subscribePase(l: () => void): () => void {
  listeners.add(l);

  return () => {
    listeners.delete(l);
  };
}
export function getPaseSnapshot(): PaseSnapshot {
  return snap;
}

/**
 * Sigue este pase. `oculto` para los que NO inició este operador (automáticos,
 * o de otro compañero): se enteran por la pastilla, sin que un diálogo les
 * tape lo que estaban haciendo. Si ya se seguía ese pase, no cambia cómo está.
 */
export function abrirPase(sessionId: string, opts: { oculto?: boolean } = {}) {
  if (!sessionId) return;
  if (snap.sessionId === sessionId) {
    if (opts.oculto === false && snap.oculto) set({ sessionId, oculto: false });

    return;
  }
  set({ sessionId, oculto: !!opts.oculto });
}
export function ocultarPase() {
  if (snap.sessionId && !snap.oculto) set({ ...snap, oculto: true });
}
export function mostrarPase() {
  if (snap.sessionId && snap.oculto) set({ ...snap, oculto: false });
}
export function cerrarPase() {
  if (snap.sessionId) set({ sessionId: null, oculto: false });
}

/** La comprobación de «¿hay un pase en curso?» se hace UNA vez por carga. */
let comprobado = false;

export function yaSeComprobo(): boolean {
  const v = comprobado;

  comprobado = true;

  return v;
}
