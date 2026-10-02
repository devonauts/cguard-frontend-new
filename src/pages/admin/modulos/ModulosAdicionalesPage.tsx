import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Puzzle, CheckCircle2, ExternalLink } from "lucide-react";

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
} from "@/components/kit";
import { useAuth } from "@/contexts/AuthContext";
import { useTiendaDeModulos } from "@/hooks/useTiendaDeModulos";
import {
  modulosAdicionalesService,
  type ModuloEnTienda,
} from "@/lib/api/modulosAdicionalesService";
import TarjetaModuloMensual from "./TarjetaModuloMensual";

/**
 * MÓDULOS ADICIONALES — lo que la empresa compra aparte.
 *
 * Un módulo de pago ÚNICO queda para siempre; uno MENSUAL (VigIA Pro) tiene
 * su propia tarjeta (`TarjetaModuloMensual`). Se cobra a la tarjeta que
 * la empresa ya tiene en su suscripción: aquí sólo se confirma. Si el banco
 * pide verificación, se abre el pago de Stripe y el módulo se activa al
 * completarlo.
 *
 * Nombre y descripción llegan ya traducidos del servidor; todo lo demás sale
 * de `modulosAdicionales.*` en los 8 idiomas del CRM.
 */
function precio(cents: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency }).format(cents / 100);
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
        message: t("modulosAdicionales.confirmar.mensaje", { nombre: m.name, precio: cuanto }),
        confirmText: t("modulosAdicionales.confirmar.boton", { precio: cuanto }),
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

  return (
    <AppLayout>
      <PageContainer width="narrow">
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
              <Section title={t("modulosAdicionales.socio.titulo")}>
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {t("modulosAdicionales.socio.desc")}
                </p>
              </Section>
            )}
            {!data.canPurchase && !esDeSocio && data.reason && data.modules.some((m) => m.billingType !== "monthly_tiers") && (
              <Section>
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {textoDeMotivo(data.reason)}{" "}
                  <Link className="underline" to="/setting/billing">
                    {t("modulosAdicionales.irAFacturacion")}
                  </Link>
                </p>
              </Section>
            )}

            {data.modules.map((m) => {
              // Los mensuales (VigIA Pro) tienen su propia tarjeta: tramos, prueba y renovación.
              if (m.billingType === "monthly_tiers") {
                return (
                  <TarjetaModuloMensual
                    key={m.key}
                    canPurchase={data.canPurchase}
                    esDeSocio={esDeSocio}
                    m={m}
                    reason={data.reason}
                  />
                );
              }
              const tiene = m.owned;
              const pendiente = m.status === "pending_payment";

              return (
                <Section
                  key={m.key}
                  action={
                    tiene ? (
                      <StatusBadge tone="ok">{t("modulosAdicionales.activo")}</StatusBadge>
                    ) : pendiente ? (
                      <StatusBadge tone="warn">{t("modulosAdicionales.pendiente")}</StatusBadge>
                    ) : undefined
                  }
                  icon={<Puzzle />}
                  title={m.name}
                >
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {m.description}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm">
                      <span className="text-lg font-semibold">
                        {precio(m.priceCents, m.currency, i18n.language)}
                      </span>{" "}
                      <span style={{ color: "var(--ink-faint)" }}>
                        · {t("modulosAdicionales.pagoUnico")}
                      </span>
                    </p>
                    {tiene ? (
                      <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
                        <CheckCircle2 className="h-4 w-4" /> {t("modulosAdicionales.yaEsTuyo")}
                      </span>
                    ) : esDeSocio ? null : pendiente ? (
                      <Button
                        disabled={comprando === m.key}
                        type="button"
                        variant="outline"
                        onClick={() => comprar(m)}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {t("modulosAdicionales.completarPago")}
                      </Button>
                    ) : data.canPurchase ? (
                      <Button
                        disabled={comprando === m.key}
                        type="button"
                        variant="brand"
                        onClick={() => comprar(m)}
                      >
                        {comprando === m.key
                          ? t("modulosAdicionales.comprando")
                          : t("modulosAdicionales.comprar")}
                      </Button>
                    ) : null}
                  </div>
                </Section>
              );
            })}
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}
