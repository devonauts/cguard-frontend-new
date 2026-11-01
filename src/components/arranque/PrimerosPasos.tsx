/**
 * PRIMEROS PASOS — the Panel guide of a new company (phase 3).
 *
 * Station → requirement → guards → schedule → publish → first clock-in, each
 * read from real data by the server. Shows only while the company is still
 * starting (never for an established one), hides by itself when every step is
 * done, and someone with management authority can hide it for the company.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Rocket, X } from "lucide-react";
import { toast } from "sonner";

import { GlassPanel, IconTile, Meter } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { nivelEnLaEmpresa } from "@/hooks/usePuede";
import { usePrimerosPasos } from "@/hooks/usePrimerosPasos";
import { NIVEL } from "@/lib/reglasDeAcciones";
import { hechos, type ClaveDePaso } from "@/lib/primerosPasos";

export function PrimerosPasos() {
  const { t } = useTranslation();
  const { user } = useAuth() as any;
  const { datos, ocultar } = usePrimerosPasos();
  const [ocultando, setOcultando] = useState(false);

  if (!datos || !datos.show) return null;

  const nivel = nivelEnLaEmpresa(user);
  const puedeOcultar = !!user?.isSuperadmin || (nivel != null && nivel >= NIVEL.GERENCIA);
  const total = datos.steps.length;
  const listos = hechos(datos);

  const TEXTOS: Record<ClaveDePaso, { titulo: string; ayuda: string }> = {
    station: {
      titulo: t("ui.PrimerosPasos.station", "Crea una estación"),
      ayuda: t("ui.PrimerosPasos.stationAyuda", "El puesto que vas a cubrir: elige el cliente y la sede."),
    },
    requirement: {
      titulo: t("ui.PrimerosPasos.requirement", "Define su requisito"),
      ayuda: t("ui.PrimerosPasos.requirementAyuda", "Cuántos vigilantes pide la estación y en qué horario."),
    },
    guards: {
      titulo: t("ui.PrimerosPasos.guards", "Agrega a tus vigilantes"),
      ayuda: t("ui.PrimerosPasos.guardsAyuda", "Con correo o sin él: entran a la app cuando tú decidas."),
    },
    schedule: {
      titulo: t("ui.PrimerosPasos.schedule", "Arma el horario"),
      ayuda: t("ui.PrimerosPasos.scheduleAyuda", "En el borrador, asigna cada vigilante a su estación."),
    },
    publish: {
      titulo: t("ui.PrimerosPasos.publish", "Publica"),
      ayuda: t("ui.PrimerosPasos.publishAyuda", "Con «Publicar», los turnos llegan a la app de cada vigilante."),
    },
    clockIn: {
      titulo: t("ui.PrimerosPasos.clockIn", "Primera marcación"),
      ayuda: t("ui.PrimerosPasos.clockInAyuda", "Cuando un vigilante marque entrada, la verás en Asistencia."),
    },
  };

  const onOcultar = async () => {
    setOcultando(true);
    try {
      await ocultar();
    } catch {
      toast.error(t("ui.PrimerosPasos.noSeOculto", "No se pudo ocultar la guía. Vuelve a intentarlo."));
    } finally {
      setOcultando(false);
    }
  };

  return (
    <GlassPanel brand className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <IconTile tone="brand">
          <Rocket />
        </IconTile>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold" style={{ color: "var(--ink)", textWrap: "balance" } as any}>
            {t("ui.PrimerosPasos.titulo", "Pon en marcha tu empresa")}
          </h2>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t("ui.PrimerosPasos.progreso", {
              defaultValue: "{{listos}} de {{total}} listos. Cada paso se marca solo cuando lo haces.",
              listos,
              total,
            })}
          </p>
          <div className="mt-2 max-w-xs">
            <Meter max={total} value={listos} />
          </div>
        </div>
        {puedeOcultar && (
          <Button
            aria-label={t("ui.PrimerosPasos.ocultar", "Ocultar la guía") as string}
            disabled={ocultando}
            size="sm"
            title={t("ui.PrimerosPasos.ocultarAyuda", "Ocultarla para toda la empresa") as string}
            variant="ghost"
            onClick={onOcultar}
          >
            <X className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">{t("ui.PrimerosPasos.ocultar", "Ocultar la guía")}</span>
          </Button>
        )}
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {datos.steps.map((s, i) => {
          const esElSiguiente = s.key === datos.next;
          const txt = TEXTOS[s.key];

          return (
            <li
              key={s.key}
              className="flex min-w-0 items-start gap-3 rounded-2xl p-3"
              style={{
                background: esElSiguiente ? "var(--brand-wash)" : "var(--glass-sunken)",
                boxShadow: esElSiguiente ? "inset 0 0 0 1px var(--brand-line)" : undefined,
                opacity: s.done ? 0.75 : 1,
              }}
            >
              <span
                aria-hidden
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                style={
                  s.done
                    ? { background: "color-mix(in oklab, var(--ok) 18%, transparent)", color: "var(--ok-text)" }
                    : esElSiguiente
                      ? { background: "var(--brand)", color: "var(--brand-ink)" }
                      : { background: "var(--glass-raised)", color: "var(--ink-soft)" }
                }
              >
                {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-sm font-semibold"
                  style={{ color: "var(--ink)", textDecoration: s.done ? "line-through" : undefined }}
                >
                  {txt.titulo}
                  <span className="sr-only">
                    {s.done ? ` · ${t("ui.PrimerosPasos.hecho", "hecho")}` : ""}
                  </span>
                </span>
                <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>
                  {txt.ayuda}
                </span>
                {esElSiguiente && (
                  <Button asChild className="mt-2" size="sm" variant="brand">
                    <Link to={s.path}>
                      {t("ui.PrimerosPasos.hacerlo", "Hacerlo ahora")}
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
                {!esElSiguiente && !s.done && (
                  <Link
                    className="mt-1 inline-block text-xs font-semibold hover:underline"
                    style={{ color: "var(--brand-text)" }}
                    to={s.path}
                  >
                    {t("ui.PrimerosPasos.ir", "Ir")}
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </GlassPanel>
  );
}

export default PrimerosPasos;
