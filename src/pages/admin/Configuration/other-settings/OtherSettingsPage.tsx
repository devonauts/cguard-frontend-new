/**
 * Otras Configuraciones.
 *
 * ── POR QUÉ ESTA PÁGINA YA NO TIENE FORMULARIO ─────────────────────────────
 * Traía doce controles (moneda, formato de fecha y hora, inicio de semana,
 * tolerancia de tardanza, horas decimales, marca de tiempo en las fotos,
 * conjuntos de habilidades…) y un botón «Guardar» que no guardaba: la página
 * ni siquiera pasaba `onSubmit` al formulario.
 *
 * Al revisarlos uno a uno, NINGUNO tenía motor detrás, y los dos que de verdad
 * hacen algo ya se configuran donde se aplican:
 *   · tolerancia de tardanza  → Asistencia › Ajustes (ventanas de marcación)
 *   · zona horaria de la empresa → Perfil de la Empresa
 * Persistirlos aquí habría sido la misma mentira con otra forma: el
 * administrador mueve un interruptor, ve «Guardado», y semanas después
 * descubre que los informes siguen igual. Así que la página dice la verdad y
 * lleva a donde el ajuste existe de verdad.
 *
 * Si algún día el formato de fecha/hora o la moneda se vuelven configurables,
 * su sitio es esta página — con su columna en `settings` y su consumidor real,
 * como se hizo con Configuración de Informes.
 */
import { SlidersHorizontal, Clock, Building2, Palette, Network, FileBarChart, MapPin } from "lucide-react";
import { Section, Stagger, InfoNote } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";
import { SettingsLinkCard, SettingsLinkGrid } from "../components/SettingsForm";

export default function OtherSettingsPage() {
  return (
    <SettingsPageShell
      icon={<SlidersHorizontal />}
      title="Otras Configuraciones"
      subtitle="Dónde se configura cada preferencia general de la plataforma."
    >
      <Stagger className="space-y-6">
        <Section title="Ajustes generales" icon={<SlidersHorizontal />}>
          <SettingsLinkGrid>
            <SettingsLinkCard
              to="/nomina/settings"
              icon={<Clock className="h-4 w-4" />}
              title="Asistencia y marcaciones"
              description="Tolerancia antes de marcar un turno como tarde, ventanas de entrada y salida, geocerca y aprobación."
            />
            <SettingsLinkCard
              to="/setting/company-profile"
              icon={<Building2 className="h-4 w-4" />}
              title="Perfil de la Empresa"
              description="Zona horaria, dirección, teléfono, correo y número de licencia — los datos que salen en los informes."
            />
            <SettingsLinkCard
              to="/setting/apariencia"
              icon={<Palette className="h-4 w-4" />}
              title="Apariencia"
              description="Color de la plataforma, modo claro u oscuro e idioma."
            />
            <SettingsLinkCard
              to="/setting/Departamentos"
              icon={<Network className="h-4 w-4" />}
              title="Departamentos"
              description="Estructura interna con la que se agrupa al personal."
            />
            <SettingsLinkCard
              to="/setting/report-configuration"
              icon={<FileBarChart className="h-4 w-4" />}
              title="Configuración de Informes"
              description="Privacidad, encabezado y pie de página de los informes exportados o enviados."
            />
            <SettingsLinkCard
              to="/setting/publishing-sites"
              icon={<MapPin className="h-4 w-4" />}
              title="Reglas globales de puestos"
              description="Exigir turno activo para las rondas y alertas de salida de geocerca."
            />
          </SettingsLinkGrid>
        </Section>

        <InfoNote tone="neutral" title="Lo que todavía no es configurable">
          El formato de fecha y hora sigue el idioma de la plataforma y la zona horaria de la
          empresa; la moneda, el día de inicio de la semana y la marca de tiempo sobre las
          fotos no se pueden cambiar por ahora. Antes aparecían aquí como interruptores que
          no guardaban nada.
        </InfoNote>
      </Stagger>
    </SettingsPageShell>
  );
}
