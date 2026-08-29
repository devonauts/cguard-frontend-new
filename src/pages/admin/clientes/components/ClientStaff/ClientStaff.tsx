import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Client } from '@/types/client';
import { useNavigate } from 'react-router-dom';
import useScrollToTopOnMount from '@/hooks/useScrollToTopOnMount';
import { clientService } from '@/lib/api/clientService';
import guardRatingService from '@/lib/api/guardRatingService';
import GuardRatingLevel from '@/pages/admin/security-guards/GuardRatingLevel';
import { Section, EmptyState, StatusBadge } from '@/components/kit';
import { FIELD_CLS, TabTable, THead, Th, Tr, RowAction, RowActions, Pager, TabFooter, TabLoading, Avatar } from '../_shared/tab-kit';
import { Donut, MeterBar } from '@/components/charts';
import { seriesVar } from '@/lib/chartColors';
import { Search, Users, UserX, ShieldCheck, Eye, MoreVertical, RefreshCw, Route as RouteIcon, Pencil, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { ApiService } from '@/services/api/apiService';
import { confirmDialog } from '@/components/ui/confirmDialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

import { localeActual } from '@/lib/localeActual'
type BadgeTone = 'green' | 'blue' | 'orange' | 'red' | 'primary' | 'slate';

// ── Shape of GET /client-account/:id/personnel (clientAccountPersonnel.ts) ──
interface PersonnelActivity { type: 'ronda' | 'checkin'; label: string; time?: string; }
interface PersonnelRow {
  id: string;
  guardId: string | null;
  assignmentId?: string | null;
  stationId?: string | null;
  name: string;
  code: string | null;
  role: 'vigilante' | 'supervisor' | 'patrullero' | 'operador';
  roleLabel: string;
  puesto: string | null;
  sede: string | null;
  sedeId: string | null;
  turno: { window: string; label: string | null } | null;
  estado: string;
  inicioTurno: string | null;
  ultimaActividad: PersonnelActivity | null;
  photoUrl: string | null;
}
interface RoleDistribution { key: string; label: string; count: number; pct: number; }
interface CoberturaTurno { key: string; label: string; window: string; required: number; covered: number; pct: number; }
interface Certificacion { id: string; name: string; role: string; cert: string; expiresInDays: number; photoUrl: string | null; }
interface Ausencia { id: string; name: string; turno: string | null; reason: string; tone: string; photoUrl: string | null; }
interface PersonnelKpis {
  totalAsignados: number; enTurno: number; enTurnoPct: number; fueraTurno: number; fueraTurnoPct: number;
  descanso: number; descansoPct: number; ausentes: number; ausentesPct: number; proximosVencer: number;
  cumplimientoCobertura: number; metaCobertura: number; horasMes: number;
}
interface PersonnelData {
  tz: string;
  sedes: Array<{ id: string; name: string }>;
  kpis: PersonnelKpis;
  roleDistribution: RoleDistribution[];
  total: number;
  personal: PersonnelRow[];
  coberturaTurno: CoberturaTurno[];
  certificaciones: Certificacion[];
  ausenciasHoy: Ausencia[];
  page: number;
  perPage: number;
  updatedAt: string;
}

/* Clave i18n + respaldo en español. Se traduce AL PINTAR (más abajo): un t() en
   el ámbito del módulo congelaría el idioma de arranque para toda la sesión. */
const ESTADO_META: Record<string, { label: string; labelKey: string; tone: BadgeTone }> = {
  en_turno:    { label: 'En turno',       labelKey: 'comun.enTurno',              tone: 'green' },
  fuera_turno: { label: 'Fuera de turno', labelKey: 'ui.ClientStaff.fueraDeTurno', tone: 'blue' },
  descanso:    { label: 'Descanso',       labelKey: 'ui.ClientStaff.descanso',     tone: 'orange' },
  ausente:     { label: 'Ausente',        labelKey: 'ui.ClientStaff.ausente',      tone: 'red' },
  en_ruta:     { label: 'En ruta',        labelKey: 'ui.ClientStaff.enRuta',       tone: 'primary' },
};
/* Los cuatro roles son categorías sin orden ni estado: van a los escalones de
   serie del acento, asignados SIEMPRE en el mismo orden. Que un filtro deje
   fuera a los supervisores no puede repintar a los guardias. */
const ROLE_META: Record<string, { label: string; labelKey: string; tone: BadgeTone; color: string }> = {
  guardia:    { label: 'Vigilante',  labelKey: 'comun.vigilante',            tone: 'slate',   color: seriesVar(0) },
  supervisor: { label: 'Supervisor', labelKey: 'comun.supervisor',           tone: 'blue',    color: seriesVar(1) },
  patrullero: { label: 'Patrullero', labelKey: 'ui.ClientStaff.patrullero',  tone: 'primary', color: seriesVar(2) },
  operador:   { label: 'Operador',   labelKey: 'ui.ClientStaff.operador',    tone: 'orange',  color: seriesVar(3) },
};

export default function ClientStaff({ client }: { client: Client }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  useScrollToTopOnMount(containerRef);

  const [data, setData] = useState<PersonnelData | null>(null);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [sede, setSede] = useState('todos');
  const [role, setRole] = useState('todos');
  const [estado, setEstado] = useState('todos');
  const [turno, setTurno] = useState('todos');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const d = await clientService.getClientPersonnel(client.id, {
        sedeId: sede !== 'todos' ? sede : undefined,
        role: role !== 'todos' ? role : undefined,
        estado: estado !== 'todos' ? estado : undefined,
        turno: turno !== 'todos' ? turno : undefined,
        q: q.trim() || undefined,
        page, perPage,
      });
      setData(d);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  // Refetch on filter/page change (debounced for search).
  useEffect(() => { const t = setTimeout(() => load(), 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q, sede, role, estado, turno, page, client.id]);
  // Live refresh.
  useEffect(() => { const t = setInterval(() => load(true), 45000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [q, sede, role, estado, turno, page, client.id]);

  const dist: RoleDistribution[] = data?.roleDistribution || [];
  const sedes: Array<{ id: string; name: string }> = data?.sedes || [];
  const personal: PersonnelRow[] = data?.personal || [];

  // Per-guard client-review level, so a service issue is visible right on the
  // roster. Click → the guard's Perfil › Reseñas. Keyed by securityGuard id.
  const [ratings, setRatings] = useState<Record<string, { average: number; count: number }>>({});
  useEffect(() => {
    const ids = personal.filter((p) => p.role === 'vigilante').map((p) => p.id).filter(Boolean);
    if (!ids.length) return;
    let alive = true;
    guardRatingService.summary(ids).then((m) => { if (alive) setRatings((prev) => ({ ...prev, ...m })); }).catch(() => {});
    return () => { alive = false; };
  }, [personal]);
  const total = data?.total ?? 0;
  const coberturaTurno: CoberturaTurno[] = data?.coberturaTurno || [];
  const certs: Certificacion[] = data?.certificaciones || [];
  const ausencias: Ausencia[] = data?.ausenciasHoy || [];
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const fmtUpdated = data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString(localeActual(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  const donutSegments = useMemo(() => dist.filter((d) => d.count > 0).map((d) => ({ value: d.count, color: ROLE_META[d.key]?.color, tone: 'neutral' as const, label: d.label })), [dist]);

  const resetPage = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(1); };

  const openWorker = (p: PersonnelRow) => {
    if (p.role === 'vigilante') navigate(`/guards/${p.id}/resumen`);
    else navigate(`/supervisors/${p.guardId}`);
  };

  // Quitar de la estación: elimina la asignación activa (guardAssignment) —
  // el vigilante vuelve al grupo sin asignación y sus turnos futuros se borran.
  const removeFromStation = async (p: PersonnelRow) => {
    if (!p.assignmentId) { toast.error(t('ui.ClientStaff.esteTrabajadorNoTieneUna')); return; }
    const ok = await confirmDialog({
      title: t('ui.ClientStaff.quitarDeLaEstacion', 'Quitar de la estación'),
      message: `¿Quitar a ${p.name} de "${p.puesto || 'su estación'}"? Volverá al grupo de vigilantes sin asignación y se eliminarán sus turnos futuros generados.`,
      confirmText: 'Quitar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const tenantId = localStorage.getItem('tenantId') || '';
      await ApiService.delete(`/tenant/${tenantId}/guard-assignment/${p.assignmentId}`);
      toast.success(`${p.name} quedó sin asignación`);
      load(true);
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t('ui.ClientStaff.noSePudoQuitarLaAsignacion', 'No se pudo quitar la asignación'));
    }
  };

  if (loading && !data) return <TabLoading />;

  return (
    <div ref={containerRef} className="space-y-4">
      {/* The shared client-header KPI cards (ClientsLayout) stay visible on
          this tab — no duplicate per-tab KPI row here. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        {/* LEFT — filters + roster table */}
        <Section title="Personal asignado" icon={<Users className="h-4 w-4" />}>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <div className="relative col-span-2 md:col-span-3 xl:col-span-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input className={`${FIELD_CLS} pl-8`} placeholder={t("ui.ClientStaff.buscarPorNombreIdO", "Buscar por nombre, ID o estación")} value={q} onChange={(e) => resetPage(setQ)(e.target.value)} />
            </div>
            <select className={FIELD_CLS} value={sede} onChange={(e) => resetPage(setSede)(e.target.value)}>
              <option value="todos">{t('comun.sedeTodas')}</option>
              {sedes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={FIELD_CLS} value={role} onChange={(e) => resetPage(setRole)(e.target.value)}>
              <option value="todos">{t('ui.ClientStaff.rolTodos')}</option>
              <option value="vigilante">Guardia</option>
              <option value="supervisor">{t('comun.supervisor')}</option>
              <option value="patrullero">Patrullero</option>
              <option value="operador">Operador</option>
            </select>
            <select className={FIELD_CLS} value={estado} onChange={(e) => resetPage(setEstado)(e.target.value)}>
              <option value="todos">{t('comun.estadoTodos')}</option>
              <option value="en_turno">{t('comun.enTurno')}</option>
              <option value="fuera_turno">{t('ui.ClientStaff.fueraDeTurno')}</option>
              <option value="descanso">Descanso</option>
              <option value="ausente">Ausente</option>
              <option value="en_ruta">En ruta</option>
            </select>
            <select className={FIELD_CLS} value={turno} onChange={(e) => resetPage(setTurno)(e.target.value)}>
              <option value="todos">{t('comun.turnoTodos')}</option>
              <option value="Diurno">Diurno</option>
              <option value="Vespertino">Vespertino</option>
              <option value="Nocturno">Nocturno</option>
            </select>
          </div>

          {personal.length === 0 ? (
            <EmptyState icon={<Users className="h-5 w-5" />} title={t('ui.ClientStaff.sinPersonal')} description={t('ui.ClientStaff.noHayPersonalQueCoincida')} />
          ) : (
            <TabTable>
                <THead>
                  <Th>Personal</Th>
                  <Th>Rol</Th>
                  <Th>{t("ui.ClientStaff.estacion", "Estación")}</Th>
                  <Th>Sede / Sitio</Th>
                  <Th>{t('comun.turno')}</Th>
                  <Th>{t('comun.estado')}</Th>
                  <Th>Inicio</Th>
                  <Th>{t("ui.ClientStaff.ultimaActividad", "Última actividad")}</Th>
                  <Th align="right">Acciones</Th>
                </THead>
                <tbody>
                  {personal.map((p) => {
                    const em = ESTADO_META[p.estado] || ESTADO_META.fuera_turno;
                    const rm = ROLE_META[p.role] || ROLE_META.guardia;
                    return (
                      <Tr key={p.id}>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar url={p.photoUrl} name={p.name} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium truncate">{p.name}</span>
                                {p.role === 'vigilante' && ratings[p.id] && (
                                  <GuardRatingLevel average={ratings[p.id].average} count={ratings[p.id].count} onClick={() => navigate(`/guards/${p.id}/reviews`)} />
                                )}
                              </div>
                              {p.code && <div className="text-xs text-muted-foreground">{p.code}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5"><StatusBadge tone={rm.tone} dot={false}>{p.roleLabel || t(rm.labelKey, rm.label)}</StatusBadge></td>
                        <td className="px-2 py-2.5">{p.puesto || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-2 py-2.5">{p.sede || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-2 py-2.5">
                          {p.turno?.window ? <div><div>{p.turno.window}</div><div className="text-xs text-muted-foreground">{p.turno.label || ''}</div></div> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2.5"><StatusBadge tone={em.tone}>{t(em.labelKey, em.label)}</StatusBadge></td>
                        <td className="px-2 py-2.5 tabular-nums">{p.inicioTurno || '—'}</td>
                        <td className="px-2 py-2.5">
                          {p.ultimaActividad?.type === 'ronda' ? <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--ok-text)' }}><RouteIcon className="h-3.5 w-3.5" /> {p.ultimaActividad.label || 'Ronda activa'}</span>
                            : p.ultimaActividad?.label ? <div><div className="tabular-nums">{p.ultimaActividad.time || ''}</div><div className="text-xs text-muted-foreground">{p.ultimaActividad.label}</div></div>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2.5">
                          <RowActions>
                            <RowAction title={t('common.viewDetail')} onClick={() => openWorker(p)}><Eye className="h-3.5 w-3.5" /></RowAction>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button title="Acciones" className="cg-focus rounded-md p-1.5 transition-opacity hover:opacity-70" style={{ color: 'var(--ink-soft)' }}><MoreVertical className="h-3.5 w-3.5" /></button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openWorker(p)}>
                                  <Eye className="mr-2 h-3.5 w-3.5" />{" "}{t('common.viewDetail')}{" "}</DropdownMenuItem>
                                {p.role === 'vigilante' && (
                                  <DropdownMenuItem onClick={() => navigate(`/security-guards/edit/${p.id}`)}>
                                    <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                                  </DropdownMenuItem>
                                )}
                                {p.role === 'vigilante' && p.assignmentId && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      style={{ color: 'var(--bad-text)' }}
                                      onClick={() => void removeFromStation(p)}
                                    >
                                      <UserMinus className="mr-2 h-3.5 w-3.5" /> {t('ui.ClientStaff.quitarDeLaEstacion', 'Quitar de la estación')}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </RowActions>
                        </td>
                      </Tr>
                    );
                  })}
                </tbody>
            </TabTable>
          )}

          <Pager page={page} pageCount={pageCount} total={total} perPage={perPage} noun="resultados" onPage={setPage} />
        </Section>

        {/* RIGHT — distribution + coverage + certs + absences */}
        <div className="space-y-4">
          <Section title={t("ui.ClientStaff.distribucionPorRol", "Distribución por rol")} icon={<Users className="h-4 w-4" />}>
            <div className="flex items-center gap-4">
              <Donut segments={donutSegments} size={150} thickness={16} centerTop={data?.total ?? dist.reduce((a, d) => a + d.count, 0)} centerBottom="Total" ariaLabel={t("ui.ClientStaff.distribucionPorRol", "Distribución por rol")} />
              <div className="flex-1 space-y-2">
                {dist.map((d) => (
                  <div key={d.key} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_META[d.key]?.color || 'var(--ink-faint)' }} />{d.label}</span>
                    <span className="tabular-nums"><b>{d.count}</b> <span className="text-xs text-muted-foreground">({d.pct}%)</span></span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title={t('ui.ClientStaff.coberturaPorTurno')} icon={<ShieldCheck className="h-4 w-4" />}>
            <div className="space-y-3">
              {coberturaTurno.map((t) => (
                <div key={t.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t.label} <span className="text-xs">({t.window})</span></span>
                    <span className="tabular-nums"><b style={{ color: t.pct >= 90 ? 'var(--ok-text)' : t.pct >= 60 ? 'var(--warn-text)' : 'var(--bad-text)' }}>{t.pct}%</b> <span className="text-xs text-muted-foreground">{t.covered} / {t.required}</span></span>
                  </div>
                  <MeterBar height={8} pct={t.pct} ariaLabel={t.label} tone={t.pct >= 90 ? 'ok' : t.pct >= 60 ? 'warn' : 'bad'} />
                </div>
              ))}
              {coberturaTurno.length === 0 && <p className="text-sm text-muted-foreground">{t('ui.ClientStaff.sinTurnosConfigurados')}</p>}
            </div>
          </Section>

          <Section title={t("ui.ClientStaff.certificacionesProximasAVencer", "Certificaciones próximas a vencer")} icon={<ShieldCheck className="h-4 w-4" />}
            action={<button onClick={() => navigate('/security-guards')} className="cg-focus rounded-md text-xs font-semibold hover:underline" style={{ color: 'var(--brand-text)' }}>{t('common.viewAll')}</button>}>
            {certs.length === 0 ? (
              <div className="py-2 text-sm" style={{ color: 'var(--ok-text)' }}>{t("ui.ClientStaff.sinCertificacionesProximasAVencer", "Sin certificaciones próximas a vencer.")}</div>
            ) : (
              <div className="divide-y">
                {certs.slice(0, 6).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar url={c.photoUrl} name={c.name} />
                      <div className="min-w-0"><div className="truncate text-sm font-medium">{c.name}</div><div className="truncate text-xs text-muted-foreground">{c.cert}</div></div>
                    </div>
                    <span
                      className="shrink-0 text-xs font-semibold"
                      style={{ color: c.expiresInDays <= 15 ? 'var(--bad-text)' : c.expiresInDays <= 30 ? 'var(--warn-text)' : 'var(--info-text)' }}
                    >
                      {c.expiresInDays < 0 ? 'Vencida' : `Vence en ${c.expiresInDays} días`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title={`Ausencias hoy (${ausencias.length})`} icon={<UserX className="h-4 w-4" />}>
            {ausencias.length === 0 ? (
              <div className="py-2 text-sm" style={{ color: 'var(--ok-text)' }}>{t('ui.ClientStaff.sinAusenciasHoy')}</div>
            ) : (
              <div className="divide-y">
                {ausencias.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar url={a.photoUrl} name={a.name} />
                      <div className="min-w-0"><div className="truncate text-sm font-medium">{a.name}</div><div className="truncate text-xs text-muted-foreground">{a.turno || ''}</div></div>
                    </div>
                    <span className="shrink-0 text-xs font-semibold" style={{ color: a.tone === 'red' ? 'var(--bad-text)' : 'var(--warn-text)' }}>{a.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      <TabFooter
        icon={<RefreshCw />}
        note="Los estados se actualizan en tiempo real según la marcación de los vigilantes."
        updatedAt={fmtUpdated}
        onRefresh={() => load()}
      />
    </div>
  );
}
