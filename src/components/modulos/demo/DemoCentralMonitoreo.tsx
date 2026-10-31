import { Car, Check, FileText, Phone, PhoneOff, Radio } from "lucide-react";

import DemoDeModulo, {
  Cambia,
  Plano,
  nota,
  type EstadoBase,
  type Guion,
  type PropsDeEscenario,
  type Tono,
} from "./DemoDeModulo";

/**
 * HOW THE «MONITORING CENTER» WORKS — three scenes.
 *
 *   · «La señal»: an alarm panel at a client site trips zone 1 (main door,
 *     burglary). The signal lands in the operator queue as P1, above
 *     everything else, with the site's action plan; the operator acknowledges
 *     it and works the call list until a contact confirms nobody is inside.
 *   · «El despacho»: a supervisor is dispatched, drives to the site on the
 *     map, finds the forced door, and the case closes with a report. Every
 *     step lands in the case trail with time and name.
 *   · «Paneles»: twelve panels report their periodic test; one goes silent,
 *     the supervision alert opens on its own, the operator calls the client
 *     and the panel restores.
 *
 * Map with the site and the patrol on the left, the operator console on the
 * right. Everything is fictional and lives under
 * `modulosAdicionales.demos.monitoreo`.
 */
type Escena = "senal" | "despacho" | "supervision";
type Caso =
  | "nada"
  | "cola"
  | "reconocida"
  | "verificada"
  | "despachada"
  | "enSitio"
  | "cerrada";
type Llamada = "nada" | "llamando" | "noContesta" | "contesto";
type Panel = "enLinea" | "sinSenal" | "llamada" | "restaurado";

interface Estado extends EstadoBase {
  /** Zone 1 tripped: the keypad blinks and the site pin pulses. */
  alarma: boolean;
  /** The signal pill is travelling from the site to the console. */
  senal: boolean;
  caso: Caso;
  /** Call list results: Andrea, Jorge. */
  llamadas: [Llamada, Llamada];
  /** Action plan steps completed (call, verify, dispatch, notify). */
  hechos: number;
  /** Patrol position: index into RUTA. */
  unidad: number;
  /** Case trail rows shown. */
  rastro: number;
  /** Supervision scene: the pharmacy panel. */
  panel: Panel;
}

/* The map, in % of the zoomable layer: the twelve monitored panels. */
const SITIO = { x: 60, y: 44 };
const SITIOS: Array<{ x: number; y: number }> = [
  SITIO,
  { x: 24, y: 30 },
  { x: 76, y: 68 },
  { x: 40, y: 78 },
  { x: 84, y: 22 },
  { x: 14, y: 60 },
  { x: 46, y: 16 },
  { x: 66, y: 88 },
  { x: 90, y: 48 },
  { x: 32, y: 44 },
  { x: 8, y: 14 },
  { x: 70, y: 28 },
];
const FARMACIA = 2;
const RUTA: Array<{ x: number; y: number }> = [
  { x: 20, y: 84 },
  { x: 27, y: 75 },
  { x: 33, y: 66 },
  { x: 41, y: 61 },
  { x: 48, y: 55 },
  { x: 54, y: 49 },
  /* Parks next to the site, so its pin stays in view. */
  { x: SITIO.x - 3.5, y: SITIO.y + 4.5 },
];

/** Zoom that leaves map point `p` at `destino` of the pane (both in %). */
const enfoque = (
  escala: number,
  p: { x: number; y: number },
  destino: { x: number; y: number },
) =>
  `scale(${escala}) translate(${(destino.x - 50) / escala + 50 - p.x}%, ${(destino.y - 50) / escala + 50 - p.y}%)`;

const ZOOM: Record<Escena, string> = {
  senal: enfoque(1.4, SITIO, { x: 66, y: 55 }),
  despacho: enfoque(1.2, { x: 40, y: 64 }, { x: 50, y: 50 }),
  supervision: "none",
};

