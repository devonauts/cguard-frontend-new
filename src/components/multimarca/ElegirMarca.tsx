import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { History, Layers, X } from "lucide-react";

import LogoDeMarca from "./LogoDeMarca";

import { useEspacio } from "@/hooks/useEspacio";
import { useEspacioDeMarca, type OpcionDeMarca } from "@/hooks/useMarcas";
import {
  EVENTO_ELEGIR_MARCA,
  hayQuePreguntarLaMarca,
  yaSePreguntoLaMarca,
} from "@/lib/marcaElegida";
import {
  EVENTO_ESPACIO_PREGUNTADO,
  hayQuePreguntarElEspacio,
} from "@/lib/sucursalElegida";

/**
 * «¿CON QUÉ MARCA TRABAJAS AHORA?» — the brand is chosen on entering, once
 * per sign-in, and only by whoever has something to choose (two or more
 * brands). Mirrors `ElegirEspacio` (branches). When both modules are on, the
 * branch question goes first; this one waits until it is answered. It also
 * opens by hand from the phone pill (`abrirSelectorDeMarca`).
 *
 * The last choice saved in the account is marked «La última vez», so on a new
 * device one tap is enough.
 */
export default function ElegirMarca() {
  const { t } = useTranslation();
  const quieto = !!useReducedMotion();
  const { activo, cargado, opciones, actual, guardado, entrar } =
    useEspacioDeMarca();
  const espacio = useEspacio();
  const [abierto, setAbierto] = useState(false);
  const [entrando, setEntrando] = useState<string | null>(null);
  // Bumped when the branch question is answered, to look again.
  const [turno, setTurno] = useState(0);

  useEffect(() => {
    const otraVez = () => setTurno((n) => n + 1);

    window.addEventListener(EVENTO_ESPACIO_PREGUNTADO, otraVez);

    return () => window.removeEventListener(EVENTO_ESPACIO_PREGUNTADO, otraVez);
  }, []);

  // On entering: ask only if there is something to choose, after the branch.
  useEffect(() => {
    if (!activo || !cargado || !hayQuePreguntarLaMarca()) return;
    if (espacio.activo && hayQuePreguntarElEspacio()) return;
    if (opciones.length >= 2) setAbierto(true);
    else yaSePreguntoLaMarca();
  }, [activo, cargado, opciones.length, espacio.activo, turno]);

  // By hand, from the phone pill.
  useEffect(() => {
    const abrir = () => setAbierto(true);

    window.addEventListener(EVENTO_ELEGIR_MARCA, abrir);

    return () => window.removeEventListener(EVENTO_ELEGIR_MARCA, abrir);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };

    window.addEventListener("keydown", tecla);

    return () => window.removeEventListener("keydown", tecla);
  });

  const cerrar = () => {
    yaSePreguntoLaMarca();
    setAbierto(false);
  };

  const elegir = async (o: OpcionDeMarca) => {
    setEntrando(o.id);
    yaSePreguntoLaMarca();
    await entrar(o.id);
    // Same brand: no reload, just close.
    setEntrando(null);
    setAbierto(false);
  };

  const nombre = (o: OpcionDeMarca) =>
    o.todas ? t("ui.SelectorDeMarca.todas", "Todas las marcas") : o.nombre;
  const detalle = (o: OpcionDeMarca) =>
    o.todas
      ? t(
          "ui.ElegirMarca.todasDesc",
          "Los clientes y el personal de todas las marcas.",
        )
      : o.principal
        ? t(
            "ui.ElegirMarca.principalDesc",
            "La marca con la que se creó la cuenta.",
          )
        : t(
            "ui.ElegirMarca.marcaDesc",
            "Solo sus clientes, sus sitios y quienes trabajan en ellos.",
          );

  return (
    <AnimatePresence>
      {abierto && opciones.length >= 2 && (
        <motion.div
          key="elegir-marca"
          animate={{ opacity: 1 }}
          aria-labelledby="elegir-marca-titulo"
          aria-modal="true"
          className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto p-4"
          exit={{ opacity: 0 }}
          initial={quieto ? false : { opacity: 0 }}
          role="dialog"
          style={{
            background: "color-mix(in oklab, var(--canvas) 80%, transparent)",
            backdropFilter: "blur(10px)",
          }}
        >
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="glass relative w-full max-w-2xl p-5 sm:p-7"
            initial={quieto ? false : { opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              aria-label={t("common.close", { defaultValue: "Cerrar" })}
              className="cg-focus absolute right-4 top-4 grid size-8 place-items-center rounded-full"
              style={{ color: "var(--ink-soft)" }}
              type="button"
              onClick={cerrar}
            >
              <X className="size-4" />
            </button>
            <h2
              className="text-xl font-semibold tracking-tight"
              id="elegir-marca-titulo"
            >
              {t("ui.ElegirMarca.titulo", "¿Con qué marca trabajas ahora?")}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              {t(
                "ui.ElegirMarca.subtitulo",
                "Cada marca es una empresa con sus propios clientes. Elige una para ver solo lo suyo, o todas a la vez.",
              )}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {opciones.map((o, i) => {
                const esActual = actual?.id === o.id;
                const ultima = guardado === o.id;
                const tinta = o.todas
                  ? "var(--brand)"
                  : o.color || "var(--ink-faint)";

                return (
                  <motion.button
                    key={o.id}
                    animate={{ opacity: 1, y: 0 }}
                    className={`cg-focus glass-hover group relative flex min-h-[5.5rem] items-start gap-3 overflow-hidden rounded-2xl border p-4 text-left ${o.todas ? "sm:col-span-2" : ""}`}
                    disabled={entrando !== null}
                    initial={quieto ? false : { opacity: 0, y: 10 }}
                    style={{
                      borderColor: esActual ? tinta : "var(--hairline)",
                      background: esActual
                        ? `color-mix(in oklab, ${tinta} 10%, var(--float))`
                        : "var(--float)",
                    }}
                    transition={{
                      duration: 0.35,
                      delay: quieto ? 0 : 0.08 + i * 0.05,
                    }}
                    type="button"
                    onClick={() => elegir(o)}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-1.5"
                      style={{ background: tinta }}
                    />
                    {o.todas ? (
                      <span
                        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl"
                        style={{
                          background:
                            "color-mix(in oklab, var(--brand) 16%, transparent)",
                          color: "var(--brand-text, var(--brand))",
                        }}
                      >
                        <Layers className="size-5" />
                      </span>
                    ) : (
                      <LogoDeMarca
                        className="mt-0.5"
                        color={o.color}
                        logoUrl={o.logoUrl}
                        nombre={o.nombre}
                        size={36}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-semibold">
                          {nombre(o)}
                        </span>
                        {o.codigo && (
                          <span
                            className="text-xs font-medium"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {o.codigo}
                          </span>
                        )}
                        {o.principal && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{
                              background:
                                "color-mix(in oklab, var(--brand) 16%, transparent)",
                              color: "var(--brand-text, var(--brand))",
                            }}
                          >
                            {t("ui.Multimarca.principal", "Principal")}
                          </span>
                        )}
                      </span>
                      <span
                        className="mt-0.5 block text-sm"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {detalle(o)}
                      </span>
                      {(ultima || esActual) && (
                        <span
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          <History className="size-3.5" />
                          {esActual
                            ? t("ui.ElegirMarca.ahora", "Estás aquí")
                            : t("ui.ElegirMarca.ultimaVez", "La última vez")}
                        </span>
                      )}
                    </span>
                  </motion.button>
                );
              })}
            </div>
            <p className="mt-4 text-xs" style={{ color: "var(--ink-faint)" }}>
              {t(
                "ui.ElegirMarca.cambiaCuandoQuieras",
                "Puedes cambiar de marca cuando quieras desde la barra superior.",
              )}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
