/**
 * Inside the VigIA Pro page, when the company ALSO has Dobletes: what the
 * assistant does when someone does not show up — only tell the office, or
 * offer the doblete to the reserve on its own. Same setting as Dobletes ›
 * Ajustes (`autoLaunchWithVigiaPro`), saved on change.
 */
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";

import { useModuloDobletes, usePuedeGestionarDobletes } from "./comun";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section } from "@/components/kit";
import { SettingRow } from "@/pages/admin/Configuration/components/SettingsForm";
import { useAgente } from "@/lib/agenteDeMarca";
import dobletesService from "@/lib/api/dobletesService";

export default function ConVigiaPro() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const agente = useAgente();
  const a = { agente: agente.nombre };
  const { tiene } = useModuloDobletes();
  const puede = usePuedeGestionarDobletes();
  const ajustes = useQuery({
    queryKey: ["dobletes", "settings"],
    queryFn: () => dobletesService.settings(),
    enabled: tiene,
    retry: false,
  });

  if (!tiene || !ajustes.data) return null;
  const auto = ajustes.data.settings.autoLaunchWithVigiaPro;

  const cambiar = async (v: string) => {
    try {
      await dobletesService.saveSettings({
        autoLaunchWithVigiaPro: v === "ofrecer",
      });
      toast.success(t("dobletes.ajustes.guardados", "Ajustes guardados"));
      void qc.invalidateQueries({ queryKey: ["dobletes", "settings"] });
    } catch {
      /* shown by the API layer */
    }
  };

  return (
    <Section
      action={
        <Link
          className="text-sm font-semibold"
          style={{ color: "var(--brand-text)" }}
          to="/dobletes?tab=ajustes"
        >
          {t("dobletes.vigia.masAjustes", "Más ajustes de dobletes")}
        </Link>
      }
      icon={<CalendarPlus />}
      title={t("dobletes.titulo", "Dobletes")}
    >
      <SettingRow
        className="py-0"
        control={
          <Select
            disabled={!puede}
            value={auto ? "ofrecer" : "avisar"}
            onValueChange={cambiar}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="avisar">
                {t("dobletes.ajustes.soloAvisar", "Solo avisar a la oficina")}
              </SelectItem>
              <SelectItem value="ofrecer">
                {t(
                  "dobletes.ajustes.ofrecerAuto",
                  "Ofrecer el doblete automáticamente",
                )}
              </SelectItem>
            </SelectContent>
          </Select>
        }
        hint={
          auto
            ? t("dobletes.ajustes.autoHintSi", {
                defaultValue:
                  "Cuando {{agente}} confirma una falta, lanza la búsqueda por oleadas con el bono de la empresa y te cuenta quién lo cubrió.",
                ...a,
              })
            : t("dobletes.ajustes.autoHintNo", {
                defaultValue:
                  "{{agente}} te avisa de la falta y tú decides si ofreces el doblete.",
                ...a,
              })
        }
        label={t("dobletes.ajustes.cuandoFalte", "Cuando falte alguien")}
      />
    </Section>
  );
}
