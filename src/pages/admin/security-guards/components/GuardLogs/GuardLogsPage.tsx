import { useTranslation } from "react-i18next";

import AppLayout from "@/layouts/app-layout";
import GuardsLayout from "@/layouts/GuardsLayout";
import RegistroDeIntentos from "@/components/RegistroDeIntentos";
import { useFichaPersona } from "@/layouts/FichaPersona";

/**
 * Pestaña «Registros» del vigilante: los fichajes que el reloj le RECHAZÓ.
 *
 * El `:id` de la url es el de su FICHA de vigilante, y el registro se lleva por
 * id de USUARIO —es el único que comparten vigilantes, supervisores y oficina—.
 * La ruta padre ya resolvió esa equivalencia al cargar la ficha, así que se lee
 * de ahí en vez de volver a pedir el perfil sólo para traducir un id.
 */
export default function GuardLogsPage() {
  const { t } = useTranslation();
  const ficha = useFichaPersona();

  return (
    <AppLayout>
      <GuardsLayout
        navKey="keep-safe"
        title={t("guards.nav.logs", { defaultValue: "Registros" })}
      >
        <RegistroDeIntentos userId={ficha?.entity?.userId ?? null} />
      </GuardsLayout>
    </AppLayout>
  );
}
