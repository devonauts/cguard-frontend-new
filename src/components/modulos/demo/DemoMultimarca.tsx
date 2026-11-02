import type { CSSProperties } from "react";

import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  Layers,
  Lock,
  Mail,
  Palette,
  ShieldCheck,
  ShoppingCart,
  UserRound,
  Wallet,
} from "lucide-react";

import DemoDeModulo, {
  Cambia,
  Plano,
  nota,
  type EstadoBase,
  type Guion,
  type PropsDeEscenario,
} from "./DemoDeModulo";
import {
  FACTURA,
  HORAS,
  IMPUESTO,
  NETO,
  PARES,
  SEMANA,
  TOTAL,
  TURNO_H,
  tarifaDe,
  type Marca,
} from "./cifrasDeMultimarca";

import i18n from "@/i18n";

/**
 * HOW «MULTIMARCA» WORKS (phase 5, 2026-11-02).
 *
 * One security company that runs two brands, each a separate legal company:
 * «Andes Seguridad» (the principal, blue) and «Costa Vigilancia» (orange).
 * Five scenes, the five things the module changes:
 *
 *   1. Two brands: each with its logo, colors, legal name, tax id and invoice
 *      series; every client belongs to one brand and the top bar narrows the
 *      whole CRM to the chosen one.
 *   2. One guard, both brands: Diego is registered in Andes and works at sites
 *      of both; one schedule, one map, and his payslip comes from Andes.
 *   3. The invoice of brand B: Costa's own legal identity and series, the
 *      e-mail speaks as Costa, and nothing of Andes shows anywhere.
 *   4. The brand admin: Lucía runs Costa's office — only Costa's clients, the
 *      staff working at Costa's sites — but cannot buy brands or touch Andes.
 *   5. Hours between brands: the hours each brand's staff worked at the other
 *      brand's sites, a rate per pair, an amount per pair and the net balance.
 *
 * Whole-dollar figures that DO add up (`cifrasDeMultimarca`, tested): 48 h + 24 h at 12 $/h =
 * 864 $; 36 h at 11 $/h = 396 $; net 468 $. The invoice: 4,200 + 600 = 4,800,
 * 15 % tax = 720, total 5,520. Dates go through Intl like the billing demo.
 */
type Escena = "marcas" | "guardia" | "factura" | "admin" | "horas";
type Vista = "all" | Marca;

/* The two brands' own colors: they are the brands' identity, not CRM tokens,
   so they stay the same in both themes (white text reads on both). */
const COLOR: Record<Marca, string> = {
  a: "oklch(0.55 0.16 258)",
  b: "oklch(0.64 0.17 48)",
};
const RUC: Record<Marca, string> = {
  a: "1790012345001",
  b: "0990067890001",
};
const SERIE: Record<Marca, string> = { a: "INV", b: "CV-INV" };

/* Clients and their sites: every client belongs to exactly one brand. */
const CLIENTES: Array<{ k: string; m: Marca }> = [
  { k: "altamira", m: "a" },
  { k: "naviera", m: "b" },
  { k: "clinica", m: "a" },
  { k: "bodega", m: "b" },
];

/* Map pins (in %): Andes inland to the north-east, Costa by the water. */
const SITIOS: Array<{ k: string; m: Marca; x: number; y: number }> = [
  { k: "altamira", m: "a", x: 66, y: 22 },
  { k: "clinica", m: "a", x: 78, y: 36 },
  { k: "naviera", m: "b", x: 24, y: 70 },
  { k: "bodega", m: "b", x: 40, y: 80 },
];
const SITIO = (k: string) => SITIOS.find((s) => s.k === k)!;

/** A month/day in the viewer's language (11/2 in the US, 2/11 in Spain). */
const dia = (m: number, d: number) => {
  try {
    return new Intl.DateTimeFormat(i18n.language, {
      month: "numeric",
      day: "numeric",
    }).format(new Date(2026, m - 1, d));
  } catch {
    return `${m}/${d}`;
  }
};

