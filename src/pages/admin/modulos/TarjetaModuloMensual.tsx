import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
 * Mientras no lo tenga pagado, la tarjeta ENSEÑA cómo trabaja con la
 * demostración animada (`ComoFuncionaVigiaPro`): se decide viendo, no leyendo.
 *
 * Lo que se ofrece depende del momento:
 *   · sin probar        → «Probar 30 días gratis» (sin tarjeta)
 *   · en prueba         → «Seguir al terminar» (mensual / anual) o ya elegido
 *   · activo            → plan, precio, renovación y «Cancelar»
 *   · cancelado         → activo hasta X y «Reactivar»
 *   · vencido / sin prueba → «Activar»
 * Nunca se cobra a mitad de prueba: elegir sólo deja dicho cómo seguir.
 */
/** El tramo sin techo, como lo guarda el servidor (`SIN_TOPE` en lib/moduloMensual). */
const SIN_TOPE = 999_999;

function dinero(cents: number | null | undefined, currency: string, lang: string) {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
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
  const [intervalo, setIntervalo] = useState<"month" | "year">(m.interval === "year" ? "year" : "month");
  const [ocupado, setOcupado] = useState(false);
  const L = i18n.language;
  const precioElegido = intervalo === "year" ? m.yearlyCents : m.monthlyCents;
  const porPeriodo = intervalo === "year" ? t("modulosAdicionales.mensual.porAnio", "/año") : t("modulosAdicionales.mensual.porMes", "/mes");

  const recargar = async () => {
    await refreshProfile().catch(() => null);
    await qc.invalidateQueries({ queryKey: ["modulos-adicionales"] });
  };
  const motivo = (r?: string | null) =>
    t(`modulosAdicionales.motivos.${r || "error"}`, { defaultValue: t("modulosAdicionales.motivos.error") });

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
    accion(() => modulosAdicionalesService.probar(m.key), t("modulosAdicionales.mensual.pruebaIniciada", { defaultValue: "¡Listo! Tienes {{n}} días de {{nombre}} gratis.", n: m.trialDays, nombre: m.name }));

  const suscribir = async () => {
    const enPrueba = m.status === "trial";
    const ok = await confirmDialog({
      title: enPrueba
        ? t("modulosAdicionales.mensual.confirmarSeguirTitulo", { defaultValue: "Seguir con {{nombre}} al terminar la prueba", nombre: m.name })
        : t("modulosAdicionales.confirmar.titulo", { nombre: m.name }),
      message: enPrueba
        ? t("modulosAdicionales.mensual.confirmarSeguir", { defaultValue: "No se cobra nada hoy. El {{fecha}} se cobrará {{precio}}{{periodo}} a tu tarjeta y seguirás sin cortes. Puedes cambiarlo antes.", fecha: fecha(m.trialEndsAt, L), precio: dinero(precioElegido, m.currency, L), periodo: porPeriodo })
        : t("modulosAdicionales.mensual.confirmarActivar", { defaultValue: "Se cobrará {{precio}}{{periodo}} a la tarjeta de tu suscripción. Puedes cancelarlo cuando quieras; sigue activo hasta el fin de lo pagado.", precio: dinero(precioElegido, m.currency, L), periodo: porPeriodo }),
      confirmText: enPrueba ? t("modulosAdicionales.mensual.seguir", "Seguir") : t("modulosAdicionales.mensual.activar", "Activar"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
    });
    if (!ok) return;
    await accion(() => modulosAdicionalesService.suscribir(m.key, intervalo), enPrueba
      ? t("modulosAdicionales.mensual.seguiraActivo", { defaultValue: "Hecho: seguirá activo al terminar la prueba." })
      : t("modulosAdicionales.exito", { nombre: m.name }));
  };

  const cancelar = async () => {
    const enPrueba = m.status === "trial";
    const ok = await confirmDialog({
      title: t("modulosAdicionales.mensual.cancelarTitulo", { defaultValue: "¿Dejar de renovar {{nombre}}?", nombre: m.name }),
      message: enPrueba
        ? t("modulosAdicionales.mensual.cancelarPrueba", { defaultValue: "No se cobrará nada. Seguirás con la prueba hasta el {{fecha}}.", fecha: fecha(m.trialEndsAt, L) })
        : t("modulosAdicionales.mensual.cancelarActivo", { defaultValue: "No se cobra nada más. Seguirás con {{nombre}} hasta el {{fecha}}.", nombre: m.name, fecha: fecha(m.periodEndsAt, L) }),
      confirmText: t("modulosAdicionales.mensual.noRenovar", "No renovar"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
    });
    if (!ok) return;
    await accion(() => modulosAdicionalesService.cancelar(m.key), t("modulosAdicionales.mensual.noSeRenovara", { defaultValue: "Listo: no se renovará." }));
  };

  const estado = m.status;
  const insignia =
    estado === "trial" && m.hasAccess ? (
      <StatusBadge tone="info">{t("modulosAdicionales.mensual.enPrueba", { defaultValue: "Prueba: {{n}} días", n: m.trialDaysLeft })}</StatusBadge>
    ) : estado === "active" || estado === "comp" ? (
      <StatusBadge tone="ok">{t("modulosAdicionales.activo")}</StatusBadge>
    ) : estado === "canceled" && m.hasAccess ? (
      <StatusBadge tone="warn">{t("modulosAdicionales.mensual.hasta", { defaultValue: "Activo hasta el {{fecha}}", fecha: fecha(m.periodEndsAt, L) })}</StatusBadge>
    ) : estado === "pending_payment" ? (
      <StatusBadge tone="warn">{t("modulosAdicionales.pendiente")}</StatusBadge>
    ) : undefined;

  const selectorDePeriodo = (
    <div className="inline-flex rounded-xl border p-0.5 text-xs" role="group" style={{ borderColor: "var(--hairline)" }}>
      {(["month", "year"] as const).map((x) => (
        <button
          key={x}
          aria-pressed={intervalo === x}
          className="cg-focus rounded-lg px-3 py-1.5"
          style={intervalo === x ? { background: "var(--brand)", color: "var(--brand-ink, #fff)" } : { color: "var(--ink-soft)" }}
          type="button"
          onClick={() => setIntervalo(x)}
        >
          {x === "month"
            ? t("modulosAdicionales.mensual.mensual", "Mensual")
            : t("modulosAdicionales.mensual.anual", { defaultValue: "Anual · {{n}} meses gratis", n: m.annualMonthsFree || 2 })}
        </button>
      ))}
    </div>
  );

  return (
    <Section action={insignia} icon={<Sparkles />} title={m.name}>
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{m.description}</p>

      {m.key === "vigia_pro" && estado !== "active" && estado !== "comp" && (
        <ComoFuncionaVigiaPro className="mt-4" />
      )}

      {/* Los tamaños, con el suyo resaltado. */}
      <div className={`mt-4 grid grid-cols-1 gap-2 ${(m.tiers || []).length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {(m.tiers || []).map((tr, i, todos) => {
          const suyo = m.currentTier?.maxGuards === tr.maxGuards;
          const sinTecho = i > 0 && i === todos.length - 1 && tr.maxGuards >= SIN_TOPE;
          return (
            <div
              key={tr.maxGuards}
              className="rounded-2xl border px-3 py-3"
              style={{
                borderColor: suyo ? "var(--brand)" : "var(--hairline)",
                background: suyo ? "color-mix(in oklab, var(--brand) 8%, transparent)" : undefined,
              }}
            >
              <div className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {sinTecho
                  ? t("modulosAdicionales.mensual.masDeVigilantes", { n: todos[i - 1].maxGuards })
                  : t("modulosAdicionales.mensual.hastaVigilantes", { defaultValue: "Hasta {{n}} vigilantes", n: tr.maxGuards })}
              </div>
              <div className="mt-0.5 text-lg font-semibold">
                {dinero(intervalo === "year" ? tr.priceCents * (12 - (m.annualMonthsFree || 0)) : tr.priceCents, m.currency, L)}
                <span className="ml-0.5 text-xs font-normal" style={{ color: "var(--ink-faint)" }}>{porPeriodo}</span>
              </div>
              {suyo && (
                <div className="mt-1 text-xs" style={{ color: "var(--brand-text, var(--brand))" }}>
                  {t("modulosAdicionales.mensual.tuPlan", { defaultValue: "Tu plan · tienes {{n}} activos", n: m.activeGuards })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {m.exceedsTopTier && (
        <p className="mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
          {t("modulosAdicionales.mensual.aMedida", "Con más de 200 vigilantes te ofrecemos un precio a medida; mientras tanto se aplica el plan mayor.")}
        </p>
      )}
      <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
        {t("modulosAdicionales.mensual.nuncaSeCorta", "Si creces, nunca se corta: el plan siguiente se aplica desde tu próxima factura.")}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {((estado === "trial" && !m.autoRenew) || !estado || estado === "expired" || (estado === "canceled" && !m.hasAccess)) && !esDeSocio && !m.canStartTrial
          ? selectorDePeriodo
          : <span />}

        {esDeSocio ? null : m.canStartTrial ? (
          <Button disabled={ocupado} type="button" variant="brand" onClick={probar}>
            {t("modulosAdicionales.mensual.probarGratis", { defaultValue: "Probar {{n}} días gratis", n: m.trialDays })}
          </Button>
        ) : estado === "trial" && m.hasAccess ? (
          m.autoRenew ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span style={{ color: "var(--ink-soft)" }}>
                {t("modulosAdicionales.mensual.seCobraraEl", { defaultValue: "Seguirá activo: se cobra el {{fecha}}", fecha: fecha(m.trialEndsAt, L) })}
              </span>
              <Button disabled={ocupado} type="button" variant="outline" onClick={cancelar}>
                {t("modulosAdicionales.mensual.noRenovar", "No renovar")}
              </Button>
            </div>
          ) : (
            <Button disabled={ocupado} type="button" variant="brand" onClick={suscribir}>
              {t("modulosAdicionales.mensual.seguirAlTerminar", { defaultValue: "Seguir al terminar · {{precio}}{{periodo}}", precio: dinero(precioElegido, m.currency, L), periodo: porPeriodo })}
            </Button>
          )
        ) : estado === "active" || estado === "comp" ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5" style={{ color: "var(--ink-soft)" }}>
              <CheckCircle2 className="h-4 w-4" />
              {estado === "comp"
                ? t("modulosAdicionales.mensual.regalado", "Incluido por cortesía")
                : t("modulosAdicionales.mensual.renueva", { defaultValue: "Renueva el {{fecha}}", fecha: fecha(m.periodEndsAt, L) })}
            </span>
            {estado === "active" && (
              <Button disabled={ocupado} type="button" variant="outline" onClick={cancelar}>
                {t("modulosAdicionales.mensual.noRenovar", "No renovar")}
              </Button>
            )}
          </div>
        ) : estado === "canceled" && m.hasAccess ? (
          <Button disabled={ocupado} type="button" variant="brand" onClick={suscribir}>
            {t("modulosAdicionales.mensual.reactivar", "Reactivar")}
          </Button>
        ) : canPurchase ? (
          <Button disabled={ocupado} type="button" variant="brand" onClick={suscribir}>
            {t("modulosAdicionales.mensual.activarPrecio", { defaultValue: "Activar · {{precio}}{{periodo}}", precio: dinero(precioElegido, m.currency, L), periodo: porPeriodo })}
          </Button>
        ) : null}
      </div>

      {/* En prueba y sin poder cobrar todavía: que lo sepa ANTES de que venza. */}
      {estado === "trial" && m.hasAccess && !canPurchase && reason && !esDeSocio && (
        <p className="mt-3 text-xs" style={{ color: "var(--ink-soft)" }}>
          {t("modulosAdicionales.mensual.paraSeguir", { defaultValue: "Para seguir con {{nombre}} al terminar la prueba, primero completa el pago de tu implementación.", nombre: m.name })}{" "}
          <Link className="underline" to="/setting/billing">{t("modulosAdicionales.irAFacturacion")}</Link>
        </p>
      )}
    </Section>
  );
}
