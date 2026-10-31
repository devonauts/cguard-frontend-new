import {
  Film,
  LayoutGrid,
  Link2,
  Navigation,
  Scissors,
  Server,
  ShieldCheck,
  VideoOff,
  Wifi,
} from "lucide-react";

import DemoDeModulo, {
  Cambia,
  nota,
  type EstadoBase,
  type Guion,
  type PropsDeEscenario,
  type Traducir,
} from "./DemoDeModulo";

/**
 * HOW «VIDEO SURVEILLANCE» WORKS — three scenes.
 *
 *   · «Conectar»: an NVR at one site is added and its three cameras go live
 *     on the video wall; a second site with no fixed IP joins through the
 *     relay and its gate camera lights up too.
 *   · «Un evento»: someone walks into the loading dock at night, the camera
 *     marks a person, the operator opens it big and clips the 30 seconds that
 *     matter.
 *   · «Despacho»: a supervisor is dispatched with the clip and watches the
 *     same live camera on her phone while driving there; the clip ends up in
 *     the incident and is shared with the client by link.
 *
 * Video wall on the left (the camera images are drawn, dark in both themes
 * like real footage), the CRM panel on the right. Everything is fictional and
 * lives under `modulosAdicionales.demos.video`.
 */
type Escena = "conectar" | "evento" | "despacho";
type Equipo = "nada" | "conectando" | "listo";
type Camara = "entrada" | "estacionamiento" | "patio" | "porton";

interface Estado extends EstadoBase {
  nvr: Equipo;
  relay: Equipo;
  /** Cameras live on the wall, in CAMARAS order. */
  vivas: number;
  /** Where the person in the loading dock is (index into PASOS_PERSONA). */
  persona: number;
  /** The person is walking (the stride animation runs). */
  anda: boolean;
  deteccion: boolean;
  /** The loading-dock camera is open big. */
  foco: boolean;
  clip: "nada" | "marcando" | "listo";
  supervisora: "nada" | "enCamino" | "enSitio";
  tel: boolean;
  incidente: boolean;
  compartido: boolean;
}

const CAMARAS: Camara[] = ["entrada", "estacionamiento", "patio", "porton"];
/* x of the person in the dock image (viewBox units): off-frame, three steps
   into the yard, and gone through the gate. */
const PASOS_PERSONA = [-20, 34, 64, 92, 190];

const base = (): Estado => ({
  hora: "18:02",
  bitacora: [],
  resultado: null,
  nvr: "nada",
  relay: "nada",
  vivas: 0,
  persona: 0,
  anda: false,
  deteccion: false,
  foco: false,
  clip: "nada",
  supervisora: "nada",
  tel: false,
  incidente: false,
  compartido: false,
});

const enVivo = (): Estado => ({
  ...base(),
  hora: "23:41",
  nvr: "listo",
  relay: "listo",
  vivas: 4,
});

