import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  MapPin,
  Navigation,
  Clock,
  RotateCw,
  Car,
  Settings2,
  Building2,
} from "lucide-react";

import { ListSection } from "./ListSection";

import AppLayout from "@/layouts/app-layout";
import GuardsLayout from "@/layouts/GuardsLayout";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  EmptyState,
  StatusBadge,
  Field,
  SkeletonCards,
} from "@/components/kit";
import { supervisorService } from "@/lib/api/supervisorService";

interface CoveragePosition {
  id: string;
  name: string;
  zone: string | null;
  rotationStyleName: string | null;
  window: string | null;
  mobileStation: { id: string; name: string } | null;
  stations: { id: string; name: string }[];
}

export default function SupervisorCoveragePage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [positions, setPositions] = useState<CoveragePosition[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    supervisorService
      .getCoverage(id)
      .then((res) => setPositions((res?.positions ?? []) as CoveragePosition[]))
      .catch(() => toast.error(t("comun.noSePudoCargarLa")))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const manageBtn = (
    <Button
      size="sm"
      variant="outline"
      onClick={() => navigate("/supervisor-positions")}
    >
      <Settings2 className="mr-2 h-4 w-4" />{" "}
      {t("ui.SupervisorCoveragePage.gestionarPuestos", "Gestionar puestos")}
    </Button>
  );

  return (
    <AppLayout>
      <GuardsLayout navKey="supervisors" title={t("ui.SupervisorCoveragePage.cobertura", "Cobertura")}
      >
        <PageContainer>
          {loading ? (
            <SkeletonCards count={2} />
          ) : !positions || positions.length === 0 ? (
            <EmptyState
              action={manageBtn}
              description={t(
                "ui.SupervisorCoveragePage.esteSupervisorNoEstaAsignado",
              )}
              icon={<MapPin />}
              title={t("ui.SupervisorCoveragePage.sinCoberturaAsignada")}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {t(
                    "ui.SupervisorCoveragePage.zonasYPuestosQueEsteSupervisorCubre",
                    "Zonas y puestos que este supervisor cubre según sus asignaciones.",
                  )}
                </p>
                {manageBtn}
              </div>

              {/* Una sección POR PUESTO → cristal plano, sin desenfoque. */}
              {positions.map((p) => (
                <ListSection
                  key={p.id}
                  action={
                    p.zone ? (
                      <StatusBadge dot={false} tone="brand">
                        {p.zone}
                      </StatusBadge>
                    ) : undefined
                  }
                  icon={<MapPin />}
                  title={p.name}
                >
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Field
                        label={
                          <span className="inline-flex items-center gap-1.5">
                            <Navigation className="h-3.5 w-3.5" />{" "}
                            {t("ui.SupervisorCoveragePage.zona", "Zona")}
                          </span>
                        }
                        value={p.zone}
                      />
                      <Field
                        label={
                          <span className="inline-flex items-center gap-1.5">
                            <RotateCw className="h-3.5 w-3.5" />{" "}
                            {t("ui.SupervisorCoverage.rotacion", "Rotación")}
                          </span>
                        }
                        value={p.rotationStyleName}
                      />
                      <Field
                        label={
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" /> {t("comun.turno")}
                          </span>
                        }
                        value={p.window}
                      />
                    </div>

                    <div>
                      <div className="cg-eyebrow mb-2 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />{" "}
                        {t("ui.SupervisorCoveragePage.puestosCubiertos", "Puestos cubiertos")}
                      </div>
                      {p.stations?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {(p.stations || []).map((s) => (
                            <StatusBadge key={s.id} dot={false} tone="neutral">
                              <MapPin className="h-3 w-3" /> {s.name}
                            </StatusBadge>
                          ))}
                        </div>
                      ) : (
                        <p
                          className="text-sm"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t(
                            "ui.SupervisorCoverage.ningunPuestoAsignado",
                            "Ningún puesto asignado.",
                          )}
                        </p>
                      )}
                    </div>

                    {p.mobileStation && (
                      <div>
                        <div className="cg-eyebrow mb-2 flex items-center gap-1.5">
                          <Car className="h-3.5 w-3.5" />{" "}
                          {t("ui.StationHero.puestoMovil", "Estación móvil")}
                        </div>
                        <StatusBadge dot={false} tone="brand">
                          <Car className="h-3 w-3" /> {p.mobileStation.name}
                        </StatusBadge>
                      </div>
                    )}
                  </div>
                </ListSection>
              ))}
            </>
          )}
        </PageContainer>
      </GuardsLayout>
    </AppLayout>
  );
}
