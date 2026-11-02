import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Puzzle,
  CheckCircle2,
  ExternalLink,
  Building2,
  ScanFace,
  FileSpreadsheet,
  Receipt,
  CalendarPlus,
  Siren,
  Cctv,
  Power,
  Layers,
} from "lucide-react";

/** El icono de cada módulo en la tienda; uno nuevo sin entrada sale con la pieza de puzle. */
const ICONO_DEL_MODULO: Record<string, React.ReactNode> = {
  sucursales: <Building2 />,
  reconocimiento_facial: <ScanFace />,
  payroll_slips: <FileSpreadsheet />,
  client_billing: <Receipt />,
  dobletes: <CalendarPlus />,
  // Same icons as their side-menu groups.
  monitoring_center: <Siren />,
  video_surveillance: <Cctv />,
  multimarca: <Layers />,
};

import TarjetaModulo, { Cifra } from "./TarjetaModulo";
import TarjetaModuloMensual from "./TarjetaModuloMensual";
import { precioACobrar, precioDeModulo } from "./precioDeModulo";
import { MARCAS_INCLUIDAS, precioDeMultimarca } from "./precioDeMultimarca";

import BotonDemo from "@/components/modulos/demo/BotonDemo";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  PageContainer,
  PageHeader,
  Section,
  StatusBadge,
  EmptyState,
  SkeletonCards,
  FadeIn,
} from "@/components/kit";
import { useAuth } from "@/contexts/AuthContext";
import {
  FREE_TIER_STORE_REASON,
  isFreeTierUser,
  storeReasonForCompany,
} from "@/lib/freeTier";
import { useTiendaDeModulos } from "@/hooks/useTiendaDeModulos";
import { useEsGerenteDeSucursal } from "@/hooks/useGerenteDeSucursal";
import { useEsAdminDeMarca } from "@/hooks/useAccesoDeMarca";
import { announceAddonsChanged } from "@/lib/addonRequired";
import { soloFecha } from "@/lib/horaDeLaEmpresa";
import {
  modulosAdicionalesService,
  type ModuloEnTienda,
} from "@/lib/api/modulosAdicionalesService";

/**
 * MÓDULOS ADICIONALES — lo que la empresa compra aparte.
 *
 * Un módulo de pago ÚNICO queda para siempre; uno MENSUAL (VigIA Pro) tiene
 * su propia lógica (`TarjetaModuloMensual`). Se cobra a la tarjeta que la
 * empresa ya tiene en su suscripción: aquí sólo se confirma. Si el banco pide
 * verificación, se abre el pago de Stripe y el módulo se activa al completarlo.
 *
 * ── FORMA DE LA PÁGINA (2026-10-21) ─────────────────────────────────────
 * Todos los módulos van en la MISMA tarjeta (`TarjetaModulo`), del mismo
 * tamaño, en una rejilla de dos columnas con filas iguales (una en el teléfono). Cada
 * tarjeta lleva un INTERRUPTOR: encender es contratar (prueba, compra o
 * suscripción, con su confirmación cuando hay dinero) y apagar es dejar de
 * renovar. Un pago único que ya es suyo se APAGA y se ENCIENDE (2026-10-30,
 * `/pause` y `/resume`): apagar pide confirmación (no se borra nada, los menús
 * desaparecen, se enciende cuando quiera sin costo, más una línea propia de
 * cada módulo en `useConsecuenciaDeApagar`); encender nunca cobra. Comprar
 * nunca se ofrece para algo que ya es suyo. Las tarjetas entran escalonadas y se elevan al
 * pasar el ratón. Cada módulo que aún no tiene lleva su píldora «Demo» con su
 * demostración animada (`components/modulos/demo`).
 *
 * Nombre y descripción llegan ya traducidos del servidor; todo lo demás sale
 * de `modulosAdicionales.*` en los 8 idiomas del CRM.
 */
/**
 * The extra line of the switch-off confirmation: what stops for THIS module.
 * Literal keys (the i18n test sees them). A module without a line just shows
 * the generic text.
 */
