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
import { Plug, Info, KeyRound, ChevronRight } from "lucide-react";

import { useTranslation } from 'react-i18next';
import { Link } from "react-router-dom";
import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { PageContainer, PageHeader, EmptyState, InfoNote } from "@/components/kit";

export default function IntegrationsList() {
  const { t } = useTranslation();
  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title="Conexiones y API">
        <PageContainer width="narrow">
          <PageHeader
            icon={<Plug />}
            title="Conexiones y API"
            subtitle={t('ui.IntegrationsList.conectarCGuardProCon')}
          />

          <Link
            to="/setting/api-keys"
            className="group flex items-center gap-3 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4 transition-colors hover:border-[color:var(--brand)]"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--surface-2)] text-[color:var(--brand-text)]">
              <KeyRound size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-[color:var(--ink)]">{t('ui.IntegrationsList.llavesDeApi', 'Llaves de API')}</span>
              <span className="block text-sm text-[color:var(--ink-soft)]">
                Da a un sistema externo acceso de solo lectura a tus trabajadores y horas — por ejemplo, para pagar la nómina.
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-[color:var(--ink-faint)] transition-transform group-hover:translate-x-0.5" />
          </Link>

          <EmptyState
            className="mt-5"
            icon={<Plug />}
            title={t('ui.IntegrationsList.buscasConectarOtroSistema', '¿Buscas conectar otro sistema?')}
            description="Las integraciones con catálogo aparecerán aquí cuando existan. Si necesitas conectar uno concreto hoy, dínoslo — saber cuál decide en qué orden se construyen."
          />

          <InfoNote tone="info" icon={<Info />} className="mt-5">
            ¿Necesitas mover datos hoy? Los informes de <strong>{t("ui.IntegrationsList.operacion", "Operación")}</strong> y los
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
