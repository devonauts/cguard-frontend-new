import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Building2 } from "lucide-react";

import { esRutaDeReglaDeEmpresa } from "./reglasDeEmpresa";

import { InfoNote } from "@/components/kit";
import { useEsGerenteDeSucursal } from "@/hooks/useGerenteDeSucursal";
import { useEsAdminDeMarca } from "@/hooks/useAccesoDeMarca";

/** The notice a branch manager sees on a company-wide settings page. */
export default function AvisoReglaDeEmpresa() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const gerente = useEsGerenteDeSucursal();
  // Multimarca phase 2: the same company-wide rules list for a brand admin.
  const adminDeMarca = useEsAdminDeMarca();

  if ((!gerente && !adminDeMarca) || !esRutaDeReglaDeEmpresa(pathname))
    return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-3">
      <InfoNote
        icon={<Building2 />}
        title={t("sucursales.gerente.reglaDeEmpresaTitulo")}
        tone="neutral"
      >
        {gerente
          ? t("sucursales.gerente.reglaDeEmpresaDesc")
          : t(
              "ui.AccesoDeMarca.reglaDeEmpresaDesc",
              "Como administrador de marca puedes verla, pero vale para todas las marcas: la cambia un administrador de la empresa.",
            )}
      </InfoNote>
    </div>
  );
}
