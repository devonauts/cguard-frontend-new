import type React from "react";

/**
 * LOS CÓDIGOS DEL HORARIO Y SU COLOR — EN UN SOLO SITIO.
 *
 * Vivían dentro de `Schedule.tsx` con una nota que decía justo esto: «la celda
 * y la leyenda tienen que salir del MISMO sitio, si no el usuario aprende un
 * color en la leyenda y ve otro en la rejilla».
 *
 * Se sacan aquí al añadir la sección de Supervisión, que pinta LOS MISMOS
 * códigos: si se hubiera copiado la paleta, un cambio de color en el Programador
 * habría dejado la supervisión pintando de otro color el mismo permiso — el
 * mismo fallo que la nota avisaba, sólo que entre dos pantallas.
 */

export type Tone = "brand" | "ok" | "warn" | "bad" | "info" | "neutral";

const toneFill = (t: Tone) =>
  t === "brand"
    ? "var(--brand)"
    : t === "neutral"
      ? "var(--ink-faint)"
      : `var(--${t})`;

/** Tinta legible del papel. La usa también la rejilla para texto sobre relleno. */
export const toneInk = (t: Tone) =>
  t === "brand"
    ? "var(--brand-text)"
    : t === "neutral"
      ? "var(--ink-soft)"
      : `var(--${t}-text)`;

/** Píldora tenue del papel: fondo mezclado con el lienzo + tinta legible. */
export const tonePill = (t: Tone, fill = 15): React.CSSProperties => ({
  background: `color-mix(in oklab, ${toneFill(t)} ${fill}%, transparent)`,
  color: toneInk(t),
});

/** Igual, con filo — para lo que tiene que separarse del fondo. */
export const toneCard = (
  t: Tone,
  fill = 12,
  edge = 30,
): React.CSSProperties => ({
  ...tonePill(t, fill),
  border: `1px solid color-mix(in oklab, ${toneFill(t)} ${edge}%, transparent)`,
});

/** Códigos tipados del Horario → papel del sistema. Vacaciones no son «morado»:
 *  son una ausencia aprobada, y por eso van en verde; una falta va en rojo pase
 *  lo que pase con el acento. */
export const OVERRIDE_TONE: Record<string, Tone> = {
  V: "ok", // vacaciones aprobadas
  PM: "warn", // permiso
  F: "bad", // falta
  "24": "brand", // turno completo — lo más fuerte de la rejilla
  D: "brand", // diurno
  N: "info", // nocturno
  L: "neutral", // libre
};

/** El nombre de cada código, en un solo sitio. */
export const CODE_LABEL: Record<string, string> = {
  D: "Diurno",
  N: "Nocturno",
  L: "Libre",
  V: "Vacaciones",
  PM: "Permiso",
  F: "Falta",
  "24": "24 horas",
};

/** Orden de lectura de la leyenda. */
export const CODE_ORDER = ["D", "N", "L", "V", "PM", "F", "24"] as const;

/** El 24 va más denso porque es turno completo. */
export const codeFill = (code: string) => (code === "24" ? 26 : 18);

/** Píldora de un código tipado — leyenda, celda de fijo, celda de sacafranco. */
export const codePill = (code: string): React.CSSProperties =>
  tonePill(OVERRIDE_TONE[code] ?? "neutral", codeFill(code));

/** Igual, con filo — el selector de novedades. */
export const codeCard = (code: string): React.CSSProperties =>
  toneCard(OVERRIDE_TONE[code] ?? "neutral", codeFill(code), 30);

/* ─── Rayado de columnas ─────────────────────────────────────────────────────
   Las filas separadoras de la hoja del Mes (cabecera de puesto, cabecera de
   sacafrancos, fila de puesto de supervisión) sólo pintaban las rayitas
   verticales… con UN DIV VACÍO POR DÍA. Con el lienzo del año entero eso eran
   365 nodos por fila, ~11.000 en total, únicamente para dibujar líneas.

   Un degradado que se repite hace exactamente lo mismo en un solo nodo, y la
   raya cae en el mismo píxel: el borde derecho de cada columna.               */
export const columnRules = (w = 44): React.CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${w - 1}px, var(--hairline) ${w - 1}px ${w}px)`,
});