const base = (): Estado => ({
  hora: "02:14",
  bitacora: [],
  resultado: null,
  alarma: false,
  senal: false,
  caso: "nada",
  llamadas: ["nada", "nada"],
  hechos: 0,
  unidad: 0,
  rastro: 0,
  panel: "enLinea",
});

const GUIONES: Record<Escena, Guion<Estado>> = {
  senal: {
    dur: 13000,
    inicio: base,
    pasos: [
      [
        500,
        (s) => {
          s.alarma = true;
          s.senal = true;
          nota(s, "02:14", "pasos.disparo", "bad");
        },
      ],
      [
        1700,
        (s) => {
          s.caso = "cola";
          nota(s, "02:14", "pasos.cola", "brand");
        },
      ],
      [
        3100,
        (s) => {
          s.hora = "02:15";
          s.caso = "reconocida";
          s.llamadas = ["llamando", "nada"];
          nota(s, "02:15", "pasos.reconoce");
        },
      ],
      [
        4500,
        (s) => {
          s.llamadas = ["noContesta", "llamando"];
        },
      ],
      [
        5900,
        (s) => {
          s.hora = "02:16";
          s.llamadas = ["noContesta", "contesto"];
          s.hechos = 1;
          nota(s, "02:16", "pasos.contacto", "warn");
        },
      ],
      [
        7200,
        (s) => {
          s.caso = "verificada";
          s.hechos = 2;
          nota(s, "02:16", "pasos.verificada", "bad");
        },
      ],
      [
        8600,
        (s) => {
          s.resultado = "resultado.senal";
        },
      ],
    ],
  },
  despacho: {
    dur: 13500,
    inicio: () => ({
      ...base(),
      hora: "02:17",
      alarma: true,
      caso: "verificada",
      llamadas: ["noContesta", "contesto"],
      hechos: 2,
      rastro: 3,
    }),
    pasos: [
      [
        600,
        (s) => {
          s.caso = "despachada";
          s.hechos = 3;
          s.rastro = 4;
          nota(s, "02:17", "pasos.despacho", "brand");
        },
      ],
      ...[1, 2, 3, 4, 5].map((i): [number, (s: Estado) => void] => [
        600 + i * 800,
        (s) => {
          s.unidad = i;
          s.hora = `02:${17 + i}`;
        },
      ]),
      [
        5400,
        (s) => {
          s.unidad = RUTA.length - 1;
          s.hora = "02:23";
          s.caso = "enSitio";
          s.alarma = false;
          s.rastro = 5;
          nota(s, "02:23", "pasos.enSitio", "warn");
        },
      ],
      [
        7200,
        (s) => {
          s.hora = "02:31";
          s.caso = "cerrada";
          s.hechos = 4;
          s.rastro = 6;
          nota(s, "02:31", "pasos.cierre", "ok");
        },
      ],
      [
        8800,
        (s) => {
          s.resultado = "resultado.despacho";
        },
      ],
    ],
  },
  supervision: {
    dur: 12000,
    inicio: () => ({ ...base(), hora: "03:00" }),
    pasos: [
      [600, (s) => nota(s, "03:00", "pasos.prueba")],
      [
        2000,
        (s) => {
          s.hora = "03:05";
          s.panel = "sinSenal";
          nota(s, "03:05", "pasos.sinSenal", "warn");
        },
      ],
      [
        3800,
        (s) => {
          s.hora = "03:07";
          s.panel = "llamada";
          nota(s, "03:07", "pasos.llama");
        },
      ],
      [
        5800,
        (s) => {
          s.hora = "03:22";
          s.panel = "restaurado";
          nota(s, "03:22", "pasos.restaurado", "ok");
        },
      ],
      [
        7400,
        (s) => {
          s.resultado = "resultado.supervision";
        },
      ],
    ],
  },
};

