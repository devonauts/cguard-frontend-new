import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Client } from '@/types/client';
import useScrollToTopOnMount from '@/hooks/useScrollToTopOnMount';
import { MeterBar } from '@/components/charts';
import { clientService } from '@/lib/api/clientService';
import { Section, EmptyState, StatCard, StatusBadge, Modal, Field, GlassPanel, IconTile } from '@/components/kit';
import {
  FIELD_CLS, LabeledField, TabTable, THead, Th, Tr, RowAction, RowActions, TabLoading,
} from '../_shared/tab-kit';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  FileText, Calendar, ScrollText, ClipboardList, Shield, Car, Monitor,
  Users, UserCheck, Bell, Lock, CalendarCheck, Plus, Pencil, Trash2, Clock,
  History, StickyNote, Gauge, Timer, ClipboardCheck, Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { confirmDialog } from "@/components/ui/confirmDialog";

// ── Shape of GET /client-account/:id/contract (clientAccountContract.ts) ──
interface ContractTerms {
  id: string; name: string; code: string | null; active: boolean;
  contractNumber: string | null; contractType: string | null; currency: string | null;
  paymentTerms: string | null; contractDate: string | null; contractEndDate: string | null;
  autoRenew: boolean | null; autoRenewDaysBefore: number | null; penaltyClause: string | null;
  earlyCancellationNotice: string | null; jurisdiction: string | null;
  contractedHoursPerMonth: number | null; contractNotes: string | null;
  slaUptimeTarget: number | null; slaResponseMinutes: number | null;
  slaRoundsTarget: number | null; slaReportsTarget: number | null;
}
interface ContractServiceRow {
  id: string; serviceKey: string; name: string; unit?: string | null; description?: string | null;
  contractedQty: number | null; slaTarget?: number | null; active: boolean;
  used: number | null; compliance: number | null; sortOrder?: number;
}
interface ContractRenewalRow {
  id: string; periodLabel?: string | null; fromDate?: string | null; toDate?: string | null;
  durationMonths?: number | null; status?: string | null;
}
interface ContractDerived {
  sedesCount: number; stationsCount: number; guardsCount: number; hoursUsed: number;
  hoursContracted: number | null; daysRemaining: number | null; durationMonths: number | null;
  incidentsThisMonth: number; roundsCompliance: number | null; tenantTimezone: string | null;
}
interface ContractData {
  contract: ContractTerms;
  services: ContractServiceRow[];
  renewals: ContractRenewalRow[];
  usage: Record<string, number | null>;
  derived: ContractDerived;
}
// Subset of a client-document row we render in the "Documentos del contrato" panel.
interface DocRow { id: string; name?: string; filename?: string; downloadUrl?: string | null; url?: string | null; createdAt?: string; }

// Edit-modal buffer: text/number inputs held as strings; autoRenew is the only boolean.
interface ContractForm {
  contractNumber?: string; contractType?: string; currency?: string; paymentTerms?: string;
  contractDate?: string; contractEndDate?: string; autoRenew?: boolean; autoRenewDaysBefore?: string | number;
  contractedHoursPerMonth?: string | number; jurisdiction?: string; penaltyClause?: string;
  earlyCancellationNotice?: string; slaUptimeTarget?: string | number; slaResponseMinutes?: string | number;
  slaRoundsTarget?: string | number; slaReportsTarget?: string | number; contractNotes?: string;
  [k: string]: string | number | boolean | undefined;
}

// ----- service catalog metadata (drives live-usage on the backend) ----------
const SERVICE_PRESETS: Record<string, { name: string; unit: string; icon: LucideIcon }> = {
  fixed_guard: { name: 'Vigilancia fija 24/7', unit: 'Estación', icon: Shield },
  mobile_patrol: { name: 'Patrullaje móvil', unit: 'Rondas', icon: Car },
  camera_monitoring: { name: 'Monitoreo de cámaras', unit: 'Cámaras', icon: Monitor },
  access_control: { name: 'Control de acceso', unit: 'Estación', icon: UserCheck },
  visitor_management: { name: 'Gestión de visitantes', unit: 'Visitantes', icon: Users },
  alarm_response: { name: 'Respuesta a alarmas', unit: 'Eventos', icon: Bell },
  asset_custody: { name: 'Custodia de activos', unit: 'Servicio', icon: Lock },
  event_security: { name: 'Seguridad para eventos', unit: 'Eventos', icon: CalendarCheck },
  custom: { name: '', unit: '', icon: ClipboardList },
};
const SERVICE_KEYS = Object.keys(SERVICE_PRESETS);

