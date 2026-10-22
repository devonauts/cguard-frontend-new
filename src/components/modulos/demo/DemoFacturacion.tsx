import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  CreditCard,
  FileSignature,
  FileText,
  Landmark,
  Mail,
  Receipt,
  UserPlus,
} from "lucide-react";

import i18n from "@/i18n";

import DemoDeModulo, {
  nota,
  type EstadoBase,
  type Guion,
  type PropsDeEscenario,
  type Tono,
} from "./DemoDeModulo";

/**
 * HOW «CLIENT BILLING» WORKS.
 *
 * Three scenes for a fictitious US security company (Cedar Bluff Security)
 * and its fictitious client (Lone Oak Logistics):
 *
 *   1. Proposal → signature: the proposal fills its lines with a monthly
 *      estimate and Texas sales tax (6.25 %), goes out, the client signs on
 *      the phone and one click turns it into a client and a contract.
 *   2. Billing run: the month's approved hours flow into the invoice column
 *      by column (hours, rate, amount), a missing clock-out is caught and
 *      resolved, overtime is flagged, and the invoice leaves by e-mail IN THE
 *      COMPANY'S NAME with its PDF.
 *   3. Collection: the client opens the invoice link, sees how to pay, pays
 *      by card and the aging report shrinks.
 *
 * Whole-dollar figures that DO add up: every subtotal is a multiple of 16, so
 * 6.25 % (= 1/16) is an exact dollar amount. Dates go through Intl, so the
 * US gets 11/14 and Spain 14/11. On a phone the column headers shorten.
 */
type Escena = "cotizacion" | "corrida" | "cobro";

interface Linea {
  k: string;
  qty: number;
  unit: "h" | "visitas" | "mes";
  rate: number;
  ot?: boolean;
}

/* Scene 1 — the proposal's monthly estimate (730 h = 24 × 365 / 12; 208 h = weekends). */
const PROPUESTA: Linea[] = [
  { k: "lineas.p247", qty: 730, unit: "h", rate: 28 },
  { k: "lineas.finde", qty: 208, unit: "h", rate: 30 },
  { k: "lineas.ronda", qty: 30, unit: "visitas", rate: 40 },
  { k: "lineas.supervision", qty: 1, unit: "mes", rate: 600 },
];
/* Scene 2 — October as worked: 31 days (744 h) and 9 weekend days (216 h). */
const FINDE_RETENIDAS = 12;
const OCTUBRE: Linea[] = [
  { k: "lineas.p247", qty: 744, unit: "h", rate: 28 },
  { k: "lineas.finde", qty: 216, unit: "h", rate: 30 },
  { k: "lineas.extra", qty: 8, unit: "h", rate: 42, ot: true },
  { k: "lineas.ronda", qty: 31, unit: "visitas", rate: 40 },
  { k: "lineas.supervision", qty: 1, unit: "mes", rate: 600 },
];

const sumar = (ls: Linea[]) => ls.reduce((a, l) => a + l.qty * l.rate, 0);
const conImpuesto = (subtotal: number) => {
  const tax = subtotal / 16;

  return { subtotal, tax, total: subtotal + tax };
};
const P = conImpuesto(sumar(PROPUESTA)); // 28,480 + 1,780 = 30,260
const F = conImpuesto(sumar(OCTUBRE)); // 29,488 + 1,843 = 31,331

/* Aging before and after Lone Oak pays (the other balances belong to other clients). */
const ANTIGUEDAD = [
  { k: "antiguedad.aldia", antes: F.total + 9214, despues: 9214 },
  { k: "antiguedad.d30", antes: 12480, despues: 12480 },
  { k: "antiguedad.d60", antes: 3960, despues: 3960 },
  { k: "antiguedad.d90", antes: 1270, despues: 1270 },
];
const MAYOR = Math.max(...ANTIGUEDAD.map((c) => c.antes));

/** A month/day in the viewer's language (11/14 in the US, 14/11 in Spain). */
const dia = (m: number, d: number, largo = false) => {
  try {
    return new Intl.DateTimeFormat(
      i18n.language,
      largo
        ? { month: "short", day: "numeric" }
        : { month: "numeric", day: "numeric" },
    ).format(new Date(2026, m - 1, d));
  } catch {
    return `${m}/${d}`;
  }
};

type Sello = "borrador" | "enviada" | "firmada" | "emitida";
type Aviso = "elige" | "procesando" | "pagada";