function useConsecuenciaDeApagar(): (key: string) => string | null {
  const { t } = useTranslation();

  return (key: string) => {
    switch (key) {
      case "sucursales":
        return t("modulosAdicionales.pausa.consecuencias.sucursales");
      case "dobletes":
        return t("modulosAdicionales.pausa.consecuencias.dobletes");
      case "client_billing":
        return t("modulosAdicionales.pausa.consecuencias.client_billing");
      case "payroll_slips":
        return t("modulosAdicionales.pausa.consecuencias.payroll_slips");
      case "reconocimiento_facial":
        return t(
          "modulosAdicionales.pausa.consecuencias.reconocimiento_facial",
        );
      case "monitoring_center":
        return t("modulosAdicionales.pausa.consecuencias.monitoring_center");
      case "video_surveillance":
        return t("modulosAdicionales.pausa.consecuencias.video_surveillance");
      case "multimarca":
        return t(
          "ui.TiendaMultimarca.consecuencia",
          "El selector de marca y la columna «Marca» desaparecen; las marcas y sus datos se quedan.",
        );
      default:
        return null;
    }
  };
}

export default function ModulosAdicionalesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { refreshProfile, user } = useAuth();
  const { data, isLoading, isError } = useTiendaDeModulos();
  /* Free tier («Plan gratis»): the server's «subscription not active» reasons
     become `plan_gratis` — never a prompt to pay or a link to billing. */
  const gratis = isFreeTierUser(user);
  const motivo = storeReasonForCompany(data?.reason, gratis);
  const [comprando, setComprando] = useState<string | null>(null);
  const consecuencia = useConsecuenciaDeApagar();

  const textoDeMotivo = (reason?: string | null) =>
    t(`modulosAdicionales.motivos.${reason || "error"}`, {
      defaultValue: t("modulosAdicionales.motivos.error"),
    });

  const comprar = async (m: ModuloEnTienda) => {
    const cuanto = precioACobrar(
      m.priceCents,
      m.currency,
      m.chargePriceCents,
      m.chargeCurrency,
    );
    // Completar un pago pendiente no cobra nada nuevo: reabre la MISMA factura.
    const ok =
      m.status === "pending_payment" ||
      (await confirmDialog({
        title: t("modulosAdicionales.confirmar.titulo", { nombre: m.name }),
        message: t("modulosAdicionales.confirmar.mensaje", {
          nombre: m.name,
          precio: cuanto,
        }),
        confirmText: t("modulosAdicionales.confirmar.boton", {
          precio: cuanto,
        }),
        cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
      }));

    if (!ok) return;

    setComprando(m.key);
    try {
      const r = await modulosAdicionalesService.comprar(m.key);

      if (r.estado === "pending_payment") {
        toast.info(t("modulosAdicionales.pendienteAviso"));
        /* En la misma pestaña: una ventana abierta DESPUÉS de esperar al
           servidor ya no cuenta como respuesta al clic, y el navegador la
           bloquea como emergente. */
        if (r.enlaceDePago) window.location.assign(r.enlaceDePago);
      } else {
        toast.success(t("modulosAdicionales.exito", { nombre: m.name }));
        // Las funciones de la empresa viajan en la sesión: se refresca para
        // que el módulo aparezca sin cerrar sesión.
        await refreshProfile().catch(() => null);
      }
      await qc.invalidateQueries({ queryKey: ["modulos-adicionales"] });
    } catch (e: any) {
      toast.error(
        textoDeMotivo(storeReasonForCompany(e?.data?.reason, gratis)),
      );
      await qc.invalidateQueries({ queryKey: ["modulos-adicionales"] });
    } finally {
      setComprando(null);
    }
  };

  /* The menus come from the session's features: refresh it, refresh the store
     and tell the open gates (other sessions get the server's socket event). */
  const trasCambiar = async () => {
    await refreshProfile().catch(() => null);
    await qc.invalidateQueries({ queryKey: ["modulos-adicionales"] });
    announceAddonsChanged();
  };

  /** Switch an owned one-time module OFF: confirm first, nothing is deleted. */
  const apagar = async (m: ModuloEnTienda) => {
    const extra = consecuencia(m.key);
    const ok = await confirmDialog({
      title: t("modulosAdicionales.pausa.titulo", { nombre: m.name }),
      message: [t("modulosAdicionales.pausa.mensaje"), extra]
        .filter(Boolean)
        .join(" "),
      confirmText: t("modulosAdicionales.pausa.boton"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
    });

    if (!ok) return;
    setComprando(m.key);
    try {
      await modulosAdicionalesService.apagar(m.key);
      toast.success(
        t("modulosAdicionales.pausa.apagadoAviso", { nombre: m.name }),
      );
    } catch (e: any) {
      toast.error(textoDeMotivo(e?.data?.reason));
    } finally {
      await trasCambiar();
      setComprando(null);
    }
  };

  /** Switch it back ON: no confirmation, no charge. */
  const encender = async (m: ModuloEnTienda) => {
    setComprando(m.key);
    try {
      await modulosAdicionalesService.encender(m.key);
      toast.success(
        t("modulosAdicionales.pausa.encendidoAviso", { nombre: m.name }),
      );
    } catch (e: any) {
      toast.error(textoDeMotivo(e?.data?.reason));
    } finally {
      await trasCambiar();
      setComprando(null);
    }
  };

  const gerente = useEsGerenteDeSucursal();
  // Multimarca phase 2: a brand admin sees the store but does not buy either.
  const adminDeMarca = useEsAdminDeMarca();
  // Un gerente de sucursal ve la tienda pero no contrata: eso es de la principal.
  const esDeSocio =
    data?.reason === "la_factura_el_socio" || gerente || adminDeMarca;
  /* Los mensuales primero; luego los de pago único. */
  const modulos = data
    ? [...data.modules].sort(
        (a, b) =>
          Number(b.billingType === "monthly_tiers") -
          Number(a.billingType === "monthly_tiers"),
      )
    : [];

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<Puzzle />}
          subtitle={t("modulosAdicionales.subtitulo")}
          title={t("modulosAdicionales.titulo")}
        />

        {isLoading ? (
          <SkeletonCards count={3} />
        ) : isError || !data || !data.modules.length ? (
          <EmptyState
            description={t("modulosAdicionales.vacio.desc")}
            icon={<Puzzle />}
            title={t("modulosAdicionales.vacio.titulo")}
          />
        ) : (
          <div className="space-y-4">
            {esDeSocio && (
              <FadeIn>
                <Section
                  title={
                    gerente
                      ? t("sucursales.gerente.soloPrincipalTitulo")
                      : adminDeMarca
                        ? t(
                            "ui.AccesoDeMarca.soloEmpresaTitulo",
                            "Esto lo hace la administración de la empresa",
                          )
                        : t("modulosAdicionales.socio.titulo")
                  }
                >
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {gerente
                      ? t("sucursales.gerente.soloPrincipalDesc")
                      : adminDeMarca
                        ? t(
                            "ui.AccesoDeMarca.soloEmpresaDesc",
                            "Como administrador de marca gestionas tus marcas, pero los pagos, los módulos y la cuenta los gestiona un administrador de la empresa.",
                          )
                        : t("modulosAdicionales.socio.desc")}
                  </p>
                </Section>
              </FadeIn>
            )}
            {!data.canPurchase &&
              !esDeSocio &&
              motivo &&
              data.modules.some((m) => m.billingType !== "monthly_tiers") && (
                <FadeIn>
                  <Section>
                    <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                      {textoDeMotivo(motivo)}{" "}
                      {motivo !== FREE_TIER_STORE_REASON && (
                        <Link className="underline" to="/setting/billing">
                          {t("modulosAdicionales.irAFacturacion")}
                        </Link>
                      )}
                    </p>
                  </Section>
                </FadeIn>
              )}

            <div className="grid auto-rows-fr grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              {modulos.map((m, i) => {
                if (m.billingType === "monthly_tiers") {
                  return (
                    <TarjetaModuloMensual
                      key={m.key}
                      canPurchase={data.canPurchase}
                      delay={i * 0.08}
                      esDeSocio={esDeSocio}
                      m={m}
                      reason={motivo}
                    />
                  );
                }
                const tiene = m.owned;
                const pendiente = m.status === "pending_payment";
                const ocupado = comprando === m.key;
                /* Already theirs (paid, gifted or a partner's running trial):
                   the switch turns it OFF and back ON, never buys it. A branch
                   manager sees the store but switches nothing. */
                const loTiene = !!m.canToggle;
                const apagado = loTiene && !!m.paused;
                const encendido = loTiene && !m.paused;
                const enPruebaDelSocio = loTiene && m.status === "trial";
                /* Not theirs yet: switching ON = buying. */
                const puedeComprar =
                  !tiene &&
                  !loTiene &&
                  !esDeSocio &&
                  (pendiente || data.canPurchase);
                const situacionTexto = apagado
                  ? m.pausedBy
                    ? t("modulosAdicionales.pausa.situacion", {
                        quien: m.pausedBy,
                      })
                    : t("modulosAdicionales.pausa.situacionSinNombre")
                  : enPruebaDelSocio
                    ? t("modulosAdicionales.pausa.pruebaDelSocio", {
                        fecha: soloFecha(
                          m.trialEndsAt,
                          { day: "numeric", month: "short" },
                          "",
                        ),
                      })
                    : tiene
                      ? t("modulosAdicionales.paraSiempre")
                      : pendiente
                        ? t("modulosAdicionales.pendienteAviso")
                        : null;

                return (
                  <TarjetaModulo
                    key={m.key}
                    accion={
                      tiene || loTiene ? undefined : (
                        <BotonDemo clave={m.key} nombre={m.name} />
                      )
                    }
                    delay={i * 0.08}
                    description={m.description}
                    icon={ICONO_DEL_MODULO[m.key] ?? <Puzzle />}
                    interruptor={{
                      checked: loTiene ? encendido : tiene,
                      disabled: loTiene
                        ? ocupado || gerente || adminDeMarca
                        : ocupado || tiene || !puedeComprar,
                      onChange: (on) => {
                        if (loTiene) void (on ? encender(m) : apagar(m));
                        else if (on) void comprar(m);
                      },
                      label: t("modulosAdicionales.interruptor", {
                        nombre: m.name,
                      }),
                    }}
                    kicker={t("modulosAdicionales.pagoUnico")}
                    name={m.name}
                    pie={
                      <>
                        <span />
                        {apagado ? (
                          gerente || adminDeMarca ? null : (
                            <Button
                              disabled={ocupado}
                              type="button"
                              variant="brand"
                              onClick={() => encender(m)}
                            >
                              <Power className="mr-2 h-4 w-4" />
                              {t("modulosAdicionales.pausa.encender")}
                            </Button>
                          )
                        ) : enPruebaDelSocio ? null : tiene ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-sm"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            <CheckCircle2
                              className="h-4 w-4"
                              style={{ color: "var(--ok)" }}
                            />{" "}
                            {t("modulosAdicionales.yaEsTuyo")}
                          </span>
                        ) : esDeSocio ? null : pendiente ? (
                          <Button
                            disabled={ocupado}
                            type="button"
                            variant="outline"
                            onClick={() => comprar(m)}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {t("modulosAdicionales.completarPago")}
                          </Button>
                        ) : data.canPurchase ? (
                          <Button
                            disabled={ocupado}
                            type="button"
                            variant="brand"
                            onClick={() => comprar(m)}
                          >
                            {ocupado
                              ? t("modulosAdicionales.comprando")
                              : t("modulosAdicionales.comprar")}
                          </Button>
                        ) : null}
                      </>
                    }
                    precio={
                      <div>
                        <div className="flex items-baseline gap-1">
                          {/* Switched on: no amount (the server sends none). */}
                          {!m.priceHidden && m.priceCents != null && (
                            <>
                              <Cifra
                                className="text-xl font-semibold tabular-nums"
                                k={`${m.currency}-${m.priceCents}`}
                              >
                                {precioDeModulo(m.priceCents, m.currency)}
                              </Cifra>
                              <span
                                className="text-xs"
                                style={{ color: "var(--ink-faint)" }}
                              >
                                · {t("modulosAdicionales.pagoUnico")}
                              </span>
                            </>
                          )}
                          {apagado ? (
                            <span className="ml-auto">
                              <StatusBadge tone="neutral">
                                {t("modulosAdicionales.pausa.apagado")}
                              </StatusBadge>
                            </span>
                          ) : encendido ? (
                            <span className="ml-auto">
                              <StatusBadge tone="ok">
                                {t("modulosAdicionales.activo")}
                              </StatusBadge>
                            </span>
                          ) : pendiente ? (
                            <span className="ml-auto">
                              <StatusBadge tone="warn">
                                {t("modulosAdicionales.pendiente")}
                              </StatusBadge>
                            </span>
                          ) : null}
                        </div>
                        <div
                          className="mt-1 truncate text-xs"
                          style={{ color: "var(--brand-text, var(--brand))" }}
                        >
                          {tiene ? t("modulosAdicionales.yaEsTuyo") : " "}
                        </div>
                        <div
                          className="truncate text-xs"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {m.key === "multimarca"
                            ? (() => {
                                /* «450 USD (incluye 2 marcas) · 50 USD por cada
                                   marca adicional», in the company's currency;
                                   nothing once it is theirs. */
                                const p = precioDeMultimarca(m);

                                if (!p) return " ";

                                return p.extra
                                  ? t(
                                      "ui.TiendaMultimarca.detalle",
                                      "(incluye {{n}} marcas) · {{extra}} por cada marca adicional",
                                      { n: MARCAS_INCLUIDAS, extra: p.extra },
                                    )
                                  : t(
                                      "ui.TiendaMultimarca.incluye",
                                      "(incluye {{n}} marcas)",
                                      { n: MARCAS_INCLUIDAS },
                                    );
                              })()
                            : " "}
                        </div>
                      </div>
                    }
                    situacion={
                      situacionTexto ? (
                        <span className="block truncate">{situacionTexto}</span>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}
