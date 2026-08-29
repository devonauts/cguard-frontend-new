import { useParams } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import GuardsLayout from '@/layouts/GuardsLayout';
import { useEffect, useState } from 'react';
import { Building2, UserCircle2, X } from 'lucide-react';
import securityGuardService from '@/lib/api/securityGuardService';
import departmentService, { Department } from '@/lib/api/departmentService';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { PageContainer, PageHeader, Section, EmptyState, SkeletonCards, StatusBadge, IconTile } from "@/components/kit";
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePermissions } from '@/hooks/usePermissions';
import type { GuardDetail } from '../../guardDetailTypes';

export default function GuardDepartamentoPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('settingsEdit');

  const [guard, setGuard] = useState<GuardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [current, setCurrent] = useState<{ id: string; name: string } | null>(null);
  const [pendingId, setPendingId] = useState<string>('');

  // securityGuard.guardId is the USER id — department membership hangs off tenantUsers.
  const userId: string | undefined = guard?.guardId;

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);
    Promise.all([
      securityGuardService.get(id).then((data: GuardDetail & { guard?: GuardDetail }) => {
        const g = data.guard ?? data;
        return { ...g, fullName: g.fullName ?? `${g.firstName ?? ''} ${g.lastName ?? ''}`.trim() };
      }),
      departmentService.list().then((r) => r.rows).catch(() => [] as Department[]),
    ])
      .then(async ([g, depts]) => {
        if (!mounted) return;
        setGuard(g);
        setDepartments(depts);
        if (g?.guardId) {
          try {
            const m = await departmentService.getMemberDepartment(g.guardId);
            if (!mounted) return;
            setCurrent(m.department ? { id: m.department.id, name: m.department.name } : null);
          } catch {
            /* member row may not exist yet */
          }
        }
      })
      .catch((err: any) => {
        console.error('Error cargando vigilante:', err);
        toast.error(t('ui.GuardDepartamentoPage.noSePudoCargarEl'));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  const assign = async (departmentId: string | null) => {
    if (!userId) return;
    try {
      setSaving(true);
      await departmentService.assignMember(userId, departmentId);
      const dept = departmentId ? departments.find((d) => d.id === departmentId) : null;
      setCurrent(dept ? { id: dept.id, name: dept.name } : null);
      setPendingId('');
      toast.success(departmentId ? 'Departamento asignado' : 'Departamento quitado');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.response?.data || t('guards.department.updateError', 'No se pudo actualizar el departamento'));
    } finally {
      setSaving(false);
    }
  };

  const activeDepts = departments.filter((d) => d.active && d.id !== current?.id);

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.departamento">
        <PageContainer>
          <PageHeader
            icon={<Building2 />}
            title={t('guards.department.title', { defaultValue: 'Departamento' })}
            subtitle={
              guard?.fullName
                ? `Departamento interno al que pertenece · ${guard.fullName}`
                : 'Departamento interno al que pertenece el vigilante.'
            }
          />

          {loading ? (
            <SkeletonCards count={2} />
          ) : guard ? (
            <Section title="Departamento asignado" icon={<Building2 />}>
              <div className="space-y-6">
                {current ? (
                  <div className="flex items-center justify-between glass-flat px-4 py-3">
                    <div className="flex items-center gap-3">
                      <IconTile><Building2 /></IconTile>
                      <div>
                        <div className="font-medium">{current.name}</div>
                        <div className="text-xs text-muted-foreground">Departamento actual</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge tone="green">Asignado</StatusBadge>
                      {canEdit && (
                        <Button variant="ghost" size="sm" disabled={saving} onClick={() => assign(null)}>
                          <X className="mr-1 h-4 w-4" />
                          Quitar
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon={<UserCircle2 />}
                    title={t('comun.sinDepartamento')}
                    description={t('ui.GuardDepartamentoPage.esteVigilanteAunNoPertenece')}
                  />
                )}

                {canEdit && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      {current ? t('guards.department.changeLabel', 'Cambiar de departamento') : t('guards.department.assignLabel', 'Asignar a un departamento')}
                    </div>
                    {departments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No hay departamentos creados. Créalos en Configuración › Departamentos.
                      </p>
                    ) : (
                      <div className="flex items-center gap-2 max-w-md">
                        <Select value={pendingId} onValueChange={setPendingId}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={t('ui.GuardDepartamentoPage.seleccionaUnDepartamento')} />
                          </SelectTrigger>
                          <SelectContent>
                            {activeDepts.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="brand"
                          disabled={!pendingId || saving}
                          onClick={() => assign(pendingId)}
                        >
                          {saving ? 'Guardando…' : 'Asignar'}
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Cada persona pertenece a un solo departamento; asignar uno nuevo reemplaza el actual.
                    </p>
                  </div>
                )}
              </div>
            </Section>
          ) : (
            <EmptyState icon={<Building2 />} title={t('ui.GuardDepartamentoPage.noSePudoCargarEl')} />
          )}
        </PageContainer>
      </GuardsLayout>
    </AppLayout>
  );
}