interface Estado extends EstadoBase {
  /* 1 · brands */
  marcas: number;
  logos: boolean;
  clientes: number;
  selector: boolean;
  resaltada: Vista | null;
  vista: Vista;
  /* 2 · one guard */
  dias: number;
  guardia: Marca;
  viaja: boolean;
  nomina: boolean;
  cruce: boolean;
  /* 3 · brand B's invoice */
  doc: boolean;
  lineas: number;
  numero: boolean;
  series: boolean;
  correo: boolean;
  limpio: boolean;
  /* 4 · brand admin */
  personal: boolean;
  compra: "no" | "intento" | "bloqueada";
  logoEditado: boolean;
  /* 5 · hours between brands */
  filas: number;
  cols: number;
  filtro: Vista;
  neto: boolean;
  excel: boolean;
}

const base = (): Estado => ({
  hora: dia(11, 2),
  bitacora: [],
  resultado: null,
  marcas: 0,
  logos: false,
  clientes: 0,
  selector: false,
  resaltada: null,
  vista: "all",
  dias: 0,
  guardia: "a",
  viaja: false,
  nomina: false,
  cruce: false,
  doc: false,
  lineas: 0,
  numero: false,
  series: false,
  correo: false,
  limpio: false,
  personal: false,
  compra: "no",
  logoEditado: false,
  filas: 0,
  cols: 0,
  filtro: "all",
  neto: false,
  excel: false,
});

