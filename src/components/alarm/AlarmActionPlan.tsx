import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Check, ShieldCheck, Phone, Video, UserCog, Siren, Bell, StickyNote, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { alarmService, type ActionPlanStep } from "@/lib/api/alarmService";

// Constante de módulo: guarda la CLAVE, no el texto. Traducir aquí congelaría
// la etiqueta en el idioma de arranque; la traducción se hace al pintar.
const STEP_META: Record<string, { labelKey: string; label: string; icon: JSX.Element }> = {
  verify: { labelKey: "alarm.actionPlan.step.verify", label: "Verificar", icon: <ShieldCheck className="size-3.5" /> },
  call: { labelKey: "alarm.actionPlan.step.call", label: "Llamar contacto", icon: <Phone className="size-3.5" /> },
  video: { labelKey: "alarm.actionPlan.step.video", label: "Verificación por video", icon: <Video className="size-3.5" /> },
  dispatch_guard: { labelKey: "alarm.actionPlan.step.dispatchGuard", label: "Despachar vigilante", icon: <UserCog className="size-3.5" /> },
  notify_police: { labelKey: "alarm.actionPlan.step.notifyPolice", label: "Notificar policía", icon: <Siren className="size-3.5" /> },
  notify_customer: { labelKey: "alarm.actionPlan.step.notifyCustomer", label: "Notificar cliente", icon: <Bell className="size-3.5" /> },
  note: { labelKey: "alarm.actionPlan.step.note", label: "Nota", icon: <StickyNote className="size-3.5" /> },
};

type Progress = Record<string, { done: boolean; note?: string | null; at?: string; by?: string | null }>;

/** Guided action-plan checklist for an alarm case. Self-contained: fetches the
 *  applicable plan + per-step progress and toggles steps via the API. */
export default function AlarmActionPlan({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const [steps, setSteps] = useState<ActionPlanStep[]>([]);
  const [planName, setPlanName] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [loading, setLoading] = useState(true);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    alarmService.actionPlan(caseId)
      .then((r) => { setSteps(r.steps || []); setPlanName(r.plan?.name || null); setProgress((r.progress as Progress) || {}); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (i: number, done: boolean) => {
    setSavingIdx(i);
    try {
      const p = await alarmService.setStep(caseId, { stepIndex: i, done });
      setProgress((p as Progress) || {});
    } catch {
      toast.error(t("alarm.actionPlan.stepUpdateError", "No se pudo actualizar el paso"));
    } finally {
      setSavingIdx(null);
    }
  };

  if (loading) return null;

  if (!steps.length) {
    return (
      <Card className="p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardList className="size-4 text-primary" /> {t("ui.AlarmActionPlan.planDeAccion", "Plan de acción")}
        </div>
        <p className="text-xs text-muted-foreground">
          Sin plan de acción configurado para este caso. Crea uno en Paneles para guiar la respuesta del operador.
        </p>
      </Card>
    );
  }

  const doneCount = steps.reduce((n, _s, i) => n + (progress[String(i)]?.done ? 1 : 0), 0);
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardList className="size-4 text-primary" /> {t("ui.AlarmActionPlan.planDeAccion", "Plan de acción")}
          {planName && <span className="text-xs font-normal text-muted-foreground">· {planName}</span>}
        </div>
        <span className="text-xs font-semibold text-muted-foreground">{doneCount}/{steps.length}</span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--glass-sunken)" }}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: "var(--brand)", boxShadow: "0 0 12px 0 var(--brand-glow)" }} />
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => {
          const known = STEP_META[s.type];
          const meta = known
            ? { label: t(known.labelKey, known.label), icon: known.icon }
            : { label: s.type, icon: <Check className="size-3.5" /> };
          const done = !!progress[String(i)]?.done;
          return (
            <li key={i} className="glass-flat flex items-start gap-2 px-3 py-2">
              <button
                onClick={() => toggle(i, !done)}
                disabled={savingIdx === i}
                className="cg-focus relative mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors after:absolute after:-inset-2 after:content-['']"
                // Marcado: relleno de marca con tinta `--brand-ink`. Blanco sobre
                // `--brand` (L 0.72/0.78) daría ~2,2:1 — ver tokens.css.
                style={done
                  ? { borderColor: "var(--brand)", background: "var(--brand)", color: "var(--brand-ink)" }
                  : { borderColor: "var(--hairline)", color: "transparent" }}
                title={done ? "Desmarcar" : "Marcar como completado"}
              >
                {savingIdx === i ? <Loader2 className="size-3 animate-spin" style={{ color: "var(--ink-faint)" }} /> : <Check className="size-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`flex items-center gap-1.5 text-sm ${done ? "line-through" : ""}`} style={{ color: done ? "var(--ink-faint)" : "var(--ink)" }}>
                  <span style={{ color: "var(--brand-text)" }}>{meta.icon}</span>
                  <span className="font-medium">{meta.label}</span>
                </div>
                {s.detail && <p className="text-xs text-muted-foreground">{s.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