interface Estado extends EstadoBase {
  /** Visible table rows (scene 1 fills row by row). */
  filas: number;
  /** Filled columns: 0 none · 1 quantity · 2 rate · 3 amount (+ subtotal). */
  cols: number;
  /** Weekend post still holding the shift without a clock-out. */
  retenidas: boolean;
  /** Cell that just changed and should flash. */
  destello: string | null;
  doc: boolean;
  lineasDoc: number;
  sello: Sello;
  firma: boolean;
  trazo: boolean;
  convertir: boolean;
  convertido: boolean;
  correo: boolean;
  pdf: boolean;
  /* Collection scene */
  opciones: number;
  tarjeta: boolean;
  aviso: Aviso;
  pagada: boolean;
}

const base = (): Estado => ({
  hora: dia(9, 28),
  bitacora: [],
  resultado: null,
  filas: 0,
  cols: 3,
  retenidas: false,
  destello: null,
  doc: false,
  lineasDoc: 0,
  sello: "borrador",
  firma: false,
  trazo: false,
  convertir: false,
  convertido: false,
  correo: false,
  pdf: false,
  opciones: 0,
  tarjeta: false,
  aviso: "elige",
  pagada: false,
});

const GUIONES: Record<Escena, Guion<Estado>> = {
  cotizacion: {
    dur: 12500,
    inicio: base,
    pasos: [
      [
        400,
        (s) => {
          s.doc = true;
          nota(s, dia(9, 28), "pasos.arma");
        },
      ],
      [
        900,
        (s) => {
          s.filas = 1;
        },
      ],
      [
        1400,
        (s) => {
          s.filas = 2;
        },
      ],
      [
        1900,
        (s) => {
          s.filas = 3;
        },
      ],
      [
        2400,
        (s) => {
          s.filas = 4;
          nota(s, dia(9, 28), "pasos.lineas", "brand");
        },
      ],
      [
        2900,
        (s) => {
          s.filas = 5;
          s.lineasDoc = 1;
        },
      ],
      [
        3500,
        (s) => {
          s.lineasDoc = 2;
          nota(s, dia(9, 28), "pasos.impuesto", "brand");
        },
      ],
      [
        4000,
        (s) => {
          s.lineasDoc = 3;
        },
      ],
      [
        5000,
        (s) => {
          s.sello = "enviada";
          nota(s, dia(9, 28), "pasos.envia");
        },
      ],
      [
        6000,
        (s) => {
          s.hora = dia(9, 29);
          s.firma = true;
          nota(s, dia(9, 29), "pasos.firma", "brand");
        },
      ],
      [
        6700,
        (s) => {
          s.trazo = true;
        },
      ],
      [
        8100,
        (s) => {
          s.sello = "firmada";
          s.convertir = true;
          nota(s, dia(9, 29), "pasos.firmada", "ok");
        },
      ],
      [
        9200,
        (s) => {
          s.convertido = true;
          nota(s, dia(9, 29), "pasos.convierte", "ok");
        },
      ],
      [
        10200,
        (s) => {
          s.resultado = "resultado.cotizacion";
        },
      ],
    ],
  },
  corrida: {
    dur: 13500,
    inicio: () => ({ ...base(), hora: dia(11, 1), filas: 6, cols: 0 }),
    pasos: [
      [500, (s) => nota(s, dia(11, 1), "pasos.corre")],
      [
        1300,
        (s) => {
          s.cols = 1;
          s.retenidas = true;
          nota(s, dia(11, 1), "pasos.horas", "brand");
        },
      ],
      [2500, (s) => nota(s, dia(11, 1), "pasos.discrepancia", "warn")],
      [
        3900,
        (s) => {
          s.retenidas = false;
          s.destello = "finde";
          nota(s, dia(11, 1), "pasos.resuelta", "ok");
        },
      ],
      [
        5000,
        (s) => {
          s.cols = 2;
          s.destello = null;
          nota(s, dia(11, 1), "pasos.extra", "brand");
        },
      ],
      [
        6100,
        (s) => {
          s.cols = 3;
          s.doc = true;
          nota(s, dia(11, 1), "pasos.importes");
        },
      ],
      [
        6600,
        (s) => {
          s.lineasDoc = 1;
        },
      ],
      [
        7000,
        (s) => {
          s.lineasDoc = 2;
        },
      ],
      [
        7400,
        (s) => {
          s.lineasDoc = 3;
          s.sello = "emitida";
          nota(s, dia(11, 1), "pasos.emite", "ok");
        },
      ],
      [
        8600,
        (s) => {
          s.correo = true;
          nota(s, dia(11, 1), "pasos.correo", "brand");
        },
      ],
      [
        9500,
        (s) => {
          s.pdf = true;
          nota(s, dia(11, 1), "pasos.pdf");
        },
      ],
      [
        10500,
        (s) => {
          s.resultado = "resultado.corrida";
        },
      ],
    ],
  },
  cobro: {
    dur: 12000,
    inicio: () => ({ ...base(), hora: dia(11, 14) }),
    pasos: [
      [500, (s) => nota(s, dia(11, 14), "pasos.abre")],
      [
        1400,
        (s) => {
          s.opciones = 1;
          nota(s, dia(11, 14), "pasos.comoPagar", "brand");
        },
      ],
      [
        1800,
        (s) => {
          s.opciones = 2;
        },
      ],
      [
        2200,
        (s) => {
          s.opciones = 3;
        },
      ],
      [
        3800,
        (s) => {
          s.tarjeta = true;
          s.aviso = "procesando";
          nota(s, dia(11, 14), "pasos.tarjeta", "brand");
        },
      ],
      [
        5400,
        (s) => {
          s.aviso = "pagada";
          s.pagada = true;
          nota(s, dia(11, 14), "pasos.pagada", "ok");
        },
      ],
      [6600, (s) => nota(s, dia(11, 14), "pasos.antiguedad", "ok")],
      [
        8200,
        (s) => {
          s.resultado = "resultado.cobro";
        },
      ],
    ],
  },
};

