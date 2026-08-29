/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONFIGURACIÓN › IDIOMA
 *
 * El CRM sigue por defecto el idioma del NAVEGADOR, como una app sigue la
 * config del teléfono. Esta pantalla existe para poder llevarle la contraria:
 * hay quien trabaja con el sistema en inglés y quiere el CRM en español, y al
 * revés.
 *
 * «Automático» es una opción de pleno derecho, no sólo el punto de partida:
 * quien probó el inglés tiene que poder volver a que lo decida el navegador. Por
 * eso se guarda la ELECCIÓN, no sólo el idioma resultante — ver LanguageContext.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useTranslation } from "react-i18next";
import { Languages, Check, Wand2, Monitor, Mail } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import {
  PageContainer, PageHeader, Section, StatusBadge, IconTile, FadeIn,
} from "@/components/kit";
import { useLanguage, LANGUAGES, type LanguageChoice } from "@/contexts/LanguageContext";
import { toast } from "sonner";

export default function LanguagePage() {
  const { t } = useTranslation();
  const { language, choice, setChoice, detected } = useLanguage();

  const nombre = (l: keyof typeof LANGUAGES) => LANGUAGES[l].name;
  // El tipo sale de LANGUAGES, no de una lista repetida a mano: cada idioma
  // nuevo obligaba a tocar este archivo y el fallo era un error de tipos.
  const bandera = (l: keyof typeof LANGUAGES) => LANGUAGES[l].flag;

  const opciones: { id: LanguageChoice; titulo: string; pie: string; icono: React.ReactNode }[] = [
    {
      id: "auto",
      titulo: t('settings.language.autoTitle', { defaultValue: 'Automático' }),
      pie: t('settings.language.autoDesc', {
        defaultValue: 'El que use tu navegador. Ahora mismo: {{idioma}}',
        idioma: nombre(detected),
      }),
      icono: <Wand2 />,
    },
    // La lista sale de LANGUAGES: un idioma nuevo aparece solo, sin tocar aquí.
    ...(Object.keys(LANGUAGES) as (keyof typeof LANGUAGES)[]).map((l) => ({
      id: l as LanguageChoice,
      titulo: `${bandera(l)} ${nombre(l)}`,
      pie: t('settings.language.fixedDesc', { defaultValue: 'Siempre en este idioma, use lo que use tu navegador.' }),
      icono: <Languages />,
    })),
  ];

  const elegir = (id: LanguageChoice) => {
    if (id === choice) return;
    setChoice(id);
    toast.success(t('settings.language.saved', { defaultValue: 'Idioma guardado' }));
  };

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title={t('settings.language.layoutTitle', { defaultValue: 'Idioma' })}>
        <PageContainer width="wide">
          <PageHeader
            icon={<Languages />}
            title={t('settings.language.pageTitle', { defaultValue: 'Idioma' })}
            subtitle={t('settings.language.pageSubtitle', {
              defaultValue: 'En qué idioma quieres ver el C-Guard Pro. Normalmente lo decide tu navegador, pero aquí puedes fijarlo tú. El cambio se aplica al instante y se guarda en tu cuenta, así que lo verás igual desde cualquier computadora.',
            })}
            badges={
              <>
                <StatusBadge tone="brand">{bandera(language)} {nombre(language)}</StatusBadge>
                <StatusBadge tone="neutral" dot={false}>
                  {choice === "auto"
                    ? t('settings.language.badgeAuto', { defaultValue: 'Automático' })
                    : t('settings.language.badgeFixed', { defaultValue: 'Elegido por ti' })}
                </StatusBadge>
              </>
            }
          />

          {/* ── LA ELECCIÓN ───────────────────────────────────────────────── */}
          <Section
            title={t('settings.language.chooseSection', { defaultValue: 'Elige el idioma' })}
            icon={<Languages />}
          >
            <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              {t('settings.language.chooseIntro', {
                defaultValue: 'Se aplica sólo a tu cuenta: cada persona del equipo elige el suyo, y nadie ve el CRM distinto por lo que tú elijas aquí.',
              })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {opciones.map((o) => {
                const activo = o.id === choice;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => elegir(o.id)}
                    aria-pressed={activo}
                    className="cg-focus flex items-center gap-3 rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5"
                    style={{
                      borderColor: activo ? "var(--brand)" : "var(--hairline)",
                      background: activo ? "var(--brand-wash)" : "var(--glass-sunken)",
                      boxShadow: activo ? "0 0 28px -10px var(--brand-glow)" : "none",
                    }}
                  >
                    <IconTile tone={activo ? "brand" : "neutral"}>{o.icono}</IconTile>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold" style={{ color: "var(--ink)" }}>{o.titulo}</span>
                      <span className="block text-xs" style={{ color: "var(--ink-faint)" }}>{o.pie}</span>
                    </span>
                    {activo && <Check className="h-4 w-4 shrink-0" style={{ color: "var(--brand-text)" }} />}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ── QUÉ ALCANZA EL CAMBIO ─────────────────────────────────────── */}
          <Section
            title={t('settings.language.reachSection', { defaultValue: 'Hasta dónde llega' })}
            icon={<Mail />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FadeIn>
                <div className="glass-sunken flex items-start gap-3 rounded-2xl p-4">
                  <Monitor className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ink-faint)" }} />
                  <p className="text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                    {t('settings.language.reachScreen', {
                      defaultValue: 'Todo lo que ves en pantalla: menús, botones, avisos y los nombres de las secciones.',
                    })}
                  </p>
                </div>
              </FadeIn>
              <FadeIn>
                <div className="glass-sunken flex items-start gap-3 rounded-2xl p-4">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ink-faint)" }} />
                  <p className="text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                    {t('settings.language.reachMail', {
                      defaultValue: 'Y también los correos y avisos que te enviamos: se escriben en el idioma que elijas aquí.',
                    })}
                  </p>
                </div>
              </FadeIn>
            </div>
          </Section>
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
