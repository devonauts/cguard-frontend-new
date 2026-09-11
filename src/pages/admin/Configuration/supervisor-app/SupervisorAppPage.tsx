import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ShieldCheck,
  Palette,
  Type,
  Save,
  RotateCcw,
  ChevronsRight,
  PauseCircle,
  OctagonX,
  Radio,
  MapPin,
  Building2,
  Link2,
} from "lucide-react";

import api from "@/lib/api";
import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  Segmented,
  IconTile,
} from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AJUSTES › APP DEL SUPERVISOR
 *
 * El vigilante y el supervisor no son el mismo público ni hacen el mismo
 * trabajo: uno está ocho horas en un puesto, el otro conduce de noche entre
 * cuatro y decide con el teléfono en una mano. Compartían UNA personalización,
 * así que subir el contraste de los botones para que se vieran en la calle se
 * lo cambiaba también al vigilante.
 *
 * Aquí se decide lo del supervisor y sólo lo del supervisor. **Vacío = hereda**
 * de «App del equipo»: una empresa que quiere una sola marca no toca nada y
 * sigue como estaba. Sin ese matiz, estrenar esta pantalla habría dejado a
 * cada supervisor con la marca de fábrica hasta que alguien la reescribiera.
 *
 * ── POR QUÉ LOS COLORES VAN ESCRITOS Y NO SALEN DE `--brand` ───────────────
 * No son estilos del CRM: son DATOS de la empresa. Es el acento con el que se
 * pinta SU app, se guarda en su cuenta y lo aplica una app nativa que no
 * comparte los tokens del panel.
 *
 * ── LA MAQUETA ES LA PANTALLA DE VERDAD ───────────────────────────────────
 * Y no una cualquiera: la parada de un recorrido, que es donde el supervisor
 * pasa el turno y donde el color del botón decide si acierta el deslizador a
 * la primera. Una vista previa de la pantalla de inicio no diría nada de eso.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El dorado de fábrica de las apps. */
const HEREDA = "";

const PRESETS = [
  "#d4a017",
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#0d9488",
  "#ea580c",
  "#475569",
];

const FUENTES: Array<{ value: string; label: string; css?: string }> = [
  { value: "", label: "Heredar del equipo" },
  {
    value: "poppins",
    label: "Poppins",
    css: '"Poppins", system-ui, sans-serif',
  },
  { value: "inter", label: "Inter", css: '"Inter", system-ui, sans-serif' },
  {
    value: "manrope",
    label: "Manrope",
    css: '"Manrope", system-ui, sans-serif',
  },
];

interface SupervisorSettings {
  accentColor: string;
  fontFamily: "" | "poppins" | "inter" | "manrope";
  displayName: string;
  tagline: string;
  defaultTheme: "dark" | "light" | "user" | "inherit";
}

const VACIO: SupervisorSettings = {
  accentColor: "",
  fontFamily: "",
  displayName: "",
  tagline: "",
  defaultTheme: "inherit",
};

/** ¿Es un hex de seis dígitos? Lo que el servidor acepta, ni más ni menos. */
const esHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v.trim());

/** Blanco o negro sobre el acento, según lo claro que sea (luminancia WCAG). */
function tintaSobre(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.45
    ? "#0b0c0e"
    : "#ffffff";
}

