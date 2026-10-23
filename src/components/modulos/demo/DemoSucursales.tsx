import { Building2, Globe2, Lock, ScrollText } from "lucide-react";

import DemoDeModulo, {
  Cambia,
  Plano,
  nota,
  type EstadoBase,
  type Guion,
  type PropsDeEscenario,
} from "./DemoDeModulo";

/**
 * CÓMO FUNCIONA «SUCURSALES» — el modelo 2.0 (2026-10-23).
 *
 * Tres escenas, las tres cosas que cambiaron:
 *   · «Elige dónde trabajar»: al entrar, la vista global, la principal o una
 *     sucursal; la barra se pinta de su color y todo queda acotado a ella.
 *   · «El mapa que viaja»: un solo mapa que va de la vista global a cada
 *     ciudad, y la comparativa de sucursales al lado.
 *   · «El gerente de sucursal»: ve y atiende lo suyo, no paga ni cancela la
 *     cuenta, y todo lo que hace queda en la bitácora.
 */
type Espacio = "global" | "uio" | "gye";
type Escena = "espacio" | "mapa" | "gerente";

interface Estado extends EstadoBase {
  selector: boolean;
  resaltada: Espacio | null;
  espacio: Espacio;
  camara: Espacio;
  comparativa: boolean;
  gerente: boolean;
  alerta: "no" | "abierta" | "resuelta";
  pago: "no" | "intento" | "bloqueado";
  bitacora2: boolean;
}

/* El mapa, en % — Quito arriba, tierra adentro; Guayaquil abajo, en la costa. */
const ZONAS: Record<
  Exclude<Espacio, "global">,
  { x: number; y: number; w: number; h: number }
> = {
  uio: { x: 50, y: 8, w: 34, h: 34 },
  gye: { x: 10, y: 54, w: 36, h: 36 },
};
const PUESTOS: Array<{ x: number; y: number; z: "uio" | "gye" }> = [
  { x: 60, y: 18, z: "uio" },
  { x: 72, y: 24, z: "uio" },
  { x: 64, y: 32, z: "uio" },
  { x: 76, y: 14, z: "uio" },
  { x: 20, y: 64, z: "gye" },
  { x: 32, y: 70, z: "gye" },
  { x: 26, y: 80, z: "gye" },
];
const PUESTO_ALERTA = 5;
const COLOR: Record<Espacio, string> = {
  global: "var(--brand)",
  uio: "var(--info)",
  gye: "var(--ok)",
};
const CIFRAS: Record<
  Espacio,
  { puestos: number; enTurno: number; cobertura: number }
> = {
  global: { puestos: 31, enTurno: 74, cobertura: 95 },
  uio: { puestos: 19, enTurno: 46, cobertura: 97 },
  gye: { puestos: 12, enTurno: 28, cobertura: 92 },
};

const base = (): Estado => ({
  hora: "07:58",
  bitacora: [],
  resultado: null,
  selector: false,
  resaltada: null,
  espacio: "global",
  camara: "global",
  comparativa: false,
  gerente: false,
  alerta: "no",
  pago: "no",
  bitacora2: false,
});

