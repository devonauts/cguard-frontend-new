import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Building2, Globe2, History, X } from "lucide-react";

import { useEspacio, type OpcionDeEspacio } from "@/hooks/useEspacio";
import {
  EVENTO_ELEGIR_ESPACIO,
  hayQuePreguntarElEspacio,
  yaSePreguntoElEspacio,
} from "@/lib/sucursalElegida";

/**
 * «¿DÓNDE TRABAJAS AHORA?» — el espacio se elige al entrar (Sucursales 2.0,
 * fase 2).
 *
 * Mike (2026-10-21): «al iniciar sesión como principal escojo si entrar a la
 * cuenta principal o a la sucursal». Aparece una vez por inicio de sesión (lo
 * marca el login) y sólo a quien tiene algo que elegir: con una sola sucursal
 * a la vista no se pregunta nada. También se abre a mano desde la barra o la
 * pastilla del teléfono (`abrirSelectorDeEspacio`).
 *
 * La última elección (guardada en la cuenta) va marcada «La última vez», así
 * que en un dispositivo nuevo basta con un toque.
 */
export default function ElegirEspacio() {
  const { t } = useTranslation();
  const quieto = !!useReducedMotion();
  const { activo, cargado, opciones, actual, guardado, entrar } = useEspacio();
  const [abierto, setAbierto] = useState(false);
  const [entrando, setEntrando] = useState<string | null>(null);

  // Al entrar: preguntar sólo si hay algo que elegir.
  useEffect(() => {
    if (!activo || !cargado || !hayQuePreguntarElEspacio()) return;
    if (opciones.length >= 2) setAbierto(true);
    else yaSePreguntoElEspacio();
  }, [activo, cargado, opciones.length]);

  // A mano, desde la barra o la pastilla del teléfono.
  useEffect(() => {
    const abrir = () => setAbierto(true);

    window.addEventListener(EVENTO_ELEGIR_ESPACIO, abrir);

    return () => window.removeEventListener(EVENTO_ELEGIR_ESPACIO, abrir);
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
    yaSePreguntoElEspacio();
    setAbierto(false);
  };

  const elegir = async (o: OpcionDeEspacio) => {
    setEntrando(o.id);
    yaSePreguntoElEspacio();
    await entrar(o.id);
    // Si era el mismo espacio no hay recarga: basta con cerrar.
    setEntrando(null);
    setAbierto(false);
  };

  const nombre = (o: OpcionDeEspacio) =>
    o.global ? t("sucursales.espacio.global") : o.nombre;
  const detalle = (o: OpcionDeEspacio) =>
    o.global
      ? t("sucursales.espacio.globalDesc")
      : o.principal
        ? t("sucursales.espacio.principalDesc")
        : t("sucursales.espacio.sucursalDesc");

  return (
    <AnimatePresence>
      {abierto && opciones.length >= 2 && (
        <motion.div
          key="elegir-espacio"
          animate={{ opacity: 1 }}
          aria-labelledby="elegir-espacio-titulo"
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
              id="elegir-espacio-titulo"
            >
              {t("sucursales.espacio.titulo")}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              {t("sucursales.espacio.subtitulo")}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {opciones.map((o, i) => {
                const esActual = actual?.id === o.id;
                const ultima = guardado === o.id;

                return (
                  <motion.button
                    key={o.id}
                    animate={{ opacity: 1, y: 0 }}
                    className={`cg-focus glass-hover group relative flex min-h-[5.5rem] items-start gap-3 overflow-hidden rounded-2xl border p-4 text-left ${o.global ? "sm:col-span-2" : ""}`}
                    disabled={entrando !== null}
                    initial={quieto ? false : { opacity: 0, y: 10 }}
                    style={{
                      borderColor: esActual
                        ? o.color || "var(--brand)"
                        : "var(--hairline)",
                      background: esActual
                        ? `color-mix(in oklab, ${o.color || "var(--brand)"} 10%, var(--float))`
                        : "var(--float)",
                    }}
                    transition={{
                      duration: 0.35,
                      delay: quieto ? 0 : 0.08 + i * 0.05,
                    }}
                    type="button"
                    onClick={() => elegir(o)}
                  >
                    {/* La franja del color de la sucursal, como en la barra. */}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-1.5"
                      style={{
                        background: o.global
                          ? "var(--brand)"
                          : o.color || "var(--ink-faint)",
                      }}
                    />
                    <span
                      className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl"
                      style={{
                        background: `color-mix(in oklab, ${o.global ? "var(--brand)" : o.color || "var(--ink-faint)"} 16%, transparent)`,
                        color: o.global
                          ? "var(--brand-text, var(--brand))"
                          : o.color || "var(--ink-soft)",
                      }}
                    >
                      {o.global ? (
                        <Globe2 className="size-5" />
                      ) : (
                        <Building2 className="size-5" />
                      )}
                    </span>
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
                            {t("sucursales.principal")}
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
                            ? t("sucursales.espacio.ahora")
                            : t("sucursales.espacio.ultimaVez")}
                        </span>
                      )}
                    </span>
                  </motion.button>
                );
              })}
            </div>
            <p className="mt-4 text-xs" style={{ color: "var(--ink-faint)" }}>
              {t("sucursales.espacio.cambiaCuandoQuieras")}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
