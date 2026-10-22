import { useTranslation } from "react-i18next";
import { FileSpreadsheet, FileText } from "lucide-react";

import DemoDeModulo, {
  nota,
  type EstadoBase,
  type Guion,
  type PropsDeEscenario,
} from "./DemoDeModulo";

/**
 * CÓMO FUNCIONA «ROLES DE PAGO».
 *
 * Izquierda, la planilla del mes: las columnas se llenan una a una (sueldo,
 * extras de los fichajes, descuentos, a pagar) y la fila del total cuadra.
 * Derecha, el rol de una persona: sus líneas, el neto, publicado y numerado,
 * el aviso en su app y la descarga en PDF. Cifras inventadas, enteras, que SÍ
 * cuadran (fila a fila y en el total). En el teléfono las cabeceras se acortan.
 */
type Escena = "planilla" | "rol";

interface Estado extends EstadoBase {
  /** Columnas llenas: 0 nada · 1 sueldo · 2 extras · 3 descuentos · 4 a pagar. */
  cols: number;
  excel: boolean;
  rol: boolean;
  lineas: number;
  publicado: boolean;
  app: boolean;
  pdf: boolean;
}

const PERSONAS = [
  { k: "personas.luis", sueldo: 520, extras: 86, desc: 87 },
  { k: "personas.ana", sueldo: 520, extras: 42, desc: 53 },
  { k: "personas.pedro", sueldo: 560, extras: 0, desc: 53 },
  { k: "personas.maria", sueldo: 520, extras: 130, desc: 101 },
];
const TOTAL = PERSONAS.reduce(
  (a, p) => ({
    sueldo: a.sueldo + p.sueldo,
    extras: a.extras + p.extras,
    desc: a.desc + p.desc,
  }),
  { sueldo: 0, extras: 0, desc: 0 },
);
/* El rol de Luis, línea a línea (los extras de la planilla = horas extra + recargo). */
const ROL: Array<{ k: string; v: number }> = [
  { k: "lineas.sueldo", v: 520 },
  { k: "lineas.extras", v: 65 },
  { k: "lineas.nocturno", v: 21 },
  { k: "lineas.social", v: -57 },
  { k: "lineas.anticipo", v: -30 },
];
const NETO_LUIS = ROL.reduce((a, l) => a + l.v, 0);

const base = (): Estado => ({
  hora: "31/10",
  bitacora: [],
  resultado: null,
  cols: 0,
  excel: false,
  rol: false,
  lineas: 0,
  publicado: false,
  app: false,
  pdf: false,
});

const GUIONES: Record<Escena, Guion<Estado>> = {
  planilla: {
    dur: 12000,
    inicio: base,
    pasos: [
      [500, (s) => nota(s, "31/10", "pasos.cierra")],
      [
        1300,
        (s) => {
          s.cols = 1;
          nota(s, "31/10", "pasos.sueldos");
        },
      ],
      [
        2500,
        (s) => {
          s.cols = 2;
          nota(s, "31/10", "pasos.extras", "brand");
        },
      ],
      [
        3800,
        (s) => {
          s.cols = 3;
          nota(s, "31/10", "pasos.descuentos", "brand");
        },
      ],
      [
        5100,
        (s) => {
          s.cols = 4;
          nota(s, "31/10", "pasos.cuadra", "ok");
        },
      ],
      [
        6600,
        (s) => {
          s.excel = true;
          nota(s, "31/10", "pasos.excel");
        },
      ],
      [
        8000,
        (s) => {
          s.resultado = "resultado.planilla";
        },
      ],
    ],
  },
  rol: {
    dur: 12500,
    inicio: () => ({ ...base(), cols: 4 }),
    pasos: [
      [
        500,
        (s) => {
          s.rol = true;
          nota(s, "31/10", "pasos.rol");
        },
      ],
      [
        1100,
        (s) => {
          s.lineas = 1;
        },
      ],
      [
        1500,
        (s) => {
          s.lineas = 2;
        },
      ],
      [
        1900,
        (s) => {
          s.lineas = 3;
        },
      ],
      [
        2300,
        (s) => {
          s.lineas = 4;
        },
      ],
      [
        2700,
        (s) => {
          s.lineas = 5;
        },
      ],
      [
        3200,
        (s) => {
          s.lineas = 6;
        },
      ],
      [
        4300,
        (s) => {
          s.publicado = true;
          nota(s, "31/10", "pasos.publica", "ok");
        },
      ],
      [
        5600,
        (s) => {
          s.hora = "01/11";
          s.app = true;
          nota(s, "01/11", "pasos.app", "brand");
        },
      ],
      [
        7000,
        (s) => {
          s.pdf = true;
          nota(s, "01/11", "pasos.pdf");
        },
      ],
      [
        8400,
        (s) => {
          s.resultado = "resultado.rol";
        },
      ],
    ],
  },
};

