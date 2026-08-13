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
import { toast } from "sonner";
import { EyeOff, LayoutPanelTop, FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Section, Stagger, SkeletonCards, InfoNote } from "@/components/kit";
import { ToggleRow, SaveBar } from "../components/SettingsForm";
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
        toast.error("No se pudo cargar la configuración de informes.");
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
      toast.success("Configuración de informes guardada. Aplica al próximo informe.");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || loading;

  if (loading) return <SkeletonCards count={3} className="sm:grid-cols-1" />;

  return (
    <Stagger className="space-y-6">
      <Section title="Privacidad" icon={<EyeOff />} contentClassName="divide-y">
        <ToggleRow
          label="Ocultar el nombre del cliente"
          hint="Se sustituye por «Cliente 1», «Cliente 2»… en los informes exportados, enviados por correo o impresos."
          checked={cfg.hideClientName}
          onCheckedChange={(v) => set("hideClientName", v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Ocultar el nombre del puesto de vigilancia"
          hint="El informe sigue distinguiendo un puesto de otro, pero no imprime su nombre."
          checked={cfg.hideStationName}
          onCheckedChange={(v) => set("hideStationName", v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Ocultar el nombre del vigilante"
          hint="Lo habitual en los informes que se comparten con el cliente."
          checked={cfg.hideGuardName}
          onCheckedChange={(v) => set("hideGuardName", v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Incluir los puntos de control del recorrido"
          hint="Añade la columna «Punto de control» al informe de rondas, con el punto escaneado."
          checked={cfg.includeCheckpoints}
          onCheckedChange={(v) => set("includeCheckpoints", v)}
          disabled={disabled}
        />
      </Section>

      <Section title="Encabezado del informe" icon={<LayoutPanelTop />} contentClassName="divide-y">
        <ToggleRow
          label="Nombre de la empresa"
          checked={cfg.header.companyName}
          onCheckedChange={(v) => setHeader("companyName", v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Correo electrónico de la empresa"
          checked={cfg.header.email}
          onCheckedChange={(v) => setHeader("email", v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Dirección de la empresa"
          checked={cfg.header.address}
          onCheckedChange={(v) => setHeader("address", v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Número de licencia"
          checked={cfg.header.licenseNumber}
          onCheckedChange={(v) => setHeader("licenseNumber", v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Sitio web"
          checked={cfg.header.website}
          onCheckedChange={(v) => setHeader("website", v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Teléfono"
          checked={cfg.header.phone}
          onCheckedChange={(v) => setHeader("phone", v)}
          disabled={disabled}
        />
        <div className="pt-4">
          <InfoNote tone="info">
            Estos datos salen del Perfil de la Empresa. Si alguno está vacío ahí, no se imprime
            aunque esté activado aquí.
          </InfoNote>
        </div>
      </Section>

      <Section title="Pie de página" icon={<FileText />} contentClassName="space-y-2">
        <Label htmlFor="report-footer">Texto que aparece al final de cada informe</Label>
        <Textarea
          id="report-footer"
          placeholder="Escribe aquí…"
          rows={5}
          maxLength={FOOTER_MAX}
          value={cfg.footerText}
          onChange={(e) => set("footerText", e.target.value.slice(0, FOOTER_MAX))}
          disabled={disabled}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
            Suele usarse para una nota de confidencialidad o los datos de contacto.
          </p>
          <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--ink-faint)" }}>
            {cfg.footerText.length}/{FOOTER_MAX}
          </span>
        </div>
      </Section>

      <SaveBar onSave={save} saving={saving} disabled={disabled} />
    </Stagger>
  );
}
