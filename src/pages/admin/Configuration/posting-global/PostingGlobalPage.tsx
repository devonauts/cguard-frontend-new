/**
 * Configuración Global de Puestos — REAL rules only.
 *
 * Guarda settings.postRules vía el PUT /settings existente (saneado en el
 * backend por postRulesService). Cada toggle tiene motor de verdad:
 *  - requireActiveShiftForRounds → bloquea tag-scans sin turno activo (server)
 *  - geofenceExitAlert/-ReturnAlert → detección de salida/regreso de geocerca
 *    sobre los pings GPS del turno (canal: fila "Excepciones de asistencia").
 * Las reglas que viven en otras páginas se enlazan, no se duplican.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, Route as RouteIcon, MapPin, ClipboardList, BellRing } from "lucide-react";
import { Section, Stagger, SkeletonCards } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";
import { ToggleRow, SaveBar } from "../components/SettingsForm";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

type PostRules = {
    requireActiveShiftForRounds: boolean;
    geofenceExitAlert: boolean;
    geofenceReturnAlert: boolean;
};

const DEFAULTS: PostRules = {
    requireActiveShiftForRounds: false,
    geofenceExitAlert: false,
    geofenceReturnAlert: false,
};

// Partial view of the tenant settings blob (GET/PUT /settings). Only the fields
// this page round-trips are named; the backend recomputes logoUrl from logos[0].
type SettingsRow = {
    theme?: string;
    logos?: unknown[];
    backgroundImages?: unknown[];
    postRules?: Partial<PostRules>;
    coverage?: { escalateAfterMin?: number };
};

const tenantId = () => localStorage.getItem("tenantId") || "";

export default function PostingGlobalPage() {
    const { hasPermission } = usePermissions();
    const canEdit = hasPermission("settingsEdit");

    const [rules, setRules] = useState<PostRules>(DEFAULTS);
    // Minutos que un puesto puede estar sin cubrir antes de escalar el aviso.
    // El motor YA lo leía (coverageEscalationService); lo que no existía era la
    // pantalla: el único parámetro vivo de cobertura sólo se podía cambiar
    // escribiendo el JSON a mano en la base de datos.
    const [escalarTrasMin, setEscalarTrasMin] = useState<number>(20);
    const [row, setRow] = useState<SettingsRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/tenant/${tenantId()}/settings`);
                setRow(data || {});
                setRules({ ...DEFAULTS, ...((data && data.postRules) || {}) });
                setEscalarTrasMin(Number(data?.coverage?.escalateAfterMin) || 20);
            } catch {
                toast.error("No se pudo cargar la configuración.");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const set = <K extends keyof PostRules>(k: K, v: PostRules[K]) =>
        setRules((r) => ({ ...r, [k]: v }));

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
                    postRules: rules,
                    coverage: { escalateAfterMin: escalarTrasMin },
                },
            });
            toast.success("Reglas de puestos guardadas. Aplican de inmediato.");
        } catch (e: any) {
            toast.error(e?.response?.data?.message || "No se pudo guardar.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <SettingsPageShell
            icon={<ShieldCheck />}
            title="Configuración Global de Puestos"
            navTitle="Configuración Global de Puestos de Vigilancia"
            subtitle="Reglas operativas aplicadas a todos los puestos de vigilancia de tu empresa."
        >
                    {loading ? (
                        <SkeletonCards count={3} className="sm:grid-cols-1" />
                    ) : (
                    <Stagger className="space-y-6">
                        <Section title="Rondas" icon={<RouteIcon />} contentClassName="divide-y">
                            <ToggleRow
                                label="Exigir turno activo para escanear rondas"
                                hint="El vigilante debe haber marcado su entrada para que un escaneo de punto de control cuente. Evita rondas registradas fuera de turno."
                                checked={rules.requireActiveShiftForRounds}
                                onCheckedChange={(v) => set("requireActiveShiftForRounds", v)}
                                disabled={!canEdit || loading}
                            />
                        </Section>

                        <Section title="Puesto sin cubrir" icon={<MapPin />} contentClassName="divide-y">
                            <label className="block py-3">
                                <span className="text-sm font-medium">Escalar el aviso tras</span>
                                <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
                                    Minutos que un puesto puede quedar sin cubrir antes de que el aviso
                                    suba de nivel. Se revisa cada 5 minutos, así que por debajo de eso el
                                    escalado no daría margen de reacción.
                                </p>
                                <div className="mt-2 flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={5}
                                        max={240}
                                        value={escalarTrasMin}
                                        onChange={(e) => setEscalarTrasMin(Number(e.target.value))}
                                        disabled={!canEdit || loading}
                                        className="cg-input cg-focus w-28 px-3 py-2 text-sm"
                                    />
                                    <span className="text-sm" style={{ color: "var(--ink-soft)" }}>minutos</span>
                                </div>
                            </label>
                        </Section>

                        <Section title="Alertas de geocerca en turno" icon={<MapPin />} contentClassName="divide-y">
                            <ToggleRow
                                label="Alertar cuando el vigilante salga de la geocerca"
                                hint="Con el GPS del turno, detecta cuando el vigilante abandona el área de su puesto estando de servicio y notifica a los supervisores (requiere 2 lecturas consecutivas fuera, para evitar falsos positivos del GPS). Los puestos móviles quedan exentos."
                                checked={rules.geofenceExitAlert}
                                onCheckedChange={(v) => {
                                    set("geofenceExitAlert", v);
                                    if (!v) set("geofenceReturnAlert", false);
                                }}
                                disabled={!canEdit || loading}
                            />
                            <ToggleRow
                                label="Alertar también cuando regrese"
                                hint="Envía una segunda notificación cuando el vigilante vuelve a entrar a la geocerca."
                                checked={rules.geofenceReturnAlert}
                                onCheckedChange={(v) => set("geofenceReturnAlert", v)}
                                disabled={!canEdit || loading || !rules.geofenceExitAlert}
                            />
                            <p className="pt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
                                Por dónde llegan estas alertas (panel, correo o SMS) se decide en{" "}
                                <Link
                                    to="/setting/notifications"
                                    className="font-semibold underline underline-offset-2"
                                    style={{ color: "var(--brand-text)" }}
                                >
                                    Configuración › Avisos
                                </Link>{" "}
                                (fila «Alertas de geovalla al entrar/salir»).
                            </p>
                        </Section>

                        {/* Aquí había una rejilla de tarjetas-enlace a otras
                            páginas de ajustes. Era el índice de Configuración
                            redibujado a mano, porque no existía navegación
                            lateral: en esta página había 5 ajustes y 6 enlaces,
                            más señalización que producto. Se quitó al devolver
                            la columna de índice en SettingsLayout. */}

                        <SaveBar onSave={save} saving={saving} disabled={!canEdit || loading} />
                    </Stagger>
                    )}
        </SettingsPageShell>
    );
}
