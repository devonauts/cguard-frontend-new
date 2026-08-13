import { useEffect, useMemo, useRef, useState } from 'react';
import { clientDisplayName } from '@/lib/clientName';
import type { Client } from '@/types/client';
import { useNavigate } from 'react-router-dom';
import useScrollToTopOnMount from '@/hooks/useScrollToTopOnMount';
import { clientService } from '@/lib/api/clientService';
import { toast } from 'sonner';
import { Section, StatusBadge, Modal, EmptyState, GlassPanel, IconTile } from '@/components/kit';
import { Button } from '@/components/ui/button';
import {
  Globe, Mail, CheckCircle2, AlertCircle, Loader2, Smartphone, Users, ShieldCheck,
  KeyRound, ArrowRight, Building2, AlertTriangle, FileBarChart, ClipboardList, MapPin, Bell,
} from 'lucide-react';
import type { ReactNode } from 'react';

type Props = { client?: Client & { contactEmail?: string; contactName?: string; userId?: string } };
type Kind = 'portal' | 'app';

// Row from GET /client-account/:id/access-users (clientAccountAccessUsers.ts).
interface AccessUser {
  id: string; pivotId: string | null; userId: string | null; isTitular: boolean;
  name: string; email: string | null; role: string; status?: string;
}

const PORTAL_FEATURES = [
  { icon: MapPin, label: 'Sedes y estaciones', desc: 'Ubicaciones y cobertura de su operación' },
  { icon: Users, label: 'Vigilantes asignados', desc: 'Quién está en turno en cada sitio' },
  { icon: AlertTriangle, label: 'Incidentes y novedades', desc: 'Reportes en tiempo real' },
  { icon: FileBarChart, label: 'Reportes', desc: 'Informes operativos de su servicio' },
  { icon: ClipboardList, label: 'Tareas y solicitudes', desc: 'Pedidos y seguimiento' },
  { icon: Bell, label: 'Notificaciones', desc: 'Avisos de turno, SOS y alertas' },
];

type Tono = 'brand' | 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
const KPI_TONE: Record<string, Tono> = { primary: 'brand', green: 'ok', orange: 'warn', blue: 'info', slate: 'neutral' };

function Kpi({ icon, value, label, accent = 'primary' }: { icon: ReactNode; value: ReactNode; label: string; accent?: string }) {
  return (
    <GlassPanel flat className="p-4">
      <IconTile tone={KPI_TONE[accent] ?? 'brand'} size="sm" className="mb-2">{icon}</IconTile>
      <div className="font-display truncate text-xl font-bold leading-tight">{value}</div>
      <div className="truncate text-xs" style={{ color: 'var(--ink-soft)' }}>{label}</div>
    </GlassPanel>
  );
}

