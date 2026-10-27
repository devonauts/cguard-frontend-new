/**
 * DOBLETES — the module's page (paid add-on `dobletes`).
 *
 * Five tabs, from what is urgent to what is set once:
 *   Ofertas   live searches for open gaps, offer by offer
 *   Reserva   the backup bench, availability, suplentes per post, «salud»
 *   Campañas  banners in the guards' app to keep the bench full
 *   Ranking   the month, levels, «Respaldo del mes»
 *   Ajustes   waves, bonuses, points, levels, VigIA Pro
 *
 * Without the module: what it does and where to get it. The tab lives in the
 * URL (`?tab=`) so Cobertura en vivo can link straight to a search
 * (`?tab=ofertas&busqueda=<id>`).
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  CalendarPlus,
  Megaphone,
  Settings2,
  Trophy,
  Users,
  Radio,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { PresentacionDelModulo, useModuloDobletes } from "./comun";
import TabOfertas from "./TabOfertas";
import TabReserva from "./TabReserva";
import TabCampanas from "./TabCampanas";
import TabRanking from "./TabRanking";
import TabAjustes from "./TabAjustes";
import { campanaVacia, usePlantillasBase } from "./EditorDeCampana";

import dobletesService, { type CampaignDraft } from "@/lib/api/dobletesService";
import { PageContainer, PageHeader, TabNav } from "@/components/kit";
import AppLayout from "@/layouts/app-layout";

type Pestana = "ofertas" | "reserva" | "campanas" | "ranking" | "ajustes";
const PESTANAS: Pestana[] = [
  "ofertas",
  "reserva",
  "campanas",
  "ranking",
  "ajustes",
];

export default function DobletesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const pedida = params.get("tab") as Pestana | null;
  const tab: Pestana = pedida && PESTANAS.includes(pedida) ? pedida : "ofertas";
  const [sugerida, setSugerida] = useState<CampaignDraft | null>(null);
  const plantillas = usePlantillasBase();

  // One cheap read decides «has the module» even if the session is stale.
  const prueba = useQuery({
    queryKey: ["dobletes", "settings"],
    queryFn: () => dobletesService.settings(),
    retry: false,
  });
  const { sinModulo } = useModuloDobletes(prueba.error);
  const activas = useQuery({
    queryKey: ["dobletes", "searches", "activas"],
    queryFn: () => dobletesService.searches({ status: "active" }),
    enabled: !sinModulo,
    refetchInterval: 30_000,
  });

  const ir = (p: Pestana) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);

        n.set("tab", p);
        n.delete("busqueda");

        return n;
      },
      { replace: true },
    );

  /* «Lanzar campaña sugerida» from the bench health: the «cover another post»
     template aimed at the posts short of suplentes. */
  const campanaSugerida = (stationIds: string[]) => {
    const p = plantillas.find((x) => x.key === "qualify_post") ?? plantillas[0];
    const base = campanaVacia();

    setSugerida({
      ...base,
      template: p.key,
      title: p.title,
      body: p.body,
      ctaLabel: p.ctaLabel,
      ctaAction: p.ctaAction,
      audience: {
        ...base.audience,
        notInReserve: false,
        qualifiedForStationIds: stationIds,
      },
      pushOnPublish: true,
      priority: 5,
    });
    ir("campanas");
  };
  const sugeridaUsada = useCallback(() => setSugerida(null), []);

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<CalendarPlus />}
          subtitle={t(
            "dobletes.subtitulo",
            "Cuando falta alguien, tu reserva cubre el turno: la oferta llega a la app y el primero que acepta se lo queda.",
          )}
          title={t("dobletes.titulo", "Dobletes")}
        />
        {sinModulo ? (
          <PresentacionDelModulo />
        ) : (
          <>
            <TabNav<Pestana>
              items={[
                {
                  value: "ofertas",
                  label: t("dobletes.tab.ofertas", "Ofertas"),
                  icon: <Radio />,
                  badge: activas.data?.length ?? null,
                },
                {
                  value: "reserva",
                  label: t("dobletes.tab.reserva", "Reserva"),
                  icon: <Users />,
                },
                {
                  value: "campanas",
                  label: t("dobletes.tab.campanas", "Campañas"),
                  icon: <Megaphone />,
                },
                {
                  value: "ranking",
                  label: t("dobletes.tab.ranking", "Ranking"),
                  icon: <Trophy />,
                },
                {
                  value: "ajustes",
                  label: t("dobletes.tab.ajustes", "Ajustes"),
                  icon: <Settings2 />,
                },
              ]}
              value={tab}
              onChange={ir}
            />
            {tab === "ofertas" && (
              <TabOfertas resaltada={params.get("busqueda")} />
            )}
            {tab === "reserva" && (
              <TabReserva onCampanaSugerida={campanaSugerida} />
            )}
            {tab === "campanas" && (
              <TabCampanas
                sugerida={sugerida}
                onSugeridaUsada={sugeridaUsada}
              />
            )}
            {tab === "ranking" && <TabRanking />}
            {tab === "ajustes" && <TabAjustes />}
          </>
        )}
      </PageContainer>
    </AppLayout>
  );
}
