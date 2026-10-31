import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ApiService } from "@/services/api/apiService";
import { dobletesService } from "@/lib/api/dobletesService";
import type { Gap } from "@/lib/api/gapService";
import {
  necesitaReportarFalta,
  peticionParaReportarFalta,
} from "@/lib/cubrirHueco";

/**
 * «Ofrecer» a gap through Dobletes: the offer search needs the gap's novedad,
 * so a falta nobody reported yet is reported first (without a replacement).
 * Leave and open shifts with a novedad are offered as they are.
 */
export function useOfertaDobletes() {
  const { t } = useTranslation();
  const [enviando, setEnviando] = useState<string | null>(null);

  const ofrecer = async (gap: Gap): Promise<boolean> => {
    setEnviando(gap.key);
    try {
      let eventId = gap.coverageEventId;

      if (!eventId && necesitaReportarFalta(gap)) {
        const p = peticionParaReportarFalta(
          localStorage.getItem("tenantId") || "",
          gap,
        );
        const ev: any = await ApiService.post(p.path, p.body);

        eventId = String(ev?.id || ev?.data?.id || "") || null;
      }
      if (!eventId)
        throw new Error(
          t("ui.SinCubrir.faltaSinNovedad", "No se pudo registrar la falta"),
        );
      await dobletesService.start({ eventId });
      toast.success(
        t(
          "ui.SinCubrir.ofertaEnviada",
          "Oferta enviada a los vigilantes disponibles.",
        ),
      );

      return true;
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.SinCubrir.noSePudoOfrecer", "No se pudo ofrecer"),
      );

      return false;
    } finally {
      setEnviando(null);
    }
  };

  return { ofrecer, enviando };
}
