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
import { useEffect, useMemo, useState } from "react";
import {
  TabletSmartphone,
  Palette,
  LayoutGrid,
  Mic,
  Save,
  RotateCcw,
  GraduationCap,
  TrendingUp,
  Users,
  CalendarOff,
  LifeBuoy,
  Map as MapIcon,
  RadioTower,
  Home,
  Route as RouteIcon,
  CalendarDays,
  User as UserIcon,
  Wifi,
  BatteryFull,
  SignalHigh,
  ChevronRight,
  ShieldAlert,
  ClipboardList,
  MessageSquare,
  CarFront,
  Check,
  QrCode,
  Building2,
  MapPin,
  Bell,
  Menu,
  Navigation,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import api from "@/lib/api";
import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  Segmented,
  StatusBadge,
  IconTile,
  SmartImage,
} from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";

/* ────────────────────────────────────────────────────────────────────────────
   Los colores de abajo NO son estilos del CRM: son DATOS de la empresa. Es el
   acento con el que se pintan SUS apps de móvil, se guarda en su cuenta y lo
   aplica una app nativa que no comparte los tokens del panel. Por eso van
   escritos y no salen de `--brand`.
   ──────────────────────────────────────────────────────────────────────────── */
const DEFAULT_ACCENT = "#d4a017"; // el dorado de fábrica de las apps

const PRESET_ACCENTS = [
  DEFAULT_ACCENT,
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#0d9488",
  "#ea580c",
  "#475569",
];

interface MobileAppSettings {
  accentColor: string;
  /** '' = la del sistema · las tres van empaquetadas en la app */
  fontFamily: "" | "poppins" | "inter" | "manrope";
  displayName: string;
  tagline: string;
  useTenantLogo: boolean;
  defaultTheme: "dark" | "light" | "user";
  modules: Record<ModuleKey, boolean>;
}

type ModuleKey =
  | "training"
  | "performance"
  | "visitors"
  | "timeOff"
  | "backup"
  | "map"
  | "radioNativa";

const MODULE_META: {
  key: ModuleKey;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "training",
    label: "Entrenamiento",
    desc: "Cursos, evaluaciones y certificados.",
    icon: <GraduationCap size={16} />,
  },
  {
    key: "performance",
    label: "Mi desempeño",
    desc: "Puntaje y evolución del vigilante.",
    icon: <TrendingUp size={16} />,
  },
  {
    key: "visitors",
    label: "Control de visitas",
    desc: "Registro de visitantes en el puesto.",
    icon: <Users size={16} />,
  },
  {
    key: "timeOff",
    label: "Permisos y vacaciones",
    desc: "Solicitudes de días libres.",
    icon: <CalendarOff size={16} />,
  },
  {
    key: "backup",
    label: "Respaldo",
    desc: "Solicitud de refuerzo/backup.",
    icon: <LifeBuoy size={16} />,
  },
  {
    key: "radioNativa",
    label: "Radio nativa (piloto)",
    desc: "La radio corre fuera del navegador de la app: sigue sonando con la pantalla apagada o usando otras apps, sin acaparar el micrófono. Requiere la versión más reciente de las apps.",
    icon: <RadioTower size={16} />,
  },
  {
    key: "map",
    label: "Mapa",
    desc: "Mapa del sitio y ubicaciones.",
    icon: <MapIcon size={16} />,
  },
];