const GUIONES: Record<Escena, Guion<Estado>> = {
  marcas: {
    dur: 12000,
    inicio: base,
    pasos: [
      [
        400,
        (s) => {
          s.marcas = 1;
          nota(s, dia(11, 2), "pasos.principal");
        },
      ],
      [
        1700,
        (s) => {
          s.marcas = 2;
          nota(s, dia(11, 2), "pasos.segunda", "brand");
        },
      ],
      [
        2900,
        (s) => {
          s.logos = true;
          nota(s, dia(11, 2), "pasos.logos");
        },
      ],
      [
        3800,
        (s) => {
          s.clientes = 1;
        },
      ],
      [
        4100,
        (s) => {
          s.clientes = 2;
        },
      ],
      [
        4400,
        (s) => {
          s.clientes = 3;
        },
      ],
      [
        4700,
        (s) => {
          s.clientes = 4;
          nota(s, dia(11, 2), "pasos.clientes", "brand");
        },
      ],
      [
        5800,
        (s) => {
          s.selector = true;
          s.resaltada = "all";
        },
      ],
      [
        6500,
        (s) => {
          s.resaltada = "a";
        },
      ],
      [
        7200,
        (s) => {
          s.resaltada = "b";
        },
      ],
      [
        7900,
        (s) => {
          s.selector = false;
          s.vista = "b";
          nota(s, dia(11, 2), "pasos.elige", "ok");
        },
      ],
      [
        9200,
        (s) => {
          s.resultado = "resultado.marcas";
        },
      ],
    ],
  },
  guardia: {
    dur: 12500,
    inicio: () => base(),
    pasos: [
      [400, (s) => nota(s, dia(11, 2), "pasos.registrado")],
      [
        1000,
        (s) => {
          s.dias = 1;
        },
      ],
      [
        1600,
        (s) => {
          s.dias = 2;
          s.hora = dia(11, 3);
        },
      ],
      [
        2200,
        (s) => {
          s.dias = 3;
          s.hora = dia(11, 4);
          nota(s, dia(11, 4), "pasos.semanaA", "brand");
        },
      ],
      [
        3200,
        (s) => {
          s.guardia = "b";
          s.viaja = true;
          s.hora = dia(11, 5);
        },
      ],
      [
        3900,
        (s) => {
          s.dias = 4;
        },
      ],
      [
        4500,
        (s) => {
          s.dias = 5;
          s.hora = dia(11, 6);
          nota(s, dia(11, 6), "pasos.semanaB", "brand");
        },
      ],
      [
        5300,
        (s) => {
          s.dias = 7;
          s.hora = dia(11, 8);
        },
      ],
      [5900, (s) => nota(s, dia(11, 8), "pasos.unMapa")],
      [
        7000,
        (s) => {
          s.nomina = true;
          nota(s, dia(11, 8), "pasos.nomina", "ok");
        },
      ],
      [
        8300,
        (s) => {
          s.cruce = true;
          nota(s, dia(11, 8), "pasos.cruce", "brand");
        },
      ],
      [
        9600,
        (s) => {
          s.resultado = "resultado.guardia";
        },
      ],
    ],
  },
  factura: {
    dur: 12000,
    inicio: () => ({ ...base(), hora: dia(11, 30) }),
    pasos: [
      [
        400,
        (s) => {
          s.doc = true;
          nota(s, dia(11, 30), "pasos.factura");
        },
      ],
      [
        1200,
        (s) => {
          s.lineas = 1;
        },
      ],
      [
        1700,
        (s) => {
          s.lineas = 2;
        },
      ],
      [
        2300,
        (s) => {
          s.lineas = 3;
          nota(s, dia(11, 30), "pasos.identidad", "brand");
        },
      ],
      [
        3600,
        (s) => {
          s.numero = true;
          s.series = true;
          nota(s, dia(11, 30), "pasos.serie", "brand");
        },
      ],
      [
        5200,
        (s) => {
          s.correo = true;
          nota(s, dia(11, 30), "pasos.correo");
        },
      ],
      [
        6700,
        (s) => {
          s.limpio = true;
          nota(s, dia(11, 30), "pasos.limpio", "ok");
        },
      ],
      [
        8200,
        (s) => {
          s.resultado = "resultado.factura";
        },
      ],
    ],
  },
  admin: {
    dur: 12500,
    inicio: () => ({ ...base(), hora: dia(11, 9), vista: "b" }),
    pasos: [
      [400, (s) => nota(s, dia(11, 9), "pasos.entraAdmin")],
      [
        1100,
        (s) => {
          s.clientes = 1;
        },
      ],
      [
        1500,
        (s) => {
          s.clientes = 2;
          nota(s, dia(11, 9), "pasos.susClientes", "brand");
        },
      ],
      [
        2900,
        (s) => {
          s.personal = true;
          nota(s, dia(11, 9), "pasos.suPersonal", "brand");
        },
      ],
      [
        4400,
        (s) => {
          s.compra = "intento";
        },
      ],
      [
        5200,
        (s) => {
          s.compra = "bloqueada";
          nota(s, dia(11, 9), "pasos.noCompra", "bad");
        },
      ],
      [
        6700,
        (s) => {
          s.logoEditado = true;
          nota(s, dia(11, 9), "pasos.suLogo", "ok");
        },
      ],
      [
        8200,
        (s) => {
          s.resultado = "resultado.admin";
        },
      ],
    ],
  },
  horas: {
    dur: 13500,
    inicio: () => ({ ...base(), hora: dia(11, 2) }),
    pasos: [
      [400, (s) => nota(s, dia(11, 2), "pasos.abre")],
      [
        900,
        (s) => {
          s.filas = 1;
        },
      ],
      [
        1300,
        (s) => {
          s.filas = 2;
        },
      ],
      [
        1700,
        (s) => {
          s.filas = 3;
          s.cols = 1;
          nota(s, dia(11, 2), "pasos.horas", "brand");
        },
      ],
      [
        3000,
        (s) => {
          s.cols = 2;
          nota(s, dia(11, 2), "pasos.tarifa");
        },
      ],
      [
        4100,
        (s) => {
          s.cols = 3;
          nota(s, dia(11, 2), "pasos.importe", "brand");
        },
      ],
      [
        5500,
        (s) => {
          s.filtro = "a";
          nota(s, dia(11, 2), "pasos.filtro");
        },
      ],
      [
        7200,
        (s) => {
          s.filtro = "all";
          s.neto = true;
          nota(s, dia(11, 2), "pasos.neto", "ok");
        },
      ],
      [
        8500,
        (s) => {
          s.excel = true;
          nota(s, dia(11, 2), "pasos.excel");
        },
      ],
      [
        9700,
        (s) => {
          s.resultado = "resultado.horas";
        },
      ],
    ],
  },
};

/* ── Pieces ───────────────────────────────────────────────────────────────── */

const conColor = (m: Marca): CSSProperties =>
  ({ "--mm": COLOR[m] }) as CSSProperties;

