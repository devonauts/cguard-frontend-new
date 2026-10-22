import { CheckCircle2, ScanFace, ShieldAlert } from "lucide-react";

import DemoDeModulo, {
  nota,
  type EstadoBase,
  type Guion,
  type PropsDeEscenario,
  type Tono,
} from "./DemoDeModulo";

/**
 * CÓMO FUNCIONA «RECONOCIMIENTO FACIAL».
 *
 * Izquierda, el teléfono del vigilante con la cámara: el óvalo se llena
 * mientras comprueba, pide un gesto al azar y la cara lo hace (gira o
 * parpadea). Derecha, el CRM: los fichajes de hoy y los rostros por aprobar.
 * Tres escenas: un fichaje bueno, alguien que intenta fichar con una foto, y
 * el registro de una cara nueva con su aprobación.
 */
type Escena = "fichaje" | "suplantacion" | "registro";
type Fase = "espera" | "buscando" | "gesto" | "ok" | "falla" | "enviado";

interface Fila {
  h: string;
  k: string;
  tono: Tono;
}
interface Estado extends EstadoBase {
  fase: Fase;
  gesto: string | null;
  progreso: number;
  foto: boolean;
  giro: -1 | 0 | 1;
  parpadea: boolean;
  registro: boolean;
  filas: Fila[];
  aprobacion: "no" | "pendiente" | "aprobado";
}

const base = (): Estado => ({
  hora: "06:57",
  bitacora: [],
  resultado: null,
  fase: "espera",
  gesto: null,
  progreso: 0,
  foto: false,
  giro: 0,
  parpadea: false,
  registro: false,
  filas: [{ h: "06:41", k: "filas.previa", tono: "ok" }],
  aprobacion: "no",
});

const fila = (s: Estado, f: Fila) => {
  s.filas = [...s.filas, f].slice(-3);
};

const GUIONES: Record<Escena, Guion<Estado>> = {
  fichaje: {
    dur: 11000,
    inicio: base,
    pasos: [
      [
        500,
        (s) => {
          s.fase = "buscando";
          s.progreso = 0.2;
          nota(s, "06:57", "pasos.abre");
        },
      ],
      [
        1600,
        (s) => {
          s.fase = "gesto";
          s.gesto = "gestos.izquierda";
          s.progreso = 0.45;
          nota(s, "06:57", "pasos.gesto", "brand");
        },
      ],
      [
        2500,
        (s) => {
          s.giro = -1;
          s.progreso = 0.75;
        },
      ],
      [
        3500,
        (s) => {
          s.giro = 0;
          s.progreso = 1;
        },
      ],
      [
        4100,
        (s) => {
          s.fase = "ok";
          s.hora = "06:58";
          fila(s, { h: "06:58", k: "filas.ok", tono: "ok" });
          nota(s, "06:58", "pasos.ok", "ok");
        },
      ],
      [
        6200,
        (s) => {
          s.resultado = "resultado.fichaje";
        },
      ],
    ],
  },
  suplantacion: {
    dur: 11500,
    inicio: () => ({ ...base(), foto: true, hora: "18:02" }),
    pasos: [
      [
        500,
        (s) => {
          s.fase = "buscando";
          s.progreso = 0.2;
          nota(s, "18:02", "pasos.foto", "warn");
        },
      ],
      [
        1600,
        (s) => {
          s.fase = "gesto";
          s.gesto = "gestos.parpadea";
          s.progreso = 0.3;
          nota(s, "18:02", "pasos.gesto", "brand");
        },
      ],
      [
        3200,
        (s) => {
          s.progreso = 0.32;
        },
      ],
      [
        4300,
        (s) => {
          s.fase = "falla";
          s.progreso = 1;
          fila(s, { h: "18:03", k: "filas.rechazo", tono: "bad" });
          nota(s, "18:03", "pasos.noParpadea", "bad");
        },
      ],
      [
        5400,
        (s) => {
          s.hora = "18:03";
          fila(s, { h: "18:03", k: "filas.aviso", tono: "warn" });
          nota(s, "18:03", "pasos.aviso", "warn");
        },
      ],
      [
        7000,
        (s) => {
          s.resultado = "resultado.suplantacion";
        },
      ],
    ],
  },
  registro: {
    dur: 11000,
    inicio: () => ({ ...base(), registro: true, hora: "09:15" }),
    pasos: [
      [
        500,
        (s) => {
          s.fase = "gesto";
          s.gesto = "gestos.angulos";
          nota(s, "09:15", "pasos.registra");
        },
      ],
      [
        1300,
        (s) => {
          s.giro = -1;
          s.progreso = 0.33;
        },
      ],
      [
        2200,
        (s) => {
          s.giro = 1;
          s.progreso = 0.66;
        },
      ],
      [
        3100,
        (s) => {
          s.giro = 0;
          s.progreso = 1;
        },
      ],
      [
        3700,
        (s) => {
          s.fase = "enviado";
          s.aprobacion = "pendiente";
          nota(s, "09:16", "pasos.pendiente", "warn");
        },
      ],
      [
        5600,
        (s) => {
          s.hora = "09:20";
          s.aprobacion = "aprobado";
          nota(s, "09:20", "pasos.aprobada", "ok");
        },
      ],
      [
        6800,
        (s) => {
          s.resultado = "resultado.registro";
        },
      ],
    ],
  },
};

