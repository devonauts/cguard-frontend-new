/**
 * Hub móvil del equipo — Settings › personalización de las apps del VIGILANTE
 * y del SUPERVISOR (no confundir con /setting/mobil, que gestiona contenido de
 * la app del CLIENTE).
 *
 * Guarda settings.mobileAppSettings vía el PUT /settings existente (saneado
 * server-side). IMPORTANTE: el PUT recalcula logoUrl desde `logos[0]`, así que
 * SIEMPRE re-enviamos logos/backgroundImages tal como llegaron del GET — si no,
 * borraríamos el logo de la empresa. Las apps leen la config resuelta por
 * GET /tenant/:id/mobile-app-config al iniciar sesión.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  TabletSmartphone, Palette, LayoutGrid, Mic, Save, RotateCcw,
  GraduationCap, TrendingUp, Users, CalendarOff, LifeBuoy, Map as MapIcon,
  RadioTower, Home, Route as RouteIcon, CalendarDays, User as UserIcon,
  Wifi, BatteryFull, SignalHigh, ChevronRight, ShieldAlert, ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/SettingsLayout';
import { PageContainer, PageHeader, Section, SkeletonCards, Segmented, StatusBadge, IconTile, SmartImage } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { usePermissions } from '@/hooks/usePermissions';

/* ────────────────────────────────────────────────────────────────────────────
   Los colores de abajo NO son estilos del CRM: son DATOS de la empresa. Es el
   acento con el que se pintan SUS apps de móvil, se guarda en su cuenta y lo
   aplica una app nativa que no comparte los tokens del panel. Por eso van
   escritos y no salen de `--brand`.
   ──────────────────────────────────────────────────────────────────────────── */
const DEFAULT_ACCENT = '#d4a017'; // el dorado de fábrica de las apps

const PRESET_ACCENTS = [
  DEFAULT_ACCENT, '#2563eb', '#16a34a', '#dc2626',
  '#7c3aed', '#0d9488', '#ea580c', '#475569',
];

interface MobileAppSettings {
  accentColor: string;
  /** '' = la del sistema · las tres van empaquetadas en la app */
  fontFamily: '' | 'poppins' | 'inter' | 'manrope';
  displayName: string;
  tagline: string;
  useTenantLogo: boolean;
  defaultTheme: 'dark' | 'light' | 'user';
  modules: Record<ModuleKey, boolean>;
}

type ModuleKey = 'training' | 'performance' | 'visitors' | 'timeOff' | 'backup' | 'map' | 'radioNativa';

const MODULE_META: { key: ModuleKey; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'training', label: 'Entrenamiento', desc: 'Cursos, evaluaciones y certificados.', icon: <GraduationCap size={16} /> },
  { key: 'performance', label: 'Mi desempeño', desc: 'Puntaje y evolución del vigilante.', icon: <TrendingUp size={16} /> },
  { key: 'visitors', label: 'Control de visitas', desc: 'Registro de visitantes en el puesto.', icon: <Users size={16} /> },
  { key: 'timeOff', label: 'Permisos y vacaciones', desc: 'Solicitudes de días libres.', icon: <CalendarOff size={16} /> },
  { key: 'backup', label: 'Respaldo', desc: 'Solicitud de refuerzo/backup.', icon: <LifeBuoy size={16} /> },
  { key: 'radioNativa', label: 'Radio nativa (piloto)', desc: 'La radio corre fuera del navegador de la app: sigue sonando con la pantalla apagada o usando otras apps, sin acaparar el micrófono. Requiere la versión más reciente de las apps.', icon: <RadioTower size={16} /> },
  { key: 'map', label: 'Mapa', desc: 'Mapa del sitio y ubicaciones.', icon: <MapIcon size={16} /> },
];