const GUIONES: Record<Escena, Guion<Estado>> = {
  espacio: {
    dur: 11500,
    inicio: () => ({ ...base(), selector: true }),
    pasos: [
      [500, (s) => nota(s, "07:58", "pasos.entra")],
      [
        1400,
        (s) => {
          s.resaltada = "global";
        },
      ],
      [
        2300,
        (s) => {
          s.resaltada = "uio";
        },
      ],
      [
        3200,
        (s) => {
          s.resaltada = "gye";
        },
      ],
      [
        4200,
        (s) => {
          s.selector = false;
          s.espacio = "gye";
          s.camara = "gye";
          s.hora = "07:59";
          nota(s, "07:59", "pasos.elige", "brand");
        },
      ],
      [5800, (s) => nota(s, "07:59", "pasos.color", "ok")],
      [7200, (s) => nota(s, "08:00", "pasos.acotado")],
      [
        8400,
        (s) => {
          s.resultado = "resultado.espacio";
        },
      ],
    ],
  },
  mapa: {
    dur: 13000,
    inicio: () => ({ ...base(), comparativa: true, hora: "10:15" }),
    pasos: [
      [600, (s) => nota(s, "10:15", "pasos.global")],
      [
        2000,
        (s) => {
          s.camara = "uio";
          nota(s, "10:15", "pasos.quito", "brand");
        },
      ],
      [
        4200,
        (s) => {
          s.camara = "gye";
          nota(s, "10:16", "pasos.guayaquil", "brand");
        },
      ],
      [
        6400,
        (s) => {
          s.camara = "global";
          nota(s, "10:16", "pasos.compara", "ok");
        },
      ],
      [
        8600,
        (s) => {
          s.resultado = "resultado.mapa";
        },
      ],
    ],
  },
  gerente: {
    dur: 13000,
    inicio: () => ({
      ...base(),
      espacio: "gye",
      camara: "gye",
      gerente: true,
      hora: "22:30",
    }),
    pasos: [
      [600, (s) => nota(s, "22:30", "pasos.gerente")],
      [
        2000,
        (s) => {
          s.hora = "22:41";
          s.alerta = "abierta";
          nota(s, "22:41", "pasos.aviso", "warn");
        },
      ],
      [
        4000,
        (s) => {
          s.hora = "22:47";
          s.alerta = "resuelta";
          nota(s, "22:47", "pasos.resuelve", "ok");
        },
      ],
      [
        5600,
        (s) => {
          s.pago = "intento";
        },
      ],
      [
        6400,
        (s) => {
          s.pago = "bloqueado";
          nota(s, "22:50", "pasos.noPaga", "bad");
        },
      ],
      [
        8000,
        (s) => {
          s.bitacora2 = true;
          nota(s, "22:50", "pasos.bitacora", "brand");
        },
      ],
      [
        9400,
        (s) => {
          s.resultado = "resultado.gerente";
        },
      ],
    ],
  },
};

