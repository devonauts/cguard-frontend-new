/**
 * What an empty page offers (phase 3, «Empresa nueva»).
 *
 * An empty list says what the page is for and gives ONE next step. If the
 * person can't take it, the button becomes a line that says who can — never a
 * button that fails, never silence.
 */
export interface Paso {
  label: string;
  /** Where it goes; or `onClick` for a dialog on the same page. */
  to?: string;
  onClick?: () => void;
  /** Default true. */
  puede?: boolean;
  /** Why not (from `usePuede().porQueNo`), shown when `puede` is false. */
  porQueNo?: string;
}

export type Vista =
  | { modo: "boton"; label: string; to?: string; onClick?: () => void }
  | { modo: "aviso"; texto: string }
  | { modo: "nada" };

/** `quienPuede` is the fallback sentence when there is no specific reason. */
export function vistaDelPaso(paso: Paso | null | undefined, quienPuede: string): Vista {
  if (!paso || !paso.label || (!paso.to && !paso.onClick)) return { modo: "nada" };
  if (paso.puede === false) return { modo: "aviso", texto: paso.porQueNo || quienPuede };
  return { modo: "boton", label: paso.label, to: paso.to, onClick: paso.onClick };
}