export default function ClientPortal({ client }: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  useScrollToTopOnMount(containerRef);

  const email = client?.email || client?.contactEmail || '';
  const name = clientDisplayName(client, client?.contactName || 'este cliente');
  const linked = !!client?.userId;
  // Real access roster from /access-users (client.portalUsers never existed in
  // the backend — this card always said 0/1 while Accesos showed the truth).
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  useEffect(() => {
    let alive = true;
    if (!client?.id) return;
    clientService.getClientAccessUsers(client.id)
      .then((r) => { if (alive) setAccessUsers(Array.isArray(r) ? r : (r?.rows ?? [])); })
      .catch(() => { /* keep empty */ });
    return () => { alive = false; };
  }, [client?.id]);
  const accessCount = accessUsers.length || (linked ? 1 : 0);

  const [confirm, setConfirm] = useState<Kind | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ kind: Kind; recipient: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const send = async (kind: Kind) => {
    setSending(true); setErrorMsg('');
    try {
      const res = kind === 'portal'
        ? await clientService.sendClientPortalInvitation(client?.id ?? "", email || undefined)
        : await clientService.sendClientAppInvitation(client?.id ?? "", email || undefined);
      setResult({ kind, recipient: res?.recipient || email });
      setConfirm(null);
      toast.success(kind === 'portal' ? 'Invitación al portal enviada' : 'Invitación a la app enviada');
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || err?.message || 'No se pudo enviar la invitación. Intenta de nuevo.');
      setConfirm(null);
    } finally { setSending(false); }
  };

  const initial = (name || '?').charAt(0).toUpperCase();
  const kindLabel = useMemo(() => (confirm === 'app' ? 'a la app Mi Seguridad' : 'al portal del cliente'), [confirm]);

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Status KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={<Globe />} value={linked ? 'Vinculado' : 'Sin usuario'} label="Acceso al portal" accent={linked ? 'green' : 'slate'} />
        <Kpi icon={<Users />} value={accessCount} label="Usuarios con acceso" accent="blue" />
        <Kpi icon={<Smartphone />} value="Mi Seguridad" label="App móvil del cliente" accent="primary" />
        <Kpi icon={<Mail />} value={email ? 'Con correo' : 'Sin correo'} label={email || 'Agrega un correo al cliente'} accent={email ? 'green' : 'orange'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* LEFT — access + actions */}
        <div className="space-y-4">
          <Section title="Acceso al portal del cliente" icon={<KeyRound />}>
            {/* Titular */}
            <div className="glass-sunken flex items-center gap-3 p-3">
              <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border"
                style={{ background: 'var(--brand)', borderColor: 'transparent', color: 'var(--brand-ink)', boxShadow: '0 0 18px -6px var(--brand-glow)' }}
              >
                <span className="text-base font-semibold">{initial}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="truncate text-xs" style={{ color: 'var(--ink-soft)' }}>{email || 'Sin correo electrónico'}</p>
              </div>
              <StatusBadge tone={linked ? 'ok' : 'neutral'}>{linked ? 'Usuario vinculado' : 'Sin usuario'}</StatusBadge>
            </div>

            {/* Result / error banners */}
            {result && (
              <div
                className="mt-3 flex items-start gap-3 rounded-xl border p-3"
                style={{
                  background: 'color-mix(in oklab, var(--ok) 12%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--ok) 28%, transparent)',
                  color: 'var(--ok-text)',
                }}
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold">¡Invitación enviada!</p>
                  <p>Se envió la invitación {result.kind === 'app' ? 'a la app' : 'al portal'} a <strong>{result.recipient}</strong>. El cliente debe revisar su bandeja de entrada.</p>
                </div>
                <button onClick={() => setResult(null)} className="cg-focus rounded text-xs underline">Cerrar</button>
              </div>
            )}
            {errorMsg && (
              <div
                className="mt-3 flex items-start gap-3 rounded-xl border p-3"
                style={{
                  background: 'color-mix(in oklab, var(--bad) 12%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--bad) 28%, transparent)',
                  color: 'var(--bad-text)',
                }}
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="flex-1 text-sm"><p className="font-semibold">Error al enviar</p><p>{errorMsg}</p></div>
                <button onClick={() => setErrorMsg('')} className="cg-focus rounded text-xs underline">Cerrar</button>
              </div>
            )}

            {/* Actions */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="brand" onClick={() => setConfirm('portal')} disabled={!email && !linked}><Mail className="mr-1.5 h-4 w-4" /> {linked ? 'Reenviar invitación al portal' : 'Enviar invitación al portal'}</Button>
              <Button variant="outline" onClick={() => setConfirm('app')} disabled={!email && !linked}><Smartphone className="mr-1.5 h-4 w-4" /> Invitar a la app Mi Seguridad</Button>
            </div>
            {(!email && !linked) && <p className="mt-2 text-xs" style={{ color: 'var(--warn-text)' }}>Este cliente no tiene correo ni usuario vinculado. Edita el cliente y agrega un correo para habilitar el acceso.</p>}
          </Section>

          <Section title="Usuarios con acceso" icon={<Users />}
            action={<button onClick={() => navigate(`/clients/${client?.id}/user-access`)} className="cg-focus inline-flex items-center gap-1 rounded-md text-xs font-semibold hover:underline" style={{ color: 'var(--brand-text)' }}>Gestionar accesos <ArrowRight className="h-3.5 w-3.5" /></button>}>
            {accessCount === 0 ? (
              <EmptyState icon={<Users />} title="Sin usuarios con acceso" description="Invita al titular o agrega accesos adicionales para que el cliente entre al portal y la app." />
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {/* /access-users already includes the titular — only fall back
                    to the linked-user row when the fetch returned nothing. */}
                {linked && accessUsers.length === 0 && (
                  <div className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-full border text-xs font-semibold" style={{ background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }}>{initial}</span><div><div className="text-sm font-medium">{name}</div><div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{email || '—'}</div></div></div>
                    <StatusBadge tone="ok" dot={false}>Titular</StatusBadge>
                  </div>
                )}
                {accessUsers.map((u, i) => (
                  <div key={u.id || i} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-full border text-xs font-semibold" style={{ background: 'var(--glass-sunken)', borderColor: 'var(--hairline)' }}>{(u.name || u.email || '?').charAt(0).toUpperCase()}</span><div><div className="text-sm font-medium">{u.name || u.email}</div><div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{u.email || ''}</div></div></div>
                    <StatusBadge tone={(u.status || '').toLowerCase().includes('activ') ? 'ok' : 'neutral'} dot={false}>{u.role || u.status || 'Acceso'}</StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* RIGHT — what the client sees + how it works */}
        <div className="space-y-4">
          <Section title="¿Qué puede ver el cliente?" icon={<Smartphone />}>
            <div className="space-y-2.5">
              {PORTAL_FEATURES.map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <IconTile size="sm"><f.icon /></IconTile>
                  <div><div className="text-sm font-medium">{f.label}</div><div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{f.desc}</div></div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="¿Cómo funciona?" icon={<ShieldCheck />}>
            <ol className="space-y-2.5">
              {['Se envía un correo de invitación al cliente.', 'El cliente abre el enlace y crea su contraseña.', 'Inicia sesión en el portal web o en la app Mi Seguridad.', 'Accede en tiempo real a su operación de seguridad.'].map((s, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}>{i + 1}</span>
                  <span style={{ color: 'var(--ink-soft)' }}>{s}</span>
                </li>
              ))}
            </ol>
            <div className="glass-sunken mt-3 flex items-start gap-2 p-2.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> El acceso muestra únicamente la información de este cliente; nunca datos de otros clientes.
            </div>
          </Section>
        </div>
      </div>

      {/* Confirm modal */}
      <Modal open={!!confirm} onOpenChange={(o) => { if (!o && !sending) setConfirm(null); }} title="Enviar invitación" icon={<Mail className="h-5 w-5" />} size="sm"
        footer={<><Button variant="outline" onClick={() => setConfirm(null)} disabled={sending}>Cancelar</Button><Button variant="brand" onClick={() => confirm && send(confirm)} disabled={sending}>{sending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Enviando…</> : 'Enviar'}</Button></>}>
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>Se enviará una invitación <b>{kindLabel}</b> a:</p>
        <div className="glass-sunken mt-3 px-4 py-3 text-center">
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>{email || '(sin correo registrado)'}</p>
        </div>
        <p className="mt-3 text-xs" style={{ color: 'var(--ink-faint)' }}>El cliente recibirá un enlace para crear su contraseña y acceder.</p>
      </Modal>
    </div>
  );
}
