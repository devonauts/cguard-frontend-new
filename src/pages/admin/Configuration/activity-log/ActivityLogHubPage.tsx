/**
 * Configuración › Datos y conexiones › Registro de actividad
 *
 * EL PROBLEMA QUE RESUELVE: el registro existía TRES VECES y ninguna estaba
 * donde se busca. `/security/audit` y `/registros-sistema` estaban enrutadas y
 * no aparecían en ningún menú; sólo `/historial-inicio-sesion` tenía enlace, y
 * colgado del menú del avatar. Una función de cumplimiento que existe y nadie
 * encuentra vale lo mismo que no tenerla — y es lo primero que pide un auditor.
 *
 * Esta página no duplica nada: es la puerta que faltaba. Cada tarjeta lleva a la
 * pantalla real, que sigue siendo la misma y conserva sus permisos.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { History, KeyRound, FileClock, ChevronRight, Info } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { PageContainer, PageHeader, IconTile, InfoNote, Stagger } from "@/components/kit";

export default function ActivityLogHubPage() {
  const { t } = useTranslation();

  const REGISTROS = [
    {
      to: "/security/audit",
      icon: <History />,
      titulo: t('settings.activityLog.auditTitle', { defaultValue: 'Quién cambió qué' }),
      desc: t('settings.activityLog.auditDesc', { defaultValue: 'Altas, modificaciones y borrados sobre clientes, puestos, vigilantes y ajustes, con el autor y la fecha.' }),
    },
    {
      to: "/historial-inicio-sesion",
      icon: <KeyRound />,
      titulo: t('settings.activityLog.accessTitle', { defaultValue: 'Accesos a la plataforma' }),
      desc: t('settings.activityLog.accessDesc', { defaultValue: 'Inicios y cierres de sesión, intentos fallidos y desde qué dispositivo se entró.' }),
    },
    {
      to: "/registros-sistema",
      icon: <FileClock />,
      titulo: t('settings.activityLog.systemTitle', { defaultValue: 'Eventos del sistema' }),
      desc: t('settings.activityLog.systemDesc', { defaultValue: 'Lo que la plataforma hizo sola: barridos, avisos automáticos y trabajos programados.' }),
    },
  ];

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title={t('settings.activityLog.pageTitle', { defaultValue: 'Registro de actividad' })}>
        <PageContainer width="narrow">
          <PageHeader
            icon={<History />}
            title={t('settings.activityLog.pageTitle', { defaultValue: 'Registro de actividad' })}
            subtitle={t('settings.activityLog.pageSubtitle', { defaultValue: 'Qué pasó, quién lo hizo y cuándo. Es lo primero que pide una auditoría.' })}
          />

          <Stagger className="space-y-3">
            {REGISTROS.map((r) => (
              <Link
                key={r.to}
                to={r.to}
                className="glass-flat glass-hover cg-focus group flex items-start gap-3 p-4"
              >
                <IconTile size="sm">{r.icon}</IconTile>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{r.titulo}</h3>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                      style={{ color: "var(--ink-faint)" }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--ink-soft)" }}>
                    {r.desc}
                  </p>
                </div>
              </Link>
            ))}
          </Stagger>

          {/* Este texto decía «se conservan sin límite de tiempo, todavía no hay
              política de retención configurable» — y para cuando se escribió eso
              era verdad, pero Retención de datos ya está publicada DOS FILAS más
              arriba en este mismo índice y borra la bitácora de cambios de
              verdad. Alguien podía leer aquí que su bitácora es eterna, fijar 90
              días en la pantalla de al lado y perder pruebas.

              2026-08-17: y quedó obsoleta OTRA VEZ en cuanto el historial de
              accesos ganó su propio plazo de retención y su exportación. Es el
              tercer aviso de que un texto que describe lo que la plataforma
              «todavía no hace» caduca solo — si vuelve a hacer falta uno, que
              enlace a la pantalla en vez de afirmar lo que existe. */}
          <InfoNote tone="neutral" icon={<Info />} className="mt-5">
            {t('settings.activityLog.retentionNoteLead', { defaultValue: 'La' })}{' '}
            <strong>{t('settings.activityLog.changeLogLabel', { defaultValue: 'bitácora de cambios' })}</strong>{' '}
            {t('settings.activityLog.retentionNoteMid1', { defaultValue: 'y el' })}{' '}
            <strong>{t('settings.activityLog.accessHistoryLabel', { defaultValue: 'historial de accesos' })}</strong>{' '}
            {t('settings.activityLog.retentionNoteMid2', { defaultValue: 'se borran según los plazos que fijes en' })}{' '}
            <Link to="/setting/retencion" className="underline" style={{ color: 'var(--brand-text)' }}>
              {t('settings.activityLog.retentionLinkLabel', { defaultValue: 'Retención de datos' })}
            </Link>
            {t('settings.activityLog.retentionNoteTail', { defaultValue: '. Los dos vienen sin plazo, o sea que se conservan hasta que decidas otra cosa. Puedes descargarlos en CSV desde su pantalla.' })}
          </InfoNote>
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
