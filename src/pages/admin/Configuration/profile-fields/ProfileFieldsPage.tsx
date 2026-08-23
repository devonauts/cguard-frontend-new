/**
 * Campos de Perfil.
 *
 * ── POR QUÉ AQUÍ NO SE PUEDE CREAR NADA ────────────────────────────────────
 * La pantalla ofrecía «Nuevo campo», un diálogo completo y una tabla… sobre
 * una lista vacía fija (`rows = []`) y un `onSubmit` que sólo cerraba el
 * diálogo. No existe tabla ni endpoint de campos personalizados en el backend:
 * lo que el administrador escribía se perdía al pulsar Guardar.
 *
 * Crear ese almacén es una decisión de producto (qué fichas admiten campos
 * propios, de qué tipos, quién los ve, cómo salen en informes y exportaciones),
 * así que la pantalla ahora DICE la verdad y no invita a crear nada. Cuando la
 * función se construya, este archivo vuelve a ser una página de catálogo
 * normal (buscador + tabla + diálogo), como Tipos de Incidentes.
 */
import { ListChecks, Building2, IdCard, Network } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState, Section, Stagger } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";
import { SettingsLinkCard, SettingsLinkGrid } from "../components/SettingsForm";

export default function ProfileFieldsPage() {
  const { t } = useTranslation();
  return (
    <SettingsPageShell
      icon={<ListChecks />}
      title={t('settings.profileFields.pageTitle', { defaultValue: "Campos de Perfil" })}
      subtitle={t('settings.profileFields.pageSubtitle', { defaultValue: "Datos propios de tu empresa en las fichas de clientes, puestos, vigilantes y personal." })}
    >
      <Stagger className="space-y-6">
        <EmptyState
          icon={<ListChecks />}
          title={t('settings.profileFields.emptyTitle', { defaultValue: "Los campos personalizados todavía no están disponibles" })}
          description={t('settings.profileFields.emptyDescription', { defaultValue: "Añadir campos propios a las fichas aún no se puede configurar: no habría dónde guardarlos. En cuanto la función exista, se administrará desde aquí." })}
        />

        <Section title={t('settings.profileFields.meanwhileTitle', { defaultValue: "Mientras tanto" })} icon={<IdCard />}>
          <SettingsLinkGrid>
            <SettingsLinkCard
              to="/setting/tipos-licencias"
              icon={<IdCard className="h-4 w-4" />}
              title={t('settings.profileFields.licenseTypesTitle', { defaultValue: "Tipos de Licencias" })}
              description={t('settings.profileFields.licenseTypesDescription', { defaultValue: "Licencias y certificaciones que se registran en la ficha de cada vigilante." })}
            />
            <SettingsLinkCard
              to="/setting/Departamentos"
              icon={<Network className="h-4 w-4" />}
              title={t('settings.profileFields.departmentsTitle', { defaultValue: "Departamentos" })}
              description={t('settings.profileFields.departmentsDescription', { defaultValue: "Clasifica al personal por área sin tocar la ficha." })}
            />
            <SettingsLinkCard
              to="/setting/company-profile"
              icon={<Building2 className="h-4 w-4" />}
              title={t('settings.profileFields.companyProfileTitle', { defaultValue: "Perfil de la Empresa" })}
              description={t('settings.profileFields.companyProfileDescription', { defaultValue: "Los datos de la empresa que salen en informes y comunicaciones." })}
            />
          </SettingsLinkGrid>
        </Section>
      </Stagger>
    </SettingsPageShell>
  );
}
