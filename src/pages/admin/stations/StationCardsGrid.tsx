/**
 * Vista de tarjetas de ESTACIONES (como la de clientes). Cada tarjeta:
 * el LOGO del cliente dueño, el «nominativo» (nickname) como título, el nombre
 * del puesto, el cliente y cuántos vigilantes tiene asignados — con clic directo
 * al detalle de la estación. Los datos llegan en lote desde /station/cards.
 */
import { useTranslation } from "react-i18next";
import { RadioTower, Building2, Users, MapPin } from "lucide-react";
import { StatusBadge, SkeletonCards, EmptyState, GlassPanel, SmartImage } from "@/components/kit";
import type { StationCard } from "@/lib/api/stationService";

export default function StationCardsGrid({
  stations,
  loading,
  onOpen,
}: {
  stations: StationCard[];
  loading: boolean;
  onOpen: (s: StationCard) => void;
}) {
  const { t } = useTranslation();

  if (loading) return <SkeletonCards count={8} className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />;
  if (!stations.length) {
    return (
      <EmptyState
        icon={<RadioTower />}
        title={t("stations.empty.title", { defaultValue: "Sin estaciones" })}
        description={t("stations.empty.description", { defaultValue: "Las estaciones se crean dentro de cada puesto." })}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {stations.map((s, i) => {
        // El nominativo (nickname) manda como título; si no hay, el nombre del puesto.
        const title = s.nickname || s.stationName || "?";
        const subtitle = s.nickname ? s.stationName : null;
        const initial = (s.clientName || title || "?").charAt(0).toUpperCase();
        return (
          <GlassPanel
            key={s.id}
            flat
            hover
            role="button"
            tabIndex={0}
            onClick={() => onOpen(s)}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen(s); }}
            className="cg-focus group flex cursor-pointer flex-col p-4 animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${Math.min(i, 12) * 30}ms`, animationFillMode: "backwards" }}
          >
            <div className="flex items-start gap-3">
              <SmartImage
                src={s.clientLogoUrl}
                alt=""
                rounded="rounded-xl"
                fit="contain"
                className="h-12 w-12 shrink-0 border"
                style={{ background: "oklch(1 0 0)", borderColor: "var(--hairline)" }}
                fallback={
                  <span
                    className="grid h-full w-full place-items-center text-lg font-bold"
                    style={{ background: "var(--brand-wash)", color: "var(--brand-text)" }}
                  >
                    {initial}
                  </span>
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight" title={title}>{title}</p>
                {subtitle && (
                  <p className="truncate text-sm leading-tight" style={{ color: "var(--ink-soft)" }} title={subtitle}>{subtitle}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={s.guardCount > 0 ? "ok" : "warn"}>
                    {s.guardCount > 0
                      ? t("stations.covered", { defaultValue: "Con cobertura" })
                      : t("stations.uncovered", { defaultValue: "Sin vigilantes" })}
                  </StatusBadge>
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              {s.clientName && (
                <p className="flex items-center gap-1.5 truncate">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{s.clientName}</span>
                </p>
              )}
              {s.postSiteName && (
                <p className="flex items-center gap-1.5 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{s.postSiteName}</span>
                </p>
              )}
            </div>

            <div
              className="mt-3 flex items-center gap-4 border-t pt-3 text-sm"
              style={{ borderColor: "var(--hairline)", color: "var(--ink-soft)" }}
            >
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" style={{ color: "var(--brand-text)" }} />
                <span className="font-semibold text-foreground">{s.guardCount}</span>{" "}
                {t("stations.guardsLabel", { defaultValue: "vigilante(s)" })}
              </span>
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}