const DEFAULTS: MobileAppSettings = {
  accentColor: '',
  fontFamily: '',
  displayName: '',
  tagline: '',
  useTenantLogo: true,
  defaultTheme: 'dark',
  modules: { training: true, performance: true, visitors: true, timeOff: true, backup: true, map: true, radioNativa: false },
};

// Partial view of the tenant settings blob (GET/PUT /settings). Only the fields
// this page reads or round-trips are named; the backend recomputes logoUrl from
// logos[0], so logos/backgroundImages must be re-sent untouched on save.
type SettingsRow = {
  theme?: string;
  logoUrl?: string;
  logos?: Array<{ downloadUrl?: string }>;
  backgroundImages?: unknown[];
  mobileAppSettings?: Partial<MobileAppSettings>;
};

const tenantId = () => localStorage.getItem('tenantId') || '';

export default function MobileHubPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('settingsEdit');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<MobileAppSettings>(DEFAULTS);
  /** Full settings row from GET — re-sent on save so logoUrl/logos survive. */
  const [row, setRow] = useState<SettingsRow | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/settings`);
        setRow(data || {});
        const stored = (data && data.mobileAppSettings) || {};
        setCfg({
          ...DEFAULTS,
          ...stored,
          modules: { ...DEFAULTS.modules, ...(stored.modules || {}) },
        });
      } catch {
        toast.error(t('settings.mobileHub.loadError', { defaultValue: 'No se pudo cargar la configuración.' }));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const accent = cfg.accentColor || DEFAULT_ACCENT;
  const logoUrl: string | null = row?.logoUrl || row?.logos?.[0]?.downloadUrl || null;
  const set = <K extends keyof MobileAppSettings>(k: K, v: MobileAppSettings[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/tenant/${tenantId()}/settings`, {
        settings: {
          theme: row?.theme || 'default',
          // Round-trip the file relations untouched — the backend recomputes
          // logoUrl from logos[0], so omitting them would ERASE the logo.
          logos: row?.logos || [],
          backgroundImages: row?.backgroundImages || [],
          mobileAppSettings: cfg,
        },
      });
      toast.success(t('settings.mobileHub.saveSuccess', { defaultValue: 'Hub móvil guardado. Las apps abiertas lo aplican en segundos.' }));
    } catch (e: any) {
      toast.error(e?.message || t('settings.mobileHub.saveError', { defaultValue: 'No se pudo guardar.' }));
    } finally {
      setSaving(false);
    }
  };

  const modulosActivos = useMemo(
    () => MODULE_META.filter((m) => cfg.modules[m.key]).length,
    [cfg.modules],
  );

  const preview = useMemo(() => (
    <PhonePreview
      accent={accent}
      name={cfg.displayName || 'C-Guard Pro'}
      tagline={cfg.tagline || 'Security Operations'}
      logoUrl={cfg.useTenantLogo ? logoUrl : null}
      light={cfg.defaultTheme === 'light'}
    />
  ), [accent, cfg.displayName, cfg.tagline, cfg.useTenantLogo, cfg.defaultTheme, logoUrl]);

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title={t('settings.mobileHub.layoutTitle', { defaultValue: 'App del equipo' })}>
        <PageContainer width="wide">
          <PageHeader
            icon={<TabletSmartphone />}
            title={t('settings.mobileHub.pageTitle', { defaultValue: 'Hub móvil del equipo' })}
            subtitle={t('settings.mobileHub.pageSubtitle', { defaultValue: 'Personaliza las apps del vigilante y del supervisor con la identidad de tu empresa.' })}
            badges={
              !loading ? (
                <StatusBadge tone={modulosActivos === MODULE_META.length ? 'ok' : 'neutral'}>
                  {t('settings.mobileHub.modulesVisibleBadge', { defaultValue: '{{active}} de {{total}} módulos visibles', active: modulosActivos, total: MODULE_META.length })}
                </StatusBadge>
              ) : undefined
            }
            actions={
              <Button variant="brand" onClick={save} disabled={!canEdit || saving || loading}>
                <Save size={16} className="mr-2" />
                {saving ? t('settings.mobileHub.saving', { defaultValue: 'Guardando…' }) : t('settings.mobileHub.saveChanges', { defaultValue: 'Guardar cambios' })}
              </Button>
            }
          />

          {loading ? (
            <SkeletonCards count={4} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
              <div className="space-y-6">
                {/* ── Marca ─────────────────────────────────────────────── */}
                <Section title={t('settings.mobileHub.brandSectionTitle', { defaultValue: 'Marca' })} icon={<Palette size={18} />}>
                  <div className="space-y-6">
                    <div>
                      <Label className="mb-2 block">{t('settings.mobileHub.accentColorLabel', { defaultValue: 'Color de acento' })}</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        {PRESET_ACCENTS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => set('accentColor', c === DEFAULT_ACCENT ? '' : c)}
                            aria-label={t('settings.mobileHub.colorAria', { defaultValue: 'Color {{c}}', c })}
                            aria-pressed={accent === c}
                            className={`cg-focus h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 ${accent === c ? 'scale-110' : ''}`}
                            style={{ background: c, borderColor: accent === c ? 'var(--ink)' : 'transparent' }}
                          />
                        ))}
                        <label
                          className="glass-flat ml-1 flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm"
                          style={{ color: 'var(--ink-soft)' }}
                        >
                          <input
                            type="color"
                            value={accent}
                            onChange={(e) => set('accentColor', e.target.value)}
                            className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                          />
                          {t('settings.mobileHub.customLabel', { defaultValue: 'Personalizado' })}
                        </label>
                        {cfg.accentColor && (
                          <Button variant="ghost" size="sm" onClick={() => set('accentColor', '')}>
                            <RotateCcw size={14} className="mr-1" /> {t('settings.mobileHub.goldOriginal', { defaultValue: 'Dorado original' })}
                          </Button>
                        )}
                      </div>
                      <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        {t('settings.mobileHub.accentHint', { defaultValue: 'Recolorea botones, el botón de hablar de la radio, pestañas y acentos en ambas apps.' })}
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="mh-name" className="mb-2 block">{t('settings.mobileHub.displayNameLabel', { defaultValue: 'Nombre a mostrar' })}</Label>
                        <Input
                          id="mh-name"
                          value={cfg.displayName}
                          maxLength={40}
                          placeholder="C-Guard Pro"
                          onChange={(e) => set('displayName', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="mh-tagline" className="mb-2 block">{t('settings.mobileHub.taglineLabel', { defaultValue: 'Lema' })}</Label>
                        <Input
                          id="mh-tagline"
                          value={cfg.tagline}
                          maxLength={60}
                          placeholder="Security Operations"
                          onChange={(e) => set('tagline', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="glass-flat flex items-center justify-between gap-4 p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <SmartImage
                          src={logoUrl}
                          alt={t('settings.mobileHub.companyLogoAlt', { defaultValue: 'Logo de la empresa' })}
                          rounded="rounded-xl"
                          fit="contain"
                          className="h-11 w-11 border border-[color:var(--hairline)] bg-[var(--glass-sunken)] p-1"
                          fallback={<IconTile tone="neutral"><Palette /></IconTile>}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{t('settings.mobileHub.useCompanyLogo', { defaultValue: 'Usar el logo de la empresa' })}</p>
                          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                            {logoUrl
                              ? t('settings.mobileHub.logoOnSignIn', { defaultValue: 'Se muestra en el inicio de sesión y la pantalla de arranque.' })
                              : t('settings.mobileHub.uploadLogoHint', { defaultValue: 'Sube tu logo en Configuración › Perfil de la empresa para activarlo.' })}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={cfg.useTenantLogo}
                        onCheckedChange={(v) => set('useTenantLogo', v)}
                        disabled={!canEdit}
                      />
                    </div>

                    <div>
                      <Label className="mb-2 block">{t('settings.mobileHub.fontLabel', { defaultValue: 'Tipo de letra' })}</Label>
                      <Segmented
                        value={cfg.fontFamily}
                        onChange={(v) => set('fontFamily', v as MobileAppSettings['fontFamily'])}
                        options={[
                          { value: '', label: t('settings.mobileHub.fontSystem', { defaultValue: 'Del sistema' }) },
                          { value: 'poppins', label: 'Poppins' },
                          { value: 'inter', label: 'Inter' },
                          { value: 'manrope', label: 'Manrope' },
                        ]}
                      />
                      <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        {t('settings.mobileHub.fontHint', { defaultValue: 'Las tres van dentro de la app, así que el cambio se ve al instante y también sin cobertura. «Del sistema» usa la letra propia de cada teléfono.' })}
                      </p>
                    </div>

                    <div>
                      <Label className="mb-2 block">{t('settings.mobileHub.defaultThemeLabel', { defaultValue: 'Tema por defecto' })}</Label>
                      <Segmented
                        value={cfg.defaultTheme}
                        onChange={(v) => set('defaultTheme', v)}
                        options={[
                          { value: 'dark', label: t('settings.mobileHub.themeDark', { defaultValue: 'Oscuro' }) },
                          { value: 'light', label: t('settings.mobileHub.themeLight', { defaultValue: 'Claro' }) },
                          { value: 'user', label: t('settings.mobileHub.themeDevice', { defaultValue: 'Según el dispositivo' }) },
                        ]}
                      />
                      <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        {t('settings.mobileHub.themeHint', { defaultValue: 'El vigilante siempre puede cambiarlo desde su perfil; esto define el arranque.' })}
                      </p>
                    </div>
                  </div>
                </Section>

                {/* ── Módulos ───────────────────────────────────────────── */}
                <Section title={t('settings.mobileHub.modulesSectionTitle', { defaultValue: 'Módulos de la app del vigilante' })} icon={<LayoutGrid size={18} />}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {MODULE_META.map((m) => (
                      <div key={m.key} className="glass-flat flex items-center justify-between gap-3 p-3.5">
                        <div className="flex min-w-0 items-start gap-3">
                          <IconTile tone={cfg.modules[m.key] ? 'brand' : 'neutral'} size="sm">{m.icon}</IconTile>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{t(`settings.mobileHub.module_${m.key}_label`, { defaultValue: m.label })}</p>
                            <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t(`settings.mobileHub.module_${m.key}_desc`, { defaultValue: m.desc })}</p>
                          </div>
                        </div>
                        <Switch
                          checked={cfg.modules[m.key]}
                          onCheckedChange={(v) => setCfg((c) => ({ ...c, modules: { ...c.modules, [m.key]: v } }))}
                          disabled={!canEdit}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 flex items-center gap-2 text-xs" style={{ color: 'var(--ink-faint)' }}>
                    <Mic size={13} />
                    {t('settings.mobileHub.operationalModulesNote', { defaultValue: 'Los módulos operativos — radio, botón de pánico, rondas, incidentes, horario, mensajes y perfil — no se pueden ocultar.' })}
                  </p>
                </Section>
              </div>

              {/* ── Vista previa ─────────────────────────────────────────── */}
              <div className="lg:sticky lg:top-24 lg:self-start">
                <Section title={t('settings.mobileHub.previewSectionTitle', { defaultValue: 'Vista previa' })} icon={<TabletSmartphone size={18} />} contentClassName="flex justify-center">
                  {preview}
                </Section>
                <p className="mt-3 text-center text-xs" style={{ color: 'var(--ink-faint)' }}>
                  {t('settings.mobileHub.previewApplyNote', { defaultValue: 'Los cambios se aplican en las apps al iniciar sesión.' })}
                </p>
              </div>
            </div>
          )}
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}

/**
 * Maqueta a escala de la app del vigilante.
 *
 * OJO: los colores de DENTRO de la pantalla son los de la APP NATIVA, no los del
 * CRM. La app se pinta sola con su propio tema (oscuro/claro) y con el acento que
 * la empresa elige arriba; si aquí usáramos los tokens del panel, la vista previa
 * mentiría. El chasis del teléfono sí es acromático como el resto del sistema.
 */
function PhonePreview({ accent, name, tagline, logoUrl, light }: {
  accent: string; name: string; tagline: string; logoUrl: string | null; light: boolean;
}) {
  const { t } = useTranslation();
  const bg = light ? '#f5f5f4' : '#0a0e16';
  const card = light ? '#ffffff' : '#141a24';
  const text = light ? '#111827' : '#f3f4f6';
  const muted = light ? '#6b7280' : '#9ca3af';
  const border = light ? '#e5e7eb' : '#232a36';
  const inkOnAccent = 'oklch(0.15 0 0)';

  /**
   * ── LA MAQUETA SE DIBUJA A TAMAÑO DE TELÉFONO DE VERDAD ──────────────────
   * Antes esto medía 240 px de ancho y todo dentro estaba escrito a mano en
   * `text-[7px]`, `text-[8px]`, `text-[9px]`: no era una pantalla de móvil a
   * escala, era un dibujo pequeño con tipografías que ningún teléfono usa. Las
   * proporciones no se parecían a nada y no se podía juzgar si el acento de la
   * empresa se ve bien.
   *
   * Ahora el contenido se dibuja en un lienzo de 390 × 844 — el tamaño lógico
   * real de un iPhone 14, que es el mismo en el que se dibuja la app — con
   * tipografías normales (14 px, 12 px), y el conjunto se REDUCE con `scale`
   * para caber en la columna. Escalar la imagen final conserva las
   * proporciones; escribir tamaños diminutos a mano las destruye.
   *
   * `ESCALA` es el único número que hay que tocar para agrandarlo o achicarlo.
   */
  const ANCHO = 390;
  const ALTO = 844;
  const ESCALA = 0.86;

  return (
    <div
      className="select-none"
      // El hueco que ocupa en la página es el del teléfono YA reducido: sin
      // esto, el `scale` deja un agujero del tamaño original debajo.
      style={{ width: ANCHO * ESCALA, height: (ALTO + 20) * ESCALA }}
    >
      <div style={{ transform: `scale(${ESCALA})`, transformOrigin: 'top left' }}>
        {/* Chasis */}
        <div
          className="rounded-[3.2rem] p-[10px]"
          style={{
            width: ANCHO + 20,
            background: 'linear-gradient(160deg, oklch(0.34 0 0), oklch(0.13 0 0) 55%, oklch(0.28 0 0))',
            boxShadow: 'var(--lift-4)',
          }}
        >
          <div
            className="relative overflow-hidden rounded-[2.6rem]"
            style={{ width: ANCHO, height: ALTO, background: bg, color: text }}
          >
            {/* Isla dinámica */}
            <div
              className="absolute left-1/2 top-[10px] z-20 h-[30px] w-[112px] -translate-x-1/2 rounded-full"
              style={{ background: 'oklch(0 0 0)' }}
            />

            {/* Barra de estado */}
            <div className="flex h-[50px] items-center justify-between px-7 pt-2 text-[14px] font-semibold">
              <span>20:04</span>
              <span className="flex items-center gap-1.5" style={{ opacity: 0.9 }}>
                <SignalHigh size={15} /> <Wifi size={15} /> <BatteryFull size={17} />
              </span>
            </div>

            {/* Contenido */}
            <div className="space-y-3.5 px-4 pt-2">
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="h-11 w-11 rounded-xl object-contain" style={{ background: card }} />
                ) : (
                  <span
                    className="grid h-11 w-11 place-items-center rounded-xl text-lg font-black"
                    style={{ background: `${accent}22`, color: accent }}
                  >
                    {name.trim().charAt(0).toUpperCase() || 'C'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold leading-tight">{name}</p>
                  <p className="truncate text-[11px] uppercase tracking-[0.14em]" style={{ color: muted }}>{tagline}</p>
                </div>
              </div>

              {/* Turno en curso */}
              <div className="rounded-2xl border p-4" style={{ borderColor: `${accent}55`, background: card }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: muted }}>
                    {t('settings.mobileHub.previewCurrentShift', { defaultValue: 'Turno actual' })}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#16a34a22', color: '#16a34a' }}>
                    {t('settings.mobileHub.previewOnDuty', { defaultValue: '● En servicio' })}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[38px] font-bold leading-none" style={{ color: accent }}>04:00:06</p>
                <p className="mt-1.5 text-[12px]" style={{ color: muted }}>
                  {t('settings.mobileHub.previewShiftHours', { defaultValue: 'Turno 20:00 – 08:00' })}
                </p>
              </div>

              {/* Accesos rápidos */}
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { icon: <RouteIcon size={17} />, label: t('settings.mobileHub.navRounds', { defaultValue: 'Rondas' }) },
                  { icon: <ShieldAlert size={17} />, label: t('settings.mobileHub.previewIncident', { defaultValue: 'Novedad' }) },
                ].map((q) => (
                  <div
                    key={q.label}
                    className="flex items-center gap-2.5 rounded-2xl border px-3 py-3"
                    style={{ borderColor: border, background: card }}
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${accent}1f`, color: accent }}>
                      {q.icon}
                    </span>
                    <span className="text-[13px] font-semibold">{q.label}</span>
                  </div>
                ))}
              </div>

              {/* Tareas */}
              <div className="flex items-center justify-between rounded-2xl border px-3.5 py-3" style={{ borderColor: border, background: card }}>
                <span className="flex items-center gap-2.5 text-[13px] font-semibold">
                  <ClipboardList size={17} style={{ color: muted }} />
                  {t('settings.mobileHub.previewShiftTasks', { defaultValue: 'Tareas del turno' })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold" style={{ background: accent, color: inkOnAccent }}>3</span>
                  <ChevronRight size={16} style={{ color: muted }} />
                </span>
              </div>
            </div>

            {/* Botón de radio, flotando sobre la barra inferior */}
            <div className="absolute bottom-[104px] right-5">
              <span className="grid h-16 w-16 place-items-center rounded-full" style={{ background: accent, boxShadow: 'var(--lift-3)' }}>
                <Mic size={26} style={{ color: inkOnAccent }} />
              </span>
            </div>

            {/* Barra de navegación */}
            <div
              className="absolute inset-x-0 bottom-0 flex items-start justify-around border-t px-2 pb-7 pt-2.5"
              style={{ borderColor: border, background: card }}
            >
              {[
                { icon: <Home size={20} />, label: t('settings.mobileHub.navHome', { defaultValue: 'Inicio' }) },
                { icon: <RouteIcon size={20} />, label: t('settings.mobileHub.navRounds', { defaultValue: 'Rondas' }) },
                { icon: <CalendarDays size={20} />, label: t('settings.mobileHub.navSchedule', { defaultValue: 'Horario' }) },
                { icon: <UserIcon size={20} />, label: t('settings.mobileHub.navProfile', { defaultValue: 'Perfil' }) },
              ].map((n, i) => (
                <span key={n.label} className="flex flex-col items-center gap-1" style={{ color: i === 0 ? accent : muted }}>
                  {n.icon}
                  <span className="text-[10px] font-semibold">{n.label}</span>
                </span>
              ))}
            </div>

            {/* Indicador de inicio */}
            <span
              className="absolute bottom-[7px] left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full"
              style={{ background: light ? '#00000055' : '#ffffff66' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
