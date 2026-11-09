import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Palette, RotateCcw, Save } from "lucide-react";

import { ToggleRow } from "../components/SettingsForm";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { InfoNote, PageContainer, PageHeader, Section, SkeletonCards } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";
import {
  COLORES_DEL_HORARIO_DEFAULTS,
  ETIQUETA_DE_EVENTO,
  EVENTOS_DEL_HORARIO,
  estiloDeResultado,
  resolverColores,
  type ColoresDelHorario,
  type EventoDelHorario,
} from "@/lib/coloresDelHorario";

const tenantId = () => localStorage.getItem("tenantId") || "";

/** Qué significa cada evento, para quien elige el color. */
const AYUDA: Record<EventoDelHorario, [string, string]> = {
  completado: [
    "ui.ColoresDelHorario.ayuda.completado",
    "Fichó la entrada y la salida a tiempo.",
  ],
  incumplido: [
    "ui.ColoresDelHorario.ayuda.incumplido",
    "Había turno y nadie fichó.",
  ],
  conIncidencia: [
    "ui.ColoresDelHorario.ayuda.conIncidencia",
    "Fichó, pero llegó tarde, salió antes, no marcó la salida o quedó pendiente de revisar.",
  ],
  doblaje: [
    "ui.ColoresDelHorario.ayuda.doblaje",
    "Lo cubrió alguien que dobló turno porque su relevo no llegó.",
  ],
  cubiertoPorOtro: [
    "ui.ColoresDelHorario.ayuda.cubiertoPorOtro",
    "Lo cubrió otro trabajador (cobertura o refuerzo) y fichó.",
  ],
};

/**
 * CONFIGURACIÓN › COLORES DEL HORARIO (Mike, 2026-11-08).
 *
 * El color con el que el Horario pinta lo que ya pasó, por evento. Vive en
 * `settings.schedulingSettings.coloresDelHorario`: se guarda junto con la
 * política de jornada, sin tocar el resto de esa política.
 */
export default function ColoresDelHorarioPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");
  const [row, setRow] = useState<any>(null);
  const [c, setC] = useState<ColoresDelHorario>(COLORES_DEL_HORARIO_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/settings`);

        setRow(data || {});
        setC(resolverColores(data?.schedulingSettings?.coloresDelHorario));
      } catch {
        toast.error(
          t("ui.ColoresDelHorario.errorCargar", "No se pudieron cargar los colores."),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/tenant/${tenantId()}/settings`, {
        settings: {
          theme: row?.theme || "default",
          // Como en Jornada: sin reenviarlas, el backend borraría el logotipo.
          logos: row?.logos || [],
          backgroundImages: row?.backgroundImages || [],
          // La política de jornada entera, con sólo los colores cambiados.
          schedulingSettings: { ...(row?.schedulingSettings || {}), coloresDelHorario: c },
        },
      });
      setRow((r: any) => ({
        ...(r || {}),
        schedulingSettings: { ...(r?.schedulingSettings || {}), coloresDelHorario: c },
      }));
      toast.success(t("ui.ColoresDelHorario.guardado", "Colores guardados."));
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t("ui.ColoresDelHorario.errorGuardar", "No se pudieron guardar los colores."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <SettingsLayout
        navKey="configuracion"
        title={t("ui.ColoresDelHorario.titulo", "Colores del horario")}
      >
        <PageContainer width="narrow">
          <PageHeader
            icon={<Palette />}
            subtitle={t(
              "ui.ColoresDelHorario.subtitulo",
              "Cuando un turno ya terminó, la celda del horario se pinta según lo que pasó. Elige el color de cada caso.",
            )}
            title={t("ui.ColoresDelHorario.titulo", "Colores del horario")}
          />

          {loading ? (
            <SkeletonCards count={2} />
          ) : (
            <div className="space-y-5">
              <InfoNote tone="info">
                {t(
                  "ui.ColoresDelHorario.nota",
                  "Se aplica a la hoja del horario. Lo que está por venir sigue con sus colores de siempre (D, N, L…), y las novedades (vacaciones, permiso, falta) conservan los suyos.",
                )}
              </InfoNote>

              <Section bare>
                <ToggleRow
                  checked={c.activo}
                  disabled={!canEdit}
                  hint={t(
                    "ui.ColoresDelHorario.activoAyuda",
                    "Si lo apagas, el pasado se ve igual que el futuro.",
                  )}
                  label={t(
                    "ui.ColoresDelHorario.activo",
                    "Pintar los turnos pasados según lo que pasó",
                  )}
                  onCheckedChange={(v) => setC((p) => ({ ...p, activo: v }))}
                />
              </Section>

              <Section
                icon={<Palette />}
                title={t("ui.ColoresDelHorario.porEvento", "Color de cada evento")}
              >
                <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                  {EVENTOS_DEL_HORARIO.map((ev) => (
                    <div
                      key={ev}
                      className="flex flex-wrap items-center gap-3 py-3.5"
                      style={{ opacity: c.activo ? 1 : 0.55 }}
                    >
                      <div
                        aria-hidden
                        className="grid h-8 w-11 shrink-0 place-items-center rounded text-[11px] font-bold"
                        style={{ ...estiloDeResultado(c[ev]), borderLeft: "2px solid var(--ink-faint)" }}
                      >
                        D
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {t(ETIQUETA_DE_EVENTO[ev][0], ETIQUETA_DE_EVENTO[ev][1])}
                        </p>
                        <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                          {t(AYUDA[ev][0], AYUDA[ev][1])}
                        </p>
                      </div>
                      <label className="flex items-center gap-2">
                        <input
                          aria-label={t(ETIQUETA_DE_EVENTO[ev][0], ETIQUETA_DE_EVENTO[ev][1])}
                          className="cg-focus h-9 w-12 cursor-pointer rounded border p-0.5 disabled:cursor-not-allowed"
                          disabled={!canEdit}
                          style={{ borderColor: "var(--hairline)", background: "transparent" }}
                          type="color"
                          value={c[ev]}
                          onChange={(e) => setC((p) => ({ ...p, [ev]: e.target.value.toLowerCase() }))}
                        />
                        <span className="w-16 font-mono text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>
                          {c[ev]}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </Section>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={!canEdit || saving}
                  variant="outline"
                  onClick={() => setC((p) => ({ ...COLORES_DEL_HORARIO_DEFAULTS, activo: p.activo }))}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t("ui.ColoresDelHorario.restaurar", "Volver a los colores de fábrica")}
                </Button>
                <Button disabled={!canEdit || saving} variant="brand" onClick={save}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {t("ui.ColoresDelHorario.guardar", "Guardar colores")}
                </Button>
              </div>
            </div>
          )}
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
