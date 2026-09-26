/**
 * The assistant's silhouettes (viewBox 0 0 48 54).
 *
 * `escudo` (the shield) is OUR assistant's shape: only the platform's own
 * companies get it. A partner's company gets the one its partner chose, or the
 * orb. The server enforces the same rule (`identidadDelAgente`); this list is
 * mirrored in the partner panel (`src/lib/formasDelAgente.ts` there).
 */

export type FormaDelAgente =
  | "escudo"
  | "orbe"
  | "cuadrado"
  | "triangulo"
  | "pentagono"
  | "octagono"
  | "burbuja"
  | "hexagono"
  | "rombo"
  | "chispa"
  | "robot";

export interface Silueta {
  d: string;
  /** Vertical centre for the name / face inside the shape. */
  cy: number;
}

export const SILUETAS: Record<FormaDelAgente, Silueta> = {
  escudo: {
    d: "M24 2 6 8.5v11.5c0 10.8 7.2 20 18 23 10.8-3 18-12.2 18-23V8.5L24 2z",
    cy: 19,
  },
  orbe: { d: "M24 5a20 20 0 1 1 0 40 20 20 0 0 1 0-40z", cy: 25 },
  cuadrado: {
    d: "M10 5h28a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V11a6 6 0 0 1 6-6z",
    cy: 25,
  },
  triangulo: {
    d: "M24 4c1.6 0 2.4.8 3.2 2.2l17 32c1.1 2.1-.2 4.8-2.8 4.8H6.6c-2.6 0-3.9-2.7-2.8-4.8l17-32C21.6 4.8 22.4 4 24 4z",
    cy: 31,
  },
  pentagono: { d: "M24 4 44 18.5 36.3 42H11.7L4 18.5z", cy: 26 },
  octagono: { d: "M16 4h16l12 12v18L32 46H16L4 34V16z", cy: 25 },
  burbuja: {
    d: "M16 5h16a12 12 0 0 1 12 12v10a12 12 0 0 1-12 12H22l-9 8v-8.6A12 12 0 0 1 4 27V17A12 12 0 0 1 16 5z",
    cy: 22,
  },
  hexagono: { d: "M24 4 42 14.5v21L24 46 6 35.5v-21z", cy: 25 },
  rombo: { d: "M24 3 45 25 24 47 3 25z", cy: 25 },
  chispa: {
    d: "M24 3c2 10 8 16 20 22-12 6-18 12-20 22-2-10-8-16-20-22 12-6 18-12 20-22z",
    cy: 25,
  },
  robot: {
    d: "M24 3a3 3 0 0 1 1.5 5.6V12H36a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8H12a8 8 0 0 1-8-8V20a8 8 0 0 1 8-8h10.5V8.6A3 3 0 0 1 24 3z",
    cy: 28,
  },
};

export function siluetaDe(forma: string | null | undefined): Silueta {
  return SILUETAS[(forma as FormaDelAgente) || "orbe"] || SILUETAS.orbe;
}

/**
 * Icons a partner can put INSIDE the shape instead of the initials (24×24,
 * white strokes). Mirrored in the partner panel; the server keeps the same
 * closed list (RESELLER_AGENT_ICONS).
 */
export const ICONOS_DEL_AGENTE: Record<string, string> = {
  robot:
    '<rect x="6" y="8" width="12" height="10" rx="3"/><circle cx="10" cy="13" r="1.4" fill="currentColor" stroke="none"/><circle cx="14" cy="13" r="1.4" fill="currentColor" stroke="none"/><path d="M12 8V5M12 4.5h.01M9.5 16h5"/>',
  operadora:
    '<circle cx="12" cy="10" r="4"/><path d="M5 20c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5M6.5 11V9.5a5.5 5.5 0 0 1 11 0V11M17.5 11v2a2 2 0 0 1-2 2H13"/>',
  buho: '<path d="M6 7l2 2.5M18 7l-2 2.5"/><path d="M6 9.5c0-2 2.7-3.5 6-3.5s6 1.5 6 3.5V15a6 6 0 0 1-12 0z"/><circle cx="9.5" cy="12" r="1.8"/><circle cx="14.5" cy="12" r="1.8"/><path d="M11.2 15l.8 1 .8-1"/>',
  chispa:
    '<path d="M12 4c.8 3.6 2.4 5.2 6 6-3.6.8-5.2 2.4-6 6-.8-3.6-2.4-5.2-6-6 3.6-.8 5.2-2.4 6-6z"/><path d="M18.5 16.5c.3 1.2.8 1.7 2 2-1.2.3-1.7.8-2 2-.3-1.2-.8-1.7-2-2 1.2-.3 1.7-.8 2-2z"/>',
  rayo: '<path d="M13 3L6 13.5h5L10 21l7-10.5h-5z"/>',
  radio:
    '<rect x="7" y="8" width="10" height="13" rx="2"/><path d="M9 8V3M10 12h4M10 15h4"/><circle cx="12" cy="18" r=".6" fill="currentColor" stroke="none"/>',
  ojo: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="3"/>',
  brujula:
    '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  chat: '<path d="M5 6h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/><path d="M9 11h.01M12 11h.01M15 11h.01"/>',
  estrella:
    '<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
  casco:
    '<path d="M4 16h16M5.5 16a6.5 6.5 0 0 1 13 0"/><path d="M12 9.5V7M9 10.5l-1-2M15 10.5l1-2"/><path d="M4 16v2h16v-2"/>',
  mano: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v6M14 11V7a1.5 1.5 0 0 1 3 0v6.5c0 4-2.5 6.5-6 6.5-2.8 0-4.3-1.4-5.8-3.8L4 13.5a1.5 1.5 0 0 1 2.4-1.8L8 13.5"/>',
};

export function iconoDe(icono: string | null | undefined): string | null {
  return icono && ICONOS_DEL_AGENTE[icono] ? ICONOS_DEL_AGENTE[icono] : null;
}
