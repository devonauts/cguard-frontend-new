/**
 * Configuración › Mi cuenta › Mis avisos
 *
 * EL HUECO QUE LLENA, medido: 11.690 mensajes a 101 personas en 30 días, y el
 * único control vivía en Configuración a nivel EMPRESA — o se manda a todos, o a
 * ninguno. Un supervisor que no quería el aviso de fichaje de las 6 de la mañana
 * no tenía absolutamente nada que tocar. El resultado es que la gente silencia
 * la app entera, y con ella el pánico.
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 * Esto sólo puede RESTAR. Apaga lo que tu empresa dejó encendido, nunca al
 * revés: si la empresa apagó una fila, no aparece aquí para encenderla. Y lo
 * urgente —pánico, puesto sin cubrir— llega siempre, aunque lo desmarques; por
 * eso esas filas se muestran bloqueadas en vez de esconderse, para que sepas que
 * están ahí.
 */
import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { toast } from "sonner";
import { BellRing, Loader2, Save, Monitor, Mail, MessageSquare, Lock } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { PageContainer, PageHeader, Section, SkeletonCards, InfoNote } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/lib/api";

type Via = "dashboard" | "email" | "sms";
type Prefs = Record<string, Partial<Record<Via, boolean>>>;

/** Las mismas filas que ve el administrador, con su mismo id. */
const FILAS: { id: string; label: string; bloqueada?: boolean; hint?: string }[] = [
  { id: "panic-button", label: "Botón de pánico", bloqueada: true, hint: "Una emergencia llega siempre" },
  { id: "coverage-uncovered", label: "Puesto sin cubrir", bloqueada: true, hint: "Nadie llegó al puesto" },
  { id: "check-in-out", label: "Entradas y salidas de vigilantes" },
  { id: "attendance-exceptions", label: "Novedades de asistencia" },
  { id: "attendance-approvals", label: "Aprobaciones de asistencia" },
  { id: "dispatch-updates", label: "Tickets de incidente" },
  { id: "inactive-guard-alert", label: "Vigilante inactivo en turno" },
  { id: "geofence-alert", label: "Entradas y salidas de geocerca" },
  { id: "task-completed", label: "Tareas completadas" },
  { id: "pto-request", label: "Solicitudes de tiempo libre" },
  { id: "license-expiry", label: "Credenciales por vencer" },
  { id: "contract-expiry", label: "Contratos de cliente por vencer" },
];

const VIAS: { key: Via; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "Panel y teléfono", icon: <Monitor className="h-3.5 w-3.5" /> },
  { key: "email", label: "Correo", icon: <Mail className="h-3.5 w-3.5" /> },
  { key: "sms", label: "SMS", icon: <MessageSquare className="h-3.5 w-3.5" /> },
];

const tenantId = () => localStorage.getItem("tenantId") || "";

export default function MisAvisosPage() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<Prefs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/me/notification-prefs`);
        setPrefs((data && data.prefs) || {});
      } catch {
        toast.error(t('ui.MisAvisosPage.noSePudieronCargarTus'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Ausente = encendido. Sólo se guarda lo apagado, así que una fila nueva de la
  // matriz nace encendida para todos sin tener que rellenar nada.
  const activo = (fila: string, via: Via) => prefs[fila]?.[via] !== false;

  const alternar = (fila: string, via: Via) =>
    setPrefs((p) => ({ ...p, [fila]: { ...(p[fila] || {}), [via]: !activo(fila, via) } }));

  const guardar = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/tenant/${tenantId()}/me/notification-prefs`, { prefs });
      setPrefs((data && data.prefs) || {});
      toast.success(t('ui.MisAvisosPage.guardadoAplicaDesdeElProximo'));
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title="Mis avisos">
        <PageContainer width="narrow">
          <PageHeader
            icon={<BellRing />}
            title="Mis avisos"
            subtitle={t('ui.MisAvisosPage.queQuieresRecibirTuY')}
          />

          {loading ? (
            <SkeletonCards count={2} />
          ) : (
            <div className="space-y-5">
              <InfoNote tone="info">
                Aquí sólo puedes <strong>quitarte</strong> avisos de los que tu empresa ya
                envía. Las emergencias llegan siempre, aunque las desmarques.
              </InfoNote>

              <Section title={t("ui.MisAvisos.queRecibo", "Qué recibo")} icon={<BellRing />}>
                <div className="overflow-x-auto">
                  <div className="min-w-[520px]">
                    <div
                      className="glass-sunken grid grid-cols-[1fr_repeat(3,120px)] items-center gap-2 px-4 py-3"
                      style={{ borderRadius: "var(--r-md) var(--r-md) 0 0" }}
                    >
                      <div className="cg-eyebrow">Aviso</div>
                      {VIAS.map((v) => (
                        <div key={v.key} className="flex items-center justify-center gap-1.5">
                          {v.icon}
                          <span className="cg-eyebrow">{v.label}</span>
                        </div>
                      ))}
                    </div>

                    <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                      {FILAS.map((f) => (
                        <div
                          key={f.id}
                          className="grid grid-cols-[1fr_repeat(3,120px)] items-center gap-2 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm">
                              {f.bloqueada && (
                                <Lock className="h-3 w-3 shrink-0" style={{ color: "var(--ink-faint)" }} />
                              )}
                              {f.label}
                            </p>
                            {f.hint && (
                              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                                {f.hint}
                              </p>
                            )}
                          </div>
                          {VIAS.map((v) => (
                            <div key={v.key} className="flex justify-center">
                              <Checkbox
                                checked={f.bloqueada ? true : activo(f.id, v.key)}
                                disabled={f.bloqueada}
                                onCheckedChange={() => alternar(f.id, v.key)}
                                aria-label={`${f.label} por ${v.label}`}
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              <div className="flex justify-end">
                <Button variant="brand" onClick={guardar} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
