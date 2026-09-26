/**
 * Configuración › Asistente VigIA — el dashboard de uso.
 *
 * La regla de esta pantalla: números que un dueño entiende. Mensajes del mes,
 * costo real, cuánto queda de la cuota gratis, saldo del monedero (el MISMO de
 * SMS/WhatsApp — una sola recarga para todo), y la bitácora de qué acciones
 * ejecutó el asistente y quién se las pidió — porque un asistente que ejecuta
 * acciones sin dejar rastro auditable no entra a esta plataforma.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bot, Wallet, MessageSquare, ListChecks } from "lucide-react";

import SettingsPageShell from "../components/SettingsPageShell";

import { SkeletonCards, StatCard, StatsStrip } from "@/components/kit";
import api from "@/lib/api";
import { useAgente } from "@/lib/agenteDeMarca";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

const tenantId = () => localStorage.getItem("tenantId") || "";

/** El gasto se MUESTRA en la moneda del tenant (tasa del día desde el
 *  backend); el cobro real sigue en USD. Sin tasa, USD honesto. */
const formatearDinero = (
  moneda: { codigo: string; tasa: number },
  usd: number,
  decimales = 2,
) =>
  `${(usd * moneda.tasa).toLocaleString(localeActual(), { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} ${moneda.codigo}`;

