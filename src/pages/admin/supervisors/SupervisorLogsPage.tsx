import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import AppLayout from "@/layouts/app-layout";
import GuardsLayout from "@/layouts/GuardsLayout";
import RegistroDeIntentos from "@/components/RegistroDeIntentos";

/**
 * Pestaña «Registros» del supervisor: los fichajes que el reloj le RECHAZÓ.
 *
 * Aquí el `:id` de la url YA es su id de usuario (igual que en las demás
 * pestañas del supervisor), así que se pasa tal cual. Es exactamente la misma
 * pantalla que la del vigilante: el suceso es el mismo aunque el reloj que lo
 * rechaza sea otro.
 */
export default function SupervisorLogsPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();

  return (
    <AppLayout>
      <GuardsLayout
        navKey="supervisors"
        title={t("supervisors.nav.logs", { defaultValue: "Registros" })}
      >
        <RegistroDeIntentos userId={id} />
      </GuardsLayout>
    </AppLayout>
  );
}
