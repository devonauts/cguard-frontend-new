import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "framer-motion";

import { Segmented } from "@/components/kit";

import "./DemoDeModulo.css";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL MOTOR DE LAS DEMOSTRACIONES DE LA TIENDA (2026-10-21)
 *
 * Mike: «quiero que hagas así mismo animación para todos los módulos que
 * ofrecemos». VigIA Pro ya tenía la suya (`ComoFuncionaVigiaPro`); las demás
 * (Sucursales, Reconocimiento facial, Roles de pago) usan este motor, que
 * copia sus reglas para que todas se sientan iguales:
 *
 *   · Cada escena es un guion `[ms, paso]`. Lo que se ve en un instante es el
 *     estado inicial con los pasos vencidos aplicados encima: determinista,
 *     sin restos al cambiar de escena.
 *   · El reloj es un temporizador de 100 ms (no fotogramas: algunos visores
 *     los frenan) que se detiene con la pestaña oculta o la escena fuera de la
 *     vista. Al terminar una escena pasa sola a la siguiente.
 *   · ALTO FIJO: el escenario mide siempre lo mismo (ver el CSS) y la bitácora
 *     enseña sus últimas 4 líneas en una caja de alto constante. Nada empuja
 *     lo de abajo mientras corre.
 *   · Con «reducir movimiento» la historia sigue avanzando paso a paso; sólo
 *     se quitan deslizamientos y latidos.
 *
 * Todo es ficticio: nombres, lugares y cifras viven en las traducciones,
 * bajo `prefijo`.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type Tono = "" | "bad" | "warn" | "ok" | "brand";
export interface Nota {
  h: string;
  k: string;
  tono: Tono;
}
export interface EstadoBase {
  hora: string;
  bitacora: Nota[];
  /** Clave (bajo `prefijo`) del cartel final, o null mientras no toca. */
  resultado: string | null;
}
export interface Guion<E extends EstadoBase> {
  dur: number;
  inicio: () => E;
  pasos: Array<[number, (s: E) => void]>;
}

export const nota = (s: EstadoBase, h: string, k: string, tono: Tono = "") => {
  s.bitacora = [...s.bitacora, { h, k, tono }];
};

export type Traducir = (k: string, o?: Record<string, unknown>) => string;

export interface PropsDeEscenario<E, K extends string> {
  s: E;
  escena: K;
  T: Traducir;
  quieto: boolean;
}

const TIC = 100;
const FILAS_BITACORA = 4;

export default function DemoDeModulo<E extends EstadoBase, K extends string>({
  prefijo,
  guiones,
  orden,
  Escenario,
  rotulo = "modulosAdicionales.demo.hora",
}: {
  /** Clave del rótulo del reloj («Hora»; «Fecha» en los roles de pago). */
  rotulo?: string;
  prefijo: string;
  guiones: Record<K, Guion<E>>;
  orden: K[];
  Escenario: ComponentType<PropsDeEscenario<E, K>>;
}) {
  const { t } = useTranslation();
  const quieto = !!useReducedMotion();
  const T: Traducir = (k, o) => String(t(`${prefijo}.${k}`, o as any));

  const [escena, setEscena] = useState<K>(orden[0]);
  const [ms, setMs] = useState(0);
  const guion = guiones[escena];
  const vencidos = guion.pasos.filter(([cuando]) => cuando <= ms).length;
  const s = useMemo(() => {
    const e = guion.inicio();

    guion.pasos.slice(0, vencidos).forEach(([, paso]) => paso(e));

    return e;
  }, [guion, vencidos]);

  const escenario = useRef<HTMLDivElement | null>(null);
  const enVista = useRef(true);

  /* Fuera de la vista se detiene donde está; arranca visible por omisión. */
  useEffect(() => {
    const el = escenario.current;

    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([en]) => {
      enVista.current = en.isIntersecting;
    });

    io.observe(el);

    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || !enVista.current) return;
      setMs((x) => x + TIC);
    }, TIC);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (ms < guion.dur) return;
    setEscena((e) => orden[(orden.indexOf(e) + 1) % orden.length]);
    setMs(0);
  }, [ms, guion.dur, orden]);

  const cambiar = (e: K) => {
    setEscena(e);
    setMs(0);
  };

  return (
    <div className="dm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {t(rotulo)}{" "}
          <b className="text-base tabular-nums" style={{ color: "var(--ink)" }}>
            {s.hora}
          </b>
        </span>
        <Segmented<K>
          options={orden.map((k) => ({ value: k, label: T(`escenas.${k}`) }))}
          value={escena}
          onChange={cambiar}
        />
      </div>

      <div ref={escenario} className="dm-stage">
        <Escenario T={T} escena={escena} quieto={quieto} s={s} />
        <div
          aria-live="polite"
          className="dm-resultado"
          data-ve={s.resultado ? "" : undefined}
        >
          {s.resultado && <b>{T(s.resultado)}</b>}
        </div>
      </div>

      <div className="mt-4">
        <div
          className="mb-2 text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--ink-faint)" }}
        >
          {t("modulosAdicionales.demo.enTuCrm")}
        </div>
        <ol className="dm-bitacora">
          {s.bitacora.slice(-FILAS_BITACORA).map((n) => (
            <li key={`${escena}-${n.k}`}>
              <span className="h">{n.h}</span>
              <span className="p" data-tono={n.tono} />
              <span className="min-w-0">{T(n.k)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
          {t("modulosAdicionales.demo.ficticio")}
        </p>
      </div>
    </div>
  );
}

/** Un plano de calles inventado, el mismo de la demostración de VigIA Pro. */
export function Plano() {
  const manzanas = useMemo(() => {
    let semilla = 11;
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
      className="dm-mapa"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1000 620"
    >
      <g transform="rotate(-9 500 310)">
        <rect
          fill="var(--dm-road)"
          height="1860"
          width="3000"
          x="-1000"
          y="-620"
        />
        {manzanas.map((m, i) => (
          <rect
            key={i}
            fill={m.parque ? "var(--dm-park)" : "var(--dm-block)"}
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
          stroke="var(--dm-water)"
          strokeLinecap="round"
          strokeWidth={26}
        />
      </g>
    </svg>
  );
}

/** Un valor que cambia: el nuevo entra subiendo. */
export function Cambia({
  k,
  children,
}: {
  k: string | number;
  children: React.ReactNode;
}) {
  return (
    <span key={k} className="dm-cifra">
      {children}
    </span>
  );
}
