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
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/SettingsLayout';
import { PageContainer, PageHeader, Section, SkeletonCards, Segmented, StatusBadge, IconTile } from '@/components/kit';
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
  displayName: string;
  tagline: string;
  useTenantLogo: boolean;
  defaultTheme: 'dark' | 'light' | 'user';
  modules: Record<ModuleKey, boolean>;
}

type ModuleKey = 'training' | 'performance' | 'visitors' | 'timeOff' | 'backup' | 'map';

const MODULE_META: { key: ModuleKey; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'training', label: 'Entrenamiento', desc: 'Cursos, evaluaciones y certificados.', icon: <GraduationCap size={16} /> },
  { key: 'performance', label: 'Mi desempeño', desc: 'Puntaje y evolución del vigilante.', icon: <TrendingUp size={16} /> },
  { key: 'visitors', label: 'Control de visitas', desc: 'Registro de visitantes en el puesto.', icon: <Users size={16} /> },
  { key: 'timeOff', label: 'Permisos y vacaciones', desc: 'Solicitudes de días libres.', icon: <CalendarOff size={16} /> },
  { key: 'backup', label: 'Respaldo', desc: 'Solicitud de refuerzo/backup.', icon: <LifeBuoy size={16} /> },
  { key: 'map', label: 'Mapa', desc: 'Mapa del sitio y ubicaciones.', icon: <MapIcon size={16} /> },
];