const GUIONES: Record<Escena, Guion<Estado>> = {
  conectar: {
    dur: 11500,
    inicio: base,
    pasos: [
      [
        500,
        (s) => {
          s.nvr = "conectando";
          nota(s, "18:02", "pasos.agrega", "brand");
        },
      ],
      [
        1800,
        (s) => {
          s.nvr = "listo";
          s.vivas = 1;
        },
      ],
      [
        2300,
        (s) => {
          s.vivas = 2;
        },
      ],
      [
        2800,
        (s) => {
          s.vivas = 3;
          nota(s, "18:03", "pasos.vivas", "ok");
        },
      ],
      [
        4000,
        (s) => {
          s.hora = "18:05";
          s.relay = "conectando";
          nota(s, "18:05", "pasos.relay", "brand");
        },
      ],
      [
        5600,
        (s) => {
          s.hora = "18:06";
          s.relay = "listo";
          s.vivas = 4;
          nota(s, "18:06", "pasos.relayVivo", "ok");
        },
      ],
      [
        7200,
        (s) => {
          s.resultado = "resultado.conectar";
        },
      ],
    ],
  },
  evento: {
    dur: 12500,
    inicio: enVivo,
    pasos: [
      [
        500,
        (s) => {
          s.persona = 1;
          s.anda = true;
        },
      ],
      [
        1700,
        (s) => {
          s.persona = 2;
          s.deteccion = true;
          nota(s, "23:41", "pasos.movimiento", "warn");
        },
      ],
      [
        2900,
        (s) => {
          s.foco = true;
          s.persona = 3;
          nota(s, "23:41", "pasos.abre");
        },
      ],
      [
        4300,
        (s) => {
          s.anda = false;
        },
      ],
      [
        4800,
        (s) => {
          s.hora = "23:42";
          s.clip = "marcando";
          nota(s, "23:42", "pasos.clip", "brand");
        },
      ],
      [
        6400,
        (s) => {
          s.clip = "listo";
          nota(s, "23:42", "pasos.clipListo", "ok");
        },
      ],
      [
        7800,
        (s) => {
          s.resultado = "resultado.evento";
        },
      ],
    ],
  },
  despacho: {
    dur: 13000,
    inicio: () => ({
      ...enVivo(),
      hora: "23:43",
      persona: 3,
      deteccion: true,
      foco: true,
      clip: "listo",
    }),
    pasos: [
      [
        600,
        (s) => {
          s.supervisora = "enCamino";
          s.incidente = true;
          nota(s, "23:43", "pasos.despacha", "brand");
        },
      ],
      [
        1900,
        (s) => {
          s.tel = true;
          nota(s, "23:44", "pasos.telefono");
        },
      ],
      [
        3600,
        (s) => {
          s.hora = "23:47";
          s.persona = 4;
          s.anda = true;
          s.deteccion = false;
        },
      ],
      [
        5000,
        (s) => {
          s.hora = "23:49";
          s.anda = false;
          s.supervisora = "enSitio";
          nota(s, "23:49", "pasos.llega", "ok");
        },
      ],
      [
        6600,
        (s) => {
          s.hora = "23:58";
          s.compartido = true;
          nota(s, "23:58", "pasos.comparte", "ok");
        },
      ],
      [
        8200,
        (s) => {
          s.resultado = "resultado.despacho";
        },
      ],
    ],
  },
};

/* Footage colours: fixed, night-camera greys (the same in both themes). */
const C = {
  fondo: "#131a1f",
  muro: "#222c33",
  muro2: "#1b2329",
  piso: "#1a2126",
  linea: "#4a5965",
  luz: "#c9d6df",
  persona: "#b7c5cf",
};

/** A person seen by a night camera, walking along the dock floor. */
function Persona({ s, T }: { s: Estado; T: Traducir }) {
  return (
    <g
      className="dm-vid-persona"
      style={{ transform: `translate(${PASOS_PERSONA[s.persona]}px, 75px)` }}
    >
      {/* Feet at y = 0; legs and arms swing while walking. */}
      <g
        className="dm-vid-anda"
        data-anda={s.anda ? "" : undefined}
        fill={C.persona}
        stroke={C.persona}
        strokeLinecap="round"
      >
        <line
          className="dm-vid-pierna"
          strokeWidth={2}
          x1={-1}
          x2={-1.3}
          y1={-9}
          y2={0}
        />
        <line
          className="dm-vid-pierna"
          data-b=""
          strokeWidth={2}
          x1={1}
          x2={1.3}
          y1={-9}
          y2={0}
        />
        <path
          d="M -3 -17 Q 0 -18.4 3 -17 L 3.3 -8.4 L -3.3 -8.4 Z"
          stroke="none"
        />
        <line
          className="dm-vid-brazo"
          strokeWidth={1.4}
          x1={-3.1}
          x2={-3.6}
          y1={-16.4}
          y2={-9.8}
        />
        <line
          className="dm-vid-brazo"
          data-b=""
          strokeWidth={1.4}
          x1={3.1}
          x2={3.6}
          y1={-16.4}
          y2={-9.8}
        />
        <circle cx={0} cy={-20.4} r={2.4} stroke="none" />
      </g>
      <g className="dm-vid-caja" data-ve={s.deteccion ? "" : undefined}>
        <rect
          fill="none"
          height={26}
          rx={1}
          stroke="var(--warn)"
          strokeWidth={0.9}
          width={14}
          x={-7}
          y={-24.2}
        />
        <text
          fill="var(--warn)"
          fontSize={3.8}
          fontWeight={700}
          paintOrder="stroke"
          stroke="#000"
          strokeWidth={0.8}
          x={-7}
          y={-25.6}
        >
          {T("persona")}
        </text>
      </g>
    </g>
  );
}