/** Each brand's own logo: Andes a mountain, Costa a wave. Drawn, never an emoji. */
function Logo({ m, chico }: { m: Marca; chico?: boolean }) {
  return (
    <span
      aria-hidden
      className="dm-mm-logo"
      data-chico={chico ? "" : undefined}
      data-m={m}
      style={conColor(m)}
    >
      <svg fill="none" viewBox="0 0 24 24">
        {m === "a" ? (
          <path d="M3.5 18 9.2 8.4l3.1 5 2-2.9L20.5 18Z" fill="currentColor" />
        ) : (
          <g stroke="currentColor" strokeLinecap="round" strokeWidth="2.2">
            <path d="M4 10.5c2.2-2 3.8-2 6 0s3.8 2 6 0 2.6-1.4 4-.6" />
            <path d="M4 15.5c2.2-2 3.8-2 6 0s3.8 2 6 0 2.6-1.4 4-.6" />
          </g>
        )}
      </svg>
    </span>
  );
}

/** The brand dot the CRM puts next to a client, a site or a person. */
const Punto = ({ m }: { m: Marca }) => (
  <span className="dm-punto" style={{ background: COLOR[m] }} />
);

type Dinero = (n: number) => string;

function useDinero(): Dinero {
  const { i18n: idioma } = useTranslation();

  return (n: number) => {
    try {
      return new Intl.NumberFormat(idioma.language, {
        style: "currency",
        currency: "USD",
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `$${Math.round(n)}`;
    }
  };
}

/* ── Scene 1 · two brands ─────────────────────────────────────────────────── */

function Marcas({
  s,
  T,
}: {
  s: Estado;
  T: PropsDeEscenario<Estado, Escena>["T"];
}) {
  const barra = s.vista === "all" ? "var(--brand)" : COLOR[s.vista];

  return (
    <div className="dm-mm dm-mm-marcas">
      <div className="dm-mm-col">
        {(["a", "b"] as const).map((m, i) => (
          <div
            key={m}
            className="dm-mm-marca"
            data-logo={s.logos ? "" : undefined}
            data-ve={s.marcas > i ? "" : undefined}
            style={conColor(m)}
          >
            <Logo m={m} />
            <div className="min-w-0 flex-1">
              <div className="dm-mm-marca-n">
                <span className="truncate">{T(`marcas.${m}.nombre`)}</span>
                {m === "a" && (
                  <span className="dm-sello">{T("principal")}</span>
                )}
              </div>
              <div className="dm-mm-marca-l">{T(`marcas.${m}.legal`)}</div>
              <div className="dm-mm-marca-d">
                <span>
                  {T("idFiscal")} {RUC[m]}
                </span>
                <span>
                  {T("serie")} {SERIE[m]}-0001
                </span>
              </div>
            </div>
          </div>
        ))}
        <div className="dm-mm-cupos" data-ve={s.marcas > 1 ? "" : undefined}>
          <Layers className="h-3.5 w-3.5 flex-none" />
          <span className="truncate">{T("cupos")}</span>
          <span className="dm-mm-cupos-barra">
            <span style={{ width: `${(s.marcas / 2) * 100}%` }} />
          </span>
        </div>
      </div>

      <div className="dm-panel dm-mm-panel">
        <div className="dm-espacio-barra" style={{ borderColor: barra }}>
          {s.vista === "all" ? (
            <Layers className="h-3.5 w-3.5" />
          ) : (
            <Logo chico m={s.vista} />
          )}
          <Cambia k={s.vista}>
            {s.vista === "all" ? T("todas") : T(`marcas.${s.vista}.nombre`)}
          </Cambia>
          <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-60" />
        </div>
        <div className="dm-titulito">{T("clientes")}</div>
        {CLIENTES.map((c, i) =>
          s.clientes > i ? (
            <div
              key={c.k}
              className="dm-item dm-mm-fila"
              data-apagada={
                s.vista !== "all" && s.vista !== c.m ? "" : undefined
              }
              data-nuevo=""
            >
              <Punto m={c.m} />
              <span className="txt">{T(`clientesN.${c.k}`)}</span>
              <span className="der">{T(`marcas.${c.m}.corto`)}</span>
            </div>
          ) : (
            <div key={c.k} className="dm-hueco" />
          ),
        )}
      </div>

      <div className="dm-selector" data-ve={s.selector ? "" : undefined}>
        <div className="dm-selector-caja">
          <div className="dm-selector-t">{T("selector")}</div>
          {(["all", "a", "b"] as const).map((v) => (
            <div
              key={v}
              className="dm-selector-op"
              data-on={s.resaltada === v ? "" : undefined}
              style={{
                borderLeftColor: v === "all" ? "var(--brand)" : COLOR[v],
                boxShadow:
                  s.resaltada === v
                    ? `inset 0 0 0 2px ${v === "all" ? "var(--brand)" : COLOR[v]}`
                    : undefined,
              }}
            >
              {v === "all" ? (
                <Layers className="h-4 w-4" />
              ) : (
                <Logo chico m={v} />
              )}
              <span className="txt">
                {v === "all" ? T("todas") : T(`marcas.${v}.nombre`)}
              </span>
              {v === "a" && <span className="dm-sello">{T("principal")}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Scenes 2 and 4 share the map ─────────────────────────────────────────── */

function Mapa({
  apagar,
  guardia,
  viaja,
  marcarGuardia,
}: {
  apagar?: Marca;
  guardia?: Marca | null;
  viaja?: boolean;
  marcarGuardia?: boolean;
}) {
  const donde = guardia
    ? SITIO(guardia === "a" ? "altamira" : "naviera")
    : null;

  return (
    <div className="dm-mm-mapa">
      <Plano />
      {viaja && (
        <svg
          aria-hidden
          className="dm-mm-ruta"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <path
            d={`M ${SITIO("altamira").x} ${SITIO("altamira").y} C 52 40, 34 52, ${SITIO("naviera").x} ${SITIO("naviera").y}`}
            fill="none"
            pathLength={100}
            stroke="var(--ink-soft)"
            strokeDasharray="2 2.5"
            strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {SITIOS.map((p) => (
        <span
          key={p.k}
          className="dm-pin"
          data-apagado={apagar === p.m ? "" : undefined}
          style={{ left: `${p.x}%`, top: `${p.y}%`, background: COLOR[p.m] }}
        />
      ))}
      {donde && (
        <span
          className="dm-mm-guardia"
          data-marcado={marcarGuardia ? "" : undefined}
          style={{ left: `${donde.x}%`, top: `${donde.y}%` }}
        >
          <UserRound className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}

/* ── Scene 2 · one guard, both brands ─────────────────────────────────────── */

function Guardia({
  s,
  T,
}: {
  s: Estado;
  T: PropsDeEscenario<Estado, Escena>["T"];
}) {
  const { i18n: idioma } = useTranslation();
  const letra = (i: number) => {
    try {
      return new Intl.DateTimeFormat(idioma.language, {
        weekday: "narrow",
      }).format(new Date(2026, 10, 2 + i));
    } catch {
      return "LMXJVSD"[i];
    }
  };
  const horas = (m: Marca) =>
    SEMANA.slice(0, s.dias).filter((x) => x === m).length * TURNO_H;

  return (
    <div className="dm-mm dm-mm-conmapa">
      <Mapa guardia={s.guardia} viaja={s.viaja} />

      <div className="dm-panel dm-mm-panel">
        <div className="dm-item" style={{ height: 40 }}>
          <span className="dm-av">DP</span>
          <span className="txt">
            <b>{T("personas.diego")}</b>
          </span>
          <span className="dm-mm-chip" style={conColor("a")}>
            <Punto m="a" />
            {T("registradoEn", { marca: T("marcas.a.corto") })}
          </span>
        </div>

        <div className="dm-titulito">{T("semana")}</div>
        <div className="dm-mm-semana">
          {SEMANA.map((m, i) => (
            <div
              key={i}
              className="dm-mm-dia"
              data-libre={s.dias > i && !m ? "" : undefined}
              data-ve={s.dias > i ? "" : undefined}
              style={m ? conColor(m) : undefined}
            >
              <span className="l">{letra(i)}</span>
              <span className="v">
                {s.dias > i ? (m ? `${TURNO_H}h` : "–") : ""}
              </span>
            </div>
          ))}
        </div>

        <div className="dm-mm-horas">
          {(["a", "b"] as const).map((m) => (
            <div key={m} className="dm-kpi" style={conColor(m)}>
              <div className="l">
                <Punto m={m} />{" "}
                {T("enSitiosDe", { marca: T(`marcas.${m}.corto`) })}
              </div>
              <div className="v">
                <Cambia k={`${m}-${horas(m)}`}>{horas(m)} h</Cambia>
              </div>
            </div>
          ))}
        </div>

        {s.nomina ? (
          <div className="dm-item" data-nuevo="">
            <Wallet className="h-3.5 w-3.5" />
            <span className="txt">
              {T("rolDe", { marca: T("marcas.a.nombre") })}
            </span>
            <span className="der">
              {SEMANA.filter(Boolean).length * TURNO_H} h
            </span>
          </div>
        ) : (
          <div className="dm-hueco" />
        )}
        {s.cruce ? (
          <div className="dm-item" data-nuevo="">
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="txt">
              {T("aCobrar", { marca: T("marcas.b.corto") })}
            </span>
            <span className="der">{horas("b")} h</span>
          </div>
        ) : (
          <div className="dm-hueco" />
        )}
      </div>
    </div>
  );
}

/* ── Scene 3 · Costa's invoice ────────────────────────────────────────────── */

function Factura({
  s,
  T,
}: {
  s: Estado;
  T: PropsDeEscenario<Estado, Escena>["T"];
}) {
  const dinero = useDinero();

  return (
    <div className="dm-mm dm-mm-factura">
      <div
        className="dm-mm-doc"
        data-ve={s.doc ? "" : undefined}
        style={conColor("b")}
      >
        <div className="dm-mm-doc-cab">
          <Logo m="b" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{T("marcas.b.legal")}</div>
            <div className="dm-mm-marca-l">
              {T("idFiscal")} {RUC.b}
            </div>
          </div>
          <div className="dm-mm-doc-num">
            <span>{T("factura")}</span>
            <b key={String(s.numero)} className="dm-cifra">
              {s.numero ? `${SERIE.b}-0001` : "—"}
            </b>
          </div>
        </div>
        <div className="dm-mm-doc-para">
          {T("para")} <b>{T("clientesN.naviera")}</b>
        </div>
        {FACTURA.map((l, i) => (
          <div
            key={l.k}
            className="dm-linea"
            data-ve={s.lineas > i ? "" : undefined}
          >
            <span>{T(l.k)}</span>
            <span className="dm-num">{dinero(l.v)}</span>
          </div>
        ))}
        <div className="dm-linea" data-ve={s.lineas > 2 ? "" : undefined}>
          <span>{T("impuesto")}</span>
          <span className="dm-num">{dinero(IMPUESTO)}</span>
        </div>
        <div
          className="dm-linea"
          data-neto=""
          data-ve={s.lineas > 2 ? "" : undefined}
        >
          <span>{T("total")}</span>
          <span className="dm-num">{dinero(TOTAL)}</span>
        </div>
      </div>

      <div className="dm-panel dm-mm-panel">
        <div className="dm-titulito">{T("series")}</div>
        {(["a", "b"] as const).map((m) =>
          s.series ? (
            <div
              key={m}
              className="dm-item"
              data-nuevo=""
              style={
                m === "b"
                  ? { boxShadow: `inset 3px 0 0 ${COLOR.b}` }
                  : undefined
              }
            >
              <Logo chico m={m} />
              <span className="txt">{T(`marcas.${m}.nombre`)}</span>
              <span className="der">
                {m === "a" ? `${SERIE.a}-0187` : `${SERIE.b}-0001`}
              </span>
            </div>
          ) : (
            <div key={m} className="dm-hueco" />
          ),
        )}
        <div className="dm-notif" data-ve={s.correo ? "" : undefined}>
          <span className="ic" style={{ background: COLOR.b, color: "#fff" }}>
            <Mail className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <b className="truncate">{T("marcas.b.nombre")}</b>
            <span className="block truncate opacity-75">
              {T("asunto", { n: `${SERIE.b}-0001` })}
            </span>
          </span>
        </div>
        {s.limpio ? (
          <div className="dm-item" data-nuevo="">
            <ShieldCheck
              className="h-3.5 w-3.5"
              style={{ color: "var(--ok)" }}
            />
            <span className="txt">
              {T("sinRastro", { marca: T("marcas.a.corto") })}
            </span>
          </div>
        ) : (
          <div className="dm-hueco" />
        )}
      </div>
    </div>
  );
}

/* ── Scene 4 · the brand admin ────────────────────────────────────────────── */

function Admin({
  s,
  T,
}: {
  s: Estado;
  T: PropsDeEscenario<Estado, Escena>["T"];
}) {
  const suyos = CLIENTES.filter((c) => c.m === "b");

  return (
    <div className="dm-mm dm-mm-conmapa">
      <Mapa
        apagar="a"
        guardia={s.personal ? "b" : null}
        marcarGuardia={s.personal}
      />

      <div className="dm-panel dm-mm-panel">
        <div className="dm-espacio-barra" style={{ borderColor: COLOR.b }}>
          <Logo chico m="b" />
          <span className="truncate">{T("marcas.b.nombre")}</span>
          <span className="dm-sello" style={{ marginLeft: "auto" }}>
            <Lock className="h-3 w-3" />
            {T("adminDeMarca")}
          </span>
        </div>

        <div className="dm-titulito">{T("clientes")}</div>
        {suyos.map((c, i) =>
          s.clientes > i ? (
            <div key={c.k} className="dm-item" data-nuevo="">
              <Punto m="b" />
              <span className="txt">{T(`clientesN.${c.k}`)}</span>
            </div>
          ) : (
            <div key={c.k} className="dm-hueco" />
          ),
        )}

        <div className="dm-titulito">{T("enSusSitios")}</div>
        {s.personal ? (
          <div className="dm-item" data-nuevo="">
            <span className="dm-av">DP</span>
            <span className="txt">{T("personas.diego")}</span>
            <span className="dm-mm-chip" style={conColor("a")}>
              <Punto m="a" />
              {T("marcas.a.corto")}
            </span>
          </div>
        ) : (
          <div className="dm-hueco" />
        )}

        {s.logoEditado ? (
          <div className="dm-item" data-nuevo="" style={{ color: "var(--ok)" }}>
            <Palette className="h-3.5 w-3.5" />
            <span className="txt">{T("editaSuMarca")}</span>
            <CheckCircle2 className="h-3.5 w-3.5 flex-none" />
          </div>
        ) : s.compra === "no" ? (
          <div className="dm-hueco" />
        ) : (
          <div
            key={s.compra}
            className="dm-item"
            data-nuevo=""
            style={{
              color: s.compra === "bloqueada" ? "var(--bad)" : undefined,
            }}
          >
            {s.compra === "bloqueada" ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <ShoppingCart className="h-3.5 w-3.5" />
            )}
            <span className="txt">
              {T(
                s.compra === "bloqueada" ? "compraBloqueada" : "compraIntento",
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Scene 5 · hours between brands ───────────────────────────────────────── */

function Horas({
  s,
  T,
}: {
  s: Estado;
  T: PropsDeEscenario<Estado, Escena>["T"];
}) {
  const dinero = useDinero();
  const visible = (de: Marca) => s.filtro === "all" || s.filtro === de;

  const celda = (col: number, id: string, texto: string) => (
    <span
      key={`${id}-${col}-${s.cols >= col}`}
      className="dm-num"
      data-nuevo={s.cols === col ? "" : undefined}
      data-vacio={s.cols < col ? "" : undefined}
    >
      {s.cols >= col ? texto : "—"}
    </span>
  );

  return (
    <div className="dm-mm dm-mm-horasx">
      <div className="dm-tabla dm-mm-tabla" data-c3="">
        <div className="dm-tabla-t">
          <span className="truncate">{T("informe")}</span>
          <span
            className="dm-mm-filtro"
            data-on={s.filtro !== "all" ? "" : undefined}
          >
            <span className="dm-largo">{T("filtroPone")}</span>
            {s.filtro === "all" ? (
              <Layers className="h-3 w-3" />
            ) : (
              <Punto m={s.filtro} />
            )}
            <Cambia k={s.filtro}>
              {s.filtro === "all"
                ? T("todasCorto")
                : T(`marcas.${s.filtro}.corto`)}
            </Cambia>
          </span>
        </div>
        <div className="dm-fila" data-cab="">
          <span>{T("cols.persona")}</span>
          {(["horas", "tarifa", "importe"] as const).map((c) => (
            <span key={c} className="dm-num">
              <span className="dm-largo">{T(`cols.${c}`)}</span>
              <span className="dm-corto">{T(`cols.corto.${c}`)}</span>
            </span>
          ))}
        </div>
        {HORAS.map((r, i) => (
          <div
            key={r.k}
            className="dm-fila dm-mm-hfila"
            data-oculta={s.filas > i && visible(r.de) ? undefined : ""}
          >
            <span className="dm-mm-quien">
              <span className="dm-mm-par">
                <Punto m={r.de} />
                <ArrowRight className="h-2.5 w-2.5" />
                <Punto m={r.en} />
              </span>
              <span className="truncate">{T(`personas.${r.k}`)}</span>
            </span>
            {celda(1, r.k, `${r.h} h`)}
            {celda(2, r.k, dinero(tarifaDe(r.de, r.en)))}
            {celda(3, r.k, dinero(r.h * tarifaDe(r.de, r.en)))}
          </div>
        ))}
      </div>

      <div className="dm-panel dm-mm-panel">
        <div className="dm-titulito">{T("porPar")}</div>
        {PARES.map((p) => (
          <div
            key={p.p}
            className="dm-item dm-mm-parfila"
            data-apagada={visible(p.de) ? undefined : ""}
            data-ve={s.filas >= 3 ? "" : undefined}
          >
            <span className="dm-mm-par">
              <Punto m={p.de} />
              <ArrowRight className="h-2.5 w-2.5" />
              <Punto m={p.en} />
            </span>
            <span className="txt">
              {T("par", {
                de: T(`marcas.${p.de}.corto`),
                en: T(`marcas.${p.en}.corto`),
              })}
            </span>
            <span className="der">
              <Cambia k={`${p.p}-${s.cols >= 3}`}>
                {p.h} h{s.cols >= 3 ? ` · ${dinero(p.importe)}` : ""}
              </Cambia>
            </span>
          </div>
        ))}
        <div className="dm-mm-neto" data-ve={s.neto ? "" : undefined}>
          <span className="dm-mm-par">
            <Logo chico m="b" />
            <ArrowRight className="h-3 w-3" />
            <Logo chico m="a" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="dm-mm-neto-t">{T("netoT")}</span>
            <b className="block truncate">
              {T("neto", { de: T("marcas.b.corto"), a: T("marcas.a.corto") })}
            </b>
          </span>
          <b className="dm-mm-neto-v">{dinero(NETO)}</b>
        </div>
        <span
          className="dm-archivo self-start"
          data-ve={s.excel ? "" : undefined}
          style={{ marginTop: 0 }}
        >
          <FileSpreadsheet className="h-4 w-4" style={{ color: "var(--ok)" }} />
          {T("archivo")}
        </span>
      </div>
    </div>
  );
}

function Escenario({ s, T, escena }: PropsDeEscenario<Estado, Escena>) {
  switch (escena) {
    case "marcas":
      return <Marcas T={T} s={s} />;
    case "guardia":
      return <Guardia T={T} s={s} />;
    case "factura":
      return <Factura T={T} s={s} />;
    case "admin":
      return <Admin T={T} s={s} />;
    default:
      return <Horas T={T} s={s} />;
  }
}

const ORDEN: Escena[] = ["marcas", "guardia", "factura", "admin", "horas"];

export default function DemoMultimarca() {
  return (
    <DemoDeModulo<Estado, Escena>
      Escenario={Escenario}
      guiones={GUIONES}
      orden={ORDEN}
      prefijo="modulosAdicionales.demos.multimarca"
      rotulo="modulosAdicionales.demo.fecha"
    />
  );
}
