import * as React from "react";
import { Info, Loader2, Bell, MonitorSmartphone, Mail, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { notificationSettingsService } from "@/lib/api/notificationSettingsService";
import { communicationService } from "@/lib/api/communicationService";
import { Link } from "react-router-dom";
import { Section, SkeletonCards } from "@/components/kit";

type ChannelKey = "dashboard" | "email" | "sms";

type NotificationItem = {
  id: string;
  label: string;
  hint?: string;
  default?: Partial<Record<ChannelKey, boolean>>;
};

type MatrixState = Record<
  string,
  {
    dashboard: boolean;
    email: boolean;
    sms: boolean;
  }
>;

/* ────────────────────────────────────────────────────────────────────────────
   ESTA LISTA TIENE QUE COINCIDIR CON `EVENT_TO_ROW` DEL BACKEND
   (backend/src/lib/notificationChannels.ts). Una fila que no esté allí no
   gobierna ningún aviso: se guarda, se pinta marcada, y no hace absolutamente
   nada.

   Había 24 filas y sólo 11 estaban conectadas. Las trece decorativas —informe
   enviado, órdenes reconocidas, política reconocida, modo vigilancia, lista de
   verificación, vigilante tardío, sin asistencia, ruta de patrulla, mención en
   comentario, estacionamiento, caída del dispositivo— se han retirado. Y
   faltaban dos que el backend SÍ enruta y el dueño no podía tocar: las
   excepciones de asistencia y sus aprobaciones, que son justo los avisos que
   más le importan a un jefe de operaciones.

   SEGUNDA PODA (auditoría 2026-08-15). De las 15 que quedaron, CINCO seguían sin
   gobernar nada, por dos motivos distintos:

     · «Retraso en el turno», «Tarea perdida» y «Estado del turno» apuntaban a
       eventos que NO LOS EMITE NADIE — la plantilla existe, el mapeo existe, y
       no hay una sola llamada que los despache. (El retraso real sí llega, por
       «Novedades de asistencia», que es la fila que de verdad funciona.)

     · «Recorrido completado» y «Recorrido perdido» eran PEORES que inertes: el
       aviso de ronda lo escribe rondaNotify directo, obedeciendo a
       Configuración › Rondas. El dueño desmarcaba la casilla aquí, seguía
       recibiendo los avisos, y no tenía forma de saber por qué. Se retiran y se
       señala la pantalla que sí manda.

   Al añadir una fila nueva aquí, añade su evento allí. Y comprueba que alguien
   lo DESPACHA: un mapeo sin emisor es una casilla que miente.
   ──────────────────────────────────────────────────────────────────────────── */
const NOTIFICATIONS: NotificationItem[] = [
  { id: "check-in-out", label: "Vigilante registrado/salida", hint: "Check-in/out del vigilante", default: { dashboard: true, email: true } },
  { id: "panic-button", label: "Botón de pánico", hint: "Siempre llega al teléfono y a esta pantalla, aunque desmarques la casilla: es una emergencia", default: { dashboard: true, email: true, sms: true } },
  { id: "coverage-uncovered", label: "Puesto sin cubrir", hint: "Nadie llegó al puesto o el vigilante lo abandonó. Llega al teléfono aunque desmarques la casilla", default: { dashboard: true, email: true } },
  { id: "dispatch-updates", label: "Actualizaciones de tickets de Incidente", default: { dashboard: true } },
  // Fila propia y no compartida con la de arriba: «un incidente más» y «nadie ha
  // atendido algo grave» son cosas distintas. Al principio comparte fila y una
  // prueba lo tumbó — el correo encendido por defecto aquí habría encendido el
  // correo de TODOS los incidentes, incluidos los rutinarios.
  { id: "incident-unattended", label: "Incidente grave sin atender", hint: "Cuando un incidente crítico lleva rato abierto y nadie lo ha reconocido. Deja de insistir en cuanto alguien lo toma", default: { dashboard: true, email: true } },
  { id: "attendance-exceptions", label: "Novedades de asistencia", hint: "Atraso, inasistencia, salida anticipada, salida sin marcar y marcación fuera de la geocerca", default: { dashboard: true } },
  { id: "attendance-approvals", label: "Aprobaciones de asistencia", hint: "Correcciones enviadas, pendientes de aprobar, aprobadas y rechazadas", default: { dashboard: true } },
  { id: "inactive-guard-alert", label: "Alerta de inactividad para vigilantes inactivos", default: { dashboard: true } },
  { id: "geofence-alert", label: "Alertas de geovalla al entrar/salir", default: { dashboard: true } },
  { id: "task-completed", label: "Tarea completada", default: { dashboard: true } },
  { id: "pto-request", label: "Solicitud de tiempo libre", default: { dashboard: true } },
  { id: "license-expiry", label: "Expiración de Licencia", default: { dashboard: true } },
  { id: "contract-expiry", label: "Contrato de cliente por vencer", hint: "Aviso semanal antes de que caduque el contrato de un cliente, con la antelación que fijes en su ficha", default: { dashboard: true, email: true } },
];

const columns: { key: ChannelKey; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "Panel de control", icon: <MonitorSmartphone className="h-3.5 w-3.5" /> },
  { key: "email", label: "Correo electrónico", icon: <Mail className="h-3.5 w-3.5" /> },
  { key: "sms", label: "SMS", icon: <MessageSquare className="h-3.5 w-3.5" /> },
];

