/**
 * RANKING — who covered most this month, with their level (Bronce / Plata /
 * Oro: Oro sees offers first) and the «Respaldo del mes». All of it can be
 * turned off by the company in Ajustes.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Award, Crown, Medal, Trophy } from "lucide-react";

import { NivelBadge, dinero, mesActual } from "./comun";

import {
  Avatar,
  EmptyState,
  GlassPanel,
  InfoNote,
  Section,
  SkeletonCards,
} from "@/components/kit";
import { Input } from "@/components/ui/input";
import dobletesService, { decimalesDe } from "@/lib/api/dobletesService";
import { hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { localeActual } from "@/lib/localeActual";

export default function TabRanking() {
  const { t } = useTranslation();
  const [mes, setMes] = useState(() => mesActual(hoyEnLaEmpresa()));

  const ajustes = useQuery({
    queryKey: ["dobletes", "settings"],
    queryFn: () => dobletesService.settings(),
    staleTime: 60_000,
  });
  const ranking = useQuery({
    queryKey: ["dobletes", "ranking", mes],
    queryFn: () => dobletesService.ranking(mes),
  });
  const s = ajustes.data?.settings;
  const filas = ranking.data?.rows ?? [];
  const respaldo = ranking.data?.reserveOfMonth ?? null;
  const moneda = ranking.data?.currency || "USD";
  const nombreDelMes = (() => {
    try {
      return new Intl.DateTimeFormat(localeActual(), {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${mes}-15T12:00:00Z`));
    } catch {
      return mes;
    }
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {nombreDelMes.charAt(0).toUpperCase() + nombreDelMes.slice(1)}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <span className="cg-eyebrow">{t("dobletes.ranking.mes", "Mes")}</span>
          <Input
            className="w-44"
            max={mesActual(hoyEnLaEmpresa())}
            type="month"
            value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
          />
        </label>
      </div>

      {s && !s.ranking && (
        <InfoNote tone="neutral">
          {t(
            "dobletes.ranking.apagado",
            "El ranking está apagado: tus vigilantes no lo ven en la app. Aquí sigue disponible para la oficina.",
          )}
        </InfoNote>
      )}

      {s?.reserveOfMonth !== false && respaldo && (
        <GlassPanel brand className="flex flex-wrap items-center gap-4 p-5">
          <span
            className="grid size-14 shrink-0 place-items-center rounded-2xl"
            style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
          >
            <Crown className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="cg-eyebrow">
              {t("dobletes.ranking.respaldoDelMes", "Respaldo del mes")}
            </p>
            <p className="font-display truncate text-2xl font-bold">
              {respaldo.name || "—"}
            </p>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {t("dobletes.ranking.respaldoCumplidos", {
                defaultValue: "{{n}} dobletes cumplidos este mes",
                n: respaldo.confirmed,
              })}
            </p>
          </div>
          <NivelBadge nivel={respaldo.level} />
        </GlassPanel>
      )}

      {s?.levels.enabled && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icono: <Award />,
              nivel: t("dobletes.nivel.bronce", "Bronce"),
              regla: t("dobletes.ranking.reglaBronce", "Estar en la reserva"),
            },
            {
              icono: <Medal />,
              nivel: t("dobletes.nivel.plata", "Plata"),
              regla: t("dobletes.ranking.reglaN", {
                defaultValue: "{{n}} dobletes en el mes",
                n: s.levels.rules.plata.minCovered,
              }),
            },
            {
              icono: <Trophy />,
              nivel: t("dobletes.nivel.oro", "Oro"),
              regla: t("dobletes.ranking.reglaOro", {
                defaultValue:
                  "{{n}} dobletes en el mes · ve las ofertas primero",
                n: s.levels.rules.oro.minCovered,
              }),
            },
          ].map((x) => (
            <GlassPanel
              key={x.nivel}
              flat
              className="flex items-center gap-3 p-3"
            >
              <span
                className="[&_svg]:size-5"
                style={{ color: "var(--brand-text)" }}
              >
                {x.icono}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{x.nivel}</p>
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {x.regla}
                </p>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      <Section
        icon={<Trophy />}
        title={t("dobletes.ranking.titulo", "Quién más cubrió")}
      >
        {ranking.isLoading ? (
          <SkeletonCards count={3} />
        ) : !filas.length ? (
          <EmptyState
            description={t(
              "dobletes.ranking.vacioDesc",
              "Cuando alguien acepte un doblete, aparece aquí con sus puntos.",
            )}
            icon={<Trophy />}
            title={t(
              "dobletes.ranking.vacio",
              "Nadie ha cubierto dobletes este mes",
            )}
            variant="inline"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--ink-soft)" }}>
                  <th className="cg-eyebrow w-10 py-2">#</th>
                  <th className="cg-eyebrow py-2">
                    {t("comun.vigilante", "Vigilante")}
                  </th>
                  <th className="cg-eyebrow py-2 text-right">
                    {t("dobletes.ranking.cubiertos", "Cubiertos")}
                  </th>
                  <th className="cg-eyebrow py-2 text-right">
                    {t("dobletes.ranking.cumplidos", "Cumplidos")}
                  </th>
                  <th className="cg-eyebrow py-2 text-right">
                    {t("dobletes.ranking.bonos", "Bonos")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r, i) => (
                  <tr
                    key={r.userId}
                    className="border-t"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <td
                      className="py-2.5 font-semibold tabular-nums"
                      style={{
                        color: i < 3 ? "var(--brand-text)" : "var(--ink-soft)",
                      }}
                    >
                      {r.position}
                    </td>
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        <Avatar name={r.name || "?"} size="sm" />
                        <span className="truncate font-medium">
                          {r.name || "—"}
                        </span>
                        <NivelBadge nivel={r.level} />
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">
                      {r.covered}
                    </td>
                    <td
                      className="py-2.5 text-right tabular-nums"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {r.confirmed}
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">
                      {r.bonusCents
                        ? dinero(r.bonusCents, moneda, decimalesDe(moneda))
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
