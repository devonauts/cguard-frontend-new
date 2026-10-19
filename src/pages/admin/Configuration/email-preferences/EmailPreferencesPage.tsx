import { useEffect, useMemo, useRef, useState } from "react";
import { olvidarPreferenciaDeInvitacion } from "@/hooks/useAppInviteEnabled";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Mail,
  Lock,
  Palette,
  RotateCcw,
  Eye,
  Info,
  TriangleAlert,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  SkeletonBlock,
  StatusBadge,
  GlassPanel,
  Modal,
  InfoNote,
} from "@/components/kit";
import {
  emailPreferencesService,
  EmailCatalogItem,
  EmailBranding,
  EmailPreviewResult,
} from "@/lib/api/emailPreferencesService";

/* ────────────────────────────────────────────────────────────────────────────
   Los valores de abajo NO son estilos del CRM: son DATOS de la empresa. Es el
   color con el que se pintan SUS correos, se guarda en su cuenta y se aplica en
   el mensaje que recibe el destinatario — un documento que no tiene los tokens
   del panel. Por eso van escritos y no salen de `--brand`.
   ──────────────────────────────────────────────────────────────────────────── */
const DEFAULT_BRAND = "#C8860A";
const DEFAULT_HEADER = "#0A0E16";
const PRESET_BRANDS = [
  "#C8860A",
  "#1E63C8",
  "#0E9F6E",
  "#DC2626",
  "#7C3AED",
  "#0891B2",
];
const PRESET_HEADERS = ["#0A0E16", "#1F2937", "#0F3D2E", "#1E293B", "#3B1D5E"];

/** Fila de conmutador: título + descripción a la izquierda, interruptor a la
 *  derecha. Superficie plana porque se repite dentro de un `map()`. */