function Escenario({ s, T, escena }: PropsDeEscenario<Estado, Escena>) {
  const { i18n } = useTranslation();
  const dinero = (n: number) => {
    try {
      return new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: "USD",
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `$${Math.round(n)}`;
    }
  };
  /* Una cifra de la planilla: «—» hasta que su columna se llena; destella al llenarse
     (sólo en la escena de la planilla: en la del rol ya estaba hecha). */
  const celda = (col: number, v: number, neg = false) => (
    <span
      key={`${escena}-${col}-${s.cols >= col}`}
      className="dm-num"
      data-neg={neg && s.cols >= col && v > 0 ? "" : undefined}
      data-nuevo={escena === "planilla" && s.cols === col ? "" : undefined}
      data-vacio={s.cols < col ? "" : undefined}
    >
      {s.cols >= col ? (neg && v > 0 ? `−${dinero(v)}` : dinero(v)) : "—"}
    </span>
  );

  return (
    <div className="dm-rol">
      <div>
        <div className="dm-tabla">
          <div className="dm-tabla-t">
            <span>{T("planilla")}</span>
            <span
              className="dm-sello"
              data-tono={s.cols >= 4 ? "ok" : undefined}
            >
              {T(s.cols >= 4 ? "cuadrada" : "calculando")}
            </span>
          </div>
          <div className="dm-fila" data-cab="">
            <span>{T("cols.persona")}</span>
            <span className="dm-num">
              <span className="dm-largo">{T("cols.sueldo")}</span>
              <span className="dm-corto">{T("cols.corto.sueldo")}</span>
            </span>
            <span className="dm-num">
              <span className="dm-largo">{T("cols.extras")}</span>
              <span className="dm-corto">{T("cols.corto.extras")}</span>
            </span>
            <span className="dm-num">
              <span className="dm-largo">{T("cols.descuentos")}</span>
              <span className="dm-corto">{T("cols.corto.descuentos")}</span>
            </span>
            <span className="dm-num">
              <span className="dm-largo">{T("cols.neto")}</span>
              <span className="dm-corto">{T("cols.corto.neto")}</span>
            </span>
          </div>
          {PERSONAS.map((p) => (
            <div key={p.k} className="dm-fila">
              <span>{T(p.k)}</span>
              {celda(1, p.sueldo)}
              {celda(2, p.extras)}
              {celda(3, p.desc, true)}
              {celda(4, p.sueldo + p.extras - p.desc)}
            </div>
          ))}
          <div className="dm-fila" data-total="">
            <span>{T("total")}</span>
            {celda(1, TOTAL.sueldo)}
            {celda(2, TOTAL.extras)}
            {celda(3, TOTAL.desc, true)}
            {celda(4, TOTAL.sueldo + TOTAL.extras - TOTAL.desc)}
          </div>
        </div>
        <span className="dm-archivo" data-ve={s.excel ? "" : undefined}>
          <FileSpreadsheet className="h-4 w-4" style={{ color: "var(--ok)" }} />
          {T("archivos.excel")}
        </span>
      </div>

      <div className="dm-rol-der">
        <div className="dm-recibo" data-ve={s.rol ? "" : undefined}>
          <div className="dm-recibo-cab">
            <div className="min-w-0">
              <div className="truncate font-semibold">{T("rol")}</div>
              <div
                className="truncate text-xs"
                style={{ color: "var(--ink-faint)" }}
              >
                {T("personas.luis")} · {T("num")}
              </div>
            </div>
            <span
              className="dm-sello"
              data-tono={s.publicado ? "ok" : undefined}
            >
              {T(s.publicado ? "publicado" : "borrador")}
            </span>
          </div>
          {ROL.map((l, i) => (
            <div
              key={l.k}
              className="dm-linea"
              data-ve={s.lineas > i ? "" : undefined}
            >
              <span>{T(l.k)}</span>
              <span className="dm-num" data-neg={l.v < 0 ? "" : undefined}>
                {l.v < 0 ? `−${dinero(-l.v)}` : dinero(l.v)}
              </span>
            </div>
          ))}
          <div
            className="dm-linea"
            data-neto=""
            data-ve={s.lineas > ROL.length ? "" : undefined}
          >
            <span>{T("lineas.neto")}</span>
            <span className="dm-num">{dinero(NETO_LUIS)}</span>
          </div>
        </div>
        <div className="dm-notif" data-ve={s.app ? "" : undefined}>
          <span className="ic">CG</span>
          <span className="min-w-0">
            <b className="truncate">{T("app.titulo")}</b>
            <span className="block truncate opacity-75">{T("app.texto")}</span>
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
      </div>
    </div>
  );
}

const ORDEN: Escena[] = ["planilla", "rol"];

export default function DemoRolesDePago() {
  return (
    <DemoDeModulo<Estado, Escena>
      Escenario={Escenario}
      guiones={GUIONES}
      orden={ORDEN}
      prefijo="modulosAdicionales.demos.roles"
      rotulo="modulosAdicionales.demo.fecha"
    />
  );
}
