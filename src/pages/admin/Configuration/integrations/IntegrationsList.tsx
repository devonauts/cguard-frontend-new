/**
 * Configuración › Datos y conexiones › Conexiones y API
 *
 * QUÉ HABÍA AQUÍ Y POR QUÉ SE FUE:
 * Un catálogo de ocho integraciones escrito a mano —QuickBooks, ADP, Paychex,
 * Gusto, Xero…— con tres problemas a la vez:
 *
 *   · No existía NINGÚN módulo de integraciones en el backend. Los botones
 *     «Conectar», «Desconectar» y «Ajustes» no tenían siquiera `onClick`.
 *   · Los dos archivos que lo definían se contradecían: QuickBooks salía
 *     `active: true` en la lista y `enabled: false` en los datos; ADP al revés,
 *     de modo que la pantalla anunciaba «Conectada» una integración inexistente.
 *   · Los logotipos se cargaban desde `app.guardspro.com` — el dominio de otro
 *     producto — y todo el catálogo era nómina de Estados Unidos en una
 *     plataforma que pide RUC ecuatoriano y RFC mexicano.
 *
 * Se sustituye por la verdad. Es el mismo criterio con el que se vació «Otras
 * configuraciones»: una pantalla que promete lo que no hay no es un adelanto,
 * es una deuda con el cliente que la abre.
 */
import { Plug, Info } from "lucide-react";
import { useTranslation } from "react-i18next";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import {
  PageContainer,
  PageHeader,
  EmptyState,
  InfoNote,
} from "@/components/kit";
import ConexionGusto from "./ConexionGusto";

export default function IntegrationsList() {
  const { t } = useTranslation();
  /* El nombre del anfitrión: «C-Guard Pro» en el de la plataforma, el del
     socio en el suyo. Por eso estos textos ya no lo llevan escrito. */
  const { platformName: nombreDeMarca } = useWhiteLabel();

  return (
    <AppLayout>
      <SettingsLayout
        navKey="configuracion"
        title={t("settings.configuracion.integraciones", "Conexiones y API")}
      >
        <PageContainer width="narrow">
          <PageHeader
            icon={<Plug />}
            subtitle={t("ui.IntegrationsList.conectarCGuardProCon", { marca: nombreDeMarca })}
            title={t("settings.configuracion.integraciones", "Conexiones y API")}
          />

          {/* Gusto (nómina de EE. UU.): sólo se pinta a empresas de EE. UU. */}
          <ConexionGusto />

          <EmptyState
            description={t(
              "ui.IntegrationsList.lasIntegracionesConCatalogoApareceran",
              "Las integraciones con catálogo aparecerán aquí cuando existan. Si necesitas conectar uno concreto hoy, dínoslo — saber cuál decide en qué orden se construyen.",
            )}
            icon={<Plug />}
            title={t(
              "ui.IntegrationsList.buscasConectarOtroSistema",
              "¿Buscas conectar otro sistema?",
            )}
          />

          <InfoNote className="mt-5" icon={<Info />} tone="info">
            {t(
              "ui.IntegrationsList.necesitasMoverDatosHoy",
              "¿Necesitas mover datos hoy? Los informes de",
            )}{" "}
            <strong>{t("ui.IntegrationsList.operacion", "Operación")}</strong>{" "}
            {t(
              "ui.IntegrationsList.yLosDelPortalDeTuCliente",
              "y los del portal de tu cliente se exportan en CSV y PDF, y el detalle de qué incluyen se configura en",
            )}{" "}
            <strong>
              {t(
                "ui.IntegrationsList.datosYConexionesInformes",
                "Datos y conexiones › Informes",
              )}
            </strong>
            {t(
              "ui.IntegrationsList.siTienesUnSistemaConcreto",
              ". Si tienes un sistema concreto con el que necesitas integrarte, dínoslo: saber cuál es lo que decide en qué orden se construyen.",
            )}
          </InfoNote>
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
