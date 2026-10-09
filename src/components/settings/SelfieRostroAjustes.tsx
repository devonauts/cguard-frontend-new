import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Camera } from "lucide-react";

import { Section } from "@/components/kit";
import attendanceService from "@/lib/api/attendanceService";

/**
 * «Selfie y rostro al fichar» inside the app settings (App del equipo / App del supervisor), where Mike looks for it
 * (2026-10-09: «¿por qué está en Nómina? Debe estar en la app de vigilantes y supervisores»).
 *
 * It edits the SAME attendance settings the apps and the server already read (`general.requireSelfie`,
 * `general.selfieFaceCheck`), so both apps follow one switch — the server applies it to guards and supervisors alike.
 * Each change is saved at once (no separate «Guardar» to forget).
 */
export default function SelfieRostroAjustes() {
  const { t } = useTranslation();
  const [general, setGeneral] = useState<{ requireSelfie?: boolean; selfieFaceCheck?: string } | null>(null);
  const [all, setAll] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    attendanceService
      .getSettings()
      .then((d: any) => { setAll(d || {}); setGeneral((d && d.general) || {}); })
      .catch(() => setGeneral({}));
  }, []);

  const save = async (patch: { requireSelfie?: boolean; selfieFaceCheck?: string }) => {
    if (!all) return;
    const nextGeneral = { ...(all.general || {}), ...patch };
    setGeneral(nextGeneral);
    setSaving(true);
    try {
      const saved: any = await attendanceService.saveSettings({ ...all, general: nextGeneral });
      setAll(saved || { ...all, general: nextGeneral });
      toast.success(t("comun.configuracionGuardada"));
    } catch (e) {
      setGeneral(all.general || {});
      toast.error((e as { message?: string })?.message || t("ui.NominaSettings.errorAlGuardar", "Error al guardar"));
    } finally {
      setSaving(false);
    }
  };

  if (!general) return null;

  return (
    <Section icon={<Camera className="size-4" />} title={t("ui.SelfieRostro.titulo", "Selfie y rostro al fichar")}>
      <p className="mb-3 text-sm" style={{ color: "var(--ink-faint)" }}>
        {t("ui.SelfieRostro.ambasApps", "Vale para la app del equipo (vigilantes) y la del supervisor: es el mismo ajuste en las dos.")}
      </p>
      <label className="glass-flat mb-3 flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="text-sm">{t("ui.NominaSettings.requerirSelfieAlMarcar", "Requerir selfie al marcar")}</span>
        <input
          type="checkbox"
          className="size-5"
          checked={!!general.requireSelfie}
          disabled={saving}
          onChange={(e) => save({ requireSelfie: e.target.checked })}
        />
      </label>
      <label className="glass-flat flex flex-col gap-1.5 px-3 py-2.5">
        <span className="text-sm">{t("ui.NominaSettings.comprobarCaraEnSelfie", "Comprobar que se vea la cara en la selfie")}</span>
        <select
          className="cg-focus rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm"
          value={general.selfieFaceCheck || "off"}
          disabled={saving}
          onChange={(e) => save({ selfieFaceCheck: e.target.value })}
        >
          <option value="off">{t("ui.NominaSettings.caraOff", "No comprobar")}</option>
          <option value="flag">{t("ui.NominaSettings.caraFlag", "Avisar al supervisor (deja marcar)")}</option>
          <option value="enforce">{t("ui.NominaSettings.caraEnforce", "Exigir: pedir que repita la selfie")}</option>
        </select>
        <span className="text-xs text-[var(--text-secondary)]">
          {t(
            "ui.NominaSettings.caraAyuda",
            "Revisa que en la foto haya una cara y no la pared, el techo o un dedo sobre la cámara. No reconoce a la persona. Con «Exigir», al tercer intento deja marcar y queda para revisión.",
          )}
        </span>
      </label>
    </Section>
  );
}
