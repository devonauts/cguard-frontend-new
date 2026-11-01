import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { dobletesService } from "@/lib/api/dobletesService";
import type { Gap } from "@/lib/api/gapService";
import { inicioDeOferta, necesitaReportarFalta } from "@/lib/cubrirHueco";

/**
 * «Ofrecer» a gap through Dobletes. The offer search hangs off a novedad:
 *   · a falta nobody reported yet is sent as `absence`: the server reports it
 *     and withdraws it again if the offer cannot start;
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
      let inicio: Parameters<typeof dobletesService.start>[0] | null =
        inicioDeOferta(gap);

      // An unreported falta goes in the same call: the server reports it and
      // takes it back if the offer cannot start (no novedad left behind).
      if (!inicio && necesitaReportarFalta(gap) && gap.guardId && gap.shiftId)
        inicio = { absence: { guardId: gap.guardId, shiftId: gap.shiftId } };
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
      // The axios client already showed this one (QA: the 409 appeared twice).
      if (e?.toastShown) return false;
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