// =============================================================================

export default function NotificationMatrix() {
  const buildDefaults = (): MatrixState => {
    const initial: MatrixState = {};
    NOTIFICATIONS.forEach((n) => {
      initial[n.id] = {
        dashboard: !!n.default?.dashboard,
        email: !!n.default?.email,
        sms: !!n.default?.sms,
      };
    });
    return initial;
  };

  const [state, setState] = React.useState<MatrixState>(buildDefaults);
  // Horario de silencio. Vive en los ajustes de comunicaciones porque es del
  // CANAL, no de la matriz, pero se edita aquí: es donde alguien lo busca.
  const [silencio, setSilencio] = React.useState({ enabled: false, startHour: 22, endHour: 7 });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    notificationSettingsService
      .get()
      .then((res) => {
        if (!mounted) return;
        const saved = res?.preferences || {};
        setState((prev) => {
          const merged: MatrixState = { ...prev };
          NOTIFICATIONS.forEach((n) => {
            const s = saved[n.id];
            if (s) {
              merged[n.id] = {
                dashboard: !!s.dashboard,
                email: !!s.email,
                sms: !!s.sms,
              };
            }
          });
          return merged;
        });
      })
      .catch(() => {
        /* keep defaults if load fails */
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    communicationService
      .getSettings()
      .then((cs: any) => {
        if (mounted && cs?.quiet_hours) setSilencio({ enabled: false, startHour: 22, endHour: 7, ...cs.quiet_hours });
      })
      .catch(() => { /* se quedan los defectos */ });

    return () => {
      mounted = false;
    };
  }, []);

  const allCheckedByColumn = (col: ChannelKey) =>
    NOTIFICATIONS.every((n) => state[n.id]?.[col]);

  const someCheckedByColumn = (col: ChannelKey) =>
    NOTIFICATIONS.some((n) => state[n.id]?.[col]);

  const toggleColumn = (col: ChannelKey, value: boolean) => {
    // Encender la columna de SMS de un clic arma un canal DE PAGO en todos los
    // avisos a la vez. Se pide confirmación diciendo cuántos son: el gasto lo
    // paga el tenant por mensaje y por destinatario, y hasta ahora no había
    // ningún aviso antes de comprometerlo.
    if (col === "sms" && value) {
      const ok = window.confirm(
        `Vas a activar el envío por SMS en los ${NOTIFICATIONS.length} avisos.\n\n` +
          `El SMS se cobra por mensaje y por destinatario, y se descuenta de tu saldo. ` +
          `Un aviso frecuente —como las entradas y salidas de turno— puede consumirlo rápido.\n\n` +
          `¿Continuar?`,
      );
      if (!ok) return;
    }
    setState((prev) => {
      const copy: MatrixState = { ...prev };
      NOTIFICATIONS.forEach((n) => {
        copy[n.id] = { ...copy[n.id], [col]: value };
      });
      return copy;
    });
  };

  const toggleCell = (id: string, col: ChannelKey, value: boolean) => {
    setState((prev) => ({
      ...prev,
      [id]: { ...prev[id], [col]: value },
    }));
  };

  const toggleRow = (id: string, value: boolean) => {
    setState((prev) => ({
      ...prev,
      [id]: { dashboard: value, email: value, sms: value },
    }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const preferences: MatrixState = {};
      NOTIFICATIONS.forEach((n) => {
        preferences[n.id] = state[n.id];
      });
      await notificationSettingsService.update(preferences);
      // El horario de silencio vive en los ajustes de comunicaciones (es del
      // canal, no de la matriz), pero se edita AQUÍ porque es donde alguien lo
      // busca cuando piensa «que dejen de despertarme».
      await communicationService.updateSettings({ quiet_hours: silencio });
      toast.success("Preferencias de notificación guardadas");
    } catch (e: any) {
      toast.error(e?.message || "No se pudieron guardar las preferencias");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SkeletonCards count={3} className="sm:grid-cols-1" />;
  }

  return (
    <div className="space-y-6">
      {/* ── HORARIO DE SILENCIO ──────────────────────────────────────────────
          No existía en NINGÚN nivel: ni por empresa, ni por rol, ni por usuario.
          En un producto de turnos 24/7 cuya audiencia son supervisores que
          duermen, un fichaje olvidado despertaba a alguien a las 3 de la mañana
          igual que un botón de pánico.

          La regla que lo hace seguro se dice en pantalla, no se deja implícita:
          lo crítico nunca calla. Si el usuario no lo supiera, poner «de 22:00 a
          07:00» apagaría sin querer las alertas de emergencia de su turno
          nocturno — el turno donde más pasan cosas. */}
      <Section title="Horario de silencio" icon={<Bell />} contentClassName="space-y-3">
        <label className="flex cursor-pointer items-center gap-2.5">
          <Checkbox
            checked={silencio.enabled}
            onCheckedChange={(v) => setSilencio((q) => ({ ...q, enabled: Boolean(v) }))}
          />
          <span className="text-sm font-medium">No enviar avisos al teléfono de noche</span>
        </label>

        {silencio.enabled && (
          <div className="flex flex-wrap items-center gap-2 pl-7">
            <span className="text-sm" style={{ color: "var(--ink-soft)" }}>Desde las</span>
            <input
              type="number" min={0} max={23}
              value={silencio.startHour}
              onChange={(e) => setSilencio((q) => ({ ...q, startHour: Number(e.target.value) }))}
              className="cg-input cg-focus w-20 px-3 py-1.5 text-sm"
            />
            <span className="text-sm" style={{ color: "var(--ink-soft)" }}>hasta las</span>
            <input
              type="number" min={0} max={23}
              value={silencio.endHour}
              onChange={(e) => setSilencio((q) => ({ ...q, endHour: Number(e.target.value) }))}
              className="cg-input cg-focus w-20 px-3 py-1.5 text-sm"
            />
            <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
              (hora local de tu empresa)
            </span>
          </div>
        )}

        <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
          <strong>Lo urgente sigue sonando siempre:</strong> botón de pánico, inasistencia,
          puesto abandonado, vigilante inactivo y escalados. El silencio es para el ruido —
          tareas, recordatorios y avisos informativos. Y sólo afecta al teléfono: el panel y
          el correo los recibes igual, para que estén ahí cuando te despiertes.
        </p>
      </Section>

      <Section
        title="Avisos y por dónde llegan"
        icon={<Bell />}
        contentClassName="space-y-3"
      >
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          Marca por qué vía quieres recibir cada aviso. La casilla de la cabecera activa o
          desactiva una vía completa; la de cada fila, todas las vías de ese aviso.
        </p>

        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Los avisos de <strong>rondas</strong> —completada, perdida, iniciada— no se
          controlan aquí, sino en{' '}
          <Link to="/setting/rondas" className="underline" style={{ color: 'var(--brand-text)' }}>
            Configuración › Rondas
          </Link>
          , junto al resto de reglas de patrullaje.
        </p>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Cabecera de la tabla */}
            <div
              className="glass-sunken grid grid-cols-[1fr_repeat(3,150px)] items-center gap-2 px-4 py-3"
              style={{ borderRadius: 'var(--r-md) var(--r-md) 0 0' }}
            >
              <div className="cg-eyebrow">Tipo de aviso</div>
              {columns.map((c) => {
                const all = allCheckedByColumn(c.key);
                const some = someCheckedByColumn(c.key);
                return (
                  <label key={c.key} className="flex cursor-pointer items-center justify-center gap-2">
                    <Checkbox
                      checked={all}
                      onCheckedChange={(v) => toggleColumn(c.key, Boolean(v))}
                      aria-label={`Seleccionar todo ${c.label}`}
                      className={cn(some && !all && "data-[state=indeterminate]:opacity-100")}
                    />
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      <span style={{ color: 'var(--ink-faint)' }}>{c.icon}</span>
                      {c.label}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Filas */}
            <ScrollArea className="max-h-[62vh]">
              <div className="divide-y border-x border-b" style={{ borderRadius: '0 0 var(--r-md) var(--r-md)' }}>
                {NOTIFICATIONS.map((n) => {
                  const row = state[n.id];
                  const allRow = row.dashboard && row.email && row.sms;
                  const someRow = [row.dashboard, row.email, row.sms].some(Boolean) && !allRow;

                  return (
                    <div
                      key={n.id}
                      className="grid grid-cols-[1fr_repeat(3,150px)] items-center gap-2 px-4 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={allRow}
                          onCheckedChange={(v) => toggleRow(n.id, Boolean(v))}
                          aria-label={`Todas las vías de ${n.label}`}
                          className={cn(someRow && "data-[state=indeterminate]:opacity-100")}
                        />
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{n.label}</span>
                          {n.hint && (
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3.5 w-3.5" style={{ color: 'var(--ink-faint)' }} />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">{n.hint}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>

                      {columns.map((c) => (
                        <div key={c.key} className="flex justify-center">
                          <Checkbox
                            checked={row[c.key]}
                            onCheckedChange={(v) => toggleCell(n.id, c.key, Boolean(v))}
                            aria-label={`${n.label} - ${c.label}`}
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      </Section>

      <div className="flex justify-end">
        <Button variant="brand" className="px-6" onClick={onSave} disabled={saving || loading}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar
        </Button>
      </div>
    </div>
  );
}