const fmtDate = (d: string | number | Date | null | undefined) => {
  if (!d) return '—';
  const dt = new Date(typeof d === 'string' && d.length <= 10 ? `${d}T00:00:00` : d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const orDash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : (v as ReactNode));

function Bar({ pct, tone = 'ok' }: { pct: number; tone?: 'ok' | 'warn' | 'crit' }) {
  return <MeterBar className="min-w-[60px]" height={6} minVisiblePct={3} pct={pct}
    tone={tone === 'crit' ? 'bad' : tone === 'warn' ? 'warn' : 'ok'} />;
}

export default function ClientContract({ client }: { client: Client }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useScrollToTopOnMount(containerRef);

  const [data, setData] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  // Real contract documents (Documentos tab, categoría "Contratos") — the old
  // panel was a hardcoded EmptyState that said "Sin documentos" forever.
  const [contractDocs, setContractDocs] = useState<DocRow[]>([]);
  useEffect(() => {
    let alive = true;
    if (!client?.id) return;
    // getClientDocuments returns { documents: DocRow[], ... } — the array is
    // under `documents` (NOT rows/docs), so read that field.
    clientService.getClientDocuments(client.id, { category: 'Contratos', perPage: 20 })
      .then((r) => { if (alive) setContractDocs(Array.isArray(r) ? r : (r?.documents ?? [])); })
      .catch(() => { /* keep empty */ });
    return () => { alive = false; };
  }, [client?.id]);

  const [editOpen, setEditOpen] = useState(false);
  // Controlled-form buffers: numeric inputs are held as strings while editing;
  // autoRenew is the only boolean (bound via `checked`, not `value`).
  const [form, setForm] = useState<ContractForm>({});
  const [saving, setSaving] = useState(false);

  const [svcOpen, setSvcOpen] = useState(false);
  // Service/renewal edit buffers spread a row then hold string-typed input values;
  // deliberately loose while editing.
  const [svcForm, setSvcForm] = useState<any>(null);

  const [renOpen, setRenOpen] = useState(false);
  const [renForm, setRenForm] = useState<any>(null);

  const load = async () => {
    try {
      const d = await clientService.getClientContract(client.id);
      setData(d);
    } catch { setData(null); } finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line */ }, [client.id]);

  const c: Partial<ContractTerms> = data?.contract || {};
  const derived: Partial<ContractDerived> = data?.derived || {};
  const services: ContractServiceRow[] = data?.services || [];
  const renewals: ContractRenewalRow[] = data?.renewals || [];

  const diff = useMemo(() => {
    if (derived.hoursContracted == null) return null;
    return (derived.hoursUsed || 0) - derived.hoursContracted;
  }, [derived]);

  // ---- contract terms modal -------------------------------------------------
  const openEdit = () => {
    setForm({
      contractNumber: c.contractNumber || '', contractType: c.contractType || '',
      currency: c.currency || 'USD', paymentTerms: c.paymentTerms || '',
      contractDate: c.contractDate || '', contractEndDate: c.contractEndDate || '',
      autoRenew: !!c.autoRenew, autoRenewDaysBefore: c.autoRenewDaysBefore ?? '',
      penaltyClause: c.penaltyClause || '', earlyCancellationNotice: c.earlyCancellationNotice || '',
      jurisdiction: c.jurisdiction || '', contractedHoursPerMonth: c.contractedHoursPerMonth ?? '',
      contractNotes: c.contractNotes || '',
      slaUptimeTarget: c.slaUptimeTarget ?? '', slaResponseMinutes: c.slaResponseMinutes ?? '',
      slaRoundsTarget: c.slaRoundsTarget ?? '', slaReportsTarget: c.slaReportsTarget ?? '',
    });
    setEditOpen(true);
  };
  const saveContract = async () => {
    setSaving(true);
    try {
      await clientService.updateClientContract(client.id, form);
      toast.success('Contrato actualizado');
      setEditOpen(false);
      await load();
    } catch { toast.error('No se pudo guardar'); } finally { setSaving(false); }
  };

  // ---- service modal --------------------------------------------------------
  const openSvc = (s?: ContractServiceRow) => {
    setSvcForm(s
      ? { ...s }
      : { serviceKey: 'fixed_guard', name: SERVICE_PRESETS.fixed_guard.name, unit: SERVICE_PRESETS.fixed_guard.unit, description: '', contractedQty: '', slaTarget: '', active: true });
    setSvcOpen(true);
  };
  const saveSvc = async () => {
    if (!svcForm?.name?.trim()) { toast.error('Nombre del servicio requerido'); return; }
    setSaving(true);
    try {
      if (svcForm.id) await clientService.updateContractService(client.id, svcForm.id, svcForm);
      else await clientService.createContractService(client.id, svcForm);
      setSvcOpen(false);
      await load();
    } catch { toast.error('No se pudo guardar el servicio'); } finally { setSaving(false); }
  };
  const delSvc = async (s: ContractServiceRow) => {
    if (!await confirmDialog({ message: `¿Eliminar el servicio "${s.name}"?`, tone: 'danger' })) return;
    try { await clientService.deleteContractService(client.id, s.id); await load(); }
    catch { toast.error('No se pudo eliminar'); }
  };

  // ---- renewal modal --------------------------------------------------------
  const openRen = (r?: ContractRenewalRow) => {
    setRenForm(r ? { ...r } : { periodLabel: '', fromDate: '', toDate: '', durationMonths: '', status: 'active' });
    setRenOpen(true);
  };
  const saveRen = async () => {
    setSaving(true);
    try {
      if (renForm.id) await clientService.updateContractRenewal(client.id, renForm.id, renForm);
      else await clientService.createContractRenewal(client.id, renForm);
      setRenOpen(false);
      await load();
    } catch { toast.error('No se pudo guardar'); } finally { setSaving(false); }
  };
  const delRen = async (r: ContractRenewalRow) => {
    if (!await confirmDialog({ message: '¿Eliminar este periodo del historial?', tone: 'danger' })) return;
    try { await clientService.deleteContractRenewal(client.id, r.id); await load(); }
    catch { toast.error('No se pudo eliminar'); }
  };

  if (loading) return <TabLoading />;

  const renewalDate = c.contractEndDate;

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Estado del contrato strip */}
      <GlassPanel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <div className="cg-eyebrow">Estado del contrato</div>
              <div className="mt-1"><StatusBadge tone={c.active ? 'ok' : 'neutral'}>{c.active ? 'Activo' : 'Inactivo'}</StatusBadge></div>
            </div>
            <div>
              <div className="cg-eyebrow">Días restantes</div>
              <div
                className="mt-1 font-display text-2xl font-bold tabular-nums"
                style={{ color: derived.daysRemaining != null && derived.daysRemaining < 30 ? 'var(--warn-text)' : 'var(--ok-text)' }}
              >
                {derived.daysRemaining != null ? `${derived.daysRemaining} días` : '—'}
              </div>
            </div>
            <div>
              <div className="cg-eyebrow">Próxima renovación</div>
              {/* Misma tipografía que «Días restantes»: son dos métricas de la
                  misma tira y con pesos distintos una parecía más importante. */}
              <div className="mt-1 font-display text-2xl font-bold tabular-nums">{fmtDate(renewalDate)}</div>
            </div>
          </div>
          <Button onClick={openEdit}><Pencil className="mr-2 h-4 w-4" /> Editar contrato</Button>
        </div>
      </GlassPanel>

      {/* Row 1 — four info cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Section title="Información del contrato" icon={<FileText className="h-4 w-4" />}>
          <div className="space-y-2.5">
            <Field label="Número de contrato" value={orDash(c.contractNumber)} />
            <Field label="Tipo de contrato" value={orDash(c.contractType)} />
            <Field label="Moneda" value={orDash(c.currency)} />
            <Field label="Forma de pago" value={orDash(c.paymentTerms)} />
          </div>
        </Section>

        <Section title="Fechas" icon={<Calendar className="h-4 w-4" />}>
          <div className="space-y-2.5">
            <Field label="Fecha de inicio" value={fmtDate(c.contractDate)} />
            <Field label="Fecha de vencimiento" value={fmtDate(c.contractEndDate)} />
            <Field label="Duración" value={derived.durationMonths != null ? `${derived.durationMonths} meses` : '—'} />
            <Field label="Renovación automática" value={c.autoRenew ? `Sí${c.autoRenewDaysBefore ? ` (${c.autoRenewDaysBefore} días antes)` : ''}` : 'No'} />
          </div>
        </Section>

        <Section title="Términos principales" icon={<ScrollText className="h-4 w-4" />}>
          <div className="space-y-2.5">
            <Field label="SLA acordado" value={c.slaUptimeTarget != null ? `${c.slaUptimeTarget}% de cumplimiento` : '—'} />
            <Field label="Penalización por incumplimiento" value={orDash(c.penaltyClause)} />
            <Field label="Cancelación anticipada" value={orDash(c.earlyCancellationNotice)} />
            <Field label="Jurisdicción" value={orDash(c.jurisdiction)} />
          </div>
        </Section>

        <Section title="Documentos del contrato" icon={<ClipboardList className="h-4 w-4" />}>
          {contractDocs.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title="Sin documentos"
              description="Sube el contrato firmado y anexos en la pestaña Documentos (categoría Contratos)."
            />
          ) : (
            <div className="divide-y">
              {contractDocs.map((d) => (
                <a
                  key={d.id}
                  href={d.downloadUrl || d.url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-md px-1 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{d.name || d.filename || 'Documento'}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : ''}
                  </span>
                </a>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Servicios contratados */}
      <Section
        title="Servicios contratados"
        icon={<ClipboardCheck className="h-4 w-4" />}
        action={<Button size="sm" variant="outline" onClick={() => openSvc()}><Plus className="mr-1.5 h-4 w-4" /> Agregar servicio</Button>}
      >
        {services.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="Aún no hay servicios contratados"
            description="Agrega los servicios de este contrato. El uso se calcula en vivo desde la operación."
            action={<Button size="sm" onClick={() => openSvc()}><Plus className="mr-1.5 h-4 w-4" /> Agregar servicio</Button>}
          />
        ) : (
          <TabTable>
              <THead>
                <Th>Servicio</Th>
                <Th>Descripción</Th>
                <Th>Unidad</Th>
                <Th align="right">Contratado</Th>
                <Th align="right">Utilizado (mes)</Th>
                <Th>Cumplimiento</Th>
                <Th>Estado</Th>
                <Th aria-label="Acciones" />
              </THead>
              <tbody>
                {services.map((s) => {
                  const Icon = SERVICE_PRESETS[s.serviceKey]?.icon || ClipboardList;
                  const contracted = s.contractedQty == null ? 'Ilimitado' : s.contractedQty;
                  const used = s.used == null ? '—' : s.used.toLocaleString('es-EC');
                  const comp = s.compliance;
                  const target = s.slaTarget ?? 90;
                  const estado = comp == null ? 'Activo' : comp >= target ? 'Cumple' : 'Atención';
                  const tone = comp == null ? 'ok' : comp >= target ? 'ok' : comp >= target * 0.75 ? 'warn' : 'crit';
                  return (
                    <Tr key={s.id}>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2 font-medium">
                          <IconTile size="sm"><Icon /></IconTile>
                          {s.name}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground">{s.description || '—'}</td>
                      <td className="px-2 py-2.5">{s.unit || '—'}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{contracted}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{used}</td>
                      <td className="px-2 py-2.5">
                        {comp == null ? <span className="text-muted-foreground">—</span> : (
                          <div className="flex items-center gap-2">
                            <span className="w-9 text-xs tabular-nums">{comp}%</span>
                            <Bar pct={comp} tone={tone} />
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusBadge tone={estado === 'Cumple' ? 'green' : estado === 'Atención' ? 'orange' : 'slate'}>{estado}</StatusBadge>
                      </td>
                      <td className="px-2 py-2.5">
                        <RowActions>
                          <RowAction title="Editar servicio" onClick={() => openSvc(s)}><Pencil className="h-3.5 w-3.5" /></RowAction>
                          <RowAction title="Eliminar servicio" tone="bad" onClick={() => delSvc(s)}><Trash2 className="h-3.5 w-3.5" /></RowAction>
                        </RowActions>
                      </td>
                    </Tr>
                  );
                })}
              </tbody>
          </TabTable>
        )}
      </Section>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Horas contratadas / mes" value={derived.hoursContracted != null ? `${derived.hoursContracted.toLocaleString('es-EC')} h` : '—'} icon={<Clock className="h-4 w-4" />} hint="Según el contrato" />
        <StatCard label="Horas utilizadas (mes)" value={`${(derived.hoursUsed || 0).toLocaleString('es-EC')} h`} icon={<Timer className="h-4 w-4" />} hint="De turnos reales" />
        <StatCard
          label="Diferencia"
          value={diff == null ? '—' : `${diff > 0 ? '+' : ''}${diff.toLocaleString('es-EC')} h`}
          accent={diff != null && diff < 0 ? 'red' : 'green'}
          icon={<Gauge className="h-4 w-4" />}
          hint={diff == null ? 'Define horas contratadas' : diff < 0 ? 'Por debajo de lo contratado' : 'Dentro / sobre lo contratado'}
        />
        <StatCard label="Cumplimiento de rondas" value={derived.roundsCompliance != null ? `${derived.roundsCompliance}%` : '—'} icon={<ClipboardCheck className="h-4 w-4" />} hint="Rondas del mes vs. contratado" />
      </div>

      {/* Row 3 — SLA, notas, historial */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Acuerdo de nivel de servicio (SLA)" icon={<Gauge className="h-4 w-4" />}>
          <div className="grid grid-cols-2 gap-4">
            <SlaCell icon={<Wifi className="h-4 w-4" />} label="Uptime del servicio" value={c.slaUptimeTarget} suffix="%" />
            <SlaCell icon={<Timer className="h-4 w-4" />} label="Tiempo de respuesta" value={c.slaResponseMinutes} suffix=" min" />
            <SlaCell icon={<ClipboardCheck className="h-4 w-4" />} label="Cumplimiento de rondas" value={c.slaRoundsTarget} suffix="%" actual={derived.roundsCompliance} />
            <SlaCell icon={<FileText className="h-4 w-4" />} label="Reportes entregados" value={c.slaReportsTarget} suffix="%" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Objetivos acordados en el contrato.</p>
        </Section>

        <Section title="Notas del contrato" icon={<StickyNote className="h-4 w-4" />}>
          {c.contractNotes
            ? <p className="whitespace-pre-line text-sm text-muted-foreground">{c.contractNotes}</p>
            : <EmptyState icon={<StickyNote className="h-5 w-5" />} title="Sin notas" description="Agrega notas del contrato al editarlo." />}
        </Section>

        <Section
          title="Historial de renovaciones"
          icon={<History className="h-4 w-4" />}
          action={<Button size="sm" variant="outline" onClick={() => openRen()}><Plus className="mr-1.5 h-4 w-4" /> Agregar</Button>}
        >
          {renewals.length === 0 ? (
            <EmptyState icon={<History className="h-5 w-5" />} title="Sin historial" description="Registra los periodos del contrato." />
          ) : (
            <TabTable minWidth={560}>
                <THead>
                  <Th>Periodo</Th>
                  <Th>Desde</Th>
                  <Th>Hasta</Th>
                  <Th>Duración</Th>
                  <Th>Estado</Th>
                  <Th aria-label="Acciones" />
                </THead>
                <tbody>
                  {renewals.map((r) => (
                    <Tr key={r.id}>
                      <td className="px-2 py-2.5 font-medium">{r.periodLabel || '—'}</td>
                      <td className="px-2 py-2.5 tabular-nums">{fmtDate(r.fromDate)}</td>
                      <td className="px-2 py-2.5 tabular-nums">{fmtDate(r.toDate)}</td>
                      <td className="px-2 py-2.5">{r.durationMonths ? `${r.durationMonths} meses` : '—'}</td>
                      <td className="px-2 py-2.5"><StatusBadge tone={r.status === 'active' ? 'green' : 'slate'}>{r.status === 'active' ? 'Activo' : 'Finalizado'}</StatusBadge></td>
                      <td className="px-2 py-2.5">
                        <RowActions>
                          <RowAction title="Editar periodo" onClick={() => openRen(r)}><Pencil className="h-3.5 w-3.5" /></RowAction>
                          <RowAction title="Eliminar periodo" tone="bad" onClick={() => delRen(r)}><Trash2 className="h-3.5 w-3.5" /></RowAction>
                        </RowActions>
                      </td>
                    </Tr>
                  ))}
                </tbody>
            </TabTable>
          )}
        </Section>
      </div>

      {/* ---- Contract terms modal ---- */}
      <Modal open={editOpen} onOpenChange={setEditOpen} title="Editar contrato" icon={<FileText className="h-5 w-5" />} size="lg"
        footer={<><Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button><Button onClick={saveContract} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button></>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledField label="Número de contrato"><input className={FIELD_CLS} value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} /></LabeledField>
          <LabeledField label="Tipo de contrato"><input className={FIELD_CLS} placeholder="Servicio integral" value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })} /></LabeledField>
          <LabeledField label="Moneda"><input className={FIELD_CLS} placeholder="USD" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></LabeledField>
          <LabeledField label="Forma de pago"><input className={FIELD_CLS} placeholder="Mensual" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} /></LabeledField>
          <LabeledField label="Fecha de inicio"><input type="date" className={FIELD_CLS} value={form.contractDate || ''} onChange={(e) => setForm({ ...form, contractDate: e.target.value })} /></LabeledField>
          <LabeledField label="Fecha de vencimiento"><input type="date" className={FIELD_CLS} value={form.contractEndDate || ''} onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })} /></LabeledField>
          <LabeledField label="Renovación automática">
            <div className="flex items-center gap-2 h-9">
              <input id="autoRenew" type="checkbox" className="h-4 w-4" checked={!!form.autoRenew} onChange={(e) => setForm({ ...form, autoRenew: e.target.checked })} />
              <label htmlFor="autoRenew" className="text-sm text-muted-foreground">Renovar automáticamente</label>
            </div>
          </LabeledField>
          <LabeledField label="Aviso de renovación (días antes)"><input type="number" className={FIELD_CLS} value={form.autoRenewDaysBefore} onChange={(e) => setForm({ ...form, autoRenewDaysBefore: e.target.value })} /></LabeledField>
          <LabeledField label="Horas contratadas / mes"><input type="number" className={FIELD_CLS} value={form.contractedHoursPerMonth} onChange={(e) => setForm({ ...form, contractedHoursPerMonth: e.target.value })} /></LabeledField>
          <LabeledField label="Jurisdicción"><input className={FIELD_CLS} placeholder="Ecuador" value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} /></LabeledField>
          <LabeledField label="Penalización por incumplimiento" full><input className={FIELD_CLS} placeholder="Crédito del 5% mensual" value={form.penaltyClause} onChange={(e) => setForm({ ...form, penaltyClause: e.target.value })} /></LabeledField>
          <LabeledField label="Cancelación anticipada" full><input className={FIELD_CLS} placeholder="60 días de notificación" value={form.earlyCancellationNotice} onChange={(e) => setForm({ ...form, earlyCancellationNotice: e.target.value })} /></LabeledField>
          <div className="sm:col-span-2 mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <LabeledField label="SLA uptime (%)"><input type="number" className={FIELD_CLS} value={form.slaUptimeTarget} onChange={(e) => setForm({ ...form, slaUptimeTarget: e.target.value })} /></LabeledField>
            <LabeledField label="Respuesta (min)"><input type="number" className={FIELD_CLS} value={form.slaResponseMinutes} onChange={(e) => setForm({ ...form, slaResponseMinutes: e.target.value })} /></LabeledField>
            <LabeledField label="Rondas (%)"><input type="number" className={FIELD_CLS} value={form.slaRoundsTarget} onChange={(e) => setForm({ ...form, slaRoundsTarget: e.target.value })} /></LabeledField>
            <LabeledField label="Reportes (%)"><input type="number" className={FIELD_CLS} value={form.slaReportsTarget} onChange={(e) => setForm({ ...form, slaReportsTarget: e.target.value })} /></LabeledField>
          </div>
          <LabeledField label="Notas del contrato" full><textarea rows={3} className={`${FIELD_CLS} h-auto py-2`} value={form.contractNotes} onChange={(e) => setForm({ ...form, contractNotes: e.target.value })} /></LabeledField>
        </div>
      </Modal>

      {/* ---- Service modal ---- */}
      <Modal open={svcOpen} onOpenChange={setSvcOpen} title={svcForm?.id ? 'Editar servicio' : 'Agregar servicio'} icon={<ClipboardCheck className="h-5 w-5" />}
        footer={<><Button variant="outline" onClick={() => setSvcOpen(false)}>Cancelar</Button><Button onClick={saveSvc} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button></>}>
        {svcForm && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledField label="Tipo de servicio" full>
              <select className={FIELD_CLS} value={svcForm.serviceKey}
                onChange={(e) => {
                  const k = e.target.value; const p = SERVICE_PRESETS[k];
                  setSvcForm({ ...svcForm, serviceKey: k, name: (svcForm.id ? svcForm.name : p.name) || svcForm.name, unit: (svcForm.id ? svcForm.unit : p.unit) || svcForm.unit });
                }}>
                {SERVICE_KEYS.map((k) => <option key={k} value={k}>{k === 'custom' ? 'Personalizado' : SERVICE_PRESETS[k].name}</option>)}
              </select>
            </LabeledField>
            <LabeledField label="Nombre" full><input className={FIELD_CLS} value={svcForm.name} onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })} /></LabeledField>
            <LabeledField label="Descripción" full><input className={FIELD_CLS} value={svcForm.description || ''} onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })} /></LabeledField>
            <LabeledField label="Unidad"><input className={FIELD_CLS} placeholder="Estación, Rondas…" value={svcForm.unit || ''} onChange={(e) => setSvcForm({ ...svcForm, unit: e.target.value })} /></LabeledField>
            <LabeledField label="Cantidad contratada"><input type="number" className={FIELD_CLS} placeholder="Vacío = ilimitado" value={svcForm.contractedQty ?? ''} onChange={(e) => setSvcForm({ ...svcForm, contractedQty: e.target.value })} /></LabeledField>
            <LabeledField label="Objetivo SLA (%)"><input type="number" className={FIELD_CLS} value={svcForm.slaTarget ?? ''} onChange={(e) => setSvcForm({ ...svcForm, slaTarget: e.target.value })} /></LabeledField>
          </div>
        )}
      </Modal>

      {/* ---- Renewal modal ---- */}
      <Modal open={renOpen} onOpenChange={setRenOpen} title={renForm?.id ? 'Editar periodo' : 'Agregar periodo'} icon={<History className="h-5 w-5" />}
        footer={<><Button variant="outline" onClick={() => setRenOpen(false)}>Cancelar</Button><Button onClick={saveRen} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button></>}>
        {renForm && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledField label="Periodo" full><input className={FIELD_CLS} placeholder="Actual / Anterior" value={renForm.periodLabel} onChange={(e) => setRenForm({ ...renForm, periodLabel: e.target.value })} /></LabeledField>
            <LabeledField label="Desde"><input type="date" className={FIELD_CLS} value={renForm.fromDate || ''} onChange={(e) => setRenForm({ ...renForm, fromDate: e.target.value })} /></LabeledField>
            <LabeledField label="Hasta"><input type="date" className={FIELD_CLS} value={renForm.toDate || ''} onChange={(e) => setRenForm({ ...renForm, toDate: e.target.value })} /></LabeledField>
            <LabeledField label="Duración (meses)"><input type="number" className={FIELD_CLS} value={renForm.durationMonths ?? ''} onChange={(e) => setRenForm({ ...renForm, durationMonths: e.target.value })} /></LabeledField>
            <LabeledField label="Estado">
              <select className={FIELD_CLS} value={renForm.status} onChange={(e) => setRenForm({ ...renForm, status: e.target.value })}>
                <option value="active">Activo</option>
                <option value="finished">Finalizado</option>
              </select>
            </LabeledField>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SlaCell({ icon, label, value, suffix, actual }: { icon: ReactNode; label: string; value: ReactNode; suffix?: string; actual?: number | null }) {
  return (
    <div>
      <div className="cg-eyebrow flex items-center gap-1.5 [&_svg]:size-3.5">{icon}{label}</div>
      <div className="mt-1 font-display text-xl font-bold tabular-nums">{value != null && value !== '' ? `${value}${suffix || ''}` : '—'}</div>
      {actual != null && <div className="text-xs" style={{ color: 'var(--ink-faint)' }}>Real: {actual}%</div>}
    </div>
  );
}
