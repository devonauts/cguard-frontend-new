import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "framer-motion";

import { Segmented } from "@/components/kit";
import { useAgente } from "@/lib/agenteDeMarca";
import { useAppDelCliente } from "@/lib/appDelCliente";

import "./ComoFuncionaVigiaPro.css";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CÓMO FUNCIONA {{agente}} PRO — la demostración que vende el módulo
 *
 * Diseño aprobado por el dueño (2026-10-07): dos teléfonos —el vigilante que
 * falta y el relevo— con el asistente en medio, sobre un plano de calles donde
 * el puesto pasa de rojo a ámbar a verde. Cada mensaje viaja como un pulso
 * entre el asistente y un teléfono, y debajo queda la bitácora del panel.
 * Tres escenas que se encadenan solas: faltas y relevos, partes, WhatsApp del
 * vigilante.
 *
 * ── CÓMO AVANZA ──────────────────────────────────────────────────────────
 * Cada escena es un guion de pasos `[ms, paso]`. Lo que se ve en un instante
 * es el estado inicial con los pasos ya vencidos aplicados encima (`aplicar`):
 * determinista, sin restos al cambiar de escena. El reloj es un temporizador de
 * 100 ms —no fotogramas: algunos visores los frenan— y sólo se detiene con la
 * pestaña oculta o la escena fuera de la vista. Arranca solo; nunca espera a
 * que «se vea lo bastante».
 *
 * Con «reducir movimiento» la historia sigue avanzando paso a paso: sólo se
 * quitan deslizamientos, latidos y pulsos (el CSS y `quieto`).
 *
 * Todo es ficticio: nombres, lugares y horas viven en las traducciones. El
 * asistente lleva el nombre de la empresa (`useAgente`): en el CRM de un socio
 * nunca dice «VigIA».
 * ════════════════════════════════════════════════════════════════════════════
 */

type Escena = "faltas" | "partes" | "vigilantes";
type Tono = "" | "bad" | "warn" | "ok" | "brand";
type Punto = "orbe" | "a" | "b";

interface Mensaje {
  lado: "in" | "out";
  h: string;
  k?: string;
  voz?: string;
}
type Pantalla =
  | { tipo: "chat"; msgs: Mensaje[]; escribe: boolean }
  | { tipo: "parte"; desde: number | null; enviar: boolean }
  | { tipo: "portal" | "supervisor"; ficha: boolean };

interface Libre {
  x: number;
  y: number;
  k: string;
  ve: boolean;
  elegido: boolean;
}

interface Estado {
  a: Pantalla;
  b: Pantalla;
  tono: Tono;
  estado: string;
  hora: string;
  pensar: string | null;
  bitacora: { h: string; k: string; tono: Tono }[];
  libres: Libre[];
  resultado: boolean;
  late: string | null;
  pulso: { id: string; de: Punto; a: Punto } | null;
}

type Paso = (s: Estado, id: string) => void;

const chat = (): Pantalla => ({ tipo: "chat", msgs: [], escribe: false });
const msg = (p: Pantalla, m: Mensaje) => {
  if (p.tipo !== "chat") return;
  p.escribe = false;
  p.msgs = [...p.msgs, m].slice(-5);
};
const escribe = (p: Pantalla) => {
  if (p.tipo === "chat") p.escribe = true;
};
const nota = (s: Estado, h: string, k: string, tono: Tono = "") => {
  s.bitacora = [...s.bitacora, { h, k, tono }];
};

/* El puesto vive aquí, en % del centro. El relevo elegido camina hasta él. */
const PUESTO = { x: 50, y: 68 };

const ESCENAS: Record<
  Escena,
  { dur: number; inicio: () => Estado; pasos: [number, Paso][] }