const SELLO_TONO: Record<Sello, Tono> = {
  borrador: "",
  enviada: "",
  firmada: "ok",
  emitida: "ok",
};

function Escenario({ s, T, escena }: PropsDeEscenario<Estado, Escena>) {
  const { i18n: idioma } = useTranslation();
  const dinero = (n: number) => {
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
  const numero = (n: number) => {
    try {
      return new Intl.NumberFormat(idioma.language).format(n);
    } catch {
      return String(n);
    }
  };

  if (escena === "cobro") return <Cobro T={T} dinero={dinero} s={s} />;

  const factura = escena === "corrida";
  const lineas = factura ? OCTUBRE : PROPUESTA;
  const doc = factura ? F : P;

  /* A cell: «—» until its column fills; it flashes when it fills (or changes). */
  const celda = (col: number, id: string, texto: string, alerta = false) => (
    <span
      key={`${escena}-${id}-${col}-${s.cols >= col}-${texto}`}
      className="dm-num"
      data-alerta={alerta ? "" : undefined}
      data-nuevo={
        factura && (s.cols === col || s.destello === id) ? "" : undefined
      }
      data-vacio={s.cols < col ? "" : undefined}
    >
      {s.cols >= col ? texto : "—"}
    </span>
  );

  return (
    <div className="dm-rol dm-fact">
      <div className="dm-tabla" data-c3="">
        <div className="dm-tabla-t">
          <span className="truncate">
            {T(factura ? "corrida" : "servicios")}
          </span>
          {factura ? (
            <span
              className="dm-sello"
              data-tono={s.retenidas ? "warn" : s.cols >= 1 ? "ok" : undefined}
            >
              {T(
                s.retenidas
                  ? "estados.revisar"
                  : s.cols >= 1
                    ? "estados.aprobadas"
                    : "estados.calculando",
              )}
            </span>
          ) : (
            <span className="dm-sello">{T("estimado")}</span>
          )}
        </div>
        <div className="dm-fila" data-cab="">
          <span>{T("cols.servicio")}</span>
          {(["cant", "tarifa", "importe"] as const).map((c) => (
            <span key={c} className="dm-num">
              <span className="dm-largo">{T(`cols.${c}`)}</span>
              <span className="dm-corto">{T(`cols.corto.${c}`)}</span>
            </span>
          ))}
        </div>
        {lineas.map((l, i) => {
          const finde = factura && l.k === "lineas.finde";
          const qty = finde && s.retenidas ? l.qty - FINDE_RETENIDAS : l.qty;
          const id = l.k.split(".")[1];

          return (
            <div
              key={l.k}
              className="dm-fila"
              data-oculta={s.filas > i ? undefined : ""}
            >
              <span>
                {l.ot && (
                  <span className="dm-sello mr-1" data-tono="warn">
                    {T("ot")}
                  </span>
                )}
                {T(l.k)}
              </span>
              {celda(
                1,
                id,
                `${numero(qty)} ${T(`unidades.${l.unit}`)}`,
                finde && s.retenidas,
              )}
              {celda(2, id, dinero(l.rate))}
              {celda(3, id, dinero(qty * l.rate))}
            </div>
          );
        })}
        <div
          className="dm-fila"
          data-oculta={s.filas > lineas.length ? undefined : ""}
          data-total=""
        >
          <span>{T("subtotal")}</span>
          <span />
          <span />
          {celda(3, "subtotal", dinero(doc.subtotal))}
        </div>
      </div>

      <div className="dm-rol-der">
        <div className="dm-recibo" data-ve={s.doc ? "" : undefined}>
          <div className="dm-recibo-cab">
            <div className="min-w-0">
              <div className="truncate font-semibold">
                {T(factura ? "factura" : "propuesta")}
              </div>
              <div
                className="truncate text-xs"
                style={{ color: "var(--ink-faint)" }}
              >
                {T("cliente")}
                {factura && ` · ${T("vence", { fecha: dia(12, 1, true) })}`}
              </div>
            </div>
            <span
              key={s.sello}
              className="dm-sello dm-cifra"
              data-tono={SELLO_TONO[s.sello]}
            >
              {T(`estados.${s.sello}`)}
            </span>
          </div>
          <div className="dm-linea" data-ve={s.lineasDoc > 0 ? "" : undefined}>
            <span>{T(factura ? "subtotal" : "estimadoMensual")}</span>
            <span className="dm-num">{dinero(doc.subtotal)}</span>
          </div>
          <div className="dm-linea" data-ve={s.lineasDoc > 1 ? "" : undefined}>
            <span>{T("impuesto")}</span>
            <span className="dm-num">{dinero(doc.tax)}</span>
          </div>
          <div
            className="dm-linea"
            data-neto=""
            data-ve={s.lineasDoc > 2 ? "" : undefined}
          >
            <span>{T(factura ? "totalFactura" : "totalMensual")}</span>
            <span className="dm-num">{dinero(doc.total)}</span>
          </div>
        </div>

        {factura ? (
          <>
            <div className="dm-notif" data-ve={s.correo ? "" : undefined}>
              <span className="ic">
                <Mail className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <b className="truncate">{T("empresa")}</b>
                <span className="block truncate opacity-75">
                  {T("correo.asunto")}
                </span>
              </span>
            </div>
            <span
              className="dm-archivo self-start"
              data-ve={s.pdf ? "" : undefined}
              style={{ marginTop: 0 }}
            >
              <FileText className="h-4 w-4" style={{ color: "var(--bad)" }} />
              {T("archivos.pdf")}
            </span>
          </>
        ) : (
          <>
            <div className="dm-firma" data-ve={s.firma ? "" : undefined}>
              <div className="dm-firma-cab">
                <FileSignature className="h-3.5 w-3.5" />
                <span className="truncate">{T("firma.titulo")}</span>
              </div>
              <svg
                aria-hidden
                className="dm-firma-svg"
                preserveAspectRatio="xMidYMid meet"
                viewBox="0 0 220 44"
              >
                <path
                  className="dm-trazo"
                  d="M8 32 C 14 10, 26 8, 24 26 C 22 38, 34 36, 40 22 C 44 14, 50 14, 50 26 C 50 34, 58 32, 64 22 C 70 12, 76 30, 84 26 C 92 22, 96 14, 104 20 C 110 26, 112 34, 122 28 C 132 22, 138 12, 146 20 C 152 26, 160 30, 172 22 C 182 16, 196 18, 212 14"
                  data-ve={s.trazo ? "" : undefined}
                  fill="none"
                  pathLength={100}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2.2"
                />
                <line
                  stroke="rgb(255 255 255 / 0.25)"
                  strokeDasharray="3 3"
                  x1="4"
                  x2="216"
                  y1="40"
                  y2="40"
                />
              </svg>
              <div className="dm-firma-pie truncate">{T("firmante")}</div>
            </div>
            <div
              className="dm-boton"
              data-hecho={s.convertido ? "" : undefined}
              data-ve={s.convertir ? "" : undefined}
            >
              {s.convertido ? (
                <CheckCircle2 className="h-4 w-4 flex-none" />
              ) : (
                <UserPlus className="h-4 w-4 flex-none" />
              )}
              <span key={String(s.convertido)} className="dm-cifra truncate">
                {T(s.convertido ? "convertido" : "convertir")}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Scene 3: the client's phone on the left, the aging report on the right. */
function Cobro({
  s,
  T,
  dinero,
}: {
  s: Estado;
  T: PropsDeEscenario<Estado, Escena>["T"];
  dinero: (n: number) => string;
}) {
  const aviso: Record<Aviso, Tono> = {
    elige: "",
    procesando: "brand",
    pagada: "ok",
  };
  const porCobrar = ANTIGUEDAD.reduce(
    (a, c) => a + (s.pagada ? c.despues : c.antes),
    0,
  );

  return (
    <div className="dm-fac dm-cobro">
      <div className="dm-tel">
        <div className="dm-pantalla">
          <div className="dm-tel-cab">
            <b className="truncate">{T("empresa")}</b>
            <span className="truncate">{T("factura")}</span>
          </div>
          <div className="dm-pago">
            <div className="dm-pago-total">
              <b>{dinero(F.total)}</b>
              <span
                key={String(s.pagada)}
                className="dm-sello dm-cifra"
                data-tono={s.pagada ? "ok" : "warn"}
              >
                {T(s.pagada ? "estados.pagada" : "estados.porPagar")}
              </span>
            </div>
            <div className="dm-pago-vence">
              {T("vence", { fecha: dia(12, 1, true) })}
            </div>
            <div className="dm-pago-t">{T("cobro.comoPagar")}</div>
            <div
              className="dm-opcion"
              data-ve={s.opciones > 0 ? "" : undefined}
            >
              <Landmark className="h-3.5 w-3.5 flex-none" />
              <span className="min-w-0">
                <b className="block truncate">{T("cobro.transferencia")}</b>
                <span className="block truncate">{T("cobro.banco")}</span>
                <span className="block truncate">{T("cobro.referencia")}</span>
              </span>
            </div>
            <div
              className="dm-opcion"
              data-ve={s.opciones > 1 ? "" : undefined}
            >
              <Receipt className="h-3.5 w-3.5 flex-none" />
              <span className="min-w-0">
                <b className="block truncate">{T("cobro.cheque")}</b>
                <span className="block truncate">{T("cobro.chequeA")}</span>
              </span>
            </div>
            <div
              className="dm-opcion"
              data-sel={s.tarjeta ? "" : undefined}
              data-ve={s.opciones > 2 ? "" : undefined}
            >
              <CreditCard className="h-3.5 w-3.5 flex-none" />
              <b className="truncate">{T("cobro.tarjeta")}</b>
            </div>
          </div>
          <div className="dm-aviso" data-tono={aviso[s.aviso]}>
            {T(`cobro.aviso.${s.aviso}`)}
          </div>
        </div>
      </div>

      <div className="dm-panel dm-fac-panel">
        <div className="dm-panel-cab">
          <span className="truncate">{T("antiguedad.titulo")}</span>
          <span className="dm-cobro-total">
            <span>{T("antiguedad.porCobrar")}</span>
            <b key={porCobrar} className="dm-cifra">
              {dinero(porCobrar)}
            </b>
          </span>
        </div>
        {ANTIGUEDAD.map((c, i) => {
          const v = s.pagada ? c.despues : c.antes;

          return (
            <div key={c.k} className="dm-cubeta" data-i={i}>
              <span className="truncate">{T(c.k)}</span>
              <span className="dm-barra">
                <span style={{ width: `${(v / MAYOR) * 100}%` }} />
              </span>
              <span key={v} className="dm-num dm-cifra">
                {dinero(v)}
              </span>
            </div>
          );
        })}
        <div className="dm-titulito mt-1">{T("pagos.titulo")}</div>
        {s.pagada ? (
          <div className="dm-item" data-nuevo="">
            <span className="dm-punto" data-tono="ok" />
            <span className="txt">{T("pagos.fila")}</span>
            <span className="der">{dinero(F.total)}</span>
          </div>
        ) : (
          <div className="dm-hueco" />
        )}
      </div>
    </div>
  );
}

const ORDEN: Escena[] = ["cotizacion", "corrida", "cobro"];

export default function DemoFacturacion() {
  return (
    <DemoDeModulo<Estado, Escena>
      Escenario={Escenario}
      guiones={GUIONES}
      orden={ORDEN}
      prefijo="modulosAdicionales.demos.facturacion"
      rotulo="modulosAdicionales.demo.fecha"
    />
  );
}