const DEFAULTS: MobileAppSettings = {
  accentColor: '',
  displayName: '',
  tagline: '',
  useTenantLogo: true,
  defaultTheme: 'dark',
  modules: { training: true, performance: true, visitors: true, timeOff: true, backup: true, map: true },
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
        toast.error('No se pudo cargar la configuración.');
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
      toast.success('Hub móvil guardado. Las apps lo aplican en el próximo inicio de sesión.');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar.');
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
      <SettingsLayout navKey="configuracion" title="Hub móvil del equipo">
        <PageContainer width="wide">
          <PageHeader
            icon={<TabletSmartphone />}
            title="Hub móvil del equipo"
            subtitle="Personaliza las apps del vigilante y del supervisor con la identidad de tu empresa."
            badges={
              !loading ? (
                <StatusBadge tone={modulosActivos === MODULE_META.length ? 'ok' : 'neutral'}>
                  {modulosActivos} de {MODULE_META.length} módulos visibles
                </StatusBadge>
              ) : undefined
            }
            actions={
              <Button variant="brand" onClick={save} disabled={!canEdit || saving || loading}>
                <Save size={16} className="mr-2" />
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            }
          />

          {loading ? (
            <SkeletonCards count={4} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                {/* ── Marca ─────────────────────────────────────────────── */}
                <Section title="Marca" icon={<Palette size={18} />}>
                  <div className="space-y-6">
                    <div>
                      <Label className="mb-2 block">Color de acento</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        {PRESET_ACCENTS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => set('accentColor', c === DEFAULT_ACCENT ? '' : c)}
                            aria-label={`Color ${c}`}
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
                          Personalizado
                        </label>
                        {cfg.accentColor && (
                          <Button variant="ghost" size="sm" onClick={() => set('accentColor', '')}>
                            <RotateCcw size={14} className="mr-1" /> Dorado original
                          </Button>
                        )}
                      </div>
                      <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        Recolorea botones, el botón de hablar de la radio, pestañas y acentos en ambas apps.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="mh-name" className="mb-2 block">Nombre a mostrar</Label>
                        <Input
                          id="mh-name"
                          value={cfg.displayName}
                          maxLength={40}
                          placeholder="C-Guard Pro"
                          onChange={(e) => set('displayName', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="mh-tagline" className="mb-2 block">Lema</Label>
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
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt="Logo de la empresa"
                            className="h-11 w-11 rounded-xl border object-contain p-1"
                            style={{ background: 'var(--glass-sunken)', borderColor: 'var(--hairline)' }}
                          />
                        ) : (
                          <IconTile tone="neutral"><Palette /></IconTile>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Usar el logo de la empresa</p>
                          <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                            {logoUrl
                              ? 'Se muestra en el inicio de sesión y la pantalla de arranque.'
                              : 'Sube tu logo en Configuración › Perfil de la empresa para activarlo.'}
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
                      <Label className="mb-2 block">Tema por defecto</Label>
                      <Segmented
                        value={cfg.defaultTheme}
                        onChange={(v) => set('defaultTheme', v)}
                        options={[
                          { value: 'dark', label: 'Oscuro' },
                          { value: 'light', label: 'Claro' },
                          { value: 'user', label: 'Según el dispositivo' },
                        ]}
                      />
                      <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        El vigilante siempre puede cambiarlo desde su perfil; esto define el arranque.
                      </p>
                    </div>
                  </div>
                </Section>

                {/* ── Módulos ───────────────────────────────────────────── */}
                <Section title="Módulos de la app del vigilante" icon={<LayoutGrid size={18} />}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {MODULE_META.map((m) => (
                      <div key={m.key} className="glass-flat flex items-center justify-between gap-3 p-3.5">
                        <div className="flex min-w-0 items-start gap-3">
                          <IconTile tone={cfg.modules[m.key] ? 'brand' : 'neutral'} size="sm">{m.icon}</IconTile>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{m.label}</p>
                            <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{m.desc}</p>
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
                    Los módulos operativos — radio, botón de pánico, rondas, incidentes, horario, mensajes y perfil — no se pueden ocultar.
                  </p>
                </Section>
              </div>

              {/* ── Vista previa ─────────────────────────────────────────── */}
              <div className="lg:sticky lg:top-24 lg:self-start">
                <Section title="Vista previa" icon={<TabletSmartphone size={18} />} contentClassName="flex justify-center">
                  {preview}
                </Section>
                <p className="mt-3 text-center text-xs" style={{ color: 'var(--ink-faint)' }}>
                  Los cambios se aplican en las apps al iniciar sesión.
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
  const bg = light ? '#f5f5f4' : '#0a0e16';
  const card = light ? '#ffffff' : '#141a24';
  const text = light ? '#111827' : '#f3f4f6';
  const muted = light ? '#6b7280' : '#9ca3af';
  const border = light ? '#e5e7eb' : '#232a36';
  const inkOnAccent = 'oklch(0.15 0 0)';

  return (
    <div
      className="w-60 select-none rounded-[2.2rem] p-[7px]"
      style={{ background: 'linear-gradient(160deg, oklch(0.32 0 0), oklch(0.14 0 0) 60%, oklch(0.26 0 0))', boxShadow: 'var(--lift-4)' }}
    >
      <div className="overflow-hidden rounded-[1.85rem]" style={{ background: bg }}>
        <div className="grid h-6 place-items-center" style={{ background: light ? '#e7e5e4' : '#10151d' }}>
          <span className="h-3.5 w-16 rounded-full" style={{ background: 'oklch(0 0 0)' }} />
        </div>
        <div className="space-y-3 p-4" style={{ color: text }}>
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" style={{ background: card }} />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-lg text-[13px] font-black" style={{ background: `${accent}22`, color: accent }}>
                {name.trim().charAt(0).toUpperCase() || 'C'}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold leading-tight">{name}</p>
              <p className="truncate text-[9px] uppercase tracking-widest" style={{ color: muted }}>{tagline}</p>
            </div>
          </div>

          <div className="rounded-xl border p-3" style={{ borderColor: `${accent}55`, background: card }}>
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: muted }}>Turno actual</span>
              <span className="rounded-full px-1.5 py-0.5 text-[7px] font-bold" style={{ background: '#16a34a22', color: '#16a34a' }}>● En servicio</span>
            </div>
            <p className="mt-1 font-mono text-xl font-bold" style={{ color: accent }}>04:00:06</p>
            <p className="text-[9px]" style={{ color: muted }}>Turno 20:00 – 08:00</p>
          </div>

          <div className="flex items-center justify-between rounded-xl border p-2.5" style={{ borderColor: border, background: card }}>
            <span className="text-[10px] font-semibold">Tareas del turno</span>
            <span className="grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold" style={{ background: accent, color: inkOnAccent }}>3</span>
          </div>

          <div className="flex justify-end pr-1">
            <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: accent, boxShadow: 'var(--lift-3)' }}>
              <Mic size={18} style={{ color: inkOnAccent }} />
            </span>
          </div>

          <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: card, border: `1px solid ${border}` }}>
            {['Inicio', 'Rondas', 'Horario', 'Perfil'].map((t, i) => (
              <span key={t} className="text-[8px] font-semibold" style={{ color: i === 0 ? accent : muted }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