> = {
  faltas: {
    dur: 15500,
    inicio: () => ({
      a: chat(),
      b: chat(),
      tono: "",
      estado: "estado.inicio",
      hora: "06:00",
      pensar: null,
      bitacora: [],
      libres: [
        { x: 22, y: 86, k: "libres.a", ve: false, elegido: false },
        { x: 80, y: 90, k: "libres.b", ve: false, elegido: false },
        { x: 72, y: 46, k: "libres.c", ve: false, elegido: false },
      ],
      resultado: false,
      late: null,
      pulso: null,
    }),
    pasos: [
      [
        700,
        (s) => {
          s.hora = "06:10";
          s.tono = "bad";
          s.estado = "estado.sinMarcar";
          nota(s, "06:10", "pasos.noFicho", "bad");
        },
      ],
      [
        1700,
        (s, id) => {
          s.late = id;
          s.pensar = "pensar.escribe";
          s.pulso = { id, de: "orbe", a: "a" };
        },
      ],
      [2300, (s) => escribe(s.a)],
      [
        3100,
        (s) => {
          msg(s.a, { lado: "in", k: "chat.luis1", h: "06:10" });
          nota(s, "06:10", "pasos.escribe", "brand");
        },
      ],
      [
        4700,
        (s, id) => {
          msg(s.a, { lado: "out", k: "chat.luis2", h: "06:11" });
          s.pulso = { id, de: "a", a: "orbe" };
        },
      ],
      [
        5700,
        (s, id) => {
          s.late = id;
          s.pensar = "pensar.noViene";
          s.tono = "warn";
          s.estado = "estado.buscando";
          nota(s, "06:11", "pasos.falta", "warn");
        },
      ],
      [
        6500,
        (s) => {
          s.libres = s.libres.map((l) => ({ ...l, ve: true }));
          nota(s, "06:12", "pasos.buscaRelevo", "brand");
        },
      ],
      [
        7300,
        (s, id) => {
          s.pulso = { id, de: "orbe", a: "b" };
        },
      ],
      [7900, (s) => escribe(s.b)],
      [8600, (s) => msg(s.b, { lado: "in", k: "chat.pedro1", h: "06:12" })],
      [
        10000,
        (s, id) => {
          s.hora = "06:16";
          msg(s.b, { lado: "out", k: "chat.pedro2", h: "06:16" });
          s.pulso = { id, de: "b", a: "orbe" };
        },
      ],
      [
        11000,
        (s, id) => {
          s.late = id;
          s.pensar = null;
          s.tono = "ok";
          s.estado = "estado.cubierto";
          s.libres = s.libres.map((l, i) =>
            i === 1 ? { ...l, ...PUESTO, elegido: true } : { ...l, ve: false },
          );
          nota(s, "06:16", "pasos.relevo", "ok");
        },
      ],
      [
        12100,
        (s) => {
          nota(s, "06:16", "pasos.supervisor");
          msg(s.b, { lado: "in", k: "chat.gracias", h: "06:16" });
        },
      ],
      [
        12700,
        (s) => {
          s.resultado = true;
        },
      ],
    ],
  },
  partes: {
    dur: 14000,
    inicio: () => ({
      a: { tipo: "parte", desde: null, enviar: false },
      b: { tipo: "portal", ficha: false },
      tono: "warn",
      estado: "estado.abierta",
      hora: "03:12",
      pensar: null,
      bitacora: [],
      libres: [],
      resultado: false,
      late: null,
      pulso: null,
    }),
    pasos: [
      [
        300,
        (s) => {
          if (s.a.tipo === "parte") s.a.desde = 300;
        },
      ],
      [
        2600,
        (s) => {
          if (s.a.tipo === "parte") s.a.enviar = true;
        },
      ],
      [
        3000,
        (s, id) => {
          s.pulso = { id, de: "a", a: "orbe" };
          nota(s, "03:14", "pasos.sube");
        },
      ],
      [
        3900,
        (s, id) => {
          s.late = id;
          s.pensar = "pensar.corrige";
        },
      ],
      [4900, (s) => nota(s, "03:14", "pasos.corrige", "brand")],
      [
        5800,
        (s) => {
          s.pensar = "pensar.traduce";
          nota(s, "03:14", "pasos.faltaDato", "warn");
        },
      ],
      [
        6800,
        (s, id) => {
          s.late = id;
          s.pulso = { id, de: "orbe", a: "b" };
          s.tono = "ok";
          s.estado = "estado.enviado";
        },
      ],
      [
        7700,
        (s) => {
          if (s.b.tipo === "portal") s.b.ficha = true;
          nota(s, "03:15", "pasos.traduce", "ok");
        },
      ],
      [
        9200,
        (s) => {
          s.pensar = null;
          nota(s, "mes", "pasos.resumen");
        },
      ],
      [
        9900,
        (s) => {
          s.resultado = true;
        },
      ],
    ],
  },
  vigilantes: {
    dur: 15000,
    inicio: () => ({
      a: chat(),
      b: { tipo: "supervisor", ficha: false },
      tono: "",
      estado: "estado.manana",
      hora: "21:40",
      pensar: null,
      bitacora: [],
      libres: [],
      resultado: false,
      late: null,
      pulso: null,
    }),
    pasos: [
      [
        500,
        (s, id) => {
          msg(s.a, { lado: "out", k: "chat.ana1", h: "21:40" });
          s.pulso = { id, de: "a", a: "orbe" };
        },
      ],
      [
        1500,
        (s, id) => {
          s.late = id;
          s.pensar = "pensar.horario";
        },
      ],
      [2200, (s) => escribe(s.a)],
      [
        2900,
        (s) => {
          msg(s.a, { lado: "in", k: "chat.ana2", h: "21:40" });
          s.tono = "ok";
          s.estado = "estado.ok";
          nota(s, "21:40", "pasos.suHorario", "brand");
        },
      ],
      [
        4500,
        (s, id) => {
          msg(s.a, { lado: "out", voz: "0:04", h: "21:41" });
          s.pulso = { id, de: "a", a: "orbe" };
        },
      ],
      [
        5500,
        (s, id) => {
          s.late = id;
          s.pensar = "pensar.voz";
          nota(s, "21:41", "pasos.voz");
        },
      ],
      [6300, (s) => escribe(s.a)],
      [
        7000,
        (s) => {
          msg(s.a, { lado: "in", k: "chat.ana4", h: "21:41" });
          nota(s, "21:41", "pasos.pideSi", "warn");
        },
      ],
      [
        8500,
        (s, id) => {
          msg(s.a, { lado: "out", k: "chat.ana5", h: "21:42" });
          s.pulso = { id, de: "a", a: "orbe" };
        },
      ],
      [
        9400,
        (s, id) => {
          s.late = id;
          s.pensar = null;
          s.pulso = { id, de: "orbe", a: "b" };
        },
      ],
      [
        10300,
        (s) => {
          if (s.b.tipo === "supervisor") s.b.ficha = true;
          msg(s.a, { lado: "in", k: "chat.ana6", h: "21:42" });
          nota(s, "21:42", "pasos.enviada", "ok");
        },
      ],
      [
        11200,
        (s) => {
          s.resultado = true;
        },
      ],
    ],
  },
};

