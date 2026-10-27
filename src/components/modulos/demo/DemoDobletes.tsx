import { CalendarPlus, Check, Megaphone, Zap } from "lucide-react";

import DemoDeModulo, {
  Cambia,
  nota,
  type EstadoBase,
  type Guion,
  type PropsDeEscenario,
} from "./DemoDeModulo";

/**
 * HOW «DOBLETES» WORKS — two scenes.
 *
 *   · «Falta alguien»: a post is left empty, the office offers the doblete,
 *     wave 1 reaches three reserve members, one says no, one accepts in the
 *     app and keeps the shift; the bonus goes to payroll.
 *   · «La banca»: a post has a single suplente; one click launches the
 *     suggested campaign, it shows in the guards' app and the bench fills up.
 *
 * Guard phone on the left (the app), the office panel on the right.
 * Everything is fictional and lives under `modulosAdicionales.demos.dobletes`.
 */
type Escena = "falta" | "banca";
type EstadoOferta = "nada" | "enviada" | "no" | "acepto" | "perdio";

interface Estado extends EstadoBase {
  /** The gap card is on the panel. */
  hueco: boolean;
  /** Offer state per person (Mariana, Luis, Carlos). */
  ofertas: [EstadoOferta, EstadoOferta, EstadoOferta];
  /** What the phone shows: nothing, the offer, accepted. */
  tel: "inicio" | "oferta" | "aceptada" | "campana" | "unido";
  cubierto: boolean;
  bono: boolean;
  /** Bench scene: suplentes of the weak post, and campaign launched. */
  suplentes: number;
  campana: boolean;
  altas: number;
}

const base = (): Estado => ({
  hora: "05:42",
  bitacora: [],
  resultado: null,
  hueco: false,
  ofertas: ["nada", "nada", "nada"],
  tel: "inicio",
  cubierto: false,
  bono: false,
  suplentes: 1,
  campana: false,
  altas: 0,
});

const GUIONES: Record<Escena, Guion<Estado>> = {
  falta: {
    dur: 13000,
    inicio: base,
    pasos: [
      [
        500,
        (s) => {
          s.hueco = true;
          nota(s, "05:42", "pasos.falta", "bad");
        },
      ],
      [
        1900,
        (s) => {
          s.hora = "05:43";
          s.ofertas = ["enviada", "enviada", "enviada"];
          s.tel = "oferta";
          nota(s, "05:43", "pasos.oleada", "brand");
        },
      ],
      [
        3600,
        (s) => {
          s.hora = "05:45";
          s.ofertas = ["enviada", "no", "enviada"];
          nota(s, "05:45", "pasos.noPuede");
        },
      ],
      [
        5200,
        (s) => {
          s.hora = "05:46";
          s.ofertas = ["acepto", "no", "perdio"];
          s.tel = "aceptada";
          s.cubierto = true;
          nota(s, "05:46", "pasos.acepta", "ok");
        },
      ],
      [
        6800,
        (s) => {
          s.bono = true;
          nota(s, "05:46", "pasos.bono");
        },
      ],
      [
        8200,
        (s) => {
          s.resultado = "resultado.falta";
        },
      ],
    ],
  },
  banca: {
    dur: 12500,
    inicio: () => ({ ...base(), hora: "10:15" }),
    pasos: [
      [500, (s) => nota(s, "10:15", "pasos.pocaBanca", "warn")],
      [
        1900,
        (s) => {
          s.campana = true;
          nota(s, "10:16", "pasos.campana", "brand");
        },
      ],
      [
        3300,
        (s) => {
          s.hora = "18:30";
          s.tel = "campana";
        },
      ],
      [
        4800,
        (s) => {
          s.tel = "unido";
          s.altas = 1;
          s.suplentes = 2;
          nota(s, "18:30", "pasos.alta", "ok");
        },
      ],
      [
        6200,
        (s) => {
          s.hora = "20:05";
          s.altas = 3;
          s.suplentes = 4;
          nota(s, "20:05", "pasos.altas", "ok");
        },
      ],
      [
        8000,
        (s) => {
          s.resultado = "resultado.banca";
        },
      ],
    ],
  },
};

const PERSONAS = ["personas.mariana", "personas.luis", "personas.carlos"];
const TONO: Record<EstadoOferta, string | undefined> = {
  nada: undefined,
  enviada: undefined,
  no: "warn",
  acepto: "ok",
  perdio: undefined,
};

