import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ApiService } from "@/services/api/apiService";
import { dobletesService } from "@/lib/api/dobletesService";
import type { Gap } from "@/lib/api/gapService";
import {
  inicioDeOferta,
  necesitaReportarFalta,
  peticionParaReportarFalta,
} from "@/lib/cubrirHueco";

/**
 * «Ofrecer» a gap through Dobletes. The offer search hangs off a novedad:
 *   · a falta nobody reported yet is reported first (without a replacement);
 *   · an empty seat (a plaza the schedule leaves empty, a shift without a
 *     guard or held by an archived one) is sent as the seat itself and the
 *     server opens it as a vacancy in the same call;
 *   · leave and anything else with a novedad is offered as it is.
 */
export function useOfertaDobletes() {
  const { t } = useTranslation();
  const [enviando, setEnviando] = useState<string | null>(null);

  const ofrecer = async (gap: Gap): Promise<boolean> => {
    setEnviando(gap.key);
    try {
      let inicio = inicioDeOferta(gap);

      if (!inicio && necesitaReportarFalta(gap)) {
        const p = peticionParaReportarFalta(
          localStorage.getItem("tenantId") || "",
          gap,
        );
        const ev: any = await ApiService.post(p.path, p.body);
        const eventId = String(ev?.id || ev?.data?.id || "");

        if (eventId) inicio = { eventId };
      }
      if (!inicio)
        throw new Error(
          t("ui.SinCubrir.faltaSinNovedad", "No se pudo registrar la falta"),
        );
      await dobletesService.start(inicio);
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