function ToggleRow({
  item,
  checked,
  onCheckedChange,
  onVerEjemplo,
}: {
  item: EmailCatalogItem;
  checked: boolean;
  onCheckedChange: (b: boolean) => void;
  onVerEjemplo: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="glass-flat flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-sm font-medium">{item.label}</Label>
          {item.locked && (
            <StatusBadge
              tone="neutral"
              dot={false}
              className="px-2 py-0.5 text-[10px]"
            >
              <Lock size={10} /> {t("ui.EmailPreferencesPage.siempreActivo", "Siempre activo")}
            </StatusBadge>
          )}
        </div>
        {item.description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-soft)" }}>
            {item.description}
          </p>
        )}
        {/* Decidir si se apaga un correo sin haberlo visto es adivinar. */}
        <button
          type="button"
          onClick={onVerEjemplo}
          className="cg-focus mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors hover:underline"
          style={{ color: "var(--brand-text)" }}
        >
          <Eye size={13} /> {t("ui.EmailPreferencesPage.verEjemplo", "Ver ejemplo")}
        </button>
      </div>
      <Switch
        checked={checked}
        disabled={item.locked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/** El correo tal cual le llega al destinatario.
 *
 *  Va en un `<iframe srcDoc>` y no inyectado en la página por dos razones que no
 *  son estéticas: el HTML de un correo trae sus propios estilos —tablas, anchos
 *  fijos, colores absolutos— que se escaparían al resto del CRM; y un iframe sin
 *  `allow-same-origin` no puede tocar la sesión. Lo que se ve es exactamente lo
 *  que renderiza el servidor al enviarlo de verdad. */
function EjemploDeCorreo({
  item,
  abierto,
  onCerrar,
}: {
  item: EmailCatalogItem | null;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const { t } = useTranslation();
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState<EmailPreviewResult | null>(null);

  useEffect(() => {
    if (!abierto || !item) return;
    let vivo = true;
    setCargando(true);
    setDatos(null);
    emailPreferencesService
      .previewTemplate(item.key)
      .then((r) => {
        if (vivo) setDatos(r);
      })
      .catch(() => {
        if (vivo)
          setDatos({
            disponible: false,
            motivo: t(
              "emailPreferences.previewLoadError",
              "No se pudo cargar el ejemplo.",
            ),
          });
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [abierto, item]);

  if (!item) return null;

  return (
    <Modal
      open={abierto}
      onOpenChange={(o) => {
        if (!o) onCerrar();
      }}
      title={item.label}
      icon={<Mail />}
      size="lg"
    >
      {cargando && <SkeletonBlock className="h-[28rem] w-full" />}

      {!cargando && datos && !datos.disponible && (
        <InfoNote tone="neutral" icon={<Info />}>
          {datos.motivo}
        </InfoNote>
      )}

      {!cargando && datos && datos.disponible && (
        <div className="space-y-3">
          <div className="glass-sunken px-3 py-2">
            <p className="cg-eyebrow">{t("ui.EmailPreferencesPage.asunto", "Asunto")}</p>
            <p className="mt-0.5 text-sm font-semibold">{datos.asunto}</p>
          </div>

          {datos.avisoSendgrid && (
            <InfoNote tone="warn" icon={<TriangleAlert />}>
              {t(
                "ui.EmailPreferencesPage.esteCorreoSeEstaEnviandoConUnaPlantilla",
                "Este correo se está enviando con una plantilla externa, así que lo que llega puede no coincidir con este ejemplo.",
              )}
            </InfoNote>
          )}

          <iframe
            title={t("ui.EmailPreferencesPage.ejemploLabel", {
              defaultValue: "Ejemplo — {{label}}",
              label: item.label,
            })}
            srcDoc={datos.html}
            sandbox=""
            className="h-[28rem] w-full rounded-xl border"
            style={{ borderColor: "var(--hairline)", background: "#fff" }}
          />

          <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
            {t(
              "ui.EmailPreferencesPage.conDatosDeEjemploElNombre",
              "Con datos de ejemplo. El nombre, el logotipo y los colores son los de tu organización; el enlace de este ejemplo no es válido.",
            )}
          </p>
        </div>
      )}
    </Modal>
  );
}

function Swatches({
  presets,
  value,
  onPick,
}: {
  presets: string[];
  value: string;
  onPick: (c: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          aria-label={t("ui.EmailPreferencesPage.colorHex", {
            defaultValue: "Color {{color}}",
            color: c,
          })}
          aria-pressed={value.toLowerCase() === c.toLowerCase()}
          className={`cg-focus h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 ${value.toLowerCase() === c.toLowerCase() ? "scale-110" : ""}`}
          style={{
            background: c,
            borderColor:
              value.toLowerCase() === c.toLowerCase()
                ? "var(--ink)"
                : "transparent",
          }}
        />
      ))}
      <label
        className="glass-flat ml-1 flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm"
        style={{ color: "var(--ink-soft)" }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onPick(e.target.value)}
          className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
        />
        {t("ui.EmailPreferencesPage.personalizado", "Personalizado")}
      </label>
    </div>
  );
}

export default function EmailPreferencesPage() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<EmailCatalogItem[]>([]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [branding, setBranding] = useState<EmailBranding>({
    brandColor: DEFAULT_BRAND,
    headerColor: DEFAULT_HEADER,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Qué correo se está mirando. null = ninguno.
  const [ejemplo, setEjemplo] = useState<EmailCatalogItem | null>(null);

  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    emailPreferencesService
      .get()
      .then((res) => {
        setCatalog(res.catalog || []);
        setPrefs(res.preferences || {});
        if (res.branding) {
          setBranding({
            brandColor: res.branding.brandColor || DEFAULT_BRAND,
            headerColor: res.branding.headerColor || DEFAULT_HEADER,
          });
        }
      })
      .catch(() =>
        toast.error(
          t("emailPreferences.loadError", {
            defaultValue: "No se pudieron cargar las preferencias",
          }),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  // Live preview — debounced re-render whenever the colors change.
  useEffect(() => {
    if (loading) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreviewLoading(true);
    previewTimer.current = setTimeout(() => {
      emailPreferencesService
        .preview(branding)
        .then((res) => setPreviewHtml(res.html || ""))
        .catch(() => setPreviewHtml(""))
        .finally(() => setPreviewLoading(false));
    }, 300);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding.brandColor, branding.headerColor, loading]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byCat: Record<string, EmailCatalogItem[]> = {};
    for (const item of catalog) {
      if (!byCat[item.category]) {
        byCat[item.category] = [];
        order.push(item.category);
      }
      byCat[item.category].push(item);
    }
    return order.map((category) => ({ category, items: byCat[category] }));
  }, [catalog]);

  const setPref = (key: string, value: boolean) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  const activos = useMemo(
    () => catalog.filter((i) => i.locked || prefs[i.key] !== false).length,
    [catalog, prefs],
  );

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, boolean> = {};
      for (const item of catalog) {
        if (!item.locked) payload[item.key] = prefs[item.key] !== false;
      }
      const res = await emailPreferencesService.update(payload, branding);
      setCatalog(res.catalog || catalog);
      setPrefs(res.preferences || prefs);
      if (res.branding)
        setBranding({
          brandColor: res.branding.brandColor,
          headerColor: res.branding.headerColor,
        });
      // La ficha del cliente pregunta UNA vez por sesión si puede invitar a la
      // app. Si no se olvida aquí, apagar ese interruptor no se notaría en la
      // ficha hasta recargar el CRM — y encenderlo tampoco.
      olvidarPreferenciaDeInvitacion();
      toast.success(
        t("emailPreferences.saved", { defaultValue: "Preferencias guardadas" }),
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("emailPreferences.saveError", { defaultValue: "Error al guardar" }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <SettingsLayout
        navKey="configuracion"
        title={t("settings.configuracion.preferencias-correo", {
          defaultValue: "Preferencias de correo",
        })}
      >
        <PageContainer width="wide">
          <PageHeader
            icon={<Mail />}
            title={t("settings.configuracion.preferencias-correo", {
              defaultValue: "Preferencias de correo",
            })}
            subtitle={t("emailPreferences.intro", {
              defaultValue:
                'Personaliza el color de tus correos y activa o desactiva cada notificación. Los correos marcados como «Siempre activo» no se pueden desactivar por seguridad.',
            })}
            badges={
              !loading && catalog.length ? (
                <StatusBadge tone="ok">
                  {t("ui.EmailPreferencesPage.avisosActivos", {
                    defaultValue: "{{active}} de {{total}} avisos activos",
                    active: activos,
                    total: catalog.length,
                  })}
                </StatusBadge>
              ) : undefined
            }
            actions={
              !loading ? (
                <Button onClick={save} disabled={saving} variant="brand">
                  {saving ? (
                    <Loader2 className="mr-2 animate-spin" size={16} />
                  ) : (
                    <Save className="mr-2" size={16} />
                  )}
                  {t("emailPreferences.save", { defaultValue: "Guardar" })}
                </Button>
              ) : undefined
            }
          />

          {loading ? (
            <SkeletonCards count={4} />
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              {/* LEFT: branding + toggles */}
              <div className="space-y-6">
                <Section
                  title={t("emailPreferences.branding", {
                    defaultValue: "Personalización de marca",
                  })}
                  icon={<Palette />}
                >
                  <div className="space-y-6">
                    <div>
                      <Label className="mb-2 block">
                        {t("emailPreferences.brandColor", {
                          defaultValue: "Color de la marca",
                        })}
                      </Label>
                      <Swatches
                        presets={PRESET_BRANDS}
                        value={branding.brandColor}
                        onPick={(c) =>
                          setBranding((b) => ({ ...b, brandColor: c }))
                        }
                      />
                      <p
                        className="mt-2 text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("emailPreferences.brandColorHint", {
                          defaultValue:
                            "Colorea el acento, la línea superior y el botón de acción de tus correos.",
                        })}
                      </p>
                    </div>

                    <div>
                      <Label className="mb-2 block">
                        {t("emailPreferences.headerColor", {
                          defaultValue: "Color del encabezado",
                        })}
                      </Label>
                      <Swatches
                        presets={PRESET_HEADERS}
                        value={branding.headerColor}
                        onPick={(c) =>
                          setBranding((b) => ({ ...b, headerColor: c }))
                        }
                      />
                      <p
                        className="mt-2 text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("emailPreferences.headerColorHint", {
                          defaultValue:
                            "Fondo de la cabecera (con tu logo). Se recomienda un tono oscuro para que el texto blanco se lea bien.",
                        })}
                      </p>
                    </div>

                    {(branding.brandColor.toLowerCase() !==
                      DEFAULT_BRAND.toLowerCase() ||
                      branding.headerColor.toLowerCase() !==
                        DEFAULT_HEADER.toLowerCase()) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setBranding({
                            brandColor: DEFAULT_BRAND,
                            headerColor: DEFAULT_HEADER,
                          })
                        }
                      >
                        <RotateCcw size={14} className="mr-1" />{" "}
                        {t("emailPreferences.reset", {
                          defaultValue: "Restaurar colores originales",
                        })}
                      </Button>
                    )}
                    <p
                      className="text-xs"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {t("emailPreferences.logoHint", {
                        defaultValue:
                          "El logo de tus correos es el de tu empresa. Cámbialo en Configuración › Perfil de la empresa.",
                      })}
                    </p>
                  </div>
                </Section>

                {/* `flat` y no `Section`: son bloques que se repiten, y `.glass`
                    dentro de un map() obliga a desenfocar el fondo una vez por
                    grupo en cada fotograma. */}
                {groups.map((group) => (
                  <GlassPanel key={group.category} flat className="p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <span
                        className="[&_svg]:size-4"
                        style={{ color: "var(--brand-text)" }}
                      >
                        <Mail />
                      </span>
                      <h3 className="truncate text-sm font-semibold tracking-tight">
                        {group.category}
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <ToggleRow
                          key={item.key}
                          item={item}
                          checked={
                            item.locked ? true : prefs[item.key] !== false
                          }
                          onCheckedChange={(b) => setPref(item.key, b)}
                          onVerEjemplo={() => setEjemplo(item)}
                        />
                      ))}
                    </div>
                  </GlassPanel>
                ))}
              </div>

              {/* RIGHT: live preview */}
              <div className="lg:sticky lg:top-24 lg:self-start">
                <Section
                  title={t("emailPreferences.preview", {
                    defaultValue: "Vista previa",
                  })}
                  icon={<Eye />}
                >
                  <p
                    className="mb-3 text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t("emailPreferences.previewHint", {
                      defaultValue:
                        "Así verá tu cliente un correo de la empresa.",
                    })}
                  </p>
                  <div className="glass-sunken relative overflow-hidden">
                    {previewLoading && (
                      <div className="glass-flat absolute right-2 top-2 z-10 rounded-full p-1.5">
                        <Loader2
                          className="animate-spin"
                          size={14}
                          style={{ color: "var(--brand-text)" }}
                        />
                      </div>
                    )}
                    {previewHtml ? (
                      <iframe
                        title="email-preview"
                        srcDoc={previewHtml}
                        className="h-[560px] w-full border-0"
                        sandbox=""
                      />
                    ) : (
                      <div className="flex h-[560px] flex-col gap-3 p-4">
                        <div className="cg-skeleton h-24 w-full" />
                        <div className="cg-skeleton h-3 w-2/3" />
                        <div className="cg-skeleton h-3 w-1/2" />
                        <div className="cg-skeleton h-3 w-3/4" />
                        <div className="cg-skeleton h-9 w-40 rounded-full" />
                      </div>
                    )}
                  </div>
                </Section>
              </div>
            </div>
          )}
        </PageContainer>

        <EjemploDeCorreo
          item={ejemplo}
          abierto={!!ejemplo}
          onCerrar={() => setEjemplo(null)}
        />
      </SettingsLayout>
    </AppLayout>
  );
}