/** The drawn image of each camera (viewBox 160 × 90). */
function Imagen({ k, s, T }: { k: Camara; s: Estado; T: Traducir }) {
  return (
    <svg aria-hidden preserveAspectRatio="xMidYMid slice" viewBox="0 0 160 90">
      <rect fill={C.fondo} height={90} width={160} />
      {k === "entrada" && (
        <>
          <rect fill={C.muro} height={50} width={84} x={38} y={8} />
          <polygon fill={C.muro2} points="0,0 38,8 38,58 0,90" />
          <polygon fill={C.muro2} points="160,0 122,8 122,58 160,90" />
          <polygon fill={C.piso} points="0,90 38,58 122,58 160,90" />
          <rect fill="#33414c" height={36} width={30} x={65} y={22} />
          <line stroke={C.linea} x1={80} x2={80} y1={22} y2={58} />
          <circle cx={80} cy={15} fill={C.luz} opacity={0.18} r={16} />
          <circle cx={80} cy={15} fill={C.luz} r={2.4} />
          {[70, 76, 84].map((y) => (
            <line
              key={y}
              stroke={C.linea}
              strokeOpacity={0.5}
              x1={0}
              x2={160}
              y1={y}
              y2={y}
            />
          ))}
        </>
      )}
      {k === "estacionamiento" && (
        <>
          <rect fill="#10161a" height={30} width={160} />
          <rect fill={C.piso} height={60} width={160} y={30} />
          {[-40, 0, 40, 80, 120, 160, 200].map((x) => (
            <line
              key={x}
              stroke={C.linea}
              x1={x}
              x2={80 + (x - 80) * 0.35}
              y1={90}
              y2={34}
            />
          ))}
          <rect fill="#33414c" height={18} rx={5} width={38} x={22} y={56} />
          <rect fill="#2a353e" height={10} rx={3} width={24} x={29} y={49} />
          <rect fill="#3b4955" height={15} rx={4} width={32} x={98} y={50} />
          <rect fill="#2c3740" height={8} rx={3} width={20} x={104} y={44} />
          <line
            stroke="#55636e"
            strokeWidth={1.5}
            x1={142}
            x2={142}
            y1={6}
            y2={46}
          />
          <polygon fill={C.luz} opacity={0.07} points="142,8 118,60 166,60" />
          <circle cx={142} cy={8} fill={C.luz} r={2} />
        </>
      )}
      {k === "patio" && (
        <>
          <rect fill={C.muro} height={56} width={160} />
          {[10, 62, 114].map((x) => (
            <g key={x}>
              <rect fill="#2e3943" height={42} width={36} x={x} y={12} />
              {[16, 21, 26, 31, 36, 41, 46, 51].map((y) => (
                <line
                  key={y}
                  stroke="#3b4853"
                  x1={x}
                  x2={x + 36}
                  y1={y}
                  y2={y}
                />
              ))}
            </g>
          ))}
          <rect fill={C.piso} height={34} width={160} y={56} />
          <line
            stroke="#8a8446"
            strokeDasharray="6 4"
            strokeWidth={1.4}
            x1={0}
            x2={160}
            y1={57}
            y2={57}
          />
          <rect fill="#3a3329" height={13} width={20} x={132} y={68} />
          <rect fill="#453c2f" height={9} width={14} x={135} y={60} />
          {[28, 80, 132].map((x) => (
            <g key={x}>
              <polygon
                fill={C.luz}
                opacity={0.05}
                points={`${x - 3},12 ${x + 3},12 ${x + 16},56 ${x - 16},56`}
              />
              <rect
                fill={C.luz}
                height={1.6}
                rx={0.8}
                width={7}
                x={x - 3.5}
                y={10.6}
              />
            </g>
          ))}
          <Persona T={T} s={s} />
        </>
      )}
      {k === "porton" && (
        <>
          <rect fill="#10161a" height={40} width={160} />
          <polygon fill={C.piso} points="0,90 50,40 110,40 160,90" />
          <rect fill="#1d252b" height={8} width={160} y={36} />
          {Array.from({ length: 17 }, (_, i) => i * 10).map((x) => (
            <line
              key={x}
              stroke="#566570"
              strokeWidth={1.4}
              x1={x}
              x2={x}
              y1={22}
              y2={62}
            />
          ))}
          <line
            stroke="#6b7a85"
            strokeWidth={2}
            x1={0}
            x2={160}
            y1={26}
            y2={26}
          />
          <line
            stroke="#6b7a85"
            strokeWidth={2}
            x1={0}
            x2={160}
            y1={58}
            y2={58}
          />
          <circle cx={20} cy={10} fill={C.luz} opacity={0.12} r={14} />
        </>
      )}
    </svg>
  );
}

