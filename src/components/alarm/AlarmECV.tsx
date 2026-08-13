import { useEffect, useState } from "react";
import { PhoneCall, ShieldCheck, ShieldAlert, Siren, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/kit";
import { alarmService } from "@/lib/api/alarmService";

const ECV_EXEMPT = ["holdup", "panic", "fire", "medical"];

const OUTCOMES: { key: string; label: string }[] = [
  { key: "contacted", label: "Contactado" },
  { key: "no_answer", label: "Sin respuesta" },
  { key: "verified_real", label: "Verif. REAL" },
  { key: "verified_false", label: "Verif. FALSA" },
  { key: "cancel_passcode", label: "Cancelar (contraseña)" },
];
const OUTCOME_LABEL: Record<string, string> = Object.fromEntries(OUTCOMES.map((o) => [o.key, o.label]));

/** Enhanced Call Verification panel: call the account contacts, log each outcome,
 *  and dispatch police once ECV is satisfied (exempt for hold-up/panic/fire). */
export default function AlarmECV({
  caseId, panelId, category, ecvSatisfied, calls = [], status, onChanged,
}: {
  caseId: string; panelId?: string | null; category?: string;
  ecvSatisfied?: boolean; calls?: any[]; status?: string; onChanged?: () => void;
}) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const exempt = ECV_EXEMPT.includes(category || "");
  const canDispatch = exempt || ecvSatisfied;
  const closed = status === "closed" || status === "resolved";

  useEffect(() => {
    if (panelId) alarmService.contacts(panelId).then((c) => setContacts(Array.isArray(c) ? c : [])).catch(() => {});
  }, [panelId]);

  const log = async (contact: any, outcome: string) => {
    setBusyKey(`${contact?.id || "x"}:${outcome}`);
    try {
      const r = await alarmService.logCall(caseId, {
        alarmContactId: contact?.id, contactName: contact?.name, phone: contact?.phone, outcome,
      });
      toast.success(`Llamada registrada — ${OUTCOME_LABEL[outcome]}`);
      if (r.ecvSatisfied) toast.success("ECV satisfecho — despacho policial habilitado");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo registrar la llamada");
    } finally {
      setBusyKey(null);
    }
  };

  const dispatchPolice = async () => {
    setDispatching(true);
    try {
      const r = await alarmService.dispatchPolice(caseId, {});
      toast.success(r?.police?.message || "Despacho policial registrado");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo despachar a la policía");
    } finally {
      setDispatching(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <PhoneCall className="size-4 text-primary" /> Verificación (ECV)
        </div>
        {/* Los tres estados son SEMÁNTICOS (grave / correcto / pendiente) y salen
            de `--bad`/`--ok`/`--warn`, fijos en tokens.css. Un despacho policial
            inmediato tiene que leerse rojo con cualquier acento configurado. */}
        {exempt ? (
          <StatusBadge tone="bad" dot={false}>
            <Siren className="size-3" /> Despacho inmediato (exento de ECV)
          </StatusBadge>
        ) : ecvSatisfied ? (
          <StatusBadge tone="ok" dot={false}>
            <ShieldCheck className="size-3" /> ECV satisfecho
          </StatusBadge>
        ) : (
          <StatusBadge tone="warn" dot={false}>
            <ShieldAlert className="size-3" /> ECV pendiente ({calls.length}/2 llamadas)
          </StatusBadge>
        )}
      </div>

      {!exempt && (
        <p className="mb-2 text-xs text-muted-foreground">
          Antes de despachar a la policía, intente contactar al menos 2 números de la lista (reduce falsas alarmas).
        </p>
      )}

      {!closed && (
        <div className="space-y-1.5">
          {contacts.length === 0 && <p className="text-xs text-muted-foreground">Sin contactos configurados para este panel.</p>}
          {contacts.map((ct) => (
            <div key={ct.id} className="glass-flat px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{ct.name}{ct.phone ? ` · ${ct.phone}` : ""}</span>
                <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>{ct.authority || ""}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => log(ct, o.key)}
                    disabled={busyKey === `${ct.id}:${o.key}`}
                    className="cg-focus inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:border-[var(--brand-line)] disabled:opacity-50"
                    style={{ borderColor: "var(--hairline)", color: "var(--ink-soft)" }}
                  >
                    {busyKey === `${ct.id}:${o.key}` ? <Loader2 className="size-3 animate-spin" /> : null}
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {calls.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">Registro de llamadas</div>
          {calls.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-soft)" }}>
              {c.outcome === "verified_real" ? <Siren className="size-3" style={{ color: "var(--bad-text)" }} /> :
               c.outcome === "verified_false" || c.outcome === "cancel_passcode" ? <X className="size-3" style={{ color: "var(--ok-text)" }} /> :
               <Check className="size-3" />}
              <span style={{ color: "var(--ink)" }}>{c.contactName || "Contacto"}</span>
              <span>· {OUTCOME_LABEL[c.outcome] || c.outcome}</span>
            </div>
          ))}
        </div>
      )}

      {!closed && (
        <div className="mt-3 flex items-center gap-2">
          {/* `destructive` = `.cg-btn-bad` del sistema: relleno `--bad` con tinta
              blanca. Despachar a la policía es una acción grave, no de marca. */}
          <Button
            size="sm"
            variant="destructive"
            onClick={dispatchPolice}
            disabled={!canDispatch || dispatching}
            className="gap-1"
            title={canDispatch ? "Despachar a la policía" : "Complete la ECV (2 llamadas) primero"}
          >
            {dispatching ? <Loader2 className="size-3.5 animate-spin" /> : <Siren className="size-3.5" />}
            Despachar policía
          </Button>
          {!canDispatch && <span className="text-[11px]" style={{ color: "var(--warn-text)" }}>Requiere ECV</span>}
        </div>
      )}
    </Card>
  );
}
