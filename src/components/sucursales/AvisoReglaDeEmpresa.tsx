import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Building2 } from "lucide-react";

import { esRutaDeReglaDeEmpresa } from "./reglasDeEmpresa";

import { InfoNote } from "@/components/kit";
import { useEsGerenteDeSucursal } from "@/hooks/useGerenteDeSucursal";

/** The notice a branch manager sees on a company-wide settings page. */
export default function AvisoReglaDeEmpresa() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const gerente = useEsGerenteDeSucursal();

  if (!gerente || !esRutaDeReglaDeEmpresa(pathname)) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-3">
      <InfoNote
        icon={<Building2 />}
        title={t("sucursales.gerente.reglaDeEmpresaTitulo")}
        tone="neutral"
      >
        {t("sucursales.gerente.reglaDeEmpresaDesc")}
      </InfoNote>
    </div>
  );
}