/** One camera tile: the image, its name, «live» and the ticking clock. */
function Toma({
  k,
  s,
  T,
  viva,
  alerta,
}: {
  k: Camara;
  s: Estado;
  T: Traducir;
  viva: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className="dm-vid-toma"
      data-alerta={alerta ? "" : undefined}
      data-off={viva ? undefined : ""}
      data-vivo={viva ? "" : undefined}
    >
      <Imagen T={T} k={k} s={s} />
      <span className="dm-vid-sin">
        <VideoOff className="h-4 w-4" />
        {T("sinSenal")}
      </span>
      <span className="dm-vid-rotulo">{T(`camaras.${k}`)}</span>
      {viva && <span className="dm-vid-rec">{T("vivo")}</span>}
      {viva && (
        <span className="dm-vid-hora">
          {s.hora}:<Segundero />
        </span>
      )}
    </div>
  );
}

/** Seconds that tick on their own (CSS): footage that is live looks live. */
function Segundero() {
  return (
    <span className="dm-vid-seg">
      <span>
        {Array.from({ length: 60 }, (_, i) => (
          <span key={i}>{String(i).padStart(2, "0")}</span>
        ))}
      </span>
    </span>
  );
}

const EQUIPO_TONO = {
  nada: undefined,
  conectando: "warn",
  listo: "ok",
} as const;