const ORDEN: Escena[] = ["faltas", "partes", "vigilantes"];

/* La placa del asistente: «IA» para VigIA, «AI» para Vigia AI; con el nombre
   de un socio, la del idioma de quien mira. */
function placaDe(agente: string, idioma: string): string {
  if (/\bAI$/.test(agente.trim())) return "AI";
  if (agente.trim() === "VigIA") return "IA";

  return /^(es|pt|fr|it)/i.test(idioma) ? "IA" : "AI";
}
const TIC = 100;
/** Líneas de bitácora a la vista: la caja mide SIEMPRE estas cuatro, llenas o no.
    Antes crecía de 0 a 7 filas y se vaciaba con cada escena, y la tarjeta de la
    tienda cambiaba de alto cada pocos segundos. */
const FILAS_BITACORA = 4;

/** El estado de la escena con sus `k` primeros pasos aplicados. */
function aplicar(escena: Escena, k: number): Estado {
  const s = ESCENAS[escena].inicio();

  ESCENAS[escena].pasos
    .slice(0, k)
    .forEach(([, paso], i) => paso(s, `${escena}-${i}`));

  return s;
}

/** Un plano de calles inventado: manzanas, un parque, un canal y una avenida. */
function Plano() {
  const manzanas = useMemo(() => {
    let semilla = 7;
    const azar = () => (semilla = (semilla * 9301 + 49297) % 233280) / 233280;
    const cols: [number, number][] = [];
    const filas: [number, number][] = [];

    for (let x = -300, i = 0; x < 1300; i++) {
      const a = 58 + azar() * 70;

      cols.push([x, a]);
      x += a + (i % 4 === 3 ? 16 : 9);
    }
    for (let y = -200, i = 0; y < 820; i++) {
      const a = 46 + azar() * 56;

      filas.push([y, a]);
      y += a + (i % 3 === 2 ? 16 : 9);
    }

    return cols.flatMap(([x, w], ci) =>
      filas.map(([y, h], fi) => ({
        x,
        y,
        w,
        h,
        parque: ci % 7 === 4 && fi % 5 === 2,
      })),
    );
  }, []);

  return (
    <svg
      aria-hidden
      className="cfv-mapa"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1000 620"
    >
      <g transform="rotate(-9 500 310)">
        <rect
          fill="var(--cfv-road)"
          height="1860"
          width="3000"
          x="-1000"
          y="-620"
        />
        {manzanas.map((m, i) => (
          <rect
            key={i}
            fill={m.parque ? "var(--cfv-park)" : "var(--cfv-block)"}
            height={m.h}
            rx={5}
            width={m.w}
            x={m.x}
            y={m.y}
          />
        ))}
        <path
          d="M -200 570 C 250 430, 550 650, 1200 480"
          fill="none"
          stroke="var(--cfv-water)"
          strokeLinecap="round"
          strokeWidth={26}
        />
        <path
          d="M -100 60 L 1100 370"
          fill="none"
          stroke="var(--cfv-road)"
          strokeWidth={14}
        />
      </g>
    </svg>
  );
}

