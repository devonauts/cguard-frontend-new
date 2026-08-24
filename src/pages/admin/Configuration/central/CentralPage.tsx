/**
 * ════════════════════════════════════════════════════════════════════════════
 * CENTRAL DE OPERACIONES — configurable, porque no hay una sola forma.
 *
 * Tres realidades que conviven entre las empresas de seguridad, y las tres son
 * legítimas: la que no tiene central; la que tiene operadores 24/7 que no se
 * levantan de la silla; y la que tiene operadores que ADEMÁS salen a cubrir un
 * puesto cuando falta un vigilante. Esta pantalla es la que deja elegir, en vez
 * de imponerle a todos la forma de trabajar de uno.
 *
 * Guarda settings.centralOperations por el PUT de ajustes de siempre; el
 * servidor lo sanea (centralOperationsService) y todo lo demás cuelga del
 * primer interruptor: apagado, el CRM se comporta exactamente como antes.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Headphones, MapPin, BellRing, Users, MonitorCheck } from "lucide-react";
import { Section, Stagger, SkeletonCards, StatusBadge } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";
import { ToggleRow, SaveBar } from "../components/SettingsForm";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

type Central = {
  habilitada: boolean;
  stationId: string | null;
  operadoresCubrenPuestos: boolean;
  alertasAlOperadorEnTurno: boolean;
  escalarTrasMinutos: number;
};

const DEFAULTS: Central = {
  habilitada: false,
  stationId: null,
  operadoresCubrenPuestos: false,
  alertasAlOperadorEnTurno: false,
  escalarTrasMinutos: 10,
};

type Estacion = { id: string; stationName?: string; name?: string };
type EnConsola = { userId: string; nombre: string | null; desde: string | null };
type Operador = { userId: string; nombre: string | null; email: string | null; temporal: boolean; enConsola: boolean };

const tenantId = () => localStorage.getItem("tenantId") || "";

export default function CentralPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");

  const [cfg, setCfg] = useState<Central>(DEFAULTS);
  const [row, setRow] = useState<any>(null);
  const [estaciones, setEstaciones] = useState<Estacion[]>([]);
  const [enConsola, setEnConsola] = useState<EnConsola[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/settings`);
        setRow(data || {});
        setCfg({ ...DEFAULTS, ...((data && data.centralOperations) || {}) });
      } catch {
        toast.error(t('settings.central.loadError', { defaultValue: 'No se pudo cargar la configuración.' }));
      }
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/station`, { params: { limit: 200 } } as any);
        setEstaciones(data?.rows || data || []);
      } catch { /* la pantalla sirve igual sin la lista */ }
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/central`);
        setEnConsola(data?.enConsola || []);
        setOperadores(data?.operadores || []);
      } catch { /* idem */ }
      setLoading(false);
    })();
  }, []);

  const set = <K extends keyof Central>(k: K, v: Central[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    if (cfg.habilitada && !cfg.stationId) {
      toast.error(t('settings.central.chooseStationError', { defaultValue: 'Elige qué puesto es la central: de ahí sale quién tiene la consola.' }));
      return;
    }
    setSaving(true);
    try {
      await api.put(`/tenant/${tenantId()}/settings`, {
        settings: {
          theme: row?.theme || "default",
          // Se devuelven intactas: el backend recalcula logoUrl desde logos[0],
          // así que omitirlas BORRARÍA el logo de la empresa.
          logos: row?.logos || [],
          backgroundImages: row?.backgroundImages || [],
          centralOperations: cfg,
        },
      });
      toast.success(t('settings.central.savedOk', { defaultValue: 'Central de operaciones guardada.' }));
    } catch (e: any) {
      toast.error(e?.response?.data?.message || t('settings.central.saveError', { defaultValue: 'No se pudo guardar.' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPageShell
      icon={<Headphones />}
      title={t('settings.central.pageTitle', { defaultValue: 'Central de Operaciones' })}
      navTitle={t('settings.central.pageTitle', { defaultValue: 'Central de Operaciones' })}
      subtitle={t('settings.central.pageSubtitle', { defaultValue: 'Si tu empresa tiene consola 24/7: dónde está, quién puede salir a cubrir y a quién llegan las alertas.' })}
    >
      {loading ? (
        <SkeletonCards count={3} className="sm:grid-cols-1" />
      ) : (
        <Stagger className="space-y-6">
          <Section title={t('settings.central.hasCentralSection', { defaultValue: '¿Tienes central?' })} icon={<Headphones />} contentClassName="divide-y">
            <ToggleRow
              label={t('settings.central.enabledLabel', { defaultValue: 'Mi empresa opera una central' })}
              hint={t('settings.central.enabledHint', { defaultValue: 'Con esto apagado nada cambia: las novedades y alarmas se reparten como hasta ahora, por rol.' })}
              checked={cfg.habilitada}
              onCheckedChange={(v: boolean) => set("habilitada", v)}
              disabled={!canEdit}
            />
          </Section>

          {cfg.habilitada && (
            <>
              <Section title={t('settings.central.consoleLocationSection', { defaultValue: 'Dónde está la consola' })} icon={<MapPin />}>
                <div className="space-y-3">
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t('settings.central.consoleLocationIntro', { defaultValue: 'La central es un puesto más. Al elegirlo, quien fiche ahí es —por definición— quien tiene la consola, y salir a cubrir un puesto pasa a ser una cobertura normal, no un caso especial.' })}
                  </p>
                  <select
                    value={cfg.stationId || ""}
                    onChange={(e) => set("stationId", e.target.value || null)}
                    disabled={!canEdit}
                    className="cg-input cg-focus w-full px-3 py-2.5 text-sm"
                  >
                    <option value="">{t('settings.central.chooseStationPlaceholder', { defaultValue: '— Elige el puesto que es la central —' })}</option>
                    {estaciones.map((s) => (
                      <option key={s.id} value={s.id}>{s.stationName || s.name || s.id}</option>
                    ))}
                  </select>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="cg-eyebrow">{t('settings.central.rightNowLabel', { defaultValue: 'Ahora mismo:' })}</span>
                    {enConsola.length ? (
                      enConsola.map((o) => (
                        <StatusBadge key={o.userId} tone="ok">
                          {o.nombre || t('settings.central.operatorFallback', { defaultValue: 'Operador' })}{o.desde ? t('settings.central.sinceTime', { defaultValue: ' · desde {{time}}', time: new Date(o.desde).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) }) : ""}
                        </StatusBadge>
                      ))
                    ) : (
                      <StatusBadge tone="warn">{t('settings.central.nobodyClockedIn', { defaultValue: 'Nadie fichado en la central' })}</StatusBadge>
                    )}
                  </div>
                </div>
              </Section>

              <Section title={t('settings.central.whoAttendsSection', { defaultValue: 'Quién la atiende' })} icon={<Users />} contentClassName="divide-y">
                <ToggleRow
                  label={t('settings.central.operatorsCoverLabel', { defaultValue: 'Mis operadores pueden salir a cubrir puestos' })}
                  hint={t('settings.central.operatorsCoverHint', { defaultValue: 'Enciéndelo si tu centralista a veces cubre un puesto de servicio: podrás asignarlo a puestos de clientes y el reloj le dejará elegir entre la central y el puesto. Apagado, la consola es su único sitio. (En ambos casos el operador necesita rol de vigilante para poder fichar en la central: es lo que permite saber quién tiene la consola.)' })}
                  checked={cfg.operadoresCubrenPuestos}
                  onCheckedChange={(v: boolean) => set("operadoresCubrenPuestos", v)}
                  disabled={!canEdit}
                />
              </Section>

              <Section
                title={t('settings.central.crmAccessSection', { defaultValue: 'Quién entra al panel por la consola' })}
                icon={<MonitorCheck />}
              >
                <div className="space-y-3">
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t('settings.central.crmAccessIntro', { defaultValue: 'Asignar a un vigilante a este puesto le abre el panel de la empresa para hacer el trabajo de central: atender fichajes, abrir y cerrar novedades, ver el mapa en vivo, las cámaras y el parte de radio. No puede tocar ajustes, usuarios ni cobros. Sigue usando su app en el campo, así que cuando lo trasladen a cubrir un puesto ficha allí con normalidad.' })}
                  </p>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t('settings.central.crmAccessRevoke', { defaultValue: 'El acceso va con la asignación: si le quitas este puesto, deja de entrar. No hay nada que revocar a mano.' })}
                  </p>
                  {operadores.length ? (
                    <ul className="divide-y">
                      {operadores.map((o) => (
                        <li key={o.userId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{o.nombre || o.email || o.userId}</p>
                            {o.email && o.nombre && (
                              <p className="truncate text-xs" style={{ color: "var(--ink-soft)" }}>{o.email}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {o.temporal && (
                              <StatusBadge tone="info">
                                {t('settings.central.operatorTemporary', { defaultValue: 'Temporal' })}
                              </StatusBadge>
                            )}
                            <StatusBadge tone={o.enConsola ? "ok" : "neutral"}>
                              {o.enConsola
                                ? t('settings.central.operatorOnConsole', { defaultValue: 'En la consola ahora' })
                                : t('settings.central.operatorAssigned', { defaultValue: 'Asignado' })}
                            </StatusBadge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                      {t('settings.central.crmAccessEmpty', { defaultValue: 'Todavía no hay nadie asignado a este puesto, así que nadie entra al panel por esta vía. Asigna a tu centralista desde Horario o desde la ficha del puesto.' })}
                    </p>
                  )}
                </div>
              </Section>

              <Section title={t('settings.central.alertsSection', { defaultValue: 'A dónde van las alertas' })} icon={<BellRing />} contentClassName="divide-y">
                <ToggleRow
                  label={t('settings.central.alertOperatorLabel', { defaultValue: 'Avisar primero a quien tiene la consola' })}
                  hint={t('settings.central.alertOperatorHint', { defaultValue: 'Las novedades y alarmas van al operador fichado en la central, en vez de a todos los que tengan el rol duerman o no. Si no hay nadie fichado, se avisa por rol como siempre: una alerta nunca se queda sin destinatario.' })}
                  checked={cfg.alertasAlOperadorEnTurno}
                  onCheckedChange={(v: boolean) => set("alertasAlOperadorEnTurno", v)}
                  disabled={!canEdit}
                />
                {cfg.alertasAlOperadorEnTurno && (
                  <div className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{t('settings.central.escalateLabel', { defaultValue: 'Escalar al supervisor si nadie atiende' })}</p>
                      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                        {t('settings.central.escalateHint', { defaultValue: 'Minutos de margen. 0 = no escalar.' })}
                      </p>
                    </div>
                    <input
                      type="number" min={0} max={120}
                      value={cfg.escalarTrasMinutos}
                      onChange={(e) => set("escalarTrasMinutos", Number(e.target.value))}
                      disabled={!canEdit}
                      className="cg-input cg-focus w-24 px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </Section>
            </>
          )}

          {canEdit && <SaveBar onSave={save} saving={saving} />}
        </Stagger>
      )}
    </SettingsPageShell>
  );
}