function Escenario({ s, T, escena }: PropsDeEscenario<Estado, Escena>) {
  return (
    <div className="dm-vid">
      {/* The video wall */}
      <div className="dm-vid-muro">
        <div className="dm-vid-cab">
          <LayoutGrid className="h-3.5 w-3.5 flex-none" />
          <span className="truncate">{T("muro")}</span>
          <span
            className="dm-sello ml-auto"
            data-tono={s.vivas ? "ok" : undefined}
          >
            <Cambia k={s.vivas}>{T("enVivo", { n: s.vivas })}</Cambia>
          </span>
        </div>
        <div className="dm-vid-rejilla">
          {CAMARAS.map((k, i) => (
            <Toma
              key={k}
              T={T}
              alerta={k === "patio" && s.deteccion}
              k={k}
              s={s}
              viva={s.vivas > i}
            />
          ))}

          {/* The dock camera, open big */}
          <div className="dm-vid-foco" data-ve={s.foco ? "" : undefined}>
            <Toma viva T={T} alerta={s.deteccion} k="patio" s={s} />
            <div
              className="dm-vid-linea"
              data-ve={
                escena === "evento" && s.clip !== "nada" ? "" : undefined
              }
            >
              <Scissors className="h-3 w-3 flex-none" />
              <span className="dm-vid-pista">
                <span
                  className="dm-vid-rango"
                  style={{ width: s.clip === "nada" ? 0 : "26%" }}
                />
              </span>
              <span className="flex-none tabular-nums">
                {s.clip === "listo" ? T("linea.listo") : T("linea.marcando")}
              </span>
            </div>
          </div>
        </div>

        {/* The supervisor's phone: the same camera, live */}
        <div className="dm-vid-tel" data-ve={s.tel ? "" : undefined}>
          <div className="dm-pantalla">
            <div className="dm-vid-tel-cab">
              <b className="truncate">{T("tel.nombre")}</b>
              <span className="truncate">{T("tel.despacho")}</span>
            </div>
            <div className="dm-vid-tel-video">
              <Toma viva T={T} k="patio" s={s} />
            </div>
            <div className="dm-vid-tel-pie">
              <span className="truncate">{T("tel.vivo")}</span>
              <span
                className="dm-vid-tel-boton"
                data-hecho={s.supervisora === "enSitio" ? "" : undefined}
              >
                {s.supervisora === "enSitio" ? (
                  <ShieldCheck className="h-3 w-3 flex-none" />
                ) : (
                  <Navigation className="h-3 w-3 flex-none" />
                )}
                <span className="truncate">
                  {T(
                    s.supervisora === "enSitio" ? "tel.llegue" : "tel.navegar",
                  )}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* The CRM panel */}
      <div className="dm-panel dm-vid-panel">
        {escena === "conectar" && (
          <>
            <div className="dm-panel-cab">
              <span className="truncate">{T("equipos.titulo")}</span>
            </div>
            {s.nvr === "nada" ? (
              <div className="dm-hueco" />
            ) : (
              <div className="dm-item" data-nuevo="">
                <Server className="h-3.5 w-3.5 flex-none" />
                <span className="txt">{T("equipos.nvr")}</span>
                <span className="dm-sello" data-tono={EQUIPO_TONO[s.nvr]}>
                  <Cambia k={s.nvr}>
                    {T(
                      s.nvr === "listo"
                        ? "estado.enLinea"
                        : "estado.conectando",
                    )}
                  </Cambia>
                </span>
              </div>
            )}
            {s.relay === "nada" ? (
              <div className="dm-hueco" />
            ) : (
              <div className="dm-item" data-nuevo="">
                <Wifi className="h-3.5 w-3.5 flex-none" />
                <span className="txt">{T("equipos.relay")}</span>
                <span className="dm-sello" data-tono={EQUIPO_TONO[s.relay]}>
                  <Cambia k={s.relay}>
                    {T(
                      s.relay === "listo"
                        ? "estado.transmitiendo"
                        : "estado.conectando",
                    )}
                  </Cambia>
                </span>
              </div>
            )}
            <div
              className="dm-item"
              style={{
                opacity: s.relay === "listo" ? 1 : 0,
                transition: "opacity 0.4s",
              }}
            >
              <ShieldCheck
                className="h-3.5 w-3.5 flex-none"
                style={{ color: "var(--ok)" }}
              />
              <span className="txt">{T("equipos.sinPuertos")}</span>
            </div>
            <div className="dm-kpis">
              <div className="dm-kpi">
                <div className="l">{T("kpi.camaras")}</div>
                <div className="v">
                  <Cambia k={s.vivas}>{s.vivas}</Cambia>
                </div>
              </div>
              <div className="dm-kpi">
                <div className="l">{T("kpi.sitios")}</div>
                <div className="v">
                  <Cambia k={`${s.nvr}${s.relay}`}>
                    {(s.nvr === "listo" ? 1 : 0) +
                      (s.relay === "listo" ? 1 : 0)}
                  </Cambia>
                </div>
              </div>
              <div className="dm-kpi">
                <div className="l">{T("kpi.puertos")}</div>
                <div className="v">0</div>
              </div>
            </div>
          </>
        )}

        {escena === "evento" && (
          <>
            <div className="dm-panel-cab">
              <span className="truncate">{T("eventos.titulo")}</span>
              <span
                className="dm-sello"
                data-tono={
                  s.deteccion && s.clip !== "listo" ? "warn" : undefined
                }
              >
                <Cambia k={s.deteccion ? 1 : 0}>
                  {T("eventos.nuevos", { n: s.deteccion ? 1 : 0 })}
                </Cambia>
              </span>
            </div>
            {s.deteccion ? (
              <div className="dm-item" data-nuevo="">
                <span className="dm-punto" data-tono="warn" />
                <span className="txt">{T("eventos.persona")}</span>
                <span className="der">23:41</span>
              </div>
            ) : (
              <div className="dm-hueco" />
            )}
            <div className="dm-item" style={{ opacity: 0.6 }}>
              <span className="dm-punto" data-tono="ok" />
              <span className="txt">{T("eventos.movimiento")}</span>
              <span className="der">22:10</span>
            </div>
            <div className="dm-item" style={{ opacity: 0.6 }}>
              <span className="dm-punto" data-tono="ok" />
              <span className="txt">{T("eventos.reconectada")}</span>
              <span className="der">21:03</span>
            </div>
            <div className="dm-titulito">{T("clip.titulo")}</div>
            {s.clip === "nada" ? (
              <div className="dm-hueco" />
            ) : (
              <div className="dm-item" data-nuevo="">
                <Film className="h-3.5 w-3.5 flex-none" />
                <span className="txt">{T("clip.rango")}</span>
                <span
                  className="dm-sello"
                  data-tono={s.clip === "listo" ? "ok" : undefined}
                >
                  0:30
                </span>
              </div>
            )}
            <div
              className="dm-boton"
              data-hecho={s.clip === "listo" ? "" : undefined}
              data-ve={s.foco ? "" : undefined}
            >
              <Scissors className="h-4 w-4" />
              <Cambia k={s.clip}>
                {T(
                  s.clip === "listo"
                    ? "clip.guardado"
                    : s.clip === "marcando"
                      ? "clip.marcando"
                      : "clip.recortar",
                )}
              </Cambia>
            </div>
          </>
        )}

        {escena === "despacho" && (
          <>
            <div className="dm-panel-cab">
              <span className="truncate">{T("incidente.titulo")}</span>
              <span
                className="dm-sello"
                data-tono={s.supervisora === "enSitio" ? "ok" : "warn"}
              >
                <Cambia k={s.supervisora}>
                  {T(
                    s.supervisora === "enSitio"
                      ? "incidente.enSitio"
                      : "incidente.abierto",
                  )}
                </Cambia>
              </span>
            </div>
            {s.supervisora === "nada" ? (
              <div className="dm-hueco" />
            ) : (
              <div className="dm-item" data-nuevo="">
                <span className="dm-av">CM</span>
                <span className="txt">{T("sup.nombre")}</span>
                <span className="der">
                  <Cambia k={s.supervisora}>
                    {T(
                      s.supervisora === "enSitio"
                        ? "sup.enSitio"
                        : "sup.enCamino",
                    )}
                  </Cambia>
                </span>
              </div>
            )}
            <div className="dm-titulito">{T("evidencia.titulo")}</div>
            {s.incidente ? (
              <div className="dm-item" data-nuevo="">
                <Film className="h-3.5 w-3.5 flex-none" />
                <span className="txt">{T("evidencia.clip")}</span>
                <span className="der">0:30</span>
              </div>
            ) : (
              <div className="dm-hueco" />
            )}
            {s.tel ? (
              <div className="dm-item" data-nuevo="">
                <span className="dm-punto" data-tono="brand" />
                <span className="txt">{T("evidencia.vivo")}</span>
              </div>
            ) : (
              <div className="dm-hueco" />
            )}
            <div
              className="dm-boton"
              data-hecho={s.compartido ? "" : undefined}
              data-ve={s.supervisora === "enSitio" ? "" : undefined}
            >
              <Link2 className="h-4 w-4" />
              <Cambia k={String(s.compartido)}>
                {T(
                  s.compartido ? "evidencia.compartido" : "evidencia.compartir",
                )}
              </Cambia>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const ORDEN: Escena[] = ["conectar", "evento", "despacho"];

export default function DemoVideovigilancia() {
  return (
    <DemoDeModulo<Estado, Escena>
      Escenario={Escenario}
      guiones={GUIONES}
      orden={ORDEN}
      prefijo="modulosAdicionales.demos.video"
    />
  );
}
