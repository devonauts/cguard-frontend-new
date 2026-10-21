import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles, CheckCircle2, ChevronDown, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { Section, StatusBadge } from "@/components/kit";
import ComoFuncionaVigiaPro from "@/components/vigia/ComoFuncionaVigiaPro";
import { useAuth } from "@/contexts/AuthContext";
import { soloFecha } from "@/lib/horaDeLaEmpresa";
import {
  modulosAdicionalesService,
  type ModuloEnTienda,
} from "@/lib/api/modulosAdicionalesService";

/**
 * UN MÓDULO MENSUAL EN LA TIENDA (VigIA Pro).
 *
 * Precio FIJO al mes según el tamaño de la empresa — $50 hasta 50 vigilantes,
 * $100 por encima (2026-10-07) — y se resalta el suyo («tienes 37 vigilantes
 * activos»). Decisión del dueño: un fijo se compara con el costo de un turno
 * perdido, no con el asiento. El tramo de arriba no tiene techo (`SIN_TOPE`
 * en el servidor) y se pinta «Más de N».
 *
 * ── EL INTERRUPTOR (2026-10-20) ──────────────────────────────────────────
 * En la cabecera hay un interruptor que dice si el módulo está CONTRATADO:
 * encendido con el módulo activo, regalado o en prueba con «seguir» ya
 * elegido; apagado en los demás casos. Encenderlo hace lo que toque en ese
 * momento (empezar la prueba, dejar elegido seguir, activar o reactivar) y
 * apagarlo deja de renovar. Lo que cuesta dinero sigue pidiendo confirmación.
 * El botón grande de abajo hace lo mismo que encender: es el camino evidente.
 *
 * La demostración animada (`ComoFuncionaVigiaPro`) ya no va abierta de serie:
 * ocupaba la pantalla entera y su bitácora crecía y se vaciaba con cada
 * escena, así que la tarjeta cambiaba de alto cada pocos segundos. Ahora se
 * abre con «Ver cómo funciona» y se despliega con una animación de altura; la
 * demostración por dentro mide siempre lo mismo (ver su CSS).
 *
 * Lo que se ofrece depende del momento:
 *   · sin probar        → «Probar 30 días gratis» (sin tarjeta)
 *   · en prueba         → «Seguir al terminar» (mensual / anual) o ya elegido
 *   · activo            → plan, precio, renovación y apagar = «No renovar»
 *   · cancelado         → activo hasta X y «Reactivar»
 *   · vencido / sin prueba → «Activar»
 * Nunca se cobra a mitad de prueba: elegir sólo deja dicho cómo seguir.
 */
/** El tramo sin techo, como lo guarda el servidor (`SIN_TOPE` en lib/moduloMensual). */
const SIN_TOPE = 999_999;
const EASE = [0.22, 1, 0.36, 1] as const;

function dinero(
  cents: number | null | undefined,
  currency: string,
  lang: string,
) {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat(lang, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `$${Math.round(cents / 100)}`;
  }
}

/** Un instante (fin de prueba, renovación) en la zona de la EMPRESA. */
function fecha(iso: string | null | undefined, _lang?: string) {
  return soloFecha(iso, { day: "numeric", month: "long", year: "numeric" }, "");
}

