/**
 * Configuración Global de Vigilantes — REAL rules only.
 *
 * Guarda settings.guardSettings vía el PUT /settings existente (saneado en el
 * backend por guardSettingsService). Cada control tiene motor de verdad:
 *  - inactivityAlert/-ThresholdMin → barrido cada 5 min (guard.inactive)
 *  - shiftRemindersEnabled → recordatorios de turno (2d/1d/12h/1h/10m)
 *  - licenseExpiryAlert/-Days → barrido diario de credenciales (aviso a RRHH)
 * Lo que vive en otras páginas se enlaza, no se duplica. Reemplaza el clon
 * de 25 toggles falsos (4 tabs, botón Guardar sin handler).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
    ShieldCheck, SatelliteDish, BellRing, IdCard,
    MapPin, Route as RouteIcon, Smartphone, Wallet, CalendarClock,
} from "lucide-react";
import { Section, Stagger, SkeletonCards } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";
import {
    ToggleRow, SettingDetail, SaveBar,
} from "../components/SettingsForm";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

type GuardSettings = {
    inactivityAlert: boolean;
    inactivityThresholdMin: number;
    shiftRemindersEnabled: boolean;
    licenseExpiryAlert: boolean;
    licenseExpiryDays: number;
};

const DEFAULTS: GuardSettings = {
    inactivityAlert: false,
    inactivityThresholdMin: 20,
    shiftRemindersEnabled: true,
    licenseExpiryAlert: true,
    licenseExpiryDays: 30,
};

// Partial view of the tenant settings blob (GET/PUT /settings). Only the fields
// this page round-trips are named; the backend recomputes logoUrl from logos[0].
type SettingsRow = {
    theme?: string;
    logos?: unknown[];
    backgroundImages?: unknown[];
    guardSettings?: Partial<GuardSettings>;
};

const tenantId = () => localStorage.getItem("tenantId") || "";

export default function GuardsGlobalSettingsPage() {
    const { hasPermission } = usePermissions();
    const canEdit = hasPermission("settingsEdit");

    const [cfg, setCfg] = useState<GuardSettings>(DEFAULTS);
    const [row, setRow] = useState<SettingsRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/tenant/${tenantId()}/settings`);
                setRow(data || {});
                setCfg({ ...DEFAULTS, ...((data && data.guardSettings) || {}) });
            } catch {
                toast.error("No se pudo cargar la configuración.");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const set = <K extends keyof GuardSettings>(k: K, v: GuardSettings[K]) =>
        setCfg((c) => ({ ...c, [k]: v }));

    const save = async () => {
        setSaving(true);
        try {
            await api.put(`/tenant/${tenantId()}/settings`, {
                settings: {
                    theme: row?.theme || "default",
                    // Round-trip file relations untouched — the backend recomputes
                    // logoUrl from logos[0], so omitting them would ERASE the logo.
                    logos: row?.logos || [],
                    backgroundImages: row?.backgroundImages || [],
                    guardSettings: cfg,
                },
            });
            toast.success("Configuración de vigilantes guardada. Aplica de inmediato.");
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "No se pudo guardar.");
        } finally {
            setSaving(false);
        }
    };

    const disabled = !canEdit || loading;

    return (
        <SettingsPageShell
            icon={<ShieldCheck />}
            title="Configuración Global de Vigilantes"
            subtitle="Estas preferencias aplican a todos los vigilantes de tu empresa."
        >
                    {loading ? (
                        <SkeletonCards count={4} className="sm:grid-cols-1" />
                    ) : (
                    <Stagger className="space-y-6">
                        <Section title="Supervisión en tiempo real" icon={<SatelliteDish />} contentClassName="divide-y">
                            <ToggleRow
                                label="Alerta de inactividad en turno"
                                hint="Avisa a los supervisores cuando un vigilante o supervisor de servicio deja de reportar ubicación (teléfono apagado, sin señal o app cerrada). La alerta llega al panel, a las apps y por correo/SMS según tus canales de notificación."
                                checked={cfg.inactivityAlert}
                                onCheckedChange={(v) => set("inactivityAlert", v)}
                                disabled={disabled}
                            >
                                {cfg.inactivityAlert && (
                                    <SettingDetail>
                                        <span className="text-sm" style={{ color: "var(--ink-soft)" }}>Alertar tras</span>
                                        <Select
                                            value={String(cfg.inactivityThresholdMin)}
                                            onValueChange={(v) => set("inactivityThresholdMin", Number(v))}
                                            disabled={disabled}
                                        >
                                            <SelectTrigger className="w-40">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="10">10 minutos</SelectItem>
                                                <SelectItem value="15">15 minutos</SelectItem>
                                                <SelectItem value="20">20 minutos</SelectItem>
                                                <SelectItem value="30">30 minutos</SelectItem>
                                                <SelectItem value="60">1 hora</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <span className="text-sm" style={{ color: "var(--ink-soft)" }}>sin señal</span>
                                    </SettingDetail>
                                )}
                            </ToggleRow>
                        </Section>

                        <Section title="Recordatorios de turno" icon={<CalendarClock />} contentClassName="divide-y">
                            <ToggleRow
                                label="Recordar a los vigilantes sus próximos turnos"
                                hint="Avisos automáticos antes de cada turno (2 días, 1 día, 12 horas, 1 hora y 10 minutos antes) para que nadie falte después de sus días de descanso."
                                checked={cfg.shiftRemindersEnabled}
                                onCheckedChange={(v) => set("shiftRemindersEnabled", v)}
                                disabled={disabled}
                            />
                        </Section>

                        <Section title="Credenciales y licencias" icon={<IdCard />} contentClassName="divide-y">
                            <ToggleRow
                                label="Avisar cuando una credencial esté por vencer"
                                hint="RR.HH. recibe un aviso semanal por cada credencial o licencia próxima a vencer (o ya vencida) hasta que se renueve. Las credenciales se registran en el perfil de cada vigilante."
                                checked={cfg.licenseExpiryAlert}
                                onCheckedChange={(v) => set("licenseExpiryAlert", v)}
                                disabled={disabled}
                            >
                                {cfg.licenseExpiryAlert && (
                                    <SettingDetail>
                                        <span className="text-sm" style={{ color: "var(--ink-soft)" }}>Empezar a avisar</span>
                                        <Input
                                            type="number"
                                            min={7}
                                            max={120}
                                            className="w-24"
                                            value={cfg.licenseExpiryDays}
                                            onChange={(e) => set("licenseExpiryDays", Number(e.target.value) || 30)}
                                            disabled={disabled}
                                        />
                                        <span className="text-sm" style={{ color: "var(--ink-soft)" }}>días antes del vencimiento</span>
                                    </SettingDetail>
                                )}
                            </ToggleRow>
                        </Section>

                        {/* Aquí había una rejilla de tarjetas-enlace a otras
                            páginas de ajustes. Era el índice de Configuración
                            redibujado a mano, porque no existía navegación
                            lateral: en esta página había 5 ajustes y 6 enlaces,
                            más señalización que producto. Se quitó al devolver
                            la columna de índice en SettingsLayout. */}

                        <SaveBar onSave={save} saving={saving} disabled={disabled} />
                    </Stagger>
                    )}
        </SettingsPageShell>
    );
}
