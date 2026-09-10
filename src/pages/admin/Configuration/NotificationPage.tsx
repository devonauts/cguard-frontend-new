import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";

import SettingsPageShell from "./components/SettingsPageShell";
import NotificationForm from "./components/NotificationForm";

const Notification = () => {
  const { t } = useTranslation();

  return (
    // `table`: es una matriz de canales por tipo de aviso, no un formulario en
    // columna — necesita el ancho.
    <SettingsPageShell
      icon={<Bell />}
      kind="table"
      subtitle={t("ui.NotificationPage.eligePorQueViaTe")}
      title={t(
        "ui.Notification.configuracionDeAvisos",
        "Configuración de avisos",
      )}
    >
      <NotificationForm />
    </SettingsPageShell>
  );
};

export default Notification;
