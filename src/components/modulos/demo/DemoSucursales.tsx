import { Lock } from "lucide-react";

import DemoDeModulo, {
  Cambia,
  Plano,
  nota,
  type EstadoBase,
  type Guion,
  type PropsDeEscenario,
} from "./DemoDeModulo";

/**
 * CÓMO FUNCIONA «SUCURSALES» — una empresa, varias sucursales.
 *
 * Izquierda, el mapa de la operación: los puestos se agrupan por zona y, al
 * elegir una sucursal, el mapa se acerca a ella. Derecha, el panel: selector
 * de sucursal y cifras que cambian con ella; en la segunda escena el
 * supervisor de una sucursal sólo ve (y atiende) la suya.
 */
type Zona = "norte" | "centro" | "sur";
type Vista = "todas" | Zona;
type Escena = "dividir" | "equipos";

interface Estado extends EstadoBase {
  agrupado: boolean;
  zonas: number;
  activa: Vista;
  supervisor: boolean;
  alerta: "no" | "abierta" | "resuelta";
  informe: boolean;
}

const ORDEN_ZONAS: Zona[] = ["norte", "centro", "sur"];
/* En % del mapa. */
const ZONAS: Record<Zona, { x: number; y: number; w: number; h: number }> = {
  norte: { x: 6, y: 6, w: 40, h: 38 },
  centro: { x: 40, y: 34, w: 30, h: 32 },
  sur: { x: 60, y: 58, w: 34, h: 36 },
};
const PUESTOS: Array<{ x: number; y: number; z: Zona }> = [
  { x: 16, y: 22, z: "norte" },
  { x: 30, y: 16, z: "norte" },
  { x: 24, y: 34, z: "norte" },
  { x: 38, y: 26, z: "norte" },
  { x: 48, y: 46, z: "centro" },
  { x: 60, y: 42, z: "centro" },
  { x: 54, y: 58, z: "centro" },
  { x: 70, y: 70, z: "sur" },
  { x: 84, y: 66, z: "sur" },
  { x: 78, y: 84, z: "sur" },
  { x: 66, y: 86, z: "sur" },
];
/* El puesto que se queda sin ronda en la escena de los equipos. */
const PUESTO_ALERTA = 2;
const CIFRAS: Record<
  Vista,
  { puestos: number; vigilantes: number; cobertura: number }
> = {
  todas: { puestos: 24, vigilantes: 58, cobertura: 96 },
  norte: { puestos: 9, vigilantes: 21, cobertura: 100 },
  centro: { puestos: 8, vigilantes: 20, cobertura: 94 },
  sur: { puestos: 7, vigilantes: 17, cobertura: 92 },
};

const base = (): Estado => ({
  hora: "08:00",
  bitacora: [],
  resultado: null,
  agrupado: false,
  zonas: 0,
  activa: "todas",
  supervisor: false,
  alerta: "no",
  informe: false,
});

const GUIONES: Record<Escena, Guion<Estado>> = {
  dividir: {
    dur: 13000,
    inicio: base,
    pasos: [
      [500, (s) => nota(s, "08:00", "pasos.todo")],
      [
        1700,
        (s) => {
          s.agrupado = true;
          s.zonas = 1;
          nota(s, "08:01", "pasos.norte", "brand");
        },
      ],
      [
        2600,
        (s) => {
          s.zonas = 2;
          nota(s, "08:01", "pasos.centro", "brand");
        },
      ],
      [
        3500,
        (s) => {
          s.zonas = 3;
          nota(s, "08:02", "pasos.sur", "brand");
        },
      ],
      [
        5000,
        (s) => {
          s.hora = "08:05";
          s.activa = "norte";
          nota(s, "08:05", "pasos.filtra");
        },
      ],
      [
        7200,
        (s) => {
          s.activa = "sur";
          nota(s, "08:05", "pasos.filtraSur");
        },
      ],
      [
        9200,
        (s) => {
          s.activa = "todas";
          nota(s, "08:06", "pasos.todas", "ok");
        },
      ],
      [
        10000,
        (s) => {
          s.resultado = "resultado.dividir";
        },
      ],
    ],
  },
  equipos: {
    dur: 12500,
    inicio: () => ({ ...base(), agrupado: true, zonas: 3, hora: "22:30" }),
    pasos: [
      [
        600,
        (s) => {
          s.supervisor = true;
          s.activa = "norte";
          nota(s, "22:30", "pasos.entra");
        },
      ],
      [2000, (s) => nota(s, "22:30", "pasos.soloSuya", "brand")],
      [
        3600,
        (s) => {
          s.hora = "22:41";
          s.alerta = "abierta";
          nota(s, "22:41", "pasos.alerta", "warn");
        },
      ],
      [
        6000,
        (s) => {
          s.hora = "22:48";
          s.alerta = "resuelta";
          nota(s, "22:48", "pasos.resuelta", "ok");
        },
      ],
      [
        7600,
        (s) => {
          s.informe = true;
          nota(s, "22:50", "pasos.informe");
        },
      ],
      [
        9000,
        (s) => {
          s.resultado = "resultado.equipos";
        },
      ],
    ],
  },
};

