import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, Users, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Section, FadeIn, StatusBadge, EmptyState } from '@/components/kit';
import { DataTable, type Column } from '@/components/table/DataTable';
import { MeterBar } from '@/components/charts';
import { securityGuardService } from '@/lib/api/securityGuardService';
import {
  trainingEnrollmentService,
  type EnrollmentRow,
} from '@/lib/api/trainingEnrollmentService';
import { enrollmentStatusLabel, ENROLLMENT_STATUS_TONE } from '../trainingConstants';

import { localeActual } from '@/lib/localeActual'
interface GuardOption {
  id: string;
  name: string;
}

function extractGuard(g: any): GuardOption | null {
  const id = g.id || g.guardId || g.securityGuardId || g.userId;
  if (!id) return null;
  const name =
    g.fullName ||
    g.guardName ||
    g.displayName ||
    g.name ||
    `${g.firstName ?? g.firstname ?? ''} ${g.lastName ?? g.lastname ?? ''}`.trim() ||
    'Sin nombre';
  return { id, name };
}

interface Props {
  courseId: string;
  published: boolean;
}

export default function AssignGuardsPanel({ courseId, published }: Props) {
  const { t } = useTranslation();
  const [assignmentType, setAssignmentType] = useState<'individual' | 'all_guards'>('individual');
  const [dueDate, setDueDate] = useState('');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<GuardOption[]>([]);
  const [selected, setSelected] = useState<GuardOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadEnrollments = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await trainingEnrollmentService.listByCourse(courseId, { limit: 100, offset: 0 });
      setEnrollments(res.rows);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }, [courseId]);

  useEffect(() => { loadEnrollments(); }, [loadEnrollments]);

  useEffect(() => {
    if (assignmentType !== 'individual') return;
    const q = query.trim();
    if (q.length < 2) { setOptions([]); return; }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res: any = await securityGuardService.autocomplete(q, 10);
        const rows: any[] = Array.isArray(res) ? res : res?.rows ?? res?.data ?? [];
        if (active) setOptions(rows.map(extractGuard).filter(Boolean) as GuardOption[]);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [query, assignmentType]);

  const handleAssign = async () => {
    if (!published) {
      toast.error(t('ui.AssignGuardsPanel.publicaElCursoAntesDe'));
      return;
    }
    if (assignmentType === 'individual' && !selected) {
      toast.error(t('ui.AssignGuardsPanel.seleccionaUnVigilante'));
      return;
    }
    setAssigning(true);
    try {
      await trainingEnrollmentService.enroll(courseId, {
        assignmentType,
        securityGuardId: assignmentType === 'individual' ? selected!.id : undefined,
        dueDate: dueDate || undefined,
      });
      toast.success(assignmentType === 'all_guards' ? 'Curso asignado a todos los vigilantes.' : `Curso asignado a ${selected!.name}.`);
      setSelected(null);
      setQuery('');
      setDueDate('');
      loadEnrollments();
    } catch (err: any) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message;
      toast.error(msg || t('ui.AssignGuardsPanel.noSePudoAsignarElCurso', 'No se pudo asignar el curso.'));
    } finally {
      setAssigning(false);
    }
  };

  const assignedColumns: Column<EnrollmentRow>[] = [
    {
      key: 'guardName',
      header: 'Vigilante',
      render: (_v, e) => (e.assignmentType === 'all_guards' && !e.guardId
        ? <StatusBadge tone="neutral" dot={false}>{t('comun.todosLosVigilantesPlantilla')}</StatusBadge>
        : (e.guardName || '—')),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (_v, e) => (
        <StatusBadge tone={ENROLLMENT_STATUS_TONE[e.status]} dot={false}>
          {enrollmentStatusLabel(e.status)}
        </StatusBadge>
      ),
    },
    {
      key: 'progressPercentage',
      header: 'Progreso',
      /* La página hermana pinta este mismo dato con `MeterBar`; una columna que
         sólo dice «40 %» y otra que lo dibuja son dos idiomas para lo mismo. */
      render: (_v, e) => (
        <div className="flex items-center gap-2">
          <MeterBar className="w-24" height={6} pct={e.progressPercentage ?? 0} ariaLabel="Progreso" />
          <span className="text-xs tabular-nums" style={{ color: 'var(--ink-soft)' }}>{e.progressPercentage ?? 0}%</span>
        </div>
      ),
    },
    {
      key: 'quizPassed',
      header: 'Cuestionario',
      render: (_v, e) => (e.quizPassed
        ? <StatusBadge tone="ok" dot={false}><span className="tabular-nums">Aprobado{e.quizScore != null ? ` (${e.quizScore}%)` : ''}</span></StatusBadge>
        : <span style={{ color: 'var(--ink-soft)' }}>—</span>),
    },
    {
      key: 'completedAt',
      header: 'Completado',
      render: (_v, e) => (
        <span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>
          {e.completedAt ? new Date(e.completedAt).toLocaleDateString(localeActual()) : '—'}
        </span>
      ),
    },
  ];

  return (
    <FadeIn className="space-y-4">
      <Section title="Asignar curso" icon={<UserPlus />}>
        <div className="space-y-4 max-w-2xl">
          {!published && (
            <p className="text-sm" style={{ color: 'var(--warn-text)' }}>{t("ui.AssignGuardsPanel.esteCursoEsUnBorrador", "Este curso es un borrador. Publícalo para poder asignarlo.")}</p>
          )}
          <div className="space-y-2">
            <Label>{t("ui.AssignGuardsPanel.tipoDeAsignacion", "Tipo de asignación")}</Label>
            <Select value={assignmentType} onValueChange={(v) => setAssignmentType(v as any)}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">{t("ui.AssignGuardsPanel.vigilanteEspecifico", "Vigilante específico")}</SelectItem>
                <SelectItem value="all_guards">{t('comun.todosLosVigilantes')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {assignmentType === 'individual' && (
            <div className="space-y-2">
              <Label>{t('ui.AssignGuardsPanel.buscarVigilante')}</Label>
              {selected ? (
                <div className="flex items-center gap-2">
                  <StatusBadge tone="neutral" dot={false}><Users className="h-3 w-3" /> {selected.name}</StatusBadge>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Cambiar</Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
                  <Input className="pl-9" placeholder={t('ui.AssignGuardsPanel.nombreDelVigilante')} value={query} onChange={(e) => setQuery(e.target.value)} />
                  {(options.length > 0 || searching) && (
                    <div className="glass-raised absolute z-10 mt-1 w-full overflow-hidden">
                      {searching && <div className="px-3 py-2 text-sm" style={{ color: 'var(--ink-soft)' }}>Buscando…</div>}
                      {options.map((o) => (
                        <button
                          key={o.id}
                          className="cg-focus block w-full px-3 py-2 text-left text-sm transition-colors hover:[background:var(--glass-sunken)]"
                          onClick={() => { setSelected(o); setOptions([]); }}
                        >
                          {o.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("ui.AssignGuardsPanel.fechaLimiteOpcional", "Fecha límite (opcional)")}</Label>
            <Input type="date" className="w-64" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <Button variant="brand" disabled={assigning || !published} onClick={handleAssign}>
            <UserPlus className="h-4 w-4 mr-1" /> {assigning ? 'Asignando...' : 'Asignar curso'}
          </Button>
        </div>
      </Section>

      <Section title="Vigilantes asignados" icon={<Users />} contentClassName="-mx-5 -mb-5">
        <DataTable
          surface="none"
          loading={loadingList}
          data={enrollments}
          columns={assignedColumns}
          emptyState={
            <EmptyState
              icon={<Users />}
              title={t("ui.AssignGuardsPanel.aunNoHayVigilantesAsignados", "Aún no hay vigilantes asignados")}
              description={t('ui.AssignGuardsPanel.asignaElCursoArribaY')}
              className="border-0"
            />
          }
        />
      </Section>
    </FadeIn>
  );
}