export default function TarjetaModuloMensual({
  m,
  canPurchase,
  reason,
  esDeSocio,
}: {
  m: ModuloEnTienda;
  canPurchase: boolean;
  reason: string | null;
  esDeSocio: boolean;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { refreshProfile } = useAuth();
  const quieto = !!useReducedMotion();
  const [intervalo, setIntervalo] = useState<"month" | "year">(
    m.interval === "year" ? "year" : "month",
  );
  const [ocupado, setOcupado] = useState(false);
  const [verDemo, setVerDemo] = useState(false);
  const L = i18n.language;
  const precioElegido = intervalo === "year" ? m.yearlyCents : m.monthlyCents;
  const porPeriodo =
    intervalo === "year"
      ? t("modulosAdicionales.mensual.porAnio", "/año")
      : t("modulosAdicionales.mensual.porMes", "/mes");

  const recargar = async () => {
    await refreshProfile().catch(() => null);
    await qc.invalidateQueries({ queryKey: ["modulos-adicionales"] });
  };
  const motivo = (r?: string | null) =>
    t(`modulosAdicionales.motivos.${r || "error"}`, {
      defaultValue: t("modulosAdicionales.motivos.error"),
    });

  const accion = async (fn: () => Promise<any>, exito: string) => {
    setOcupado(true);
    try {
      const r = await fn();

      if (r?.estado === "pending_payment" && r?.enlaceDePago) {
        toast.info(t("modulosAdicionales.pendienteAviso"));
        window.location.assign(r.enlaceDePago);

        return;
      }
      toast.success(exito);
      await recargar();
    } catch (e: any) {
      toast.error(motivo(e?.data?.reason));
      await recargar();
    } finally {
      setOcupado(false);
    }
  };

  const probar = () =>
    accion(
      () => modulosAdicionalesService.probar(m.key),
      t("modulosAdicionales.mensual.pruebaIniciada", {
        defaultValue: "¡Listo! Tienes {{n}} días de {{nombre}} gratis.",
        n: m.trialDays,
        nombre: m.name,
      }),
    );

  const suscribir = async () => {
    const enPrueba = m.status === "trial";
    const ok = await confirmDialog({
      title: enPrueba
        ? t("modulosAdicionales.mensual.confirmarSeguirTitulo", {
            defaultValue: "Seguir con {{nombre}} al terminar la prueba",
            nombre: m.name,
          })
        : t("modulosAdicionales.confirmar.titulo", { nombre: m.name }),
      message: enPrueba
        ? t("modulosAdicionales.mensual.confirmarSeguir", {
            defaultValue:
              "No se cobra nada hoy. El {{fecha}} se cobrará {{precio}}{{periodo}} a tu tarjeta y seguirás sin cortes. Puedes cambiarlo antes.",
            fecha: fecha(m.trialEndsAt, L),
            precio: dinero(precioElegido, m.currency, L),
            periodo: porPeriodo,
          })
        : t("modulosAdicionales.mensual.confirmarActivar", {
            defaultValue:
              "Se cobrará {{precio}}{{periodo}} a la tarjeta de tu suscripción. Puedes cancelarlo cuando quieras; sigue activo hasta el fin de lo pagado.",
            precio: dinero(precioElegido, m.currency, L),
            periodo: porPeriodo,
          }),
      confirmText: enPrueba
        ? t("modulosAdicionales.mensual.seguir", "Seguir")
        : t("modulosAdicionales.mensual.activar", "Activar"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
    });

    if (!ok) return;
    await accion(
      () => modulosAdicionalesService.suscribir(m.key, intervalo),
      enPrueba
        ? t("modulosAdicionales.mensual.seguiraActivo", {
            defaultValue: "Hecho: seguirá activo al terminar la prueba.",
          })
        : t("modulosAdicionales.exito", { nombre: m.name }),
    );
  };

  const cancelar = async () => {
    const enPrueba = m.status === "trial";
    const ok = await confirmDialog({
      title: t("modulosAdicionales.mensual.cancelarTitulo", {
        defaultValue: "¿Dejar de renovar {{nombre}}?",
        nombre: m.name,
      }),
      message: enPrueba
        ? t("modulosAdicionales.mensual.cancelarPrueba", {
            defaultValue:
              "No se cobrará nada. Seguirás con la prueba hasta el {{fecha}}.",
            fecha: fecha(m.trialEndsAt, L),
          })
        : t("modulosAdicionales.mensual.cancelarActivo", {
            defaultValue:
              "No se cobra nada más. Seguirás con {{nombre}} hasta el {{fecha}}.",
            nombre: m.name,
            fecha: fecha(m.periodEndsAt, L),
          }),
      confirmText: t("modulosAdicionales.mensual.noRenovar", "No renovar"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
    });

    if (!ok) return;
    await accion(
      () => modulosAdicionalesService.cancelar(m.key),
      t("modulosAdicionales.mensual.noSeRenovara", {
        defaultValue: "Listo: no se renovará.",
      }),
    );
  };

  const estado = m.status;
  const enPruebaConAcceso = estado === "trial" && !!m.hasAccess;
  const canceladoConAcceso = estado === "canceled" && !!m.hasAccess;
  const activo = estado === "active" || estado === "comp";
  /* Lo que se muestra mientras no está contratado: probar, seguir, reactivar o activar. */
  const puedeProbar = !!m.canStartTrial && !esDeSocio;
  const puedeSeguir = enPruebaConAcceso && !m.autoRenew && !esDeSocio;
  const puedeReactivar = canceladoConAcceso && !esDeSocio;
  const puedeActivar =
    !activo &&
    !enPruebaConAcceso &&
    !canceladoConAcceso &&
    !puedeProbar &&
    estado !== "pending_payment" &&
    canPurchase &&
    !esDeSocio;

  /* El interruptor dice si está CONTRATADO (no si hoy tiene acceso: un
     cancelado sigue con acceso hasta fin de periodo, pero ya está apagado). */
  const contratado = activo || (enPruebaConAcceso && !!m.autoRenew);
  const puedeEncender =
    puedeProbar || puedeSeguir || puedeReactivar || puedeActivar;
  const puedeApagar =
    (estado === "active" || (enPruebaConAcceso && !!m.autoRenew)) && !esDeSocio;
  const encender = () => {
    if (puedeProbar) return probar();
    if (puedeSeguir || puedeReactivar || puedeActivar) return suscribir();

    return undefined;
  };
  const alCambiar = (on: boolean) => {
    if (ocupado) return;
    if (on && puedeEncender) void encender();
    else if (!on && puedeApagar) void cancelar();
  };

  const insignia = enPruebaConAcceso ? (
    <StatusBadge tone="info">
      {t("modulosAdicionales.mensual.enPrueba", {
        defaultValue: "Prueba: {{n}} días",
        n: m.trialDaysLeft,
      })}
    </StatusBadge>
  ) : activo ? (
    <StatusBadge tone="ok">{t("modulosAdicionales.activo")}</StatusBadge>
  ) : canceladoConAcceso ? (
    <StatusBadge tone="warn">
      {t("modulosAdicionales.mensual.hasta", {
        defaultValue: "Activo hasta el {{fecha}}",
        fecha: fecha(m.periodEndsAt, L),
      })}
    </StatusBadge>
  ) : estado === "pending_payment" ? (
    <StatusBadge tone="warn">{t("modulosAdicionales.pendiente")}</StatusBadge>
  ) : null;

  const selectorDePeriodo = (
    <div
      className="inline-flex rounded-xl border p-0.5 text-xs"
      role="group"
      style={{ borderColor: "var(--hairline)" }}
    >
      {(["month", "year"] as const).map((x) => (
        <button
          key={x}
          aria-pressed={intervalo === x}
          className="cg-focus rounded-lg px-3 py-1.5"
          style={
            intervalo === x
              ? { background: "var(--brand)", color: "var(--brand-ink, #fff)" }
              : { color: "var(--ink-soft)" }
          }
          type="button"
          onClick={() => setIntervalo(x)}
        >
          {x === "month"
            ? t("modulosAdicionales.mensual.mensual", "Mensual")
            : t("modulosAdicionales.mensual.anual", {
                defaultValue: "Anual · {{n}} meses gratis",
                n: m.annualMonthsFree || 2,
              })}
        </button>
      ))}
    </div>
  );

  /* La línea que explica en qué queda: se cobra el X, renueva el X, no seguirá… */
  const situacion =
    estado === "comp"
      ? t("modulosAdicionales.mensual.regalado", "Incluido por cortesía")
      : estado === "active"
        ? t("modulosAdicionales.mensual.renueva", {
            defaultValue: "Renueva el {{fecha}}",
            fecha: fecha(m.periodEndsAt, L),
          })
        : enPruebaConAcceso && m.autoRenew
          ? t("modulosAdicionales.mensual.seCobraraEl", {
              defaultValue: "Seguirá activo: se cobra el {{fecha}}",
              fecha: fecha(m.trialEndsAt, L),
            })
          : enPruebaConAcceso
            ? t("modulosAdicionales.mensual.pruebaSinSeguir", {
                defaultValue:
                  "Prueba hasta el {{fecha}} · al terminar no seguirá",
                fecha: fecha(m.trialEndsAt, L),
              })
            : puedeProbar
              ? t(
                  "modulosAdicionales.mensual.sinTarjeta",
                  "Sin tarjeta. Al terminar decides si sigues.",
                )
              : null;

  return (
    <Section
      action={
        <div className="flex items-center gap-3">
          {insignia}
          <Switch
            aria-label={t("modulosAdicionales.interruptor", { nombre: m.name })}
            checked={contratado}
            disabled={ocupado || (contratado ? !puedeApagar : !puedeEncender)}
            onCheckedChange={alCambiar}
          />
        </div>
      }
      className="flex h-full flex-col"
      contentClassName="flex flex-1 flex-col"
      icon={<Sparkles />}
      title={m.name}
    >
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {m.description}
      </p>

      {/* La demostración, plegada: se abre a voluntad y con altura animada. */}
      {m.key === "vigia_pro" && !activo && (
        <div className="mt-3">
          <button
            aria-expanded={verDemo}
            className="cg-focus inline-flex items-center gap-1.5 rounded-lg text-sm font-medium"
            style={{ color: "var(--brand-text, var(--brand))" }}
            type="button"
            onClick={() => setVerDemo((v) => !v)}
          >
            <Play className="h-4 w-4" />
            {verDemo
              ? t(
                  "modulosAdicionales.mensual.ocultarDemo",
                  "Ocultar la demostración",
                )
              : t(
                  "modulosAdicionales.mensual.verComoFunciona",
                  "Ver cómo funciona",
                )}
            <ChevronDown
              className="h-4 w-4 transition-transform duration-300 motion-reduce:transition-none"
              style={{ transform: verDemo ? "rotate(180deg)" : undefined }}
            />
          </button>
          <AnimatePresence initial={false}>
            {verDemo && (
              <motion.div
                key="demo"
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                initial={quieto ? false : { height: 0, opacity: 0 }}
                style={{ overflow: "hidden" }}
                transition={
                  quieto
                    ? { duration: 0 }
                    : {
                        height: { duration: 0.45, ease: EASE },
                        opacity: { duration: 0.3 },
                      }
                }
              >
                <ComoFuncionaVigiaPro className="mt-4" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Los tamaños, con el suyo resaltado. */}
      <div
        className={`mt-4 grid grid-cols-1 gap-2 ${(m.tiers || []).length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      >
        {(m.tiers || []).map((tr, i, todos) => {
          const suyo = m.currentTier?.maxGuards === tr.maxGuards;
          const sinTecho =
            i > 0 && i === todos.length - 1 && tr.maxGuards >= SIN_TOPE;

          return (
            <div
              key={tr.maxGuards}
              className="rounded-2xl border px-3 py-3 transition-colors duration-300"
              style={{
                borderColor: suyo ? "var(--brand)" : "var(--hairline)",
                background: suyo
                  ? "color-mix(in oklab, var(--brand) 8%, transparent)"
                  : undefined,
              }}
            >
              <div className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {sinTecho
                  ? t("modulosAdicionales.mensual.masDeVigilantes", {
                      n: todos[i - 1].maxGuards,
                    })
                  : t("modulosAdicionales.mensual.hastaVigilantes", {
                      defaultValue: "Hasta {{n}} vigilantes",
                      n: tr.maxGuards,
                    })}
              </div>
              <div className="mt-0.5 text-lg font-semibold">
                {dinero(
                  intervalo === "year"
                    ? tr.priceCents * (12 - (m.annualMonthsFree || 0))
                    : tr.priceCents,
                  m.currency,
                  L,
                )}
                <span
                  className="ml-0.5 text-xs font-normal"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {porPeriodo}
                </span>
              </div>
              {/* Una línea reservada SIEMPRE: así las tres cajas miden lo mismo tenga o no su plan. */}
              <div
                className="mt-1 min-h-4 text-xs"
                style={{ color: "var(--brand-text, var(--brand))" }}
              >
                {suyo
                  ? t("modulosAdicionales.mensual.tuPlan", {
                      defaultValue: "Tu plan · tienes {{n}} activos",
                      n: m.activeGuards,
                    })
                  : " "}
              </div>
            </div>
          );
        })}
      </div>
      {m.exceedsTopTier && (
        <p className="mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
          {t(
            "modulosAdicionales.mensual.aMedida",
            "Con más de 200 vigilantes te ofrecemos un precio a medida; mientras tanto se aplica el plan mayor.",
          )}
        </p>
      )}
      <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
        {t(
          "modulosAdicionales.mensual.nuncaSeCorta",
          "Si creces, nunca se corta: el plan siguiente se aplica desde tu próxima factura.",
        )}
      </p>

      <div className="mt-auto flex min-h-10 flex-wrap items-center justify-between gap-3 pt-4">
        {puedeSeguir || puedeReactivar || puedeActivar ? (
          selectorDePeriodo
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm">
          {situacion && (
            <span
              className="inline-flex items-center gap-1.5"
              style={{ color: "var(--ink-soft)" }}
            >
              {(activo || (enPruebaConAcceso && m.autoRenew)) && (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {situacion}
            </span>
          )}
          {puedeProbar ? (
            <Button
              disabled={ocupado}
              type="button"
              variant="brand"
              onClick={probar}
            >
              {t("modulosAdicionales.mensual.probarGratis", {
                defaultValue: "Probar {{n}} días gratis",
                n: m.trialDays,
              })}
            </Button>
          ) : puedeSeguir ? (
            <Button
              disabled={ocupado}
              type="button"
              variant="brand"
              onClick={suscribir}
            >
              {t("modulosAdicionales.mensual.seguirAlTerminar", {
                defaultValue: "Seguir al terminar · {{precio}}{{periodo}}",
                precio: dinero(precioElegido, m.currency, L),
                periodo: porPeriodo,
              })}
            </Button>
          ) : puedeReactivar ? (
            <Button
              disabled={ocupado}
              type="button"
              variant="brand"
              onClick={suscribir}
            >
              {t("modulosAdicionales.mensual.reactivar", "Reactivar")}
            </Button>
          ) : puedeActivar ? (
            <Button
              disabled={ocupado}
              type="button"
              variant="brand"
              onClick={suscribir}
            >
              {t("modulosAdicionales.mensual.activarPrecio", {
                defaultValue: "Activar · {{precio}}{{periodo}}",
                precio: dinero(precioElegido, m.currency, L),
                periodo: porPeriodo,
              })}
            </Button>
          ) : puedeApagar ? (
            <Button
              disabled={ocupado}
              type="button"
              variant="outline"
              onClick={cancelar}
            >
              {t("modulosAdicionales.mensual.noRenovar", "No renovar")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* En prueba y sin poder cobrar todavía: que lo sepa ANTES de que venza. */}
      {enPruebaConAcceso && !canPurchase && reason && !esDeSocio && (
        <p className="mt-3 text-xs" style={{ color: "var(--ink-soft)" }}>
          {t("modulosAdicionales.mensual.paraSeguir", {
            defaultValue:
              "Para seguir con {{nombre}} al terminar la prueba, primero completa el pago de tu implementación.",
            nombre: m.name,
          })}{" "}
          <Link className="underline" to="/setting/billing">
            {t("modulosAdicionales.irAFacturacion")}
          </Link>
        </p>
      )}
      {/* Apagado y sin poder activarlo: el porqué, en vez de una tarjeta muda. */}
      {!contratado &&
        !puedeEncender &&
        !esDeSocio &&
        estado !== "pending_payment" &&
        !canceladoConAcceso &&
        reason && (
          <p className="mt-3 text-xs" style={{ color: "var(--ink-soft)" }}>
            {motivo(reason)}{" "}
            <Link className="underline" to="/setting/billing">
              {t("modulosAdicionales.irAFacturacion")}
            </Link>
          </p>
        )}
    </Section>
  );
}