const ESTADO_TONO: Record<Caso, Tono> = {
  nada: "",
  cola: "bad",
  reconocida: "warn",
  verificada: "bad",
  despachada: "brand",
  enSitio: "warn",
  cerrada: "ok",
};
const LLAMADA_TONO: Record<Llamada, Tono> = {
  nada: "",
  llamando: "brand",
  noContesta: "warn",
  contesto: "ok",
};
const PLAN = ["llamar", "verificar", "despachar", "avisar"] as const;
const CONTACTOS = ["contactos.andrea", "contactos.jorge"] as const;
const RASTRO: Array<{ h: string; k: string; tono: Tono }> = [
  { h: "02:14", k: "rastro.senal", tono: "bad" },
  { h: "02:15", k: "rastro.reconoce", tono: "" },
  { h: "02:16", k: "rastro.llamada", tono: "warn" },
  { h: "02:17", k: "rastro.despacho", tono: "brand" },
  { h: "02:23", k: "rastro.enSitio", tono: "warn" },
  { h: "02:31", k: "rastro.cierre", tono: "ok" },
];

/** Action plan: four chips that fill as the operator works them. */
function Plan({
  s,
  T,
}: {
  s: Estado;
  T: PropsDeEscenario<Estado, Escena>["T"];
}) {
  const activo = s.caso !== "nada" && s.caso !== "cola";

  return (
    <div className="dm-mon-plan" style={{ opacity: activo ? 1 : 0.35 }}>
      {PLAN.map((p, i) => (
        <span
          key={p}
          className="dm-mon-paso"
          data-actual={activo && s.hechos === i ? "" : undefined}
          data-hecho={s.hechos > i ? "" : undefined}
        >
          {s.hechos > i ? (
            <Check className="h-3 w-3 flex-none" />
          ) : (
            <b>{i + 1}</b>
          )}
          <span className="truncate">{T(`plan.${p}`)}</span>
        </span>
      ))}
    </div>
  );
}

