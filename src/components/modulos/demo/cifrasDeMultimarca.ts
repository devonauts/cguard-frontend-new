/**
 * The figures of the Multimarca store demo (`DemoMultimarca`), kept apart so a
 * test can prove they add up. Whole dollars and whole hours only.
 */
export type Marca = "a" | "b";

/* Diego's week (2026-11-02 is a Monday): three 12-hour shifts at Torre
   Altamira (Andes), two at Puerto Norte (Costa), the weekend off. */
export const SEMANA: Array<Marca | null> = [
  "a",
  "a",
  "a",
  "b",
  "b",
  null,
  null,
];
export const TURNO_H = 12;

/* Hours between brands — October, approved hours only. Rate per hour for
   each pair «employer brand → site brand» (the site brand owes the employer). */
export const TARIFA: Record<"ab" | "ba", number> = { ab: 12, ba: 11 };
export const HORAS: Array<{
  k: string;
  de: Marca;
  en: Marca;
  sitio: string;
  h: number;
}> = [
  { k: "diego", de: "a", en: "b", sitio: "naviera", h: 48 },
  { k: "carla", de: "a", en: "b", sitio: "bodega", h: 24 },
  { k: "luis", de: "b", en: "a", sitio: "altamira", h: 36 },
];
export const tarifaDe = (de: Marca, en: Marca) =>
  TARIFA[`${de}${en}` as "ab" | "ba"];

export const PARES = (["ab", "ba"] as const).map((p) => {
  const de = p[0] as Marca;
  const en = p[1] as Marca;
  const h = HORAS.filter((r) => r.de === de && r.en === en).reduce(
    (a, r) => a + r.h,
    0,
  );

  return { p, de, en, h, importe: h * TARIFA[p] };
});

/* Costa (b) owes Andes (a) for Andes' staff at Costa's sites, minus the other way round. */
export const NETO = PARES[0].importe - PARES[1].importe; // 864 − 396 = 468

/* Costa's invoice to Naviera Pacífico: 15 % tax on a whole subtotal. */
export const FACTURA = [
  { k: "lineas.puesto", v: 4200 },
  { k: "lineas.ronda", v: 600 },
];
export const SUBTOTAL = FACTURA.reduce((a, l) => a + l.v, 0); // 4,800
export const IMPUESTO = (SUBTOTAL * 15) / 100; // 720
export const TOTAL = SUBTOTAL + IMPUESTO; // 5,520
