/**
 * HOW SURCHARGES COMBINE ON ONE HOUR — the same rule the server pays with
 * (`backend/src/lib/politicaDeNomina.ts` · `combinarRecargos`), so the pay
 * rules page can show live examples of what an hour pays.
 *
 * Each pair of surcharges that can fall on the same hour is either added
 * ('suma') or only the higher one is paid ('mayor'). The three day pairs
 * (holiday + rest day, holiday + Sunday, Sunday + rest day) follow the general
 * rule (`acumulacionDeRecargos`) until the company sets them one by one. Night
 * and overtime were always added, and still are unless the company says not.
 */
export type Regla = "suma" | "mayor";
export type ClaveDeRecargo = "domingo" | "descanso" | "feriado" | "nocturno" | "extra";

export interface Combinaciones {
  feriadoDescanso: Regla | null;
  feriadoDomingo: Regla | null;
  domingoDescanso: Regla | null;
  nocheDomingo: Regla;
  nocheFeriado: Regla;
  nocheDescanso: Regla;
  extraDia: Regla;
}

export interface RecargosActivos {
  domingo: boolean;
  descanso: boolean;
  feriado: boolean;
  nocturno: boolean;
  extra: boolean;
  extraNocturna: boolean;
}

export const COMBINACIONES_POR_DEFECTO: Combinaciones = {
  feriadoDescanso: null,
  feriadoDomingo: null,
  domingoDescanso: null,
  nocheDomingo: "suma",
  nocheFeriado: "suma",
  nocheDescanso: "suma",
  extraDia: "suma",
};

export const ACTIVOS_POR_DEFECTO: RecargosActivos = {
  domingo: true, descanso: true, feriado: true, nocturno: true, extra: true, extraNocturna: true,
};

/** What `combinarRecargos` needs from the policy. */
export interface PoliticaDeRecargos {
  acumulacionDeRecargos?: Regla;
  combinaciones?: Partial<Combinaciones>;
  recargosActivos?: Partial<RecargosActivos>;
  domingoRecargoPct?: number;
  descansoRecargoPct?: number;
  feriadoRecargoPct?: number;
  nocturno?: { recargoPct?: number };
  tramosExtra?: Array<{ desdeHora: number; recargoPct: number }>;
  horasOrdinariasDia?: number;
}

export function activosDe(p: PoliticaDeRecargos): RecargosActivos {
  return { ...ACTIVOS_POR_DEFECTO, ...(p.recargosActivos || {}) };
}

export function combinacionesDe(p: PoliticaDeRecargos): Combinaciones {
  return { ...COMBINACIONES_POR_DEFECTO, ...(p.combinaciones || {}) };
}

export function reglaDelPar(p: PoliticaDeRecargos, a: ClaveDeRecargo, b: ClaveDeRecargo): Regla {
  const c = combinacionesDe(p);
  const general: Regla = p.acumulacionDeRecargos === "mayor" ? "mayor" : "suma";

  switch ([a, b].sort().join("+")) {
    case "descanso+feriado": return c.feriadoDescanso ?? general;
    case "domingo+feriado": return c.feriadoDomingo ?? general;
    case "descanso+domingo": return c.domingoDescanso ?? general;
    case "domingo+nocturno": return c.nocheDomingo;
    case "feriado+nocturno": return c.nocheFeriado;
    case "descanso+nocturno": return c.nocheDescanso;
    case "descanso+extra": case "domingo+extra": case "extra+feriado": return c.extraDia;
    case "extra+nocturno": return "mayor";
    default: return "suma";
  }
}

/** The % of one hour that carries these surcharges (switched-off ones count 0). */
export function combinar(p: PoliticaDeRecargos, partes: Array<{ clave: ClaveDeRecargo; pct: number }>): number {
  const vivos = partes.filter((x) => Number(x.pct) > 0);

  if (!vivos.length) return 0;
  if (vivos.length === 1) return vivos[0].pct;
  const padre = vivos.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));

  for (let i = 0; i < vivos.length; i++) {
    for (let j = i + 1; j < vivos.length; j++) {
      if (reglaDelPar(p, vivos[i].clave, vivos[j].clave) === "mayor") padre[raiz(i)] = raiz(j);
    }
  }
  const mayorDe = new Map<number, number>();

  vivos.forEach((x, i) => {
    const r = raiz(i);

    mayorDe.set(r, Math.max(mayorDe.get(r) ?? 0, x.pct));
  });
  let total = 0;

  for (const v of mayorDe.values()) total += v;

  return total;
}

/** The % each surcharge pays, with the switches applied. */
export function pctDe(p: PoliticaDeRecargos, clave: ClaveDeRecargo): number {
  const a = activosDe(p);

  switch (clave) {
    case "domingo": return a.domingo ? Number(p.domingoRecargoPct) || 0 : 0;
    case "descanso": return a.descanso ? Number(p.descansoRecargoPct) || 0 : 0;
    case "feriado": return a.feriado ? Number(p.feriadoRecargoPct) || 0 : 0;
    case "nocturno": return a.nocturno ? Number(p.nocturno?.recargoPct) || 0 : 0;
    case "extra": return a.extra ? Number(p.tramosExtra?.[0]?.recargoPct) || 0 : 0;
  }
}

/** One hour with these surcharges: its % by the company's rules. */
export function horaCon(p: PoliticaDeRecargos, claves: ClaveDeRecargo[]): number {
  return combinar(p, claves.map((clave) => ({ clave, pct: pctDe(p, clave) })));
}

/**
 * A 12 h day shift on a holiday that is also the person's rest day, at a rate
 * of 10 per hour: ordinary hours up to the daily limit, the rest overtime at
 * the first tier.
 */
export function turnoDeEjemplo(p: PoliticaDeRecargos, horas = 12, tarifa = 10) {
  const limite = Number(p.horasOrdinariasDia) || 0;
  const ordinarias = limite > 0 ? Math.min(horas, limite) : horas;
  const extra = horas - ordinarias;
  const pctOrdinaria = horaCon(p, ["feriado", "descanso"]);
  const pctExtra = horaCon(p, ["extra", "feriado", "descanso"]);
  const total = ordinarias * tarifa * (1 + pctOrdinaria / 100) + extra * tarifa * (1 + pctExtra / 100);

  return { ordinarias, extra, pctOrdinaria, pctExtra, total: Math.round(total * 100) / 100, tarifa };
}
