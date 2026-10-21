import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Puzzle, CheckCircle2, ExternalLink } from "lucide-react";

import TarjetaModuloMensual from "./TarjetaModuloMensual";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { useTiendaDeModulos } from "@/hooks/useTiendaDeModulos";
import {
  modulosAdicionalesService,
  type ModuloEnTienda,
} from "@/lib/api/modulosAdicionalesService";

/**
 * MÓDULOS ADICIONALES — lo que la empresa compra aparte.
 *
 * Un módulo de pago ÚNICO queda para siempre; uno MENSUAL (VigIA Pro) tiene
 * su propia tarjeta (`TarjetaModuloMensual`). Se cobra a la tarjeta que
 * la empresa ya tiene en su suscripción: aquí sólo se confirma. Si el banco
 * pide verificación, se abre el pago de Stripe y el módulo se activa al
 * completarlo.
 *
 * ── FORMA DE LA PÁGINA (2026-10-20) ─────────────────────────────────────
 * Cada módulo tiene un INTERRUPTOR en la cabecera: encender es contratar
 * (prueba, compra o suscripción, con su confirmación cuando hay dinero) y
 * apagar es dejar de renovar. Un pago único no se apaga —es suyo para
 * siempre— y su interruptor queda encendido y bloqueado.
 *
 * Las tarjetas van en una rejilla de dos columnas (una en el teléfono) con la
 * misma altura por fila; la del módulo mensual ocupa el ancho entero porque
 * lleva los tramos de precio. Entran escalonadas (`FadeIn`) y una tarjeta que
 * crece —al abrir la demostración— mueve a las demás con `layout`, sin saltos.
 *
 * Nombre y descripción llegan ya traducidos del servidor; todo lo demás sale
 * de `modulosAdicionales.*` en los 8 idiomas del CRM.
 */
function precio(cents: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency }).format(
      cents / 100,
    );
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export default function ModulosAdicionalesPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { refreshProfile } = useAuth();
  const { data, isLoading, isError } = useTiendaDeModulos();
  const [comprando, setComprando] = useState<string | null>(null);

  const textoDeMotivo = (reason?: string | null) =>
    t(`modulosAdicionales.motivos.${reason || "error"}`, {
      defaultValue: t("modulosAdicionales.motivos.error"),
    });

  const comprar = async (m: ModuloEnTienda) => {
    const cuanto = precio(m.priceCents, m.currency, i18n.language);
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
      toast.error(textoDeMotivo(e?.data?.reason));
      await qc.invalidateQueries({ queryKey: ["modulos-adicionales"] });
    } finally {
      setComprando(null);
    }
  };

  const esDeSocio = data?.reason === "la_factura_el_socio";
  /* Los mensuales primero y a lo ancho; los de pago único después, de dos en dos. */
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
          <SkeletonCards count={2} />
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
                <Section title={t("modulosAdicionales.socio.titulo")}>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t("modulosAdicionales.socio.desc")}
                  </p>
                </Section>
              </FadeIn>
            )}
            {!data.canPurchase &&
              !esDeSocio &&
              data.reason &&
              data.modules.some((m) => m.billingType !== "monthly_tiers") && (
                <FadeIn>
                  <Section>
                    <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                      {textoDeMotivo(data.reason)}{" "}
                      <Link className="underline" to="/setting/billing">
                        {t("modulosAdicionales.irAFacturacion")}
                      </Link>
                    </p>
                  </Section>
                </FadeIn>
              )}

            <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
              {modulos.map((m, i) => {
                // Los mensuales (VigIA Pro) tienen su propia tarjeta: tramos, prueba y renovación.
                if (m.billingType === "monthly_tiers") {
                  return (
                    <FadeIn
                      key={m.key}
                      layout
                      className="sm:col-span-2"
                      delay={i * 0.06}
                    >
                      <TarjetaModuloMensual
                        canPurchase={data.canPurchase}
                        esDeSocio={esDeSocio}
                        m={m}
                        reason={data.reason}
                      />
                    </FadeIn>
                  );
                }
                const tiene = m.owned;
                const pendiente = m.status === "pending_payment";
                const ocupado = comprando === m.key;
                /* Encender = comprar. Un pago único no se apaga: es suyo para siempre. */
                const puedeEncender =
                  !tiene && !esDeSocio && (pendiente || data.canPurchase);

                return (
                  <FadeIn
                    key={m.key}
                    layout
                    className="flex flex-col"
                    delay={i * 0.06}
                  >
                    <Section
                      action={
                        <div className="flex items-center gap-3">
                          {tiene ? (
                            <StatusBadge tone="ok">
                              {t("modulosAdicionales.activo")}
                            </StatusBadge>
                          ) : pendiente ? (
                            <StatusBadge tone="warn">
                              {t("modulosAdicionales.pendiente")}
                            </StatusBadge>
                          ) : null}
                          <Switch
                            aria-label={t("modulosAdicionales.interruptor", {
                              nombre: m.name,
                            })}
                            checked={tiene}
                            disabled={ocupado || tiene || !puedeEncender}
                            onCheckedChange={(on) => {
                              if (on) void comprar(m);
                            }}
                          />
                        </div>
                      }
                      className="flex flex-1 flex-col"
                      contentClassName="flex flex-1 flex-col"
                      icon={<Puzzle />}
                      title={m.name}
                    >
                      <p
                        className="text-sm"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {m.description}
                      </p>
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                        <p className="text-sm">
                          <span className="text-lg font-semibold">
                            {precio(m.priceCents, m.currency, i18n.language)}
                          </span>{" "}
                          <span style={{ color: "var(--ink-faint)" }}>
                            · {t("modulosAdicionales.pagoUnico")}
                          </span>
                        </p>
                        {tiene ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-sm"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            <CheckCircle2 className="h-4 w-4" />{" "}
                            {t("modulosAdicionales.paraSiempre")}
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
                      </div>
                    </Section>
                  </FadeIn>
                );
              })}
            </div>
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}