export default function SupervisorAppPage() {
  const { t } = useTranslation();
  const uid = useId();
  const { hasPermission } = usePermissions();
  const puedeEditar = hasPermission("settingsEdit");

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cfg, setCfg] = useState<SupervisorSettings>(VACIO);
  // Lo del EQUIPO, sólo para enseñar de qué se hereda. No se toca desde aquí.
  const [equipo, setEquipo] = useState<{
    accentColor: string;
    fontFamily: string;
    displayName: string;
  }>({
    accentColor: "",
    fontFamily: "",
    displayName: "",
  });
  // El PUT de ajustes recalcula el logo desde `logos[0]`: hay que reenviar los
  // archivos tal como llegaron o se borraría el logo de la empresa.
  const [crudo, setCrudo] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId") || "";
        const { data } = await api.get(`/tenant/${tenantId}/settings`);
        const s = (data as any)?.data ?? data ?? {};
        setCrudo(s);
        const m = s.mobileAppSettings || {};
        setEquipo({
          accentColor: m.accentColor || "",
          fontFamily: m.fontFamily || "",
          displayName: m.displayName || "",
        });
        setCfg({ ...VACIO, ...(m.supervisor || {}) });
      } catch {
        toast.error(
          t(
            "ui.SupervisorApp.noCargo",
            "No se pudo leer la configuración. Reintenta.",
          ),
        );
      } finally {
        setCargando(false);
      }
    })();
  }, [t]);

  const set = (p: Partial<SupervisorSettings>) =>
    setCfg((c) => ({ ...c, ...p }));

  const guardar = async () => {
    if (cfg.accentColor && !esHex(cfg.accentColor)) {
      toast.error(
        t(
          "ui.SupervisorApp.colorInvalido",
          "El color debe ser un hex de seis dígitos, como #2563eb",
        ),
      );

      return;
    }
    setGuardando(true);
    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      await api.put(`/tenant/${tenantId}/settings`, {
        data: {
          ...(crudo || {}),
          mobileAppSettings: {
            ...((crudo || {}).mobileAppSettings || {}),
            supervisor: cfg,
          },
        },
      });
      toast.success(
        t(
          "ui.SupervisorApp.guardado",
          "Guardado. Los supervisores lo verán al abrir la app.",
        ),
      );
    } catch {
      toast.error(
        t("ui.SupervisorApp.noGuardo", "No se pudo guardar. Reintenta."),
      );
    } finally {
      setGuardando(false);
    }
  };

  // Lo que de verdad va a ver la app: lo propio si está, si no lo del equipo.
  const acentoReal = cfg.accentColor || equipo.accentColor || "#d4a017";
  const fuenteReal = cfg.fontFamily || equipo.fontFamily || "";
  const cssFuente = useMemo(
    () => FUENTES.find((f) => f.value === fuenteReal)?.css,
    [fuenteReal],
  );
  const claro = cfg.defaultTheme === "light";

  return (
    <AppLayout>
      <SettingsLayout
        navKey="configuracion"
        title={t("ui.SupervisorApp.titulo", "App del supervisor")}
      >
        <PageContainer className="p-4 lg:p-8" width="wide">
          <PageHeader
            actions={
              puedeEditar ? (
                <div className="flex gap-2">
                  <Button
                    disabled={guardando}
                    variant="outline"
                    onClick={() => setCfg(VACIO)}
                  >
                    <RotateCcw className="size-4" />
                    {t(
                      "ui.SupervisorApp.heredarTodo",
                      "Heredar todo del equipo",
                    )}
                  </Button>
                  <Button
                    disabled={guardando}
                    variant="brand"
                    onClick={guardar}
                  >
                    <Save className="size-4" />
                    {guardando
                      ? t("comun.guardando", "Guardando…")
                      : t("comun.guardar", "Guardar")}
                  </Button>
                </div>
              ) : undefined
            }
            icon={<ShieldCheck />}
            subtitle={t(
              "ui.SupervisorApp.subtitulo",
              "Lo que ve el supervisor en su teléfono. Lo que dejes vacío se hereda de «App del equipo».",
            )}
            title={t("ui.SupervisorApp.titulo", "App del supervisor")}
          />

          {cargando ? (
            <SkeletonCards count={2} />
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="space-y-6">
                {/* ── COLOR DE LOS BOTONES ─────────────────────────────── */}
                <Section
                  icon={<Palette className="size-4" />}
                  title={t("ui.SupervisorApp.color", "Color de los botones")}
                >
                  <p
                    className="mb-3 text-sm"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {t(
                      "ui.SupervisorApp.colorSub",
                      "Pinta los botones, el deslizador de llegada y la pestaña activa. Un supervisor mira su teléfono de noche y en marcha: conviene que resalte.",
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="flex h-9 items-center gap-2 rounded-lg border px-3 text-sm"
                      disabled={!puedeEditar}
                      style={{
                        borderColor: cfg.accentColor
                          ? "var(--line-2)"
                          : "var(--brand)",
                      }}
                      type="button"
                      onClick={() => set({ accentColor: HEREDA })}
                    >
                      <Link2 className="size-3.5" />
                      {t("ui.SupervisorApp.heredar", "Heredar")}
                    </button>
                    {PRESETS.map((c) => (
                      <button
                        key={c}
                        aria-label={c}
                        className="size-9 rounded-lg border-2 transition-transform hover:scale-105"
                        disabled={!puedeEditar}
                        style={{
                          background: c,
                          borderColor:
                            cfg.accentColor.toLowerCase() === c
                              ? "var(--ink)"
                              : "transparent",
                        }}
                        type="button"
                        onClick={() => set({ accentColor: c })}
                      />
                    ))}
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={t(
                          "ui.SupervisorApp.colorPropio",
                          "Color propio",
                        )}
                        className="size-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                        disabled={!puedeEditar}
                        type="color"
                        value={acentoReal}
                        onChange={(e) => set({ accentColor: e.target.value })}
                      />
                      <Input
                        className="w-28 font-mono text-sm"
                        disabled={!puedeEditar}
                        maxLength={7}
                        placeholder={equipo.accentColor || "#d4a017"}
                        value={cfg.accentColor}
                        onChange={(e) => set({ accentColor: e.target.value })}
                      />
                    </div>
                  </div>
                  {!cfg.accentColor && (
                    <p
                      className="mt-2 text-sm"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {t(
                        "ui.SupervisorApp.heredandoColor",
                        "Heredando el color del equipo:",
                      )}{" "}
                      <span className="font-mono">
                        {equipo.accentColor || "#d4a017"}
                      </span>
                    </p>
                  )}
                </Section>

                {/* ── TIPO DE LETRA ────────────────────────────────────── */}
                <Section
                  icon={<Type className="size-4" />}
                  title={t("ui.SupervisorApp.letra", "Tipo de letra")}
                >
                  <p
                    className="mb-3 text-sm"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {t(
                      "ui.SupervisorApp.letraSub",
                      "Las tres van dentro de la app: cambiar de una a otra es instantáneo y funciona sin cobertura.",
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {FUENTES.map((f) => (
                      <button
                        key={f.value}
                        className="rounded-lg border px-4 py-2.5 text-left transition-colors"
                        disabled={!puedeEditar}
                        style={{
                          borderColor:
                            cfg.fontFamily === f.value
                              ? "var(--brand)"
                              : "var(--line-2)",
                          fontFamily: f.css,
                        }}
                        type="button"
                        onClick={() =>
                          set({
                            fontFamily:
                              f.value as SupervisorSettings["fontFamily"],
                          })
                        }
                      >
                        <span className="block text-sm font-semibold">
                          {f.label}
                        </span>
                        <span
                          className="block text-xs"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {f.value
                            ? t(
                                "ui.SupervisorApp.muestra",
                                "Parada 2 de 4 · Ya llegué",
                              )
                            : equipo.fontFamily
                              ? t(
                                  "ui.SupervisorApp.equipoUsa",
                                  "El equipo usa {{f}}",
                                  {
                                    f: equipo.fontFamily,
                                  },
                                )
                              : t(
                                  "ui.SupervisorApp.delSistema",
                                  "La del teléfono",
                                )}
                        </span>
                      </button>
                    ))}
                  </div>
                </Section>

                {/* ── NOMBRE, LEMA Y TEMA ──────────────────────────────── */}
                <Section
                  title={t("ui.SupervisorApp.identidad", "Nombre y tema")}
                >
                  <p
                    className="mb-3 text-sm"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {t(
                      "ui.SupervisorApp.identidadSub",
                      "Lo que se lee en el acceso y en la cabecera de la app del supervisor.",
                    )}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${uid}-nombre`}>
                        {t("ui.SupervisorApp.nombre", "Nombre visible")}
                      </Label>
                      <Input
                        disabled={!puedeEditar}
                        id={`${uid}-nombre`}
                        maxLength={40}
                        placeholder={equipo.displayName || "C-Guard Pro"}
                        value={cfg.displayName}
                        onChange={(e) => set({ displayName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${uid}-lema`}>
                        {t("ui.SupervisorApp.lema", "Lema")}
                      </Label>
                      <Input
                        disabled={!puedeEditar}
                        id={`${uid}-lema`}
                        maxLength={60}
                        placeholder={t(
                          "ui.SupervisorApp.lemaEj",
                          "Supervisión de campo",
                        )}
                        value={cfg.tagline}
                        onChange={(e) => set({ tagline: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mt-4 space-y-1.5">
                    <Label>
                      {t("ui.SupervisorApp.tema", "Tema al instalar")}
                    </Label>
                    <Segmented<SupervisorSettings["defaultTheme"]>
                      options={[
                        {
                          value: "inherit",
                          label: t("ui.SupervisorApp.heredar", "Heredar"),
                        },
                        {
                          value: "dark",
                          label: t("ui.SupervisorApp.oscuro", "Oscuro"),
                        },
                        {
                          value: "light",
                          label: t("ui.SupervisorApp.claro", "Claro"),
                        },
                        {
                          value: "user",
                          label: t(
                            "ui.SupervisorApp.delTelefono",
                            "Del teléfono",
                          ),
                        },
                      ]}
                      value={cfg.defaultTheme}
                      onChange={(v) => puedeEditar && set({ defaultTheme: v })}
                    />
                    <p
                      className="text-sm"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {t(
                        "ui.SupervisorApp.temaNota",
                        "Sólo decide con qué tema ARRANCA una instalación nueva; luego cada supervisor lo cambia en su app.",
                      )}
                    </p>
                  </div>
                </Section>
              </div>

              {/* ── LA PARADA, COMO SE VA A VER ──────────────────────────── */}
              <div className="xl:sticky xl:top-4 xl:self-start">
                <VistaParada
                  accent={acentoReal}
                  claro={claro}
                  font={cssFuente}
                  nombre={
                    cfg.displayName || equipo.displayName || "C-Guard Pro"
                  }
                />
              </div>
            </div>
          )}
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}

/**
 * La pantalla donde el supervisor pasa el turno: una parada del recorrido.
 * Los colores de DENTRO son los de la APP NATIVA, no los del CRM — si aquí
 * usáramos los tokens del panel, la vista previa mentiría.
 */
function VistaParada({
  accent,
  font,
  claro,
  nombre,
}: {
  accent: string;
  font?: string;
  claro: boolean;
  nombre: string;
}) {
  const { t } = useTranslation();
  const bg = claro ? "#f5f5f4" : "#0a0e16";
  const card = claro ? "#ffffff" : "#141a24";
  const texto = claro ? "#111827" : "#f3f4f6";
  const suave = claro ? "#6b7280" : "#9ca3af";
  const linea = claro ? "#e5e7eb" : "#232a36";
  const tinta = tintaSobre(accent);

  return (
    <div className="space-y-2">
      <span className="cg-eyebrow">
        {t("ui.SupervisorApp.previa", "Vista previa · parada del recorrido")}
      </span>
      <div
        className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[2rem] border p-4"
        style={{
          background: bg,
          borderColor: linea,
          color: texto,
          fontFamily: font,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold">
            {t("ui.SupervisorApp.paradaN", "Parada 2 de 4")}
          </span>
          <span
            className="grid size-8 place-items-center rounded-full border"
            style={{ borderColor: linea, color: accent }}
          >
            <Radio className="size-4" />
          </span>
        </div>

        <div className="mt-2 h-1 rounded-full" style={{ background: linea }}>
          <div
            className="h-1 w-1/4 rounded-full"
            style={{ background: accent }}
          />
        </div>

        <div
          className="mt-3 rounded-2xl border p-3"
          style={{ background: card, borderColor: linea }}
        >
          <div className="flex items-start gap-2.5">
            <IconTile tone="info">
              <Building2 className="size-4" />
            </IconTile>
            <div>
              <p className="text-[16px] font-bold leading-tight">P-061</p>
              <p className="text-[12px]" style={{ color: suave }}>
                <MapPin className="mr-1 inline size-3" />
                {t("ui.SupervisorApp.caseta", "Caseta de Acceso")}
              </p>
            </div>
          </div>
        </div>

        {/* El deslizador: es donde el color decide si se acierta a la primera. */}
        <div
          className="relative mt-4 flex h-[52px] items-center overflow-hidden rounded-full border"
          style={{
            background: claro ? "#eceae6" : "#161c27",
            borderColor: linea,
          }}
        >
          <span
            className="grid size-[44px] place-items-center rounded-full"
            style={{ background: accent, color: tinta, marginLeft: 4 }}
          >
            <ChevronsRight className="size-5" />
          </span>
          <span
            className="absolute inset-0 grid place-items-center text-[13px] font-bold uppercase tracking-wide"
            style={{ color: accent }}
          >
            {t("ui.SupervisorApp.deslizaLlegue", "Desliza: ya llegué")}
          </span>
        </div>
        <p className="mt-1.5 text-center text-[11px]" style={{ color: suave }}>
          {t(
            "ui.SupervisorApp.seRegistra",
            "Se registra la hora y tu ubicación",
          )}
        </p>

        <div
          className="mt-3 flex items-center justify-center gap-3 border-t pt-2.5 text-[12px] font-semibold"
          style={{ borderColor: linea, color: suave }}
        >
          <span className="inline-flex items-center gap-1">
            <PauseCircle className="size-3.5" />
            {t("ui.SupervisorApp.pausar", "Pausar ruta")}
          </span>
          <span style={{ color: linea }}>|</span>
          <span
            className="inline-flex items-center gap-1"
            style={{ color: "#ef4444" }}
          >
            <OctagonX className="size-3.5" />
            {t("ui.SupervisorApp.abortar", "Abortar")}
          </span>
        </div>

        <p className="mt-3 text-center text-[11px]" style={{ color: suave }}>
          {nombre}
        </p>
      </div>
    </div>
  );
}
