import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { Link } from "react-router-dom";

import { Section } from "@/components/kit";
import attendanceService from "@/lib/api/attendanceService";
import { useEntitlement } from "@/hooks/useEntitlement";
import { MODULO_RECONOCIMIENTO_FACIAL, modoFacial } from "@/lib/rostro";

type Generales = {
  requireSelfie?: boolean;
  selfieFaceCheck?: string;
  /** Reconocimiento facial (módulo de pago): ¿es la cara registrada del vigilante? */
  faceRecognition?: string;
};

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
  const [general, setGeneral] = useState<Generales | null>(null);
  const conModulo = useEntitlement(MODULO_RECONOCIMIENTO_FACIAL);
  const [all, setAll] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    attendanceService
      .getSettings()
      .then((d: any) => { setAll(d || {}); setGeneral((d && d.general) || {}); })
      .catch(() => setGeneral({}));
  }, []);

  const save = async (patch: Generales) => {
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
            "Revisa que en la foto se vea la cara y no la pared, el techo o un dedo sobre la cámara. No reconoce a la persona. Con «Exigir», la app pide verificación facial: la cara entera, de frente y dentro del marco, y no deja marcar sin ella. Con «No comprobar» o «Avisar», la app solo toma la foto.",
          )}
        </span>
      </label>
      {/* ── ¿ES EL VIGILANTE? (módulo «Reconocimiento facial») ─────────
          Sin el módulo se ve, apagado, con el camino para conseguirlo. */}
      <label className="glass-flat mt-3 flex flex-col gap-1.5 px-3 py-2.5">
        <span className="text-sm">
          {t("ui.SelfieRostro.reconocimiento", "Verificar que sea la persona (reconocimiento facial)")}
        </span>
        <select
          className="cg-focus rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm disabled:opacity-60"
          value={conModulo ? modoFacial(general.faceRecognition) : "off"}
          disabled={saving || !conModulo}
          onChange={(e) => save({ faceRecognition: e.target.value })}
        >
          <option value="off">{t("ui.SelfieRostro.reconocimientoOff", "Apagado")}</option>
          <option value="flag">{t("ui.SelfieRostro.reconocimientoFlag", "Avisar (ficha y queda para revisar)")}</option>
          <option value="enforce">
            {t("ui.SelfieRostro.reconocimientoEnforce", "Exigir (si no es su cara no puede fichar)")}
          </option>
        </select>
        {conModulo ? (
          <span className="text-xs text-[var(--text-secondary)]">
            {t(
              "ui.SelfieRostro.reconocimientoAyuda",
              "Al iniciar turno, la app compara la cara con la que el vigilante registró y tú aprobaste en Caras registradas. Si aún no tiene una aprobada, ficha igual y queda para revisar.",
            )}{" "}
            <Link className="underline" to="/security-guards/rostros">
              {t("ui.SelfieRostro.verCaras", "Ver caras registradas")}
            </Link>
          </span>
        ) : (
          <span className="text-xs text-[var(--text-secondary)]">
            {t("ui.SelfieRostro.disponibleComoModulo", "Disponible como módulo adicional")}
            {" · "}
            <Link className="underline" to="/modulos-adicionales">
              {t("ui.SelfieRostro.verModulo", "Ver el módulo")}
            </Link>
          </span>
        )}
      </label>
    </Section>
  );
}
