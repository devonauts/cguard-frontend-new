/**
 * Configuración › Empresa › Marca
 *
 * EL PROBLEMA QUE RESUELVE: el color de la empresa se elegía en TRES pantallas
 * distintas, y las dos que llegan a un tercero traían dorados diferentes escritos
 * a mano — `#C8860A` en Preferencias de Correo y `#d4a017` en el Hub Móvil. Una
 * empresa que quisiera su color tenía que acertar tres veces, y aun así el
 * correo y la app no coincidían.
 *
 * Aquí se elige UNA vez y se escribe en los dos sitios que lo consumen de
 * verdad: el armazón de los correos y la marca de las apps del equipo.
 *
 * EL ACENTO DEL CRM NO ESTÁ AQUÍ, Y ES DELIBERADO. Ese vive en Apariencia y se
 * guarda en el navegador de cada persona: es una preferencia personal, como el
 * modo oscuro. Meterlo aquí obligaría a que el administrador decidiera el color
 * con el que trabajan los demás ocho horas al día. Lo que sí se dice es dónde
 * está, para que nadie lo busque en dos sitios.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Palette, Loader2, Save, Info, Mail, Smartphone } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { PageContainer, PageHeader, Section, SkeletonCards, InfoNote } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

/* Los mismos valores de fábrica que traían las dos pantallas de origen. Aquí
   están juntos para que se vea que eran distintos: ése era el problema. */
const ORO_CORREO = "#C8860A";
const CABECERA = "#0A0E16";

const PRESETS = ["#C8860A", "#1E63C8", "#0E9F6E", "#DC2626", "#7C3AED", "#0891B2"];

const tenantId = () => localStorage.getItem("tenantId") || "";

export default function MarcaPage() {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");

  const [color, setColor] = useState(ORO_CORREO);
  const [cabecera, setCabecera] = useState(CABECERA);
  const [row, setRow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/settings`);
        setRow(data || {});
        const eb = (data && data.emailBranding) || {};
        const ma = (data && data.mobileAppSettings) || {};
        // El correo manda como fuente de verdad: es el que ya tenía pantalla y
        // el que más tenants han tocado.
        setColor(eb.brandColor || ma.accentColor || ORO_CORREO);
        setCabecera(eb.headerColor || CABECERA);
      } catch {
        toast.error("No se pudo cargar la marca.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/tenant/${tenantId()}/settings`, {
        settings: {
          theme: row?.theme || "default",
          // Las relaciones de archivo se reenvían intactas: el backend recalcula
          // logoUrl desde logos[0], así que omitirlas BORRARÍA el logotipo.
          logos: row?.logos || [],
          backgroundImages: row?.backgroundImages || [],
          // Un color, dos destinos. Es todo el propósito de esta pantalla.
          emailBranding: { brandColor: color, headerColor: cabecera },
          mobileAppSettings: { ...(row?.mobileAppSettings || {}), accentColor: color },
        },
      });
      toast.success("Marca guardada. Se aplica a los correos y a las apps del equipo.");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const Swatches = ({ valor, onPick }: { valor: string; onPick: (c: string) => void }) => (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          disabled={!canEdit}
          onClick={() => onPick(c)}
          aria-label={`Color ${c}`}
          aria-pressed={valor.toLowerCase() === c.toLowerCase()}
          className={`cg-focus h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 ${
            valor.toLowerCase() === c.toLowerCase() ? "scale-110" : ""
          }`}
          style={{ background: c, borderColor: valor.toLowerCase() === c.toLowerCase() ? "var(--ink)" : "transparent" }}
        />
      ))}
      <label className="glass-flat ml-1 flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
        <input
          type="color"
          value={valor}
          disabled={!canEdit}
          onChange={(e) => onPick(e.target.value)}
          className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
        />
        Personalizado
      </label>
    </div>
  );

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title="Marca">
        <PageContainer width="narrow">
          <PageHeader
            icon={<Palette />}
            title="Marca"
            subtitle="El color con el que tu empresa se presenta a tus clientes y a tu equipo."
          />

          {loading ? (
            <SkeletonCards count={2} />
          ) : (
            <div className="space-y-5">
              <InfoNote tone="info" icon={<Info />}>
                Este color se elegía en <strong>dos pantallas distintas</strong> y con
                dorados diferentes, así que el correo y la app no coincidían. Ahora se
                elige una vez y se aplica a los dos.
              </InfoNote>

              <Section title="Color de la empresa" icon={<Palette />}>
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  Se usa en el botón principal y la línea superior de tus correos, y como
                  acento de las apps del vigilante y del supervisor.
                </p>
                <Swatches valor={color} onPick={setColor} />

                <div className="mt-5 flex flex-wrap gap-3">
                  <div className="glass-flat flex items-center gap-2.5 px-3 py-2">
                    <Mail className="h-4 w-4" style={{ color: "var(--ink-faint)" }} />
                    <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Correos</span>
                    <span className="h-5 w-10 rounded" style={{ background: color }} />
                  </div>
                  <div className="glass-flat flex items-center gap-2.5 px-3 py-2">
                    <Smartphone className="h-4 w-4" style={{ color: "var(--ink-faint)" }} />
                    <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Apps del equipo</span>
                    <span className="h-5 w-10 rounded" style={{ background: color }} />
                  </div>
                </div>
              </Section>

              <Section title="Cabecera de los correos" icon={<Mail />}>
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  Fondo de la franja donde va tu logotipo. Conviene un tono oscuro para
                  que el texto blanco se lea.
                </p>
                <Swatches valor={cabecera} onPick={setCabecera} />
              </Section>

              <InfoNote tone="neutral">
                ¿El color del panel? Ése es tuyo, no de la empresa: se elige en{" "}
                <strong>Mi cuenta › Apariencia</strong> y se guarda en tu navegador, como
                el modo oscuro. El administrador no decide con qué colores trabaja su
                equipo ocho horas al día.
              </InfoNote>

              <div className="flex justify-end">
                <Button variant="brand" onClick={save} disabled={!canEdit || saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar marca
                </Button>
              </div>
            </div>
          )}
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
