/**
 * ════════════════════════════════════════════════════════════════════════════
 * MARCO DE INVITACIÓN DEL VIGILANTE
 * La misma pantalla de acceso que el resto del producto (`AuthShell`), con la
 * marca de la EMPRESA que invita en lugar de la de la plataforma: quien recibe
 * la invitación tiene que reconocer a quien le contrata.
 *
 * ── POR QUÉ YA NO ES UN MARCO PROPIO ───────────────────────────────────────
 * Era un panel de dos columnas con el oro de la marca escrito a mano
 * (#C8860A → #F5C300) sobre un fondo oscuro fijo: ignoraba el acento elegido y
 * se veía idéntico en claro y en oscuro. La firma pública NO cambia —
 * `guard/registration.tsx` lo sigue usando igual— pero por dentro es ya el
 * marco del sistema, así que hereda el cristal, el acento y los dos temas.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { ReactNode } from 'react';
import { CalendarClock, ClipboardCheck, MapPin } from 'lucide-react';
import AuthShell from '@/pages/auth/AuthShell';

export default function GuardInviteLayout({
  children,
  tenantName,
  tenantLogoUrl,
  title,
  subtitle,
}: {
  children: ReactNode;
  tenantName?: string | null;
  tenantLogoUrl?: string | null;
  title: string;
  subtitle?: string;
}) {
  const empresa = (tenantName || '').trim();

  return (
    <AuthShell
      title={title}
      subtitle={subtitle}
      brandName={empresa || undefined}
      logoUrl={tenantLogoUrl || undefined}
      eyebrow="Invitación · Equipo de seguridad"
      /* El formulario del vigilante es largo (documento, fechas, contactos):
         la columna estrecha lo convertiría en una tira interminable. */
      width="lg"
      /* Ya venimos de cargar la invitación por red — una cortina de 2,5 s
         encima sólo retrasa un formulario que el usuario ya está esperando. */
      splash={false}
      features={[
        { icon: MapPin, label: 'Entrada y salida con geolocalización' },
        { icon: ClipboardCheck, label: 'Reportes, rondas y novedades' },
        { icon: CalendarClock, label: 'Tus turnos siempre a la mano' },
      ]}
    >
      {children}
    </AuthShell>
  );
}