export default function ComoFuncionaVigiaPro({
  className,
}: {
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const agente = useAgente().nombre;
  /* The customer app on the demo phone: the host's name, never ours on a
     partner's host (a neutral label when the partner has none). */
  const appDelCliente = useAppDelCliente() || t("ui.ClientPortal.appMovilDelCliente");
  const placa = placaDe(agente, i18n.language || "");
  const quieto = !!useReducedMotion();

  const [escena, setEscena] = useState<Escena>("faltas");
  const [ms, setMs] = useState(0);
  const guion = ESCENAS[escena];
  const vencidos = guion.pasos.filter(([cuando]) => cuando <= ms).length;
  const s = useMemo(() => aplicar(escena, vencidos), [escena, vencidos]);

  const stage = useRef<HTMLDivElement | null>(null);
  const orbe = useRef<HTMLDivElement | null>(null);
  const telA = useRef<HTMLDivElement | null>(null);
  const telB = useRef<HTMLDivElement | null>(null);
  const hilos = useRef<SVGSVGElement | null>(null);
  const enVista = useRef(true);

  const cambiar = (e: Escena) => {
    setEscena(e);
    setMs(0);
  };

  /* Fuera de la vista se detiene donde está; arranca visible por omisión. */
  useEffect(() => {
    const el = stage.current;

    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([en]) => {
      enVista.current = en.isIntersecting;
    });

    io.observe(el);

    return () => io.disconnect();
  }, []);

  /* El reloj. Al terminar una escena, pasa a la siguiente. */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || !enVista.current) return;
      setMs((x) => x + TIC);
    }, TIC);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (ms < guion.dur) return;
    setEscena((e) => ORDEN[(ORDEN.indexOf(e) + 1) % ORDEN.length]);
    setMs(0);
  }, [ms, guion.dur]);

  /* El pulso que lleva un mensaje: una curva del asistente a un teléfono (o al revés). */
  const pulso = s.pulso;

  useEffect(() => {
    if (!pulso || quieto) return;
    const svg = hilos.current;
    const caja = stage.current?.getBoundingClientRect();
    const sitio = (p: Punto): [number, number] | null => {
      const el =
        p === "orbe" ? orbe.current : p === "a" ? telA.current : telB.current;
      const r = el?.getBoundingClientRect();

      if (!r || !caja) return null;
      const x =
        p === "orbe" ? r.left + r.width / 2 : p === "a" ? r.right : r.left;
      const y = p === "orbe" ? r.top + r.height / 2 : r.top + r.height * 0.45;

      return [x - caja.left, y - caja.top];
    };
    const desde = sitio(pulso.de);
    const hasta = sitio(pulso.a);

    if (!svg || !caja || !desde || !hasta) return;
    svg.setAttribute("viewBox", `0 0 ${caja.width} ${caja.height}`);
    const NS = "http://www.w3.org/2000/svg";
    const curva = document.createElementNS(NS, "path");
    const bola = document.createElementNS(NS, "circle");
    const cy = Math.min(desde[1], hasta[1]) - 60;

    curva.setAttribute(
      "d",
      `M ${desde[0]} ${desde[1]} Q ${(desde[0] + hasta[0]) / 2} ${cy} ${hasta[0]} ${hasta[1]}`,
    );
    curva.setAttribute("fill", "none");
    curva.setAttribute("stroke", "var(--brand)");
    curva.setAttribute("stroke-width", "2");
    curva.setAttribute("stroke-dasharray", "4 6");
    bola.setAttribute("r", "6");
    bola.setAttribute("fill", "var(--brand)");
    bola.setAttribute("stroke", "var(--float)");
    bola.setAttribute("stroke-width", "2");
    svg.append(curva, bola);
    const largo = curva.getTotalLength();
    const t0 = performance.now();
    let marco = 0;
    const paso = (ahora: number) => {
      const k = Math.min(1, (ahora - t0) / 900);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const q = curva.getPointAtLength(largo * e);

      bola.setAttribute("cx", String(q.x));
      bola.setAttribute("cy", String(q.y));
      if (k < 1) marco = requestAnimationFrame(paso);
      else bola.remove();
    };

    marco = requestAnimationFrame(paso);
    const borrar = setTimeout(() => curva.remove(), 1300);

    return () => {
      cancelAnimationFrame(marco);
      clearTimeout(borrar);
      curva.remove();
      bola.remove();
    };
  }, [pulso?.id, quieto]);

  const T = (k: string) =>
    t(`vigiaPro.demo.${escena}.${k}`, { agente, app: appDelCliente });

  return (
    <div className={`cfv ${className ?? ""}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--ink-faint)" }}
        >
          {t("vigiaPro.demo.titulo", { agente })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t("vigiaPro.demo.horaDelPuesto")}{" "}
            <b
              className="text-base tabular-nums"
              style={{ color: "var(--ink)" }}
            >
              {s.hora}
            </b>
          </span>
          <Segmented<Escena>
            options={ORDEN.map((e) => ({
              value: e,
              label: t(`vigiaPro.demo.escenas.${e}`),
            }))}
            value={escena}
            onChange={cambiar}
          />
        </div>
      </div>

      <div ref={stage} className="cfv-stage">
        <Plano />
        <div className="cfv-cuadro">
          <figure className="cfv-lado">
            <div ref={telA} className="cfv-tel">
              <Telefono
                T={T}
                agente={agente}
                enLinea={t("vigiaPro.demo.enLinea")}
                ms={ms}
                p={s.a}
                placa={placa}
              />
            </div>
            <figcaption>{T("telA")}</figcaption>
          </figure>

          <div className="cfv-centro">
            <div className="cfv-nucleo">
              <div
                key={s.late ?? "quieto"}
                ref={orbe}
                className="cfv-orbe"
                data-late={s.late && !quieto ? "" : undefined}
              >
                {placa}
              </div>
              <div className="cfv-nombre">{agente}</div>
              <div className="cfv-pensando">{s.pensar ? T(s.pensar) : ""}</div>
            </div>

            {s.libres.map((l) => (
              <div
                key={l.k}
                className="cfv-libre"
                data-elegido={l.elegido ? "" : undefined}
                data-ve={l.ve ? "" : undefined}
                style={{ left: `${l.x}%`, top: `${l.y}%` }}
              >
                <span className="cfv-ini">{T(l.k)}</span>
              </div>
            ))}

            <div
              className="cfv-puesto"
              data-tono={s.tono}
              style={{ left: `${PUESTO.x}%`, top: `${PUESTO.y}%` }}
            >
              <div className="cfv-etiqueta">
                <div className="cfv-lugar">{T("lugar")}</div>
                <div className="cfv-estado">
                  <span className="cfv-punto" />
                  <span>{T(s.estado)}</span>
                </div>
              </div>
              <div className="cfv-chincheta" />
              <div className="cfv-halo" />
            </div>

            <div
              aria-live="polite"
              className="cfv-resultado"
              data-ve={s.resultado ? "" : undefined}
            >
              {s.resultado && <b>{T("resultado")}</b>}
            </div>
          </div>

          <figure className="cfv-lado">
            <div ref={telB} className="cfv-tel">
              <Telefono
                T={T}
                agente={agente}
                enLinea={t("vigiaPro.demo.enLinea")}
                ms={ms}
                p={s.b}
                placa={placa}
              />
            </div>
            <figcaption>{T("telB")}</figcaption>
          </figure>
        </div>
        <svg ref={hilos} aria-hidden className="cfv-hilos" />
      </div>

      <div className="mt-4">
        <div
          className="mb-2 text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--ink-faint)" }}
        >
          {t("vigiaPro.demo.enTuCrm")}
        </div>
        <ol className="cfv-bitacora">
          {s.bitacora.slice(-FILAS_BITACORA).map((n) => (
            <li key={`${escena}-${n.k}`}>
              <span className="h">
                {n.h === "mes" ? t("vigiaPro.demo.mes") : n.h}
              </span>
              <span className="p" data-tono={n.tono} />
              <span className="min-w-0">{T(n.k)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
          {t("vigiaPro.demo.nota")}
        </p>
      </div>
    </div>
  );
}

/** Una pantalla del teléfono: WhatsApp, el parte que se escribe, el portal del cliente o el supervisor. */
function Telefono({
  p,
  T,
  agente,
  enLinea,
  ms,
  placa,
}: {
  p: Pantalla;
  T: (k: string) => string;
  agente: string;
  enLinea: string;
  ms: number;
  placa: string;
}) {
  if (p.tipo === "chat") {
    return (
      <div className="cfv-pantalla">
        <div className="cfv-cab">
          <div className="cfv-av">{placa}</div>
          <div className="min-w-0">
            <div className="n">{agente}</div>
            <div className="s">{enLinea}</div>
          </div>
        </div>
        <div className="cfv-chat">
          {p.msgs.map((m, i) => (
            <div
              key={`${m.h}-${m.k ?? m.voz}-${i}`}
              className="cfv-msg"
              data-lado={m.lado}
            >
              {m.voz ? (
                <span className="flex items-center gap-2">
                  <span aria-hidden>▶</span>
                  <span aria-hidden className="cfv-voz">
                    {Array.from({ length: 20 }, (_, j) => (
                      <i
                        key={j}
                        style={{
                          height:
                            4 + Math.round(Math.abs(Math.sin(j * 1.7)) * 12),
                        }}
                      />
                    ))}
                  </span>
                  <span>{m.voz}</span>
                </span>
              ) : (
                T(m.k!)
              )}
              <span className="cfv-meta">
                {m.h}
                {m.lado === "out" && <span className="cfv-ticks">✓✓</span>}
              </span>
            </div>
          ))}
          {p.escribe && (
            <div aria-hidden className="cfv-escribe">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (p.tipo === "parte") {
    const texto = T("parte.antes");
    const n =
      p.desde === null
        ? 0
        : Math.min(
            texto.length,
            Math.round(((ms - p.desde) / 2000) * texto.length),
          );

    return (
      <div className="cfv-pantalla">
        <div className="cfv-cab">
          <div className="min-w-0">
            <div className="n">{T("app.nuevo")}</div>
            <div className="s">{T("app.ronda")}</div>
          </div>
        </div>
        <div className="cfv-app">
          <div className="cfv-campo">
            {texto.slice(0, n)}
            {!p.enviar && <span className="cfv-cursor" />}
          </div>
          <div className="cfv-enviar" data-on={p.enviar ? "" : undefined}>
            {T("app.enviar")}
          </div>
        </div>
      </div>
    );
  }

  const portal = p.tipo === "portal";

  return (
    <div className="cfv-pantalla">
      <div className="cfv-cab">
        <div className="min-w-0">
          <div className="n">{T(portal ? "app.portal" : "app.supervisor")}</div>
          <div className="s">{T(portal ? "app.cliente" : "app.quien")}</div>
        </div>
      </div>
      <div className="cfv-app">
        {!p.ficha ? (
          <div className="cfv-vacio">{T("app.vacio")}</div>
        ) : portal ? (
          <div className="cfv-ficha">
            <span className="cfv-chip" data-brand="">
              {T("app.traducido")}
            </span>
            <div className="t">{T("parte.tituloTraducido")}</div>
            {T("parte.traducido")}
          </div>
        ) : (
          <div className="cfv-ficha">
            <span className="cfv-chip">{T("app.chip")}</span>
            <div className="t">{T("app.solicitud")}</div>
            {T("app.via")}
            <div className="cfv-acciones">
              <span>{T("app.aprobar")}</span>
              <span>{T("app.rechazar")}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