function Escenario({ s, T }: PropsDeEscenario<Estado, Escena>) {
  const zona = s.camara === "global" ? null : ZONAS[s.camara];
  const zoom = zona
    ? `scale(1.5) translate(${50 - (zona.x + zona.w / 2)}%, ${50 - (zona.y + zona.h / 2)}%)`
    : "none";
  const cifras = CIFRAS[s.espacio === "global" ? s.camara : s.espacio];
  const nombre = (e: Espacio) => T(`espacios.${e}`);

  return (
    <div className="dm-suc">
      {/* El mapa: uno solo, la cámara viaja */}
      <div className="dm-suc-mapa">
        <div className="dm-zoom" style={{ transform: zoom }}>
          <Plano />
          {(["uio", "gye"] as const).map((z) => (
            <div
              key={z}
              className="dm-zona"
              data-apagada={
                s.espacio !== "global" && s.espacio !== z ? "" : undefined
              }
              data-ve=""
              data-z={z === "uio" ? "norte" : "sur"}
              style={{
                left: `${ZONAS[z].x}%`,
                top: `${ZONAS[z].y}%`,
                width: `${ZONAS[z].w}%`,
                height: `${ZONAS[z].h}%`,
              }}
            >
              <span className="dm-zona-nombre">{nombre(z)}</span>
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
                s.espacio !== "global" && s.espacio !== p.z ? "" : undefined
              }
              data-color=""
              data-z={p.z === "uio" ? "norte" : "sur"}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          ))}
        </div>
        {/* Los puntos de las paradas, como en el panel de verdad */}
        <div className="dm-paradas">
          {(["global", "uio", "gye"] as const).map((e) => (
            <span
              key={e}
              data-on={s.camara === e ? "" : undefined}
              style={{ background: s.camara === e ? COLOR[e] : undefined }}
            />
          ))}
        </div>
      </div>

      {/* El panel del CRM */}
      <div className="dm-panel dm-suc-panel">
        {/* La barra: el espacio y su color */}
        <div className="dm-espacio-barra" style={{ borderColor: COLOR[s.espacio] }}>
          {s.espacio === "global" ? (
            <Globe2 className="h-3.5 w-3.5" />
          ) : (
            <span
              className="dm-punto"
              style={{ background: COLOR[s.espacio] }}
            />
          )}
          <Cambia k={s.espacio}>{nombre(s.espacio)}</Cambia>
          {s.espacio === "uio" && (
            <span className="dm-sello">{T("principal")}</span>
          )}
          {s.gerente && (
            <span className="dm-sello" data-tono="ok">
              {T("gerente")}
            </span>
          )}
        </div>

        <div className="dm-kpis">
          <div className="dm-kpi">
            <div className="l">{T("kpi.cobertura")}</div>
            <div className="v">
              <Cambia k={`c-${s.espacio}-${s.camara}`}>
                {cifras.cobertura}%
              </Cambia>
            </div>
          </div>
          <div className="dm-kpi">
            <div className="l">{T("kpi.enTurno")}</div>
            <div className="v">
              <Cambia k={`t-${s.espacio}-${s.camara}`}>{cifras.enTurno}</Cambia>
            </div>
          </div>
          <div className="dm-kpi">
            <div className="l">{T("kpi.puestos")}</div>
            <div className="v">
              <Cambia k={`p-${s.espacio}-${s.camara}`}>{cifras.puestos}</Cambia>
            </div>
          </div>
        </div>

        {s.comparativa ? (
          <>
            <div className="dm-titulito">{T("comparativa")}</div>
            {(["uio", "gye", "global"] as const).map((e) => (
              <div
                key={e}
                className="dm-item"
                style={{
                  fontWeight: e === "global" ? 700 : undefined,
                  boxShadow:
                    s.camara === e && e !== "global"
                      ? `inset 3px 0 0 ${COLOR[e]}`
                      : undefined,
                }}
              >
                {e === "global" ? (
                  <Globe2 className="h-3.5 w-3.5" />
                ) : (
                  <span className="dm-punto" style={{ background: COLOR[e] }} />
                )}
                <span className="txt">
                  {e === "global" ? T("total") : nombre(e)}
                </span>
                <span className="der">
                  {CIFRAS[e].cobertura}% · {CIFRAS[e].puestos}
                </span>
              </div>
            ))}
          </>
        ) : s.gerente ? (
          <>
            <div className="dm-titulito">{T("hoy")}</div>
            {s.alerta === "no" ? (
              <div className="dm-hueco" />
            ) : (
              <div key={s.alerta} className="dm-item" data-nuevo="">
                <span
                  className="dm-punto"
                  data-tono={s.alerta === "abierta" ? "warn" : "ok"}
                />
                <span className="txt">
                  {T(s.alerta === "abierta" ? "alerta" : "alertaResuelta")}
                </span>
              </div>
            )}
            {s.pago === "no" ? (
              <div className="dm-hueco" />
            ) : (
              <div
                className="dm-item"
                data-nuevo=""
                style={{
                  color: s.pago === "bloqueado" ? "var(--bad)" : undefined,
                }}
              >
                <Lock className="h-3.5 w-3.5" />
                <span className="txt">
                  {T(s.pago === "bloqueado" ? "pagoBloqueado" : "pagoIntento")}
                </span>
              </div>
            )}
            {s.bitacora2 ? (
              <div className="dm-item" data-nuevo="">
                <ScrollText className="h-3.5 w-3.5" />
                <span className="txt">{T("enBitacora")}</span>
                <span className="der">22:50</span>
              </div>
            ) : (
              <div className="dm-hueco" />
            )}
          </>
        ) : (
          <>
            <div className="dm-titulito">{T("hoy")}</div>
            <div className="dm-item">
              <Building2 className="h-3.5 w-3.5" />
              <span className="txt">
                {T(s.espacio === "global" ? "soloGlobal" : "soloSuya")}
              </span>
            </div>
            <div className="dm-hueco" />
            <div className="dm-hueco" />
          </>
        )}
      </div>

      {/* «¿Dónde trabajas ahora?» al entrar */}
      <div className="dm-selector" data-ve={s.selector ? "" : undefined}>
        <div className="dm-selector-caja">
          <div className="dm-selector-t">{T("selector")}</div>
          {(["global", "uio", "gye"] as const).map((e) => (
            <div
              key={e}
              className="dm-selector-op"
              data-on={s.resaltada === e ? "" : undefined}
              style={{
                borderLeftColor: COLOR[e],
                boxShadow:
                  s.resaltada === e ? `inset 0 0 0 2px ${COLOR[e]}` : undefined,
              }}
            >
              {e === "global" ? (
                <Globe2 className="h-4 w-4" />
              ) : (
                <Building2 className="h-4 w-4" style={{ color: COLOR[e] }} />
              )}
              <span className="txt">{nombre(e)}</span>
              {e === "uio" && (
                <span className="dm-sello">{T("principal")}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ORDEN: Escena[] = ["espacio", "mapa", "gerente"];

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
