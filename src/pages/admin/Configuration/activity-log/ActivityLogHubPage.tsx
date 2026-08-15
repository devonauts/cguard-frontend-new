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
import { History, KeyRound, FileClock, ChevronRight, Info } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { PageContainer, PageHeader, IconTile, InfoNote, Stagger } from "@/components/kit";

const REGISTROS = [
  {
    to: "/security/audit",
    icon: <History />,
    titulo: "Quién cambió qué",
    desc:
      "Altas, modificaciones y borrados sobre clientes, puestos, vigilantes y ajustes, con el autor y la fecha.",
  },
  {
    to: "/historial-inicio-sesion",
    icon: <KeyRound />,
    titulo: "Accesos a la plataforma",
    desc:
      "Inicios y cierres de sesión, intentos fallidos y desde qué dispositivo se entró.",
  },
  {
    to: "/registros-sistema",
    icon: <FileClock />,
    titulo: "Eventos del sistema",
    desc:
      "Lo que la plataforma hizo sola: barridos, avisos automáticos y trabajos programados.",
  },
];

export default function ActivityLogHubPage() {
  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title="Registro de actividad">
        <PageContainer width="narrow">
          <PageHeader
            icon={<History />}
            title="Registro de actividad"
            subtitle="Qué pasó, quién lo hizo y cuándo. Es lo primero que pide una auditoría."
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
              días en la pantalla de al lado y perder pruebas. */}
          <InfoNote tone="neutral" icon={<Info />} className="mt-5">
            La <strong>bitácora de cambios</strong> se borra según el plazo que fijes en{' '}
            <Link to="/setting/retencion" className="underline" style={{ color: 'var(--brand-text)' }}>
              Retención de datos
            </Link>
            ; viene sin plazo, o sea que se conserva hasta que decidas otra cosa. El{' '}
            <strong>historial de accesos</strong> se conserva siempre. Todavía no se pueden
            exportar desde aquí.
          </InfoNote>
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
