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
