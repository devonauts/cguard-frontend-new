/**
 * Configuración de Informes — ajustes REALES.
 *
 * Guarda `settings.reportSettings` con el PUT /settings de siempre (saneado en
 * el backend por reportSettingsService) y cada interruptor tiene motor:
 *  - privacidad → el CSV que se exporta desde la ficha del cliente y el que se
 *    envía en los informes programados (clientReportGenerator), el CSV/PDF de
 *    la app del cliente y el PDF de KPIs: el nombre se sustituye por un
 *    seudónimo estable («Vigilante 1»), nunca sale del sistema.
 *  - encabezado → qué datos de la empresa se imprimen en los PDF.
 *  - pie de página → texto al final de cada PDF.
 * Antes esta página tenía un botón «Guardar» SIN manejador: parecía guardar y
 * no guardaba nada.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EyeOff, LayoutPanelTop, FileText } from "lucide-react";

import { ToggleRow, SaveBar } from "../components/SettingsForm";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Section, Stagger, SkeletonCards, InfoNote } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

type HeaderFields = {
  companyName: boolean;
  email: boolean;
  address: boolean;
  licenseNumber: boolean;
  website: boolean;
  phone: boolean;
};

export type ReportSettings = {
  hideClientName: boolean;
  hideStationName: boolean;
  hideGuardName: boolean;
  includeCheckpoints: boolean;
  header: HeaderFields;
  footerText: string;
};

const FOOTER_MAX = 500;

const DEFAULTS: ReportSettings = {
  hideClientName: false,
  hideStationName: false,
  hideGuardName: false,
  includeCheckpoints: false,
  header: {
    companyName: true,
    email: true,
    address: true,
    licenseNumber: true,
    website: true,
    phone: true,
  },
  footerText: "",
};

// Vista parcial de la fila de ajustes (GET/PUT /settings). Sólo se nombra lo que
// esta página necesita; el PUT es parcial a propósito — mandar `logos: []`
// BORRARÍA el logo del tenant.
type SettingsRow = {
  theme?: string;
  reportSettings?: Partial<ReportSettings>;
};

const tenantId = () => localStorage.getItem("tenantId") || "";

const merge = (saved: Partial<ReportSettings> | undefined): ReportSettings => ({
  ...DEFAULTS,
  ...(saved || {}),
  header: { ...DEFAULTS.header, ...((saved && saved.header) || {}) },
});

export default function ReportSettingsForm() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");

  const [cfg, setCfg] = useState<ReportSettings>(DEFAULTS);
  const [theme, setTheme] = useState("default");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/settings`);
        const row = (data || {}) as SettingsRow;

        setTheme(row.theme || "default");
        setCfg(merge(row.reportSettings));
      } catch {
        toast.error(
          t("settings.reportSettings.loadError", {
            defaultValue: "No se pudo cargar la configuración de informes.",
          }),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = <K extends keyof ReportSettings>(k: K, v: ReportSettings[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const setHeader = (k: keyof HeaderFields, v: boolean) =>
    setCfg((c) => ({ ...c, header: { ...c.header, [k]: v } }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/tenant/${tenantId()}/settings`, {
        settings: { theme, reportSettings: cfg },
      });
      toast.success(
        t("settings.reportSettings.saveSuccess", {
          defaultValue:
            "Configuración de informes guardada. Aplica al próximo informe.",
        }),
      );
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t("settings.reportSettings.saveError", {
            defaultValue: "No se pudo guardar la configuración.",
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || loading;

  if (loading) return <SkeletonCards className="sm:grid-cols-1" count={3} />;

  return (
    <Stagger className="space-y-6">
      <Section
        contentClassName="divide-y"
        icon={<EyeOff />}
        title={t("settings.reportSettings.privacyTitle", {
          defaultValue: "Privacidad",
        })}
      >
        <ToggleRow
          checked={cfg.hideClientName}
          disabled={disabled}
          hint={t("settings.reportSettings.hideClientNameHint", {
            defaultValue:
              "Se sustituye por «Cliente 1», «Cliente 2»… en los informes exportados, enviados por correo o impresos.",
          })}
          label={t("settings.reportSettings.hideClientNameLabel", {
            defaultValue: "Ocultar el nombre del cliente",
          })}
          onCheckedChange={(v) => set("hideClientName", v)}
        />
        <ToggleRow
          checked={cfg.hideStationName}
          disabled={disabled}
          hint={t("settings.reportSettings.hideStationNameHint", {
            defaultValue:
              "El informe sigue distinguiendo un puesto de otro, pero no imprime su nombre.",
          })}
          label={t("settings.reportSettings.hideStationNameLabel", {
            defaultValue: "Ocultar el nombre del puesto de vigilancia",
          })}
          onCheckedChange={(v) => set("hideStationName", v)}
        />
        <ToggleRow
          checked={cfg.hideGuardName}
          disabled={disabled}
          hint={t("settings.reportSettings.hideGuardNameHint", {
            defaultValue:
              "Lo habitual en los informes que se comparten con el cliente.",
          })}
          label={t("settings.reportSettings.hideGuardNameLabel", {
            defaultValue: "Ocultar el nombre del vigilante",
          })}
          onCheckedChange={(v) => set("hideGuardName", v)}
        />
        <ToggleRow
          checked={cfg.includeCheckpoints}
          disabled={disabled}
          hint={t("settings.reportSettings.includeCheckpointsHint", {
            defaultValue:
              "Añade la columna «Punto de control» al informe de rondas, con el punto escaneado.",
          })}
          label={t("settings.reportSettings.includeCheckpointsLabel", {
            defaultValue: "Incluir los puntos de control del recorrido",
          })}
          onCheckedChange={(v) => set("includeCheckpoints", v)}
        />
      </Section>

      <Section
        contentClassName="divide-y"
        icon={<LayoutPanelTop />}
        title={t("settings.reportSettings.headerTitle", {
          defaultValue: "Encabezado del informe",
        })}
      >
        <ToggleRow
          checked={cfg.header.companyName}
          disabled={disabled}
          label={t("settings.reportSettings.headerCompanyName", {
            defaultValue: "Nombre de la empresa",
          })}
          onCheckedChange={(v) => setHeader("companyName", v)}
        />
        <ToggleRow
          checked={cfg.header.email}
          disabled={disabled}
          label={t("settings.reportSettings.headerEmail", {
            defaultValue: "Correo electrónico de la empresa",
          })}
          onCheckedChange={(v) => setHeader("email", v)}
        />
        <ToggleRow
          checked={cfg.header.address}
          disabled={disabled}
          label={t("settings.reportSettings.headerAddress", {
            defaultValue: "Dirección de la empresa",
          })}
          onCheckedChange={(v) => setHeader("address", v)}
        />
        <ToggleRow
          checked={cfg.header.licenseNumber}
          disabled={disabled}
          label={t("settings.reportSettings.headerLicenseNumber", {
            defaultValue: "Número de licencia",
          })}
          onCheckedChange={(v) => setHeader("licenseNumber", v)}
        />
        <ToggleRow
          checked={cfg.header.website}
          disabled={disabled}
          label={t("settings.reportSettings.headerWebsite", {
            defaultValue: "Sitio web",
          })}
          onCheckedChange={(v) => setHeader("website", v)}
        />
        <ToggleRow
          checked={cfg.header.phone}
          disabled={disabled}
          label={t("settings.reportSettings.headerPhone", {
            defaultValue: "Teléfono",
          })}
          onCheckedChange={(v) => setHeader("phone", v)}
        />
        <div className="pt-4">
          <InfoNote tone="info">
            {t("settings.reportSettings.headerInfoNote", {
              defaultValue:
                "Estos datos salen del Perfil de la Empresa. Si alguno está vacío ahí, no se imprime aunque esté activado aquí.",
            })}
          </InfoNote>
        </div>
      </Section>

      <Section
        contentClassName="space-y-2"
        icon={<FileText />}
        title={t("settings.reportSettings.footerTitle", {
          defaultValue: "Pie de página",
        })}
      >
        <Label htmlFor="report-footer">
          {t("settings.reportSettings.footerLabel", {
            defaultValue: "Texto que aparece al final de cada informe",
          })}
        </Label>
        <Textarea
          disabled={disabled}
          id="report-footer"
          maxLength={FOOTER_MAX}
          placeholder={t("settings.reportSettings.footerPlaceholder", {
            defaultValue: "Escribe aquí…",
          })}
          rows={5}
          value={cfg.footerText}
          onChange={(e) =>
            set("footerText", e.target.value.slice(0, FOOTER_MAX))
          }
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
            {t("settings.reportSettings.footerHint", {
              defaultValue:
                "Suele usarse para una nota de confidencialidad o los datos de contacto.",
            })}
          </p>
          <span
            className="shrink-0 text-xs tabular-nums"
            style={{ color: "var(--ink-faint)" }}
          >
            {cfg.footerText.length}/{FOOTER_MAX}
          </span>
        </div>
      </Section>

      <SaveBar disabled={disabled} saving={saving} onSave={save} />
    </Stagger>
  );
}