function Escenario({ s, T, escena }: PropsDeEscenario<Estado, Escena>) {
  const enRuta = escena === "despacho";
  const coche = RUTA[Math.min(s.unidad, RUTA.length - 1)];
  const pinTono = (i: number): string => {
    if (escena === "supervision") {
      if (i !== FARMACIA) return "ok";

      return s.panel === "sinSenal" || s.panel === "llamada" ? "off" : "ok";
    }
    if (i !== 0) return "tenue";
    if (s.alarma) return "bad";

    return s.caso === "nada" || s.caso === "cerrada" ? "ok" : "brand";
  };
  const enLinea = s.panel === "restaurado" || s.panel === "enLinea" ? 12 : 11;

  return (
    <div className="dm-mon">
      {/* The map: the client site, its neighbours and the patrol */}
      <div className="dm-mon-mapa">
        <div className="dm-zoom" style={{ transform: ZOOM[escena] }}>
          <Plano />
          <svg
            aria-hidden
            className="dm-mon-ruta"
            data-ve={enRuta ? "" : undefined}
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            <polyline
              fill="none"
              points={RUTA.map((p) => `${p.x},${p.y}`).join(" ")}
              stroke="var(--brand)"
              strokeDasharray="2 6"
              strokeLinecap="round"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {SITIOS.map((p, i) => (
            <span
              key={i}
              className="dm-pin dm-mon-pin"
              data-t={pinTono(i)}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          ))}
          {escena === "supervision" && s.panel !== "enLinea" && (
            <span
              key={s.panel === "restaurado" ? "ok" : "off"}
              className="dm-mon-etiqueta"
              data-tono={s.panel === "restaurado" ? "ok" : "warn"}
              style={{
                left: `${SITIOS[FARMACIA].x}%`,
                top: `${SITIOS[FARMACIA].y}%`,
              }}
            >
              {T(
                s.panel === "restaurado"
                  ? "etiqueta.restaurado"
                  : "etiqueta.sinSenal",
              )}
            </span>
          )}
          <span
            className="dm-mon-unidad"
            data-ve={enRuta ? "" : undefined}
            style={{ left: `${coche.x}%`, top: `${coche.y}%` }}
          >
            <Car className="h-3.5 w-3.5" />
          </span>
        </div>

        {/* The signal leaves the site for the console */}
        {s.senal && escena === "senal" && (
          <span className="dm-mon-senal">
            <Radio className="h-3 w-3 flex-none" />
            {T("senal")}
          </span>
        )}

        {/* The alarm keypad at the client site */}
        <div
          className="dm-mon-teclado"
          data-oculto={escena === "senal" ? undefined : ""}
        >
          <div className="dm-mon-teclado-cab">
            <span className="truncate">{T("sitio")}</span>
            <span
              className="dm-mon-led"
              data-alarma={s.alarma ? "" : undefined}
            />
          </div>
          <div className="dm-mon-lcd" data-alarma={s.alarma ? "" : undefined}>
            <span className="truncate">
              {T(s.alarma ? "teclado.alarma" : "teclado.armado")}
            </span>
          </div>
          {(["z1", "z2", "z3"] as const).map((z) => (
            <div key={z} className="dm-mon-zona">
              <span
                className="dm-mon-led"
                data-alarma={s.alarma && z === "z1" ? "" : undefined}
              />
              <span className="truncate">{T(`zonas.${z}`)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* The operator console */}
      <div className="dm-panel dm-mon-panel">
        {escena === "senal" && (
          <>
            <div className="dm-panel-cab">
              <span className="truncate">{T("cola.titulo")}</span>
              <span
                className="dm-sello"
                data-tono={s.caso === "cola" ? "bad" : undefined}
              >
                <Cambia k={s.caso === "nada" ? 1 : 2}>
                  {T("cola.n", { n: s.caso === "nada" ? 1 : 2 })}
                </Cambia>
              </span>
            </div>
            {s.caso === "nada" ? (
              <div className="dm-hueco dm-mon-hueco-caso" />
            ) : (
              <div className="dm-mon-caso" data-tono={ESTADO_TONO[s.caso]}>
                <div className="dm-mon-caso-l">
                  <span className="dm-sello" data-tono="bad">
                    {T("caso.prioridad")}
                  </span>
                  <b className="truncate">{T("caso.titulo")}</b>
                </div>
                <div className="dm-mon-caso-l">
                  <span
                    className="truncate"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {T("sitio")}
                  </span>
                  <span
                    className="dm-sello ml-auto"
                    data-tono={ESTADO_TONO[s.caso]}
                  >
                    <Cambia k={s.caso}>{T(`estado.${s.caso}`)}</Cambia>
                  </span>
                </div>
              </div>
            )}
            <div className="dm-item" style={{ opacity: 0.7 }}>
              <span className="dm-sello">{T("otra.prioridad")}</span>
              <span className="txt">{T("otra.texto")}</span>
              <span className="der">02:09</span>
            </div>
            <div className="dm-titulito">{T("plan.titulo")}</div>
            <Plan T={T} s={s} />
            <div className="dm-titulito">{T("llamadas.titulo")}</div>
            {CONTACTOS.map((c, i) => {
              const ll = s.llamadas[i];

              return ll === "nada" ? (
                <div key={c} className="dm-hueco" />
              ) : (
                <div key={c} className="dm-item" data-nuevo="">
                  <span
                    className="dm-mon-tel"
                    data-llamando={ll === "llamando" ? "" : undefined}
                    data-tono={LLAMADA_TONO[ll]}
                  >
                    {ll === "noContesta" ? (
                      <PhoneOff className="h-3 w-3" />
                    ) : (
                      <Phone className="h-3 w-3" />
                    )}
                  </span>
                  <span className="txt">{T(c)}</span>
                  <span className="dm-sello" data-tono={LLAMADA_TONO[ll]}>
                    <Cambia k={ll}>{T(`llamada.${ll}`)}</Cambia>
                  </span>
                </div>
              );
            })}
          </>
        )}

        {escena === "despacho" && (
          <>
            <div className="dm-panel-cab">
              <span className="truncate">{T("caso.numero")}</span>
              <span className="dm-sello" data-tono={ESTADO_TONO[s.caso]}>
                <Cambia k={s.caso}>{T(`estado.${s.caso}`)}</Cambia>
              </span>
            </div>
            <Plan T={T} s={s} />
            <div
              className="dm-item"
              style={{
                opacity: s.hechos >= 3 ? 1 : 0.35,
                transition: "opacity 0.4s",
              }}
            >
              <span className="dm-av">DR</span>
              <span className="txt">{T("unidad.nombre")}</span>
              <span className="der">
                <Cambia k={`${s.caso}-${s.unidad}`}>
                  {s.caso === "cerrada"
                    ? T("unidad.cerrado")
                    : s.caso === "enSitio"
                      ? T("unidad.enSitio")
                      : T("unidad.eta", { n: Math.max(1, 6 - s.unidad) })}
                </Cambia>
              </span>
            </div>
            <div className="dm-titulito">{T("rastro.titulo")}</div>
            <ol className="dm-mon-rastro">
              {RASTRO.map((r, i) => (
                <li
                  key={r.k}
                  data-cierre={i === RASTRO.length - 1 ? "" : undefined}
                  data-ve={s.rastro > i ? "" : undefined}
                >
                  <span className="h">{r.h}</span>
                  <span className="dm-punto" data-tono={r.tono || undefined} />
                  <span className="truncate">{T(r.k)}</span>
                  {i === RASTRO.length - 1 && (
                    <FileText className="ml-auto h-3.5 w-3.5 flex-none" />
                  )}
                </li>
              ))}
            </ol>
          </>
        )}

        {escena === "supervision" && (
          <>
            <div className="dm-panel-cab">
              <span className="truncate">{T("sup.titulo")}</span>
              <span
                className="dm-sello"
                data-tono={enLinea === 12 ? "ok" : "warn"}
              >
                <Cambia k={enLinea}>{T("sup.enLinea", { n: enLinea })}</Cambia>
              </span>
            </div>
            <div className="dm-kpis">
              <div className="dm-kpi">
                <div className="l">{T("kpi.paneles")}</div>
                <div className="v">12</div>
              </div>
              <div className="dm-kpi">
                <div className="l">{T("kpi.senales")}</div>
                <div className="v">
                  <Cambia k={s.panel}>
                    {
                      {
                        enLinea: 248,
                        sinSenal: 251,
                        llamada: 252,
                        restaurado: 256,
                      }[s.panel]
                    }
                  </Cambia>
                </div>
              </div>
              <div className="dm-kpi">
                <div className="l">{T("kpi.sinSenal")}</div>
                <div
                  className="v"
                  style={{ color: enLinea === 12 ? undefined : "var(--warn)" }}
                >
                  <Cambia k={enLinea}>{12 - enLinea}</Cambia>
                </div>
              </div>
            </div>
            <div className="dm-titulito">{T("sup.alertas")}</div>
            {s.panel === "enLinea" ? (
              <div className="dm-hueco" />
            ) : (
              <div className="dm-item" data-nuevo="">
                <span
                  className="dm-punto"
                  data-tono={s.panel === "restaurado" ? "ok" : "warn"}
                />
                <span className="txt">{T("sup.sinSenal")}</span>
                <span className="der">{T("sup.hace")}</span>
              </div>
            )}
            {s.panel === "llamada" || s.panel === "restaurado" ? (
              <div className="dm-item" data-nuevo="">
                <Phone className="h-3.5 w-3.5 flex-none" />
                <span className="txt">{T("sup.llamada")}</span>
                <span className="der">03:07</span>
              </div>
            ) : (
              <div className="dm-hueco" />
            )}
            {s.panel === "restaurado" ? (
              <div className="dm-item" data-nuevo="">
                <span className="dm-punto" data-tono="ok" />
                <span className="txt">{T("sup.restaurado")}</span>
                <span className="der">03:22</span>
              </div>
            ) : (
              <div className="dm-hueco" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

const ORDEN: Escena[] = ["senal", "despacho", "supervision"];

export default function DemoCentralMonitoreo() {
  return (
    <DemoDeModulo<Estado, Escena>
      Escenario={Escenario}
      guiones={GUIONES}
      orden={ORDEN}
      prefijo="modulosAdicionales.demos.monitoreo"
    />
  );
}
