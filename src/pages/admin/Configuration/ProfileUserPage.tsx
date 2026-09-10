import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import SettingsPageShell from "./components/SettingsPageShell";
import ProfileUserForm from "./components/ProfileUserForm";

const ProfileUser = () => {
  const { t } = useTranslation();

  return (
    <SettingsPageShell
      icon={<UserRound />}
      subtitle="Tu foto, tus datos de contacto y el idioma con el que ves la plataforma."
      title={t("ui.ProfileUserPage.perfilDelUsuario", "Perfil del usuario")}
    >
      <ProfileUserForm />
    </SettingsPageShell>
  );
};

export default ProfileUser;