/** Cabeza y hombros. Los ojos parpadean si `parpadea`. */
function Silueta({ parpadea, foto }: { parpadea: boolean; foto?: boolean }) {
  const piel = foto ? "#94a3b8" : "#9ca3af";

  return (
    <svg aria-hidden viewBox="0 0 100 120">
      <path
        d="M8 120 C 12 92, 34 84, 50 84 C 66 84, 88 92, 92 120 Z"
        fill={foto ? "#64748b" : "#4b5563"}
      />
      <rect fill={piel} height="12" rx="4" width="16" x="42" y="72" />
      <ellipse cx="50" cy="48" fill={piel} rx="23" ry="28" />
      <ellipse
        className="dm-ojo"
        cx="41"
        cy="46"
        data-parpadea={parpadea ? "" : undefined}
        fill="#111827"
        rx="3.2"
        ry="2.4"
      />
      <ellipse
        className="dm-ojo"
        cx="59"
        cy="46"
        data-parpadea={parpadea ? "" : undefined}
        fill="#111827"
        rx="3.2"
        ry="2.4"
      />
      <path
        d="M42 61 Q50 66 58 61"
        fill="none"
        stroke="#111827"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function Escenario({ s, T, quieto }: PropsDeEscenario<Estado, Escena>) {
  const color =
    s.fase === "ok"
      ? "var(--ok)"
      : s.fase === "falla"
        ? "var(--bad)"
        : s.fase === "enviado"
          ? "var(--ok)"
          : "var(--brand)";
  const aviso =
    s.fase === "ok"
      ? { k: "tel.ok", tono: "ok" as Tono }
      : s.fase === "falla"
        ? { k: "tel.falla", tono: "bad" as Tono }
        : s.fase === "enviado"
          ? { k: "tel.listo", tono: "ok" as Tono }
          : s.gesto
            ? { k: s.gesto, tono: "brand" as Tono }
            : { k: "tel.buscando", tono: "" as Tono };
  const escaneando = !quieto && (s.fase === "buscando" || s.fase === "gesto");
  /* Una cara de verdad parpadea cuando se le pide; una foto, nunca. */
  const parpadea =
    !s.foto && s.gesto === "gestos.parpadea" && s.fase === "gesto";

  return (
    <div className="dm-fac">
      <div className="dm-tel">
        <div className="dm-pantalla">
          <div className="dm-tel-cab">
            <b>{T(s.registro ? "tel.registro" : "tel.inicio")}</b>
            <span>{T("tel.puesto")}</span>
          </div>
          <div className="dm-camara">
            {s.foto ? (
              <div className="dm-foto">
                <Silueta foto parpadea={false} />
              </div>
            ) : (
              <div
                className="dm-cara"
                style={{ transform: `rotateY(${s.giro * 32}deg)` }}
              >
                <Silueta parpadea={parpadea} />
              </div>
            )}
            <svg
              aria-hidden
              className="dm-aro"
              preserveAspectRatio="none"
              viewBox="0 0 120 160"
            >
              <ellipse
                cx="60"
                cy="80"
                fill="none"
                rx="52"
                ry="72"
                stroke="rgb(255 255 255 / 0.15)"
                strokeWidth="3"
              />
              <ellipse
                cx="60"
                cy="80"
                fill="none"
                pathLength={100}
                rx="52"
                ry="72"
                stroke={color}
                strokeDasharray={`${Math.round(s.progreso * 100)} 100`}
                strokeLinecap="round"
                strokeWidth="3.5"
                transform="rotate(-90 60 80)"
              />
            </svg>
            {escaneando && <span className="dm-escaneo" />}
          </div>
          <div className="dm-aviso" data-tono={aviso.tono}>
            {T(aviso.k)}
          </div>
        </div>
      </div>

      <div className="dm-panel dm-fac-panel">
        <div className="dm-panel-cab">
          <span className="inline-flex items-center gap-2">
            <ScanFace
              className="h-4 w-4"
              style={{ color: "var(--brand-text, var(--brand))" }}
            />
            {T("panel")}
          </span>
          <span
            className="dm-sello"
            data-tono={s.fase === "falla" ? "bad" : "ok"}
          >
            {s.fase === "falla" ? (
              <ShieldAlert className="h-3 w-3" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            {T(s.fase === "falla" ? "sello.alerta" : "sello.protegido")}
          </span>
        </div>
        {/* Tres filas, siempre: las que faltan quedan como hueco. */}
        {[0, 1, 2].map((i) => {
          const f = s.filas[i];

          return f ? (
            <div key={`${f.h}-${f.k}`} className="dm-item" data-nuevo="">
              <span className="dm-punto" data-tono={f.tono} />
              <span className="txt">{T(f.k)}</span>
              <span className="der">{f.h}</span>
            </div>
          ) : (
            <div key={`h${i}`} className="dm-hueco" />
          );
        })}
        <div className="dm-titulito mt-1">{T("aprobar")}</div>
        {s.aprobacion === "no" ? (
          <div className="dm-hueco" />
        ) : (
          <div className="dm-item" data-nuevo="">
            <span className="dm-av">A</span>
            <span className="txt">{T("aprobacion.ana")}</span>
            <span
              key={s.aprobacion}
              className="dm-sello dm-cifra"
              data-tono={s.aprobacion === "aprobado" ? "ok" : "warn"}
            >
              {T(`aprobacion.${s.aprobacion}`)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const ORDEN: Escena[] = ["fichaje", "suplantacion", "registro"];

export default function DemoReconocimientoFacial() {
  return (
    <DemoDeModulo<Estado, Escena>
      Escenario={Escenario}
      guiones={GUIONES}
      orden={ORDEN}
      prefijo="modulosAdicionales.demos.facial"
    />
  );
}