export default function VigiaUsagePage() {
  const { t } = useTranslation();
  // A partner's companies see the assistant under the partner's name.
  const agente = useAgente();
  const [datos, setDatos] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp: any = await api.get(
          `/tenant/${tenantId()}/assistant/usage`,
        );

        setDatos(resp && resp.data !== undefined ? resp.data : resp);
      } catch {
        toast.error(t("ui.VigiaUsagePage.noSePudoCargarEl"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // El backend manda SOLO los días con uso: sin rellenar los huecos, dos días
  // activos se pintaban como dos barras gigantes al 100% — un bloque azul sin
  // dibujo. La ventana completa de 30 días es la que cuenta la historia.
  const serieCruda: Array<{ dia: string; mensajes: number }> =
    datos?.serie || [];
  const usoPorDia = new Map(serieCruda.map((d: any) => [d.dia, d]));
  const serie = Array.from({ length: 30 }, (_, i) => {
    const dia = new Date(Date.now() - (29 - i) * 86400000)
      .toISOString()
      .slice(0, 10);
    const v: any = usoPorDia.get(dia);

    return {
      dia,
      mensajes: v?.mensajes || 0,
      costCentiCents: Number(v?.costCentiCents) || 0,
    };
  });
  const hayUso = serieCruda.some((d) => d.mensajes > 0);
  const moneda: { codigo: string; tasa: number; aproximada: boolean } =
    datos?.moneda || { codigo: "USD", tasa: 1, aproximada: false };
  const dinero = (cents: number, dec = 2) =>
    formatearDinero(moneda, Math.max(0, cents) / 100, dec);
  const dineroDesdeCenti = (centi: number) =>
    formatearDinero(moneda, Math.max(0, centi) / 10000, 3);
  const costo30dCenti = serieCruda.reduce(
    (acc, d: any) => acc + (Number(d.costCentiCents) || 0),
    0,
  );
  const maxMensajes = Math.max(1, ...serie.map((d) => d.mensajes));
  const etiqueta = (dia: string) =>
    new Date(`${dia}T12:00:00Z`).toLocaleDateString(localeActual(), {
      day: "2-digit",
      month: "short",
    });

  return (
    <SettingsPageShell
      icon={<Bot />}
      subtitle={t("ui.VigiaUsagePage.cuantoSeUsaCuantoCuesta")}
      title={t("settings.configuracion.asistente-ia", {
        defaultValue: "Asistente {{agente}}",
        agente: agente.nombre,
      })}
    >
      {loading ? (
        <SkeletonCards className="grid-cols-2 sm:grid-cols-4" count={4} />
      ) : !datos ? null : (
        <div className="space-y-6">
          <StatsStrip className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              icon={<MessageSquare />}
              label={t("ui.VigiaUsagePage.mensajesEsteMes")}
              value={String(datos.mes?.mensajes ?? 0)}
            />
            <StatCard
              accent={
                (datos.mes?.gratisRestanteCents ?? 0) > 0 ? "ok" : "neutral"
              }
              icon={<Bot />}
              label={t(
                "ui.VigiaUsagePage.mensajesGratisRestantesAprox",
                "Mensajes gratis restantes (aprox.)",
              )}
              value={`≈${(() => {
                const resto = datos.mes?.gratisRestanteCents ?? 0;
                const msgs = datos.mes?.mensajes || 0;
                const gastado = (datos.mes?.cuotaGratisCents ?? 100) - resto;
                // costo promedio observado; sin historial, 0.44¢ el turno típico
                const prom = msgs > 0 && gastado > 0 ? gastado / msgs : 0.44;

                return Math.max(
                  0,
                  Math.floor(resto / Math.max(0.05, prom)),
                ).toLocaleString(localeActual());
              })()}`}
            />
            <StatCard
              icon={<Wallet />}
              label={t("ui.VigiaUsagePage.cobradoDelSaldoMes")}
              value={dinero(datos.mes?.cobradoCents ?? 0)}
            />
            <StatCard
              accent={(datos.saldoCents ?? 0) > 0 ? "ok" : "warn"}
              icon={<Wallet />}
              label={t("ui.VigiaUsagePage.saldoDisponible", "Saldo disponible")}
              value={dinero(datos.saldoCents ?? 0)}
            />
          </StatsStrip>

          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t("ui.VigiaUsagePage.comparteElMonederoDeComunicaciones", {
              defaultValue:
                "{{agente}} comparte el monedero de Comunicaciones: la misma recarga sirve para SMS, WhatsApp y el asistente.",
              agente: agente.nombre,
            })}{" "}
            <Link
              className="-my-3 inline-block py-3 font-semibold underline"
              style={{ color: "var(--brand-text)" }}
              to="/setting/comunicaciones?tab=saldo"
            >
              {t("comms.rechargeTitle", "Recargar saldo")}
            </Link>
          </p>

          {/* Actividad de los últimos 30 días */}
          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-3 text-sm font-semibold">
              {t(
                "ui.VigiaUsage.actividadUltimos30Dias",
                "Actividad · últimos 30 días",
              )}
            </h3>
            {!hayUso ? (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "ui.VigiaUsage.aunSinUsoElAsistente",
                  "Aún sin uso. El asistente vive abajo a la derecha del CRM.",
                )}
              </p>
            ) : (
              <>
                <div
                  className="flex items-end gap-[3px]"
                  style={{ height: 90 }}
                >
                  {serie.map((d) => (
                    <div
                      key={d.dia}
                      className="flex-1 rounded-t"
                      style={
                        d.mensajes > 0
                          ? {
                              height: `${Math.max(10, (d.mensajes / maxMensajes) * 100)}%`,
                              background:
                                "color-mix(in oklab, var(--brand) 60%, transparent)",
                            }
                          : // Un día sin uso es un tic en la base, no una barra.
                            { height: 3, background: "var(--hairline)" }
                      }
                      title={`${etiqueta(d.dia)}: ${t("ui.VigiaUsagePage.nMensajes", {
                        defaultValue: "{{count}} mensajes",
                        count: d.mensajes,
                      })}${d.costCentiCents > 0 ? ` · ≈ ${dineroDesdeCenti(d.costCentiCents)}` : ""}`}
                    />
                  ))}
                </div>
                <div
                  className="mt-1 flex justify-between text-[10px]"
                  style={{ color: "var(--ink-faint)" }}
                >
                  <span>{etiqueta(serie[0].dia)}</span>
                  <span>{etiqueta(serie[15].dia)}</span>
                  <span>{etiqueta(serie[29].dia)}</span>
                </div>
              </>
            )}
            {typeof datos.tokens30d === "number" && datos.tokens30d > 0 && (
              <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
                {t("ui.VigiaUsagePage.tokensProcesadosEn30Dias", {
                  defaultValue:
                    "{{tokens}} tokens procesados en 30 días · gasto ≈ {{gasto}}.",
                  tokens: datos.tokens30d.toLocaleString(localeActual()),
                  gasto: dineroDesdeCenti(costo30dCenti),
                })}
              </p>
            )}
          </section>

          {/* Bitácora de acciones — quién le pidió qué */}
          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ListChecks size={15} />{" "}
              {t("ui.VigiaUsagePage.accionesEjecutadas", "Acciones ejecutadas")}
            </h3>
            {!datos.acciones?.length ? (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "ui.VigiaUsage.ningunaTodaviaTodaAccionDel",
                  "Ninguna todavía. Toda acción del asistente queda registrada aquí.",
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {datos.acciones.map((a: any, i: number) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm"
                    style={{ background: "var(--glass-raised)" }}
                  >
                    <span className="font-mono text-xs">{a.action}</span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {a.quien} ·{" "}
                      {new Date(a.at).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
            {t("ui.VigiaUsagePage.costoRealDelMes", {
              defaultValue:
                "Costo real del mes: {{costo}} en el proveedor de IA. La cuota gratis se renueva cada mes.",
              costo: dineroDesdeCenti(datos.mes?.costCentiCents ?? 0),
            })}
            {moneda.aproximada &&
              ` ${t(
                "ui.VigiaUsagePage.montosConvertidosDeUsd",
                "Montos convertidos de USD al tipo de cambio del día.",
              )}`}
          </p>
        </div>
      )}
    </SettingsPageShell>
  );
}
