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

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { PageContainer, PageHeader, EmptyState, InfoNote } from "@/components/kit";

export default function IntegrationsList() {
  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title="Conexiones y API">
        <PageContainer width="narrow">
          <PageHeader
            icon={<Plug />}
            title="Conexiones y API"
            subtitle="Conectar C-Guard Pro con otros sistemas de tu empresa."
          />

          <EmptyState
            icon={<Plug />}
            title="Todavía no hay integraciones disponibles"
            description="Cuando existan, aparecerán aquí y podrás conectarlas tú mismo. Mientras tanto, nada de esta pantalla está conectado: preferimos decírtelo a enseñarte un catálogo que no funciona."
          />

          <InfoNote tone="info" icon={<Info />} className="mt-5">
            ¿Necesitas mover datos hoy? Los informes de <strong>Operación</strong> y los
            del portal de tu cliente se exportan en CSV y PDF, y el detalle de qué
            incluyen se configura en <strong>Datos y conexiones › Informes</strong>.
            Si tienes un sistema concreto con el que necesitas integrarte, dínoslo:
            saber cuál es lo que decide en qué orden se construyen.
          </InfoNote>
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