const DEFAULTS: MobileAppSettings = {
  accentColor: "",
  fontFamily: "",
  displayName: "",
  tagline: "",
  useTenantLogo: true,
  defaultTheme: "dark",
  modules: {
    training: true,
    performance: true,
    visitors: true,
    timeOff: true,
    backup: true,
    map: true,
    radioNativa: false,
  },
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

const tenantId = () => localStorage.getItem("tenantId") || "";

export default function MobileHubPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<MobileAppSettings>(DEFAULTS);
  const [previewApp, setPreviewApp] = useState<"guard" | "supervisor">("guard");
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
        toast.error(
          t("settings.mobileHub.loadError", {
            defaultValue: "No se pudo cargar la configuración.",
          }),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const accent = cfg.accentColor || DEFAULT_ACCENT;
  const logoUrl: string | null =
    row?.logoUrl || row?.logos?.[0]?.downloadUrl || null;
  const set = <K extends keyof MobileAppSettings>(
    k: K,
    v: MobileAppSettings[K],
  ) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/tenant/${tenantId()}/settings`, {
        settings: {
          theme: row?.theme || "default",
          // Round-trip the file relations untouched — the backend recomputes
          // logoUrl from logos[0], so omitting them would ERASE the logo.
          logos: row?.logos || [],
          backgroundImages: row?.backgroundImages || [],
          mobileAppSettings: cfg,
        },
      });
      toast.success(
        t("settings.mobileHub.saveSuccess", {
          defaultValue:
            "Hub móvil guardado. Las apps abiertas lo aplican en segundos.",
        }),
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("settings.mobileHub.saveError", {
            defaultValue: "No se pudo guardar.",
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  const modulosActivos = useMemo(
    () => MODULE_META.filter((m) => cfg.modules[m.key]).length,
    [cfg.modules],
  );

  const preview = useMemo(
    () => (
      <PhonePreview
        accent={accent}
        font={cfg.fontFamily}
        light={cfg.defaultTheme === "light"}
        logoUrl={cfg.useTenantLogo ? logoUrl : null}
        modules={cfg.modules}
        name={cfg.displayName || "C-Guard Pro"}
        tagline={cfg.tagline || "Security Operations"}
      />
    ),
    [
      accent,
      cfg.displayName,
      cfg.tagline,
      cfg.useTenantLogo,
      cfg.defaultTheme,
      cfg.modules,
      cfg.fontFamily,
      logoUrl,
    ],
  );

  const previewSupervisor = useMemo(
    () => (
      <SupervisorPreview
        accent={accent}
        font={cfg.fontFamily}
        light={cfg.defaultTheme === "light"}
        logoUrl={cfg.useTenantLogo ? logoUrl : null}
        name={cfg.displayName || "C-Guard Pro"}
      />
    ),
    [
      accent,
      cfg.displayName,
      cfg.useTenantLogo,
      cfg.defaultTheme,
      cfg.fontFamily,
      logoUrl,
    ],
  );

  return (
    <AppLayout>
      <SettingsLayout
        navKey="configuracion"
        title={t("settings.mobileHub.layoutTitle", {
          defaultValue: "App del equipo",
        })}
      >
        <PageContainer width="wide">
          <PageHeader
            actions={
              <Button
                disabled={!canEdit || saving || loading}
                variant="brand"
                onClick={save}
              >
                <Save className="mr-2" size={16} />
                {saving
                  ? t("settings.mobileHub.saving", {
                      defaultValue: "Guardando…",
                    })
                  : t("settings.mobileHub.saveChanges", {
                      defaultValue: "Guardar cambios",
                    })}
              </Button>
            }
            badges={
              !loading ? (
                <StatusBadge
                  tone={
                    modulosActivos === MODULE_META.length ? "ok" : "neutral"
                  }
                >
                  {t("settings.mobileHub.modulesVisibleBadge", {
                    defaultValue: "{{active}} de {{total}} módulos visibles",
                    active: modulosActivos,
                    total: MODULE_META.length,
                  })}
                </StatusBadge>
              ) : undefined
            }
            icon={<TabletSmartphone />}
            subtitle={t("settings.mobileHub.pageSubtitle", {
              defaultValue:
                "Personaliza las apps del vigilante y del supervisor con la identidad de tu empresa.",
            })}
            title={t("settings.mobileHub.pageTitle", {
              defaultValue: "Hub móvil del equipo",
            })}
          />

          {loading ? (
            <SkeletonCards count={4} />
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
              <div className="space-y-6">
                {/* ── Marca ─────────────────────────────────────────────── */}
                <Section
                  icon={<Palette size={18} />}
                  title={t("settings.mobileHub.brandSectionTitle", {
                    defaultValue: "Marca",
                  })}
                >
                  <div className="space-y-6">
                    <div>
                      <Label className="mb-2 block">
                        {t("settings.mobileHub.accentColorLabel", {
                          defaultValue: "Color de acento",
                        })}
                      </Label>
                      <div className="flex flex-wrap items-center gap-2">
                        {PRESET_ACCENTS.map((c) => (
                          <button
                            key={c}
                            aria-label={t("settings.mobileHub.colorAria", {
                              defaultValue: "Color {{c}}",
                              c,
                            })}
                            aria-pressed={accent === c}
                            className={`cg-focus h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 ${accent === c ? "scale-110" : ""}`}
                            style={{
                              background: c,
                              borderColor:
                                accent === c ? "var(--ink)" : "transparent",
                            }}
                            type="button"
                            onClick={() =>
                              set("accentColor", c === DEFAULT_ACCENT ? "" : c)
                            }
                          />
                        ))}
                        <label
                          className="glass-flat ml-1 flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          <input
                            className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                            type="color"
                            value={accent}
                            onChange={(e) => set("accentColor", e.target.value)}
                          />
                          {t("settings.mobileHub.customLabel", {
                            defaultValue: "Personalizado",
                          })}
                        </label>
                        {cfg.accentColor && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => set("accentColor", "")}
                          >
                            <RotateCcw className="mr-1" size={14} />{" "}
                            {t("settings.mobileHub.goldOriginal", {
                              defaultValue: "Dorado original",
                            })}
                          </Button>
                        )}
                      </div>
                      <p
                        className="mt-2 text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("settings.mobileHub.accentHint", {
                          defaultValue:
                            "Recolorea botones, el botón de hablar de la radio, pestañas y acentos en ambas apps.",
                        })}
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="mb-2 block" htmlFor="mh-name">
                          {t("settings.mobileHub.displayNameLabel", {
                            defaultValue: "Nombre a mostrar",
                          })}
                        </Label>
                        <Input
                          id="mh-name"
                          maxLength={40}
                          placeholder="C-Guard Pro"
                          value={cfg.displayName}
                          onChange={(e) => set("displayName", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="mb-2 block" htmlFor="mh-tagline">
                          {t("settings.mobileHub.taglineLabel", {
                            defaultValue: "Lema",
                          })}
                        </Label>
                        <Input
                          id="mh-tagline"
                          maxLength={60}
                          placeholder="Security Operations"
                          value={cfg.tagline}
                          onChange={(e) => set("tagline", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="glass-flat flex items-center justify-between gap-4 p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <SmartImage
                          alt={t("settings.mobileHub.companyLogoAlt", {
                            defaultValue: "Logo de la empresa",
                          })}
                          className="h-11 w-11 border border-[color:var(--hairline)] bg-[var(--glass-sunken)] p-1"
                          fallback={
                            <IconTile tone="neutral">
                              <Palette />
                            </IconTile>
                          }
                          fit="contain"
                          rounded="rounded-xl"
                          src={logoUrl}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {t("settings.mobileHub.useCompanyLogo", {
                              defaultValue: "Usar el logo de la empresa",
                            })}
                          </p>
                          <p
                            className="text-xs"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {logoUrl
                              ? t("settings.mobileHub.logoOnSignIn", {
                                  defaultValue:
                                    "Se muestra en el inicio de sesión y la pantalla de arranque.",
                                })
                              : t("settings.mobileHub.uploadLogoHint", {
                                  defaultValue:
                                    "Sube tu logo en Configuración › Perfil de la empresa para activarlo.",
                                })}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={cfg.useTenantLogo}
                        disabled={!canEdit}
                        onCheckedChange={(v) => set("useTenantLogo", v)}
                      />
                    </div>

                    <div>
                      <Label className="mb-2 block">
                        {t("settings.mobileHub.fontLabel", {
                          defaultValue: "Tipo de letra",
                        })}
                      </Label>
                      <Segmented
                        options={[
                          {
                            value: "",
                            label: t("settings.mobileHub.fontSystem", {
                              defaultValue: "Del sistema",
                            }),
                          },
                          { value: "poppins", label: "Poppins" },
                          { value: "inter", label: "Inter" },
                          { value: "manrope", label: "Manrope" },
                        ]}
                        value={cfg.fontFamily}
                        onChange={(v) =>
                          set(
                            "fontFamily",
                            v as MobileAppSettings["fontFamily"],
                          )
                        }
                      />
                      <p
                        className="mt-2 text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("settings.mobileHub.fontHint", {
                          defaultValue:
                            "Las tres van dentro de la app, así que el cambio se ve al instante y también sin cobertura. «Del sistema» usa la letra propia de cada teléfono.",
                        })}
                      </p>
                    </div>

                    <div>
                      <Label className="mb-2 block">
                        {t("settings.mobileHub.defaultThemeLabel", {
                          defaultValue: "Tema por defecto",
                        })}
                      </Label>
                      <Segmented
                        options={[
                          {
                            value: "dark",
                            label: t("settings.mobileHub.themeDark", {
                              defaultValue: "Oscuro",
                            }),
                          },
                          {
                            value: "light",
                            label: t("settings.mobileHub.themeLight", {
                              defaultValue: "Claro",
                            }),
                          },
                          {
                            value: "user",
                            label: t("settings.mobileHub.themeDevice", {
                              defaultValue: "Según el dispositivo",
                            }),
                          },
                        ]}
                        value={cfg.defaultTheme}
                        onChange={(v) => set("defaultTheme", v)}
                      />
                      <p
                        className="mt-2 text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("settings.mobileHub.themeHint", {
                          defaultValue:
                            "El vigilante siempre puede cambiarlo desde su perfil; esto define el arranque.",
                        })}
                      </p>
                    </div>
                  </div>
                </Section>

                {/* ── Módulos ───────────────────────────────────────────── */}
                <Section
                  icon={<LayoutGrid size={18} />}
                  title={t("settings.mobileHub.modulesSectionTitle", {
                    defaultValue: "Módulos de la app del vigilante",
                  })}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    {MODULE_META.map((m) => (
                      <div
                        key={m.key}
                        className="glass-flat flex items-center justify-between gap-3 p-3.5"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <IconTile
                            size="sm"
                            tone={cfg.modules[m.key] ? "brand" : "neutral"}
                          >
                            {m.icon}
                          </IconTile>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {t(`settings.mobileHub.module_${m.key}_label`, {
                                defaultValue: m.label,
                              })}
                            </p>
                            <p
                              className="text-xs"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {t(`settings.mobileHub.module_${m.key}_desc`, {
                                defaultValue: m.desc,
                              })}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={cfg.modules[m.key]}
                          disabled={!canEdit}
                          onCheckedChange={(v) =>
                            setCfg((c) => ({
                              ...c,
                              modules: { ...c.modules, [m.key]: v },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p
                    className="mt-4 flex items-center gap-2 text-xs"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    <Mic size={13} />
                    {t("settings.mobileHub.operationalModulesNote", {
                      defaultValue:
                        "Los módulos operativos — radio, botón de pánico, rondas, incidentes, horario, mensajes y perfil — no se pueden ocultar.",
                    })}
                  </p>
                </Section>
              </div>

              {/* ── Vista previa ─────────────────────────────────────────── */}
              <div className="lg:sticky lg:top-24 lg:self-start">
                <Section
                  icon={<TabletSmartphone size={18} />}
                  title={t("settings.mobileHub.previewSectionTitle", {
                    defaultValue: "Vista previa",
                  })}
                >
                  <Segmented
                    options={[
                      {
                        value: "guard",
                        label: t("settings.mobileHub.previewAppGuard", {
                          defaultValue: "App del vigilante",
                        }),
                      },
                      {
                        value: "supervisor",
                        label: t("settings.mobileHub.previewAppSupervisor", {
                          defaultValue: "App del supervisor",
                        }),
                      },
                    ]}
                    value={previewApp}
                    onChange={(v) => setPreviewApp(v as "guard" | "supervisor")}
                  />
                  <div className="mt-4 flex justify-center">
                    {previewApp === "guard" ? preview : previewSupervisor}
                  </div>
                </Section>
                <p
                  className="mt-3 text-center text-xs"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t("settings.mobileHub.previewApplyNote", {
                    defaultValue:
                      "Los cambios se aplican en las apps al iniciar sesión.",
                  })}
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
/** La familia CSS de cada fuente elegible (las carga main.tsx). '' = del sistema. */
const FAMILIA_FUENTE: Record<string, string | undefined> = {
  "": undefined,
  poppins: '"Poppins", system-ui, sans-serif',
  inter: '"Inter", system-ui, sans-serif',
  manrope: '"Manrope", system-ui, sans-serif',
};

function PhonePreview({
  accent,
  name,
  tagline,
  logoUrl,
  light,
  modules,
  font,
}: {
  accent: string;
  name: string;
  tagline: string;
  logoUrl: string | null;
  light: boolean;
  modules: Record<ModuleKey, boolean>;
  font: string;
}) {
  const { t } = useTranslation();
  const [pantalla, setPantalla] = useState<
    "inicio" | "ronda" | "entrenamiento" | "horario" | "mensajes" | "perfil"
  >("inicio");

  const bg = light ? "#f5f5f4" : "#0a0e16";
  const card = light ? "#ffffff" : "#141a24";
  const text = light ? "#111827" : "#f3f4f6";
  const muted = light ? "#6b7280" : "#9ca3af";
  const border = light ? "#e5e7eb" : "#232a36";
  const inkOnAccent = "oklch(0.15 0 0)";

  /**
   * ── LA MAQUETA SE DIBUJA A TAMAÑO DE TELÉFONO DE VERDAD ──────────────────
   * Antes medía 240 px de ancho y todo dentro estaba escrito a mano en
   * `text-[7px]`, `text-[8px]`, `text-[9px]`: no era una pantalla a escala,
   * era un dibujo pequeño con tipografías que ningún teléfono usa.
   *
   * Ahora el contenido se dibuja en un lienzo de 390 × 844 —el tamaño lógico
   * real de un iPhone 14, el mismo en el que se dibuja la app— con tipografías
   * normales, y el conjunto se REDUCE con `scale` para caber en la columna.
   * Escalar la imagen final conserva las proporciones; escribir tamaños
   * diminutos a mano las destruye. `ESCALA` es el único número que hay que
   * tocar para agrandarlo o achicarlo.
   */
  const ANCHO = 390;
  const ALTO = 844;
  const ESCALA = 0.86;

  /* ── Piezas ─────────────────────────────────────────────────────────────── */

  const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <p
      className="mb-2 text-[11px] font-bold uppercase tracking-wider"
      style={{ color: muted }}
    >
      {children}
    </p>
  );

  const Tarjeta = ({
    children,
    acento = false,
  }: {
    children: React.ReactNode;
    acento?: boolean;
  }) => (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: acento ? `${accent}55` : border, background: card }}
    >
      {children}
    </div>
  );

  /** Fila pulsable con icono — la forma que tiene la app para Radio, Visitantes… */
  const Fila = ({
    icon,
    label,
    extra,
    onClick,
  }: {
    icon: React.ReactNode;
    label: string;
    extra?: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button
      className="flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-transform active:scale-[0.98]"
      style={{ borderColor: border, background: card, color: text }}
      type="button"
      onClick={onClick}
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
        style={{ background: `${accent}1f`, color: accent }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
        {label}
      </span>
      {extra}
      <ChevronRight size={16} style={{ color: muted }} />
    </button>
  );

  const Stat = ({
    v,
    l,
    acento = false,
  }: {
    v: string;
    l: string;
    acento?: boolean;
  }) => (
    <div className="min-w-0 flex-1">
      <p
        className="truncate text-[17px] font-bold tabular-nums"
        style={{ color: acento ? accent : text }}
      >
        {v}
      </p>
      <p className="truncate text-[10.5px]" style={{ color: muted }}>
        {l}
      </p>
    </div>
  );

  /* ── Pantallas ──────────────────────────────────────────────────────────── */

  const inicio = (
    <div className="space-y-3">
      <Tarjeta acento>
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: muted }}
          >
            {t("settings.mobileHub.previewCurrentShift", {
              defaultValue: "Turno actual",
            })}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: "#16a34a22", color: "#16a34a" }}
          >
            {t("settings.mobileHub.previewOnDuty", {
              defaultValue: "● En servicio",
            })}
          </span>
        </div>
        <p
          className="mt-1.5 font-mono text-[36px] font-bold leading-none"
          style={{ color: accent }}
        >
          04:00:06
        </p>
        <p className="mt-1.5 text-[12px]" style={{ color: muted }}>
          {t("settings.mobileHub.previewShiftHours", {
            defaultValue: "Turno 20:00 – 08:00",
          })}
        </p>
        <div
          className="mt-3 flex gap-3 border-t pt-3"
          style={{ borderColor: border }}
        >
          <Stat
            l={t("settings.mobileHub.previewRemaining", {
              defaultValue: "Restante",
            })}
            v="03:59"
          />
          <Stat
            l={t("settings.mobileHub.previewEndsAt", {
              defaultValue: "Finaliza",
            })}
            v="08:00"
          />
          <Stat
            l={t("settings.mobileHub.previewIncidents", {
              defaultValue: "Incidentes",
            })}
            v="00"
          />
          <Stat
            acento
            l={t("settings.mobileHub.previewCheckpoints", {
              defaultValue: "Puntos",
            })}
            v="6/8"
          />
        </div>
      </Tarjeta>

      <button
        className="w-full rounded-2xl border p-4 text-left transition-transform active:scale-[0.98]"
        style={{ borderColor: border, background: card, color: text }}
        type="button"
        onClick={() => setPantalla("ronda")}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: muted }}
          >
            {t("settings.mobileHub.previewActiveRound", {
              defaultValue: "Ronda activa",
            })}
          </span>
          <span
            className="flex items-center gap-1 text-[12px] font-semibold"
            style={{ color: accent }}
          >
            {t("settings.mobileHub.previewContinue", {
              defaultValue: "Continuar",
            })}{" "}
            <ChevronRight size={14} />
          </span>
        </div>
        <p className="mt-1 text-[15px] font-bold">
          R-02 ·{" "}
          {t("settings.mobileHub.previewNextPoint", {
            defaultValue: "Próximo: Puerta trasera",
          })}
        </p>
        <div
          className="mt-2.5 h-[6px] w-full overflow-hidden rounded-full"
          style={{ background: light ? "#e5e7eb" : "#232a36" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: "75%", background: accent }}
          />
        </div>
        <p className="mt-1.5 text-[11.5px]" style={{ color: muted }}>
          {t("settings.mobileHub.previewCheckpointsDone", {
            defaultValue: "6 de 8 puntos completados",
          })}
        </p>
      </button>

      <Fila
        extra={
          <span
            className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold"
            style={{ background: accent, color: inkOnAccent }}
          >
            3
          </span>
        }
        icon={<ClipboardList size={16} />}
        label={t("settings.mobileHub.previewShiftTasks", {
          defaultValue: "Tareas del turno",
        })}
      />
      <Fila
        icon={<RadioTower size={16} />}
        label={t("settings.mobileHub.navRadio", { defaultValue: "Radio" })}
      />
      {modules.visitors && (
        <>
          <Fila
            icon={<Users size={16} />}
            label={t("settings.mobileHub.previewVisitors", {
              defaultValue: "Visitantes",
            })}
          />
          <Fila
            icon={<CarFront size={16} />}
            label={t("settings.mobileHub.previewVehicles", {
              defaultValue: "Control vehicular",
            })}
          />
        </>
      )}
      {modules.map && (
        <Fila
          icon={<MapIcon size={16} />}
          label={t("settings.mobileHub.previewMap", {
            defaultValue: "Mapa del sitio",
          })}
        />
      )}
      {modules.backup && (
        <Fila
          icon={<LifeBuoy size={16} />}
          label={t("settings.mobileHub.previewBackup", {
            defaultValue: "Pedir respaldo",
          })}
        />
      )}

      <div>
        <Eyebrow>
          {t("settings.mobileHub.previewAlerts", { defaultValue: "Novedades" })}
        </Eyebrow>
        <div
          className="overflow-hidden rounded-2xl border"
          style={{ borderColor: border, background: card }}
        >
          {[
            {
              icon: <RouteIcon size={15} />,
              txt: t("settings.mobileHub.previewActRound", {
                defaultValue: "Ronda completada · 8/8 puntos",
              }),
              hora: "21:40",
            },
            {
              icon: <ShieldAlert size={15} />,
              txt: t("settings.mobileHub.previewActIncident", {
                defaultValue: "Novedad reportada · portón norte",
              }),
              hora: "20:55",
            },
          ].map((r, i) => (
            <div
              key={r.hora}
              className="flex items-center gap-3 px-3.5 py-3"
              style={i ? { borderTop: `1px solid ${border}` } : undefined}
            >
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                style={{ background: `${accent}1a`, color: accent }}
              >
                {r.icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">
                {r.txt}
              </span>
              <span
                className="shrink-0 text-[11px] tabular-nums"
                style={{ color: muted }}
              >
                {r.hora}
              </span>
            </div>
          ))}
        </div>
      </div>

      <button
        className="w-full rounded-2xl py-3.5 text-[14px] font-bold transition-transform active:scale-[0.98]"
        style={{ background: accent, color: inkOnAccent }}
        type="button"
      >
        {t("settings.mobileHub.previewClockOut", {
          defaultValue: "Marcar salida",
        })}
      </button>

      <div
        className="rounded-2xl border p-4"
        style={{
          borderColor: "#dc262655",
          background: light ? "#fef2f2" : "#1a1114",
        }}
      >
        <p className="text-[13.5px] font-bold" style={{ color: "#ef4444" }}>
          {t("settings.mobileHub.previewSosTitle", {
            defaultValue: "Emergencia",
          })}
        </p>
        <p className="mt-0.5 text-[11.5px]" style={{ color: muted }}>
          {t("settings.mobileHub.previewSosSub", {
            defaultValue: "Envía una alerta de pánico a tu central",
          })}
        </p>
        <div
          className="mt-3 rounded-xl py-2.5 text-center text-[13px] font-bold"
          style={{ background: "#dc2626", color: "#fff" }}
        >
          {t("settings.mobileHub.previewSosButton", {
            defaultValue: "SOS / Pánico",
          })}
        </div>
      </div>
    </div>
  );

  const ronda = (
    <div className="space-y-3">
      <Tarjeta acento>
        <Eyebrow>
          {t("settings.mobileHub.previewActiveRound", {
            defaultValue: "Ronda activa",
          })}
        </Eyebrow>
        <p className="text-[17px] font-bold">
          R-02 ·{" "}
          {t("settings.mobileHub.previewPerimeter", {
            defaultValue: "Perímetro",
          })}
        </p>
        <div
          className="mt-2.5 h-[6px] w-full overflow-hidden rounded-full"
          style={{ background: light ? "#e5e7eb" : "#232a36" }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: "75%", background: accent }}
          />
        </div>
        <p className="mt-1.5 text-[11.5px]" style={{ color: muted }}>
          {t("settings.mobileHub.previewCheckpointsDone", {
            defaultValue: "6 de 8 puntos completados",
          })}
        </p>
      </Tarjeta>
      {[
        {
          n: t("settings.mobileHub.previewPointLobby", {
            defaultValue: "Recepción",
          }),
          ok: true,
        },
        {
          n: t("settings.mobileHub.previewPointParking", {
            defaultValue: "Parqueadero",
          }),
          ok: true,
        },
        {
          n: t("settings.mobileHub.previewPointBack", {
            defaultValue: "Puerta trasera",
          }),
          ok: false,
        },
        {
          n: t("settings.mobileHub.previewPointRoof", {
            defaultValue: "Terraza",
          }),
          ok: false,
        },
      ].map((p) => (
        <div
          key={p.n}
          className="flex items-center gap-3 rounded-2xl border px-3.5 py-3"
          style={{ borderColor: border, background: card }}
        >
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
            style={
              p.ok
                ? { background: "#16a34a22", color: "#16a34a" }
                : { background: `${accent}1f`, color: accent }
            }
          >
            {p.ok ? <Check size={16} /> : <QrCode size={16} />}
          </span>
          <span className="flex-1 text-[13.5px] font-semibold">{p.n}</span>
          <span className="text-[11px]" style={{ color: muted }}>
            {p.ok
              ? "21:12"
              : t("settings.mobileHub.previewPending", {
                  defaultValue: "Pendiente",
                })}
          </span>
        </div>
      ))}
      <button
        className="w-full rounded-2xl py-3.5 text-[14px] font-bold"
        style={{ background: accent, color: inkOnAccent }}
        type="button"
      >
        {t("settings.mobileHub.previewScan", {
          defaultValue: "Escanear punto",
        })}
      </button>
    </div>
  );

  const entrenamiento = (
    <div className="space-y-3">
      <Tarjeta acento>
        <Eyebrow>
          {t("settings.mobileHub.previewMyProgress", {
            defaultValue: "Mi progreso",
          })}
        </Eyebrow>
        <p
          className="font-mono text-[32px] font-bold leading-none"
          style={{ color: accent }}
        >
          720
        </p>
        <p className="mt-1 text-[12px]" style={{ color: muted }}>
          {t("settings.mobileHub.previewPoints", {
            defaultValue: "puntos acumulados",
          })}
        </p>
      </Tarjeta>
      {[
        {
          c: t("settings.mobileHub.previewCourse1", {
            defaultValue: "Uso de la fuerza",
          }),
          p: 100,
        },
        {
          c: t("settings.mobileHub.previewCourse2", {
            defaultValue: "Primeros auxilios",
          }),
          p: 60,
        },
        {
          c: t("settings.mobileHub.previewCourse3", {
            defaultValue: "Control de accesos",
          }),
          p: 0,
        },
      ].map((c) => (
        <div
          key={c.c}
          className="rounded-2xl border px-3.5 py-3"
          style={{ borderColor: border, background: card }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[13.5px] font-semibold">{c.c}</span>
            <span className="text-[11px] tabular-nums" style={{ color: muted }}>
              {c.p}%
            </span>
          </div>
          <div
            className="mt-2 h-[5px] w-full overflow-hidden rounded-full"
            style={{ background: light ? "#e5e7eb" : "#232a36" }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${c.p}%`, background: accent }}
            />
          </div>
        </div>
      ))}
    </div>
  );

  const horario = (
    <div className="space-y-3">
      <Eyebrow>
        {t("settings.mobileHub.previewThisWeek", {
          defaultValue: "Esta semana",
        })}
      </Eyebrow>
      {[
        {
          d: t("settings.mobileHub.previewToday", { defaultValue: "Hoy" }),
          h: "20:00 – 08:00",
          hoy: true,
        },
        {
          d: t("settings.mobileHub.previewTomorrow", {
            defaultValue: "Mañana",
          }),
          h: "20:00 – 08:00",
          hoy: false,
        },
        {
          d: t("settings.mobileHub.previewDayAfter", {
            defaultValue: "Sábado",
          }),
          h: t("settings.mobileHub.previewRestDay", {
            defaultValue: "Descanso",
          }),
          hoy: false,
        },
      ].map((r) => (
        <div
          key={r.d}
          className="flex items-center justify-between rounded-2xl border px-3.5 py-3.5"
          style={{
            borderColor: r.hoy ? `${accent}55` : border,
            background: card,
          }}
        >
          <div>
            <p className="text-[13.5px] font-bold">{r.d}</p>
            <p className="text-[11.5px]" style={{ color: muted }}>
              {t("settings.mobileHub.previewPost", { defaultValue: "Puesto" })}{" "}
              BRAVO 4
            </p>
          </div>
          <span
            className="text-[13px] font-semibold tabular-nums"
            style={{ color: r.hoy ? accent : muted }}
          >
            {r.h}
          </span>
        </div>
      ))}
      {modules.timeOff && (
        <Fila
          icon={<CalendarOff size={16} />}
          label={t("settings.mobileHub.previewTimeOff", {
            defaultValue: "Permisos y vacaciones",
          })}
        />
      )}
    </div>
  );

  const mensajes = (
    <div className="space-y-3">
      {[
        {
          n: t("settings.mobileHub.previewOpsRoom", {
            defaultValue: "Central de operaciones",
          }),
          m: t("settings.mobileHub.previewMsg1", {
            defaultValue: "Confirma relevo a las 08:00",
          }),
          h: "21:30",
          sinLeer: 2,
        },
        {
          n: t("settings.mobileHub.previewSupervisor", {
            defaultValue: "Supervisor de zona",
          }),
          m: t("settings.mobileHub.previewMsg2", {
            defaultValue: "Recibido, gracias.",
          }),
          h: "20:12",
          sinLeer: 0,
        },
      ].map((c) => (
        <div
          key={c.n}
          className="flex items-center gap-3 rounded-2xl border px-3.5 py-3"
          style={{ borderColor: border, background: card }}
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-bold"
            style={{ background: `${accent}22`, color: accent }}
          >
            {c.n.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold">{c.n}</p>
            <p className="truncate text-[11.5px]" style={{ color: muted }}>
              {c.m}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-[10.5px]" style={{ color: muted }}>
              {c.h}
            </span>
            {c.sinLeer > 0 && (
              <span
                className="grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold"
                style={{ background: accent, color: inkOnAccent }}
              >
                {c.sinLeer}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const perfil = (
    <div className="space-y-3">
      <div className="flex flex-col items-center py-2">
        <span
          className="grid h-20 w-20 place-items-center rounded-full text-[26px] font-black"
          style={{ background: `${accent}22`, color: accent }}
        >
          JR
        </span>
        <p className="mt-2.5 text-[16px] font-bold">
          {t("settings.mobileHub.previewGuardName", {
            defaultValue: "Juan Ramírez",
          })}
        </p>
        <p className="text-[11.5px]" style={{ color: muted }}>
          {t("settings.mobileHub.previewPost", { defaultValue: "Puesto" })}{" "}
          BRAVO 4
        </p>
      </div>
      {modules.performance && (
        <Tarjeta acento>
          <Eyebrow>
            {t("settings.mobileHub.previewMyPerformance", {
              defaultValue: "Mi desempeño",
            })}
          </Eyebrow>
          <div className="flex items-end gap-2">
            <p
              className="font-mono text-[34px] font-bold leading-none"
              style={{ color: accent }}
            >
              96
            </p>
            <p className="pb-1 text-[12px]" style={{ color: muted }}>
              / 100
            </p>
          </div>
        </Tarjeta>
      )}
      {modules.training && (
        <Fila
          icon={<GraduationCap size={16} />}
          label={t("settings.mobileHub.previewTraining", {
            defaultValue: "Entrenamiento",
          })}
          onClick={() => setPantalla("entrenamiento")}
        />
      )}
      {modules.timeOff && (
        <Fila
          icon={<CalendarOff size={16} />}
          label={t("settings.mobileHub.previewTimeOff", {
            defaultValue: "Permisos y vacaciones",
          })}
        />
      )}
      <Fila
        icon={<UserIcon size={16} />}
        label={t("settings.mobileHub.previewMyData", {
          defaultValue: "Mis datos",
        })}
      />
    </div>
  );

  const PANTALLAS: Record<string, React.ReactNode> = {
    inicio,
    ronda,
    entrenamiento,
    horario,
    mensajes,
    perfil,
  };

  /**
   * ── LA BARRA ES LA DE LA APP, NO UNA INVENTADA ───────────────────────────
   * Cinco pestañas, y la segunda es VARIABLE igual que en la app: Ronda cuando
   * el vigilante está en servicio, Entrenamiento cuando no lo está — y Ronda
   * también si la empresa apagó el módulo de entrenamiento (ver `GuardTabs`).
   * La maqueta enseñaba cuatro pestañas y se comía Mensajes.
   */
  const pestanas = [
    {
      id: "inicio" as const,
      icon: <Home size={21} />,
      label: t("settings.mobileHub.navHome", { defaultValue: "Inicio" }),
    },
    modules.training
      ? {
          id: "entrenamiento" as const,
          icon: <GraduationCap size={21} />,
          label: t("settings.mobileHub.navTraining", {
            defaultValue: "Entrenamiento",
          }),
        }
      : {
          id: "ronda" as const,
          icon: <RouteIcon size={21} />,
          label: t("settings.mobileHub.navRounds", { defaultValue: "Ronda" }),
        },
    {
      id: "horario" as const,
      icon: <CalendarDays size={21} />,
      label: t("settings.mobileHub.navSchedule", { defaultValue: "Horario" }),
    },
    {
      id: "mensajes" as const,
      icon: <MessageSquare size={21} />,
      label: t("settings.mobileHub.navMessages", { defaultValue: "Mensajes" }),
    },
    {
      id: "perfil" as const,
      icon: <UserIcon size={21} />,
      label: t("settings.mobileHub.navProfile", { defaultValue: "Perfil" }),
    },
  ];

  // La pestaña variable puede desaparecer al apagar «Entrenamiento» estando en
  // ella: se vuelve a Inicio en vez de dejar la maqueta en una pantalla muerta.
  const activa =
    pestanas.some((p) => p.id === pantalla) || pantalla === "ronda"
      ? pantalla
      : "inicio";

  return (
    <div
      className="select-none"
      style={{
        width: ANCHO * ESCALA,
        height: (ALTO + 20) * ESCALA,
        fontFamily: FAMILIA_FUENTE[font],
      }}
    >
      <div
        style={{ transform: `scale(${ESCALA})`, transformOrigin: "top left" }}
      >
        <div
          className="rounded-[3.2rem] p-[10px]"
          style={{
            width: ANCHO + 20,
            background:
              "linear-gradient(160deg, oklch(0.34 0 0), oklch(0.13 0 0) 55%, oklch(0.28 0 0))",
            boxShadow: "var(--lift-4)",
          }}
        >
          <div
            className="relative overflow-hidden rounded-[2.6rem]"
        data-simulador
            style={{ width: ANCHO, height: ALTO, background: bg, color: text }}
          >
            {/* Isla dinámica */}
            <div
              className="absolute left-1/2 top-[10px] z-20 h-[30px] w-[112px] -translate-x-1/2 rounded-full"
              style={{ background: "oklch(0 0 0)" }}
            />

            {/* Barra de estado */}
            <div className="flex h-[50px] items-center justify-between px-7 pt-2 text-[14px] font-semibold">
              <span>20:04</span>
              <span
                className="flex items-center gap-1.5"
                style={{ opacity: 0.9 }}
              >
                <SignalHigh size={15} /> <Wifi size={15} />{" "}
                <BatteryFull size={17} />
              </span>
            </div>

            {/* Cabecera de marca */}
            <div className="flex items-center gap-3 px-4 pb-2 pt-1">
              {logoUrl ? (
                <img
                  alt=""
                  className="h-11 w-11 rounded-xl object-contain"
                  src={logoUrl}
                  style={{ background: card }}
                />
              ) : (
                <span
                  className="grid h-11 w-11 place-items-center rounded-xl text-lg font-black"
                  style={{ background: `${accent}22`, color: accent }}
                >
                  {name.trim().charAt(0).toUpperCase() || "C"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold leading-tight">
                  {name}
                </p>
                <p
                  className="truncate text-[11px] uppercase tracking-[0.14em]"
                  style={{ color: muted }}
                >
                  {tagline}
                </p>
              </div>
            </div>

            {/* Pantalla — desplazable, como en el teléfono. El hueco de abajo
                deja sitio al botón de radio: la app hace lo mismo
                (`radio-fab-visible` reserva espacio) para que la última fila no
                quede tapada para siempre debajo del micrófono. */}
            <div
              className="absolute inset-x-0 bottom-[86px] top-[104px] overflow-y-auto px-4"
              style={{ paddingBottom: activa === "inicio" ? 76 : 16 }}
            >
              {PANTALLAS[activa]}
            </div>

            {/* Botón flotante de radio — existe de verdad en la app
                (`components/FloatingRadioButton`) y sólo mientras se está en
                servicio, que es el estado que enseña esta maqueta. */}
            {activa === "inicio" && (
              <div className="absolute bottom-[100px] right-5">
                <span
                  className="grid h-14 w-14 place-items-center rounded-full"
                  style={{ background: accent, boxShadow: "var(--lift-3)" }}
                >
                  <Mic size={24} style={{ color: inkOnAccent }} />
                </span>
              </div>
            )}

            {/* Barra de navegación — PULSABLE */}
            <div
              className="absolute inset-x-0 bottom-0 flex items-start justify-around border-t px-1 pb-7 pt-2.5"
              style={{ borderColor: border, background: card }}
            >
              {pestanas.map((p) => (
                <button
                  key={p.id}
                  className="flex flex-1 flex-col items-center gap-1 rounded-lg py-1 transition-transform active:scale-95"
                  style={{ color: activa === p.id ? accent : muted }}
                  type="button"
                  onClick={() => setPantalla(p.id)}
                >
                  {p.icon}
                  <span className="text-[9.5px] font-semibold">{p.label}</span>
                </button>
              ))}
            </div>

            <span
              className="absolute bottom-[7px] left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full"
              style={{ background: light ? "#00000055" : "#ffffff66" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Maqueta a escala de la app del SUPERVISOR — su mundo es distinto al del
 * vigilante: un tablero de MAPA con las estaciones, no una lista de turno.
 * Mismo chasis de teléfono y misma regla de color (los de dentro son los de la
 * app nativa, no los del CRM). Refleja acento, nombre, logo, tema y la fuente
 * elegida arriba, al instante.
 */
function SupervisorPreview({
  accent,
  name,
  logoUrl,
  light,
  font,
}: {
  accent: string;
  name: string;
  logoUrl: string | null;
  light: boolean;
  font: string;
}) {
  const { t } = useTranslation();
  const [pantalla, setPantalla] = useState<"dashboard" | "estaciones">(
    "dashboard",
  );

  const bg = light ? "#f5f5f4" : "#0d0d0d";
  const card = light ? "#ffffff" : "#1a1a1a";
  const card2 = light ? "#f3f4f6" : "#262626";
  const text = light ? "#111827" : "#f5f5f5";
  const muted = light ? "#6b7280" : "#a3a3a3";
  const border = light ? "#e5e7eb" : "#2e2e2e";
  const inkOnAccent = "oklch(0.15 0 0)";
  const mapBg = light ? "#dfe3e8" : "#12161b";

  const ANCHO = 390,
    ALTO = 844,
    ESCALA = 0.86;

  /* ── piezas ── */
  const Kpi = ({
    v,
    l,
    c,
    acento = false,
  }: {
    v: string;
    l: string;
    c: string;
    acento?: boolean;
  }) => (
    <div
      className="rounded-2xl border px-3 py-2.5"
      style={{ borderColor: acento ? accent + "66" : border, background: card }}
    >
      <div className="flex items-center gap-1.5" style={{ color: c }}>
        <span className="h-2 w-2 rounded-full" style={{ background: c }} />
        <span
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: muted }}
        >
          {l}
        </span>
      </div>
      <p
        className="mt-1 text-[22px] font-bold leading-none tabular-nums"
        style={{ color: acento ? accent : text }}
      >
        {v}
      </p>
    </div>
  );

  const Chip = ({
    icon,
    label,
    val,
    activo = false,
  }: {
    icon: React.ReactNode;
    label: string;
    val: string;
    activo?: boolean;
  }) => (
    <div
      className="flex min-w-[92px] items-center gap-2 rounded-2xl border px-3 py-2"
      style={{
        borderColor: activo ? accent : border,
        background: activo ? accent + "1f" : card,
      }}
    >
      <span style={{ color: activo ? accent : muted }}>{icon}</span>
      <div className="min-w-0">
        <p
          className="truncate text-[9.5px] uppercase tracking-wide"
          style={{ color: muted }}
        >
          {label}
        </p>
        <p
          className="text-[15px] font-bold leading-none tabular-nums"
          style={{ color: activo ? accent : text }}
        >
          {val}
        </p>
      </div>
    </div>
  );

  const Estacion = ({ nombre, dir }: { nombre: string; dir: string }) => (
    <div
      className="rounded-2xl border"
      style={{ borderColor: border, background: card }}
    >
      <div className="flex items-center gap-3 p-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={{ background: card2, color: accent }}
        >
          <Building2 size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold" style={{ color: text }}>
            {nombre}
          </p>
          <p className="truncate text-[11px]" style={{ color: muted }}>
            {dir}
          </p>
          <span
            className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold"
            style={{ background: card2, color: muted }}
          >
            ●{" "}
            {t("settings.mobileHub.svPreviewOffline", {
              defaultValue: "Sin conexión",
            })}
          </span>
        </div>
        <div className="text-right">
          <p
            className="text-[9.5px] uppercase tracking-wide"
            style={{ color: muted }}
          >
            {t("settings.mobileHub.svPreviewEta", { defaultValue: "ETA" })}
          </p>
          <p
            className="flex items-center gap-1 text-[13px] font-bold tabular-nums"
            style={{ color: accent }}
          >
            <Navigation size={11} /> 26 min
          </p>
        </div>
        <ChevronRight size={16} style={{ color: muted }} />
      </div>
      <div
        className="flex items-center justify-between border-t px-3 py-2 text-[11px]"
        style={{ borderColor: border, color: muted }}
      >
        <span className="flex items-center gap-1">
          <Check size={12} style={{ color: "#16a34a" }} />{" "}
          {t("settings.mobileHub.svPreviewIncidents", {
            defaultValue: "Incidentes hoy",
          })}{" "}
          <b style={{ color: text }}>0</b>
        </span>
        <span className="flex items-center gap-1">
          <ClipboardList size={12} />{" "}
          {t("settings.mobileHub.svPreviewTasks", { defaultValue: "Tareas" })}{" "}
          <b style={{ color: text }}>0</b>
        </span>
      </div>
    </div>
  );

  /* ── pantallas ── */
  const dashboard = (
    <div className="relative h-full w-full">
      {/* Mapa estilizado */}
      <div className="absolute inset-0" style={{ background: mapBg }}>
        <div
          className="absolute inset-0 opacity-[0.28]"
          style={{
            backgroundImage: `linear-gradient(${border} 1px, transparent 1px), linear-gradient(90deg, ${border} 1px, transparent 1px)`,
            backgroundSize: "46px 46px",
          }}
        />
        <div
          className="absolute"
          style={{ left: "18%", top: "54%", color: accent }}
        >
          <MapPin fill={accent} size={22} />
        </div>
        <div
          className="absolute"
          style={{ left: "62%", top: "40%", color: "#ef4444" }}
        >
          <MapPin fill="#ef4444" size={22} />
        </div>
        <div
          className="absolute"
          style={{ left: "44%", top: "66%", color: muted }}
        >
          <MapPin size={20} />
        </div>
        <div
          className="absolute flex flex-col items-center"
          style={{ left: "48%", top: "30%" }}
        >
          <span
            className="grid h-7 w-7 place-items-center rounded-full ring-4"
            style={{
              background: "#3b82f6",
              color: "#fff",
              ["--tw-ring-color" as any]: "#3b82f622",
            }}
          >
            <UserIcon size={14} />
          </span>
          <span
            className="mt-1 rounded px-1.5 py-0.5 text-[9px] font-bold"
            style={{ background: "#3b82f6", color: "#fff" }}
          >
            {t("settings.mobileHub.svPreviewYou", { defaultValue: "Tú" })}
          </span>
        </div>
      </div>
      {/* KPIs flotantes */}
      <div className="absolute inset-x-3 top-3 grid grid-cols-4 gap-2">
        <Kpi
          acento
          c={accent}
          l={t("settings.mobileHub.svPreviewStations", {
            defaultValue: "Puestos",
          })}
          v="20"
        />
        <Kpi
          c="#16a34a"
          l={t("settings.mobileHub.svPreviewOnDuty", {
            defaultValue: "En turno",
          })}
          v="2"
        />
        <Kpi
          c="#f59e0b"
          l={t("settings.mobileHub.svPreviewLate", { defaultValue: "Tarde" })}
          v="0"
        />
        <Kpi
          c="#ef4444"
          l={t("settings.mobileHub.svPreviewOff", { defaultValue: "Offline" })}
          v="18"
        />
      </div>
      {/* FABs SOS + Radio */}
      <div className="absolute bottom-4 right-4 flex flex-col items-center gap-3">
        <span
          className="grid h-14 w-14 place-items-center rounded-full"
          style={{ background: accent, boxShadow: "var(--lift-3)" }}
        >
          <RadioTower size={22} style={{ color: inkOnAccent }} />
        </span>
        <span
          className="grid h-16 w-16 place-items-center rounded-full text-[13px] font-black"
          style={{
            background: "#ef4444",
            color: "#fff",
            boxShadow: "var(--lift-3)",
          }}
        >
          SOS
        </span>
      </div>
    </div>
  );

  const estaciones = (
    <div className="space-y-3 px-4 pt-3">
      <div>
        <p className="text-[20px] font-bold" style={{ color: text }}>
          {t("settings.mobileHub.svPreviewStationsTitle", {
            defaultValue: "Puestos",
          })}
        </p>
        <p className="text-[12px]" style={{ color: muted }}>
          {t("settings.mobileHub.svPreviewStationsSub", {
            defaultValue: "Todas las ubicaciones del cliente",
          })}
        </p>
      </div>
      <div className="flex gap-2 overflow-hidden">
        <Chip
          activo
          icon={<Building2 size={15} />}
          label={t("settings.mobileHub.svPreviewAll", {
            defaultValue: "Todos",
          })}
          val="20"
        />
        <Chip
          icon={<Check size={15} />}
          label={t("settings.mobileHub.svPreviewActive", {
            defaultValue: "Activos",
          })}
          val="1"
        />
        <Chip
          icon={<ShieldAlert size={15} />}
          label={t("settings.mobileHub.svPreviewAttention", {
            defaultValue: "Atención",
          })}
          val="0"
        />
      </div>
      <Estacion dir="Av. Ámsterdam 240, Condesa" nombre="Acceso de Servicio" />
      <Estacion dir="Av. Universidad 2020, Copilco" nombre="Acceso Peatonal" />
      <Estacion
        dir="Calz. Vallejo 1055, Industrial Vallejo"
        nombre="Andén de Carga"
      />
    </div>
  );

  const PANTALLAS: Record<string, React.ReactNode> = { dashboard, estaciones };

  const pestanas = [
    {
      id: "dashboard" as const,
      icon: <MapIcon size={21} />,
      label: t("settings.mobileHub.svNavDashboard", {
        defaultValue: "Tablero",
      }),
    },
    {
      id: "estaciones" as const,
      icon: <Building2 size={21} />,
      label: t("settings.mobileHub.svNavStations", { defaultValue: "Puestos" }),
    },
    {
      id: "guardias" as const,
      icon: <Users size={21} />,
      label: t("settings.mobileHub.svNavGuards", {
        defaultValue: "Vigilantes",
      }),
    },
    {
      id: "mensajes" as const,
      icon: <MessageSquare size={21} />,
      label: t("settings.mobileHub.svNavMessages", {
        defaultValue: "Mensajes",
      }),
    },
    {
      id: "reportes" as const,
      icon: <ClipboardList size={21} />,
      label: t("settings.mobileHub.svNavReports", { defaultValue: "Reportes" }),
    },
  ];
  const activa = pantalla;
  const conMapa = activa === "dashboard";

  return (
    <div
      className="select-none"
      style={{
        width: ANCHO * ESCALA,
        height: (ALTO + 20) * ESCALA,
        fontFamily: FAMILIA_FUENTE[font],
      }}
    >
      <div
        style={{ transform: `scale(${ESCALA})`, transformOrigin: "top left" }}
      >
        <div
          className="rounded-[3.2rem] p-[10px]"
          style={{
            width: ANCHO + 20,
            background:
              "linear-gradient(160deg, oklch(0.34 0 0), oklch(0.13 0 0) 55%, oklch(0.28 0 0))",
            boxShadow: "var(--lift-4)",
          }}
        >
          <div
            className="relative overflow-hidden rounded-[2.6rem]"
        data-simulador
            style={{ width: ANCHO, height: ALTO, background: bg, color: text }}
          >
            <div
              className="absolute left-1/2 top-[10px] z-20 h-[30px] w-[112px] -translate-x-1/2 rounded-full"
              style={{ background: "oklch(0 0 0)" }}
            />
            <div
              className="flex h-[50px] items-center justify-between px-7 pt-2 text-[14px] font-semibold"
              style={{ color: conMapa ? "#fff" : text }}
            >
              <span>20:04</span>
              <span
                className="flex items-center gap-1.5"
                style={{ opacity: 0.9 }}
              >
                <SignalHigh size={15} /> <Wifi size={15} />{" "}
                <BatteryFull size={17} />
              </span>
            </div>
            {/* Cabecera: hamburguesa + marca + campana (como en la app del supervisor) */}
            <div
              className="relative z-10 flex items-center gap-2.5 px-4 pb-2 pt-1"
              style={{ color: conMapa ? "#fff" : text }}
            >
              <Menu size={20} style={{ opacity: 0.85 }} />
              {logoUrl ? (
                <img
                  alt=""
                  className="h-9 w-9 rounded-xl object-contain"
                  src={logoUrl}
                  style={{ background: card }}
                />
              ) : (
                <span
                  className="grid h-9 w-9 place-items-center rounded-xl text-[15px] font-black"
                  style={{ background: accent + "22", color: accent }}
                >
                  {name.trim().charAt(0).toUpperCase() || "C"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold leading-tight">
                  {name}
                </p>
                <p
                  className="truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: accent }}
                >
                  {t("settings.mobileHub.svPreviewRole", {
                    defaultValue: "Supervisor",
                  })}
                </p>
              </div>
              <Bell size={19} style={{ opacity: 0.85 }} />
            </div>
            {/* Pantalla */}
            <div
              className="absolute inset-x-0 bottom-[86px] top-[104px] overflow-hidden"
              style={conMapa ? {} : { overflowY: "auto" }}
            >
              {PANTALLAS[activa]}
            </div>
            {/* Nav */}
            <div
              className="absolute inset-x-0 bottom-0 flex items-start justify-around border-t px-1 pb-7 pt-2.5"
              style={{ borderColor: border, background: card }}
            >
              {pestanas.map((p) => (
                <button
                  key={p.id}
                  className="flex flex-1 flex-col items-center gap-1 rounded-lg py-1 transition-transform active:scale-95"
                  style={{ color: activa === p.id ? accent : muted }}
                  type="button"
                  onClick={() => {
                    if (p.id === "dashboard" || p.id === "estaciones")
                      setPantalla(p.id);
                  }}
                >
                  {p.icon}
                  <span className="text-[9.5px] font-semibold">{p.label}</span>
                </button>
              ))}
            </div>
            <span
              className="absolute bottom-[7px] left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full"
              style={{ background: light ? "#00000055" : "#ffffff66" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