function Escenario({ s, T, escena }: PropsDeEscenario<Estado, Escena>) {
  return (
    <div className="dm-fac dm-cobro">
      <div className="dm-tel">
        <div className="dm-pantalla">
          <div className="dm-tel-cab">
            <b className="truncate">{T("empresa")}</b>
            <span className="truncate">
              {T(escena === "falta" ? "tel.reserva" : "tel.fueraDeServicio")}
            </span>
          </div>
          <div className="dm-pago">
            {(s.tel === "oferta" || s.tel === "aceptada") && (
              <>
                <div className="dm-pago-t">{T("tel.oferta")}</div>
                <div className="dm-opcion" data-ve="">
                  <CalendarPlus className="h-3.5 w-3.5 flex-none" />
                  <span className="min-w-0">
                    <b className="block truncate">{T("puesto")}</b>
                    <span className="block truncate">{T("tel.horario")}</span>
                    <span className="block truncate">{T("tel.bono")}</span>
                  </span>
                </div>
                <div
                  className="dm-boton"
                  data-hecho={s.tel === "aceptada" ? "" : undefined}
                  data-ve=""
                >
                  {s.tel === "aceptada" ? <Check className="h-4 w-4" /> : null}
                  {T(s.tel === "aceptada" ? "tel.tuyo" : "tel.aceptar")}
                </div>
              </>
            )}
            {(s.tel === "campana" || s.tel === "unido") && (
              <>
                <div className="dm-pago-t">{T("tel.campana")}</div>
                <div className="dm-opcion" data-sel="" data-ve="">
                  <Megaphone className="h-3.5 w-3.5 flex-none" />
                  <span className="min-w-0">
                    <b className="block truncate">{T("campana.titulo")}</b>
                    <span className="block">{T("campana.texto")}</span>
                  </span>
                </div>
                <div
                  className="dm-boton"
                  data-hecho={s.tel === "unido" ? "" : undefined}
                  data-ve=""
                >
                  {s.tel === "unido" ? <Check className="h-4 w-4" /> : null}
                  {T(s.tel === "unido" ? "campana.unido" : "campana.boton")}
                </div>
              </>
            )}
            {s.tel === "inicio" && (
              <div className="dm-pago-t">{T("tel.sinNovedad")}</div>
            )}
          </div>
        </div>
      </div>

      <div className="dm-panel dm-fac-panel">
        {escena === "falta" ? (
          <>
            <div className="dm-panel-cab">
              <span className="truncate">{T("panel.cobertura")}</span>
              <span
                className="dm-sello"
                data-tono={s.cubierto ? "ok" : s.hueco ? "bad" : undefined}
              >
                <Cambia k={String(s.cubierto)}>
                  {T(s.cubierto ? "estado.cubierto" : "estado.sinCubrir")}
                </Cambia>
              </span>
            </div>
            <div
              className="dm-item"
              data-nuevo={s.hueco ? "" : undefined}
              style={{ opacity: s.hueco ? 1 : 0.3 }}
            >
              <Zap
                className="h-3.5 w-3.5 flex-none"
                style={{ color: "var(--warn)" }}
              />
              <span className="txt">{T("puesto")}</span>
              <span className="der">{T("panel.falta")}</span>
            </div>
            <div className="dm-titulito">{T("panel.oleada")}</div>
            {PERSONAS.map((p, i) => {
              const e = s.ofertas[i];

              return e === "nada" ? (
                <div key={p} className="dm-hueco" />
              ) : (
                <div key={p} className="dm-item" data-nuevo="">
                  <span className="dm-av">{T(p).charAt(0)}</span>
                  <span className="txt">{T(p)}</span>
                  <span className="dm-sello" data-tono={TONO[e]}>
                    <Cambia k={e}>{T(`oferta.${e}`)}</Cambia>
                  </span>
                </div>
              );
            })}
            <div
              className="dm-item"
              style={{ opacity: s.bono ? 1 : 0, transition: "opacity 0.4s" }}
            >
              <span className="txt">{T("panel.rol")}</span>
              <span className="der">{T("panel.bono")}</span>
            </div>
          </>
        ) : (
          <>
            <div className="dm-panel-cab">
              <span className="truncate">{T("panel.salud")}</span>
              <span
                className="dm-sello"
                data-tono={s.suplentes >= 2 ? "ok" : "bad"}
              >
                <Cambia k={s.suplentes}>
                  {T("panel.suplentes", { n: s.suplentes })}
                </Cambia>
              </span>
            </div>
            {[
              { k: "puesto", n: s.suplentes },
              { k: "puesto2", n: 5 },
              { k: "puesto3", n: 3 },
            ].map((x) => (
              <div
                key={x.k}
                className="dm-cubeta"
                data-i={x.n < 2 ? "3" : undefined}
              >
                <span className="truncate">{T(x.k)}</span>
                <span className="dm-barra">
                  <span style={{ width: `${Math.min(100, x.n * 20)}%` }} />
                </span>
                <span className="dm-num">
                  {T("panel.suplentes", { n: x.n })}
                </span>
              </div>
            ))}
            <div
              className="dm-boton"
              data-hecho={s.campana ? "" : undefined}
              data-ve=""
            >
              <Megaphone className="h-4 w-4" />
              {T(s.campana ? "panel.campanaLanzada" : "panel.lanzarCampana")}
            </div>
            <div className="dm-kpis">
              <div className="dm-kpi">
                <div className="l">{T("kpi.vistas")}</div>
                <div className="v">
                  <Cambia k={s.altas}>
                    {s.campana ? 18 + s.altas * 9 : 0}
                  </Cambia>
                </div>
              </div>
              <div className="dm-kpi">
                <div className="l">{T("kpi.toques")}</div>
                <div className="v">
                  <Cambia k={s.altas}>{s.altas ? s.altas + 2 : 0}</Cambia>
                </div>
              </div>
              <div className="dm-kpi">
                <div className="l">{T("kpi.altas")}</div>
                <div className="v">
                  <Cambia k={s.altas}>{s.altas}</Cambia>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const ORDEN: Escena[] = ["falta", "banca"];

export default function DemoDobletes() {
  return (
    <DemoDeModulo<Estado, Escena>
      Escenario={Escenario}
      guiones={GUIONES}
      orden={ORDEN}
      prefijo="modulosAdicionales.demos.dobletes"
    />
  );
}