function Escenario({ s, T }: PropsDeEscenario<Estado, Escena>) {
  const zona = s.activa === "todas" ? null : ZONAS[s.activa];
  /* Acercar el mapa a la sucursal: llevar su centro al centro y ampliar. */
  const zoom = zona
    ? `scale(1.45) translate(${50 - (zona.x + zona.w / 2)}%, ${50 - (zona.y + zona.h / 2)}%)`
    : "none";
  const cifras = CIFRAS[s.activa];
  const equipo =
    s.activa === "todas"
      ? ["norte", "centro", "sur"].map((z) => `equipo.jefe.${z}`)
      : [1, 2, 3].map((n) => `equipo.${s.activa}${n}`);

  return (
    <div className="dm-suc">
      <div className="dm-suc-mapa">
        <div className="dm-zoom" style={{ transform: zoom }}>
          <Plano />
          {ORDEN_ZONAS.map((z, i) => (
            <div
              key={z}
              className="dm-zona"
              data-apagada={
                s.activa !== "todas" && s.activa !== z ? "" : undefined
              }
              data-ve={s.zonas > i ? "" : undefined}
              data-z={z}
              style={{
                left: `${ZONAS[z].x}%`,
                top: `${ZONAS[z].y}%`,
                width: `${ZONAS[z].w}%`,
                height: `${ZONAS[z].h}%`,
              }}
            >
              <span className="dm-zona-nombre">{T(`chips.${z}`)}</span>
            </div>
          ))}
          {PUESTOS.map((p, i) => (
            <span
              key={i}
              className="dm-pin"
              data-alerta={
                s.alerta === "abierta" && i === PUESTO_ALERTA ? "" : undefined
              }
              data-apagado={
                s.activa !== "todas" && s.activa !== p.z ? "" : undefined
              }
              data-color={
                s.agrupado && s.zonas > ORDEN_ZONAS.indexOf(p.z)
                  ? ""
                  : undefined
              }
              data-z={p.z}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          ))}
        </div>
      </div>

      <div className="dm-panel dm-suc-panel">
        <div className="dm-panel-cab">
          <span>{T("panel")}</span>
          {s.supervisor && (
            <span className="dm-sello">
              <Lock className="h-3 w-3" /> {T("supervisor")}
            </span>
          )}
        </div>
        <div className="dm-chips">
          {(["todas", ...ORDEN_ZONAS] as Vista[]).map((v, i) => (
            <span
              key={v}
              className="dm-chip"
              data-off={
                (s.supervisor && v !== "norte") ||
                (v !== "todas" && s.zonas < i)
                  ? ""
                  : undefined
              }
              data-on={s.activa === v ? "" : undefined}
            >
              {T(`chips.${v}`)}
            </span>
          ))}
        </div>
        <div className="dm-kpis">
          <div className="dm-kpi">
            <div className="l">{T("kpi.puestos")}</div>
            <div className="v">
              <Cambia k={`p-${s.activa}`}>{cifras.puestos}</Cambia>
            </div>
          </div>
          <div className="dm-kpi">
            <div className="l">{T("kpi.vigilantes")}</div>
            <div className="v">
              <Cambia k={`v-${s.activa}`}>{cifras.vigilantes}</Cambia>
            </div>
          </div>
          <div className="dm-kpi">
            <div className="l">{T("kpi.cobertura")}</div>
            <div className="v">
              <Cambia k={`c-${s.activa}`}>{cifras.cobertura}%</Cambia>
            </div>
          </div>
        </div>
        <div className="dm-titulito">{T("equipo.titulo")}</div>
        {equipo.map((k, i) => (
          <div key={`${s.activa}-${k}`} className="dm-item" data-nuevo="">
            <span className="dm-av">{T(k).slice(0, 1)}</span>
            <span className="txt">{T(k)}</span>
            {i === 0 && s.activa !== "todas" && (
              <span className="der">{T("equipo.supervisa")}</span>
            )}
          </div>
        ))}
        {/* Una fila reservada para la alerta o el informe: siempre ocupa su sitio. */}
        {s.informe ? (
          <div className="dm-item" data-nuevo="">
            <span className="dm-punto" data-tono="brand" />
            <span className="txt">{T("informe")}</span>
            <span className="der">PDF</span>
          </div>
        ) : s.alerta !== "no" ? (
          <div key={s.alerta} className="dm-item" data-nuevo="">
            <span
              className="dm-punto"
              data-tono={s.alerta === "abierta" ? "warn" : "ok"}
            />
            <span className="txt">
              {T(s.alerta === "abierta" ? "alerta" : "alertaResuelta")}
            </span>
          </div>
        ) : (
          <div className="dm-hueco" />
        )}
      </div>
    </div>
  );
}

const ORDEN: Escena[] = ["dividir", "equipos"];

export default function DemoSucursales() {
  return (
    <DemoDeModulo<Estado, Escena>
      Escenario={Escenario}
      guiones={GUIONES}
      orden={ORDEN}
      prefijo="modulosAdicionales.demos.sucursales"
    />
  );
}
