import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Copy, Check, Trash2, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { PageContainer, PageHeader, Section, Modal, InfoNote, EmptyState, StatusBadge } from "@/components/kit";
import { ApiService } from "@/services/api/apiService";

/**
 * Configuración › Conexiones y API › Llaves de API
 *
 * El admin crea aquí una llave de solo lectura para que un sistema externo
 * (p. ej. el conector de nómina de Conseg → Buk) consulte trabajadores y horas.
 * La clave secreta se muestra UNA sola vez, al crearla.
 */

type Scope = "employees:read" | "timesheets:read";
const SCOPE_LABEL: Record<Scope, { title: string; desc: string }> = {
  "employees:read": { title: "Trabajadores", desc: "Leer la lista de personal (documento, nombre, estado)." },
  "timesheets:read": { title: "Horas y días", desc: "Leer horas trabajadas, extra, festivos, faltas y retrasos." },
};

interface ApiKey {
  id: string; name: string; prefix: string; scopes: Scope[]; ipAllowlist: string[];
  expiresAt: string | null; lastUsedAt: string | null; revokedAt: string | null;
  createdAt: string; revoked: boolean; expired: boolean;
}

const tid = () => localStorage.getItem("tenantId") || "";

function fecha(v: string | null): string {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Formulario de creación
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Record<Scope, boolean>>({ "employees:read": true, "timesheets:read": true });
  const [expiresAt, setExpiresAt] = useState("");
  const [ips, setIps] = useState("");
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await ApiService.get(`/tenant/${tid()}/api-keys`);
      setKeys((res && res.keys) || (res && res.data && res.data.keys) || []);
    } catch {
      toast.error("No se pudieron cargar las llaves.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const resetForm = () => {
    setName(""); setScopes({ "employees:read": true, "timesheets:read": true }); setExpiresAt(""); setIps("");
  };

  const crear = async () => {
    const elegidos = (Object.keys(scopes) as Scope[]).filter((s) => scopes[s]);
    if (!name.trim()) { toast.error("Ponle un nombre a la llave."); return; }
    if (!elegidos.length) { toast.error("Marca al menos un permiso."); return; }
    setSaving(true);
    try {
      const res: any = await ApiService.post(`/tenant/${tid()}/api-keys`, {
        name: name.trim(),
        scopes: elegidos,
        ipAllowlist: ips.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
        expiresAt: expiresAt || null,
      });
      const value = res?.secret || res?.data?.secret;
      if (!value) throw new Error("sin secreto");
      setSecret({ name: name.trim(), value });
      setOpenCreate(false);
      resetForm();
      await cargar();
    } catch {
      toast.error("No se pudo crear la llave.");
    } finally {
      setSaving(false);
    }
  };

  const revocar = async (k: ApiKey) => {
    if (!window.confirm(`¿Revocar la llave «${k.name}»? El acceso se corta de inmediato y no se puede deshacer.`)) return;
    try {
      await ApiService.delete(`/tenant/${tid()}/api-keys/${k.id}`);
      toast.success("Llave revocada.");
      await cargar();
    } catch {
      toast.error("No se pudo revocar la llave.");
    }
  };

  const copiar = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error("No se pudo copiar."); }
  };

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title="Llaves de API">
        <PageContainer>
          <PageHeader
            title="Llaves de API"
            subtitle="Da a un sistema externo acceso de solo lectura a tus trabajadores y horas — por ejemplo, para pagar la nómina."
            icon={<KeyRound size={20} />}
            actions={
              <button type="button" onClick={() => setOpenCreate(true)}
                className="cg-btn-brand cg-focus inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold">
                <Plus size={16} /> Crear llave
              </button>
            }
          />

          <InfoNote tone="info" icon={<ShieldCheck size={16} />} title="Cómo se usa">
            El sistema externo llama a <code>https://api.cguardpro.com/api/v1</code> con la llave en la
            cabecera <code>Authorization: Bearer …</code>. Solo puede <strong>leer</strong> lo que marques;
            nunca escribe ni ve incidentes, mensajería ni configuración. La clave secreta se muestra
            <strong> una sola vez</strong> al crearla.
          </InfoNote>

          <Section title="Tus llaves" icon={<KeyRound size={16} />}>
            {loading ? (
              <p className="text-sm text-[color:var(--ink-soft)]">Cargando…</p>
            ) : keys.length === 0 ? (
              <EmptyState icon={<KeyRound size={22} />} title="Aún no hay llaves"
                description="Crea una llave para conectar tu sistema de nómina u otro servicio externo." />
            ) : (
              <div className="flex flex-col gap-3">
                {keys.map((k) => {
                  const tone = k.revoked ? "bad" : k.expired ? "warn" : "ok";
                  const estado = k.revoked ? "Revocada" : k.expired ? "Caducada" : "Activa";
                  return (
                    <div key={k.id} className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[color:var(--ink)]">{k.name}</span>
                            <StatusBadge tone={tone as any}>{estado}</StatusBadge>
                          </div>
                          <code className="mt-1 block text-xs text-[color:var(--ink-faint)]">{k.prefix}…</code>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {k.scopes.map((s) => (
                              <span key={s} className="rounded-md bg-[color:var(--surface-2)] px-2 py-0.5 font-mono text-[11px] text-[color:var(--ink-soft)]">{s}</span>
                            ))}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--ink-faint)]">
                            <span>Creada: {fecha(k.createdAt)}</span>
                            <span>Último uso: {fecha(k.lastUsedAt)}</span>
                            {k.expiresAt && <span>Caduca: {fecha(k.expiresAt)}</span>}
                            {k.ipAllowlist.length > 0 && <span>IP: {k.ipAllowlist.join(", ")}</span>}
                          </div>
                        </div>
                        {!k.revoked && (
                          <button type="button" onClick={() => revocar(k)}
                            className="cg-btn-glass cg-focus inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--bad-text)]">
                            <Trash2 size={14} /> Revocar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </PageContainer>

        {/* ── Modal de creación ──────────────────────────────── */}
        <Modal open={openCreate} onOpenChange={setOpenCreate} title="Crear llave de API"
          icon={<KeyRound size={18} />}
          description="Dale un nombre y marca solo los permisos que el sistema externo necesita."
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpenCreate(false)} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold">Cancelar</button>
              <button type="button" onClick={crear} disabled={saving} className="cg-btn-brand cg-focus rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50">
                {saving ? "Creando…" : "Crear llave"}
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[color:var(--ink)]">Nombre</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Buk – nómina"
                className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--brand)]" />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[color:var(--ink)]">Permisos (solo lectura)</span>
              {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
                <label key={s} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-3">
                  <input type="checkbox" checked={scopes[s]} onChange={(e) => setScopes((p) => ({ ...p, [s]: e.target.checked }))} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold text-[color:var(--ink)]">{SCOPE_LABEL[s].title} <code className="ml-1 text-[11px] font-normal text-[color:var(--ink-faint)]">{s}</code></span>
                    <span className="block text-xs text-[color:var(--ink-soft)]">{SCOPE_LABEL[s].desc}</span>
                  </span>
                </label>
              ))}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[color:var(--ink)]">Caducidad <span className="text-[color:var(--ink-faint)]">(opcional)</span></span>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--brand)]" />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[color:var(--ink)]">IP permitidas <span className="text-[color:var(--ink-faint)]">(opcional, separadas por coma)</span></span>
              <input value={ips} onChange={(e) => setIps(e.target.value)} placeholder="200.100.50.10"
                className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--ink)] outline-none focus:border-[color:var(--brand)]" />
            </label>
          </div>
        </Modal>

        {/* ── Modal: la clave, una sola vez ──────────────────── */}
        <Modal open={!!secret} onOpenChange={(o) => { if (!o) setSecret(null); }} title="Copia tu clave ahora"
          icon={<AlertTriangle size={18} />}
          description="Esta es la única vez que se muestra la clave completa. Guárdala en un lugar seguro."
          footer={
            <div className="flex justify-end">
              <button type="button" onClick={() => setSecret(null)} className="cg-btn-brand cg-focus rounded-full px-4 py-2 text-sm font-semibold">Ya la guardé</button>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="text-sm text-[color:var(--ink-soft)]">Llave <strong className="text-[color:var(--ink)]">{secret?.name}</strong></div>
            <div className="flex items-center gap-2 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-2)] p-3">
              <code className="min-w-0 flex-1 break-all text-xs text-[color:var(--ink)]">{secret?.value}</code>
              <button type="button" onClick={() => secret && copiar(secret.value)}
                className="cg-btn-glass cg-focus inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold">
                {copied ? <><Check size={14} /> Copiada</> : <><Copy size={14} /> Copiar</>}
              </button>
            </div>
            <InfoNote tone="warn">
              Si la pierdes, no se puede recuperar: tendrás que crear una nueva y revocar esta.
            </InfoNote>
          </div>
        </Modal>
      </SettingsLayout>
    </AppLayout>
  );
}
