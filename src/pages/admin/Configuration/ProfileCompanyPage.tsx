import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import SettingsPageShell from "./components/SettingsPageShell";
import ProfileCompanyForm from "./components/ProfileCompanyForm";

const ProfileCompany = () => {
  const { t } = useTranslation();

  return (
    <SettingsPageShell
      icon={<Building2 />}
      subtitle={t(
        "ui.ProfileCompanyPage.losDatosConLosQueTuEmpresaAparece",
        "Los datos con los que tu empresa aparece en informes, correos y documentos.",
      )}
      title={t("settings.configuracion.perfil-empresa", "Perfil de la empresa")}
    >
      <ProfileCompanyForm />
    </SettingsPageShell>
  );
};

export default ProfileCompany;
