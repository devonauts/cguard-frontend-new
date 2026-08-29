import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FIELD_CLS } from '@/pages/admin/clientes/components/_shared/tab-kit';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { projectService } from '@/lib/api/projectService';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_LABEL_KEYS } from '@/lib/projectTypes';
import type { ProjectTypeValue } from '@/lib/projectTypes';
import { ProjectTypePicker } from '@/components/projects/ProjectBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { clientService } from '@/lib/api/clientService';
import { Section } from '@/components/kit';
import { Layers, FileText, CalendarRange, ClipboardList } from 'lucide-react';

const schema = z.object({
  name: z.string().trim().min(1, 'Nombre requerido').max(200),
  type: z.enum(['event', 'investigation', 'alarm_response', 'consulting', 'other']),
  clientAccountId: z.string().trim().min(1, 'Cliente requerido'),
  status: z.enum(['active', 'completed', 'cancelled', 'on_hold']),
  description: z.string().trim().max(5000).optional().or(z.literal('')),
  startDate: z.string().optional().or(z.literal('')),
  endDate: z.string().optional().or(z.literal('')),
  location: z.string().trim().max(300).optional().or(z.literal('')),
  estimatedHours: z.string().optional().or(z.literal('')),
  notes: z.string().trim().max(5000).optional().or(z.literal('')),
});

type FormInput = z.infer<typeof schema>;

interface ProjectFormProps {
  mode: 'create' | 'edit';
  projectId?: string;
  /** Pre-selected clientAccountId (when opened from a client page) */
  defaultClientId?: string;
  onSaved?: (project: any) => void;
  onCancel?: () => void;
}

export default function ProjectForm({
  mode,
  projectId,
  defaultClientId,
  onSaved,
  onCancel,
}: ProjectFormProps) {
  const { t } = useTranslation();
  const [clients, setClients] = useState<{ id: string; label: string }[]>([]);

  const form = useForm<FormInput, unknown, FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      type: 'event',
      clientAccountId: defaultClientId ?? '',
      status: 'active',
      description: '',
      startDate: '',
      endDate: '',
      location: '',
      estimatedHours: '',
      notes: '',
    },
  });

  // Load clients for the selector
  useEffect(() => {
    clientService.getClients({ limit: 500, offset: 0 } as any).then((resp) => {
      const rows = resp?.rows ?? [];
      setClients(
        rows.map((c: any) => ({
          id: c.id,
          label: c.commercialName || [c.name, c.lastName].filter(Boolean).join(' '),
        })),
      );
    }).catch(() => {});
  }, []);

  // Load existing project in edit mode
  useEffect(() => {
    if (mode === 'edit' && projectId) {
      projectService.get(projectId).then((p) => {
        form.reset({
          name: p.name ?? '',
          type: (p.type as any) ?? 'event',
          clientAccountId: p.clientAccountId ?? defaultClientId ?? '',
          status: (p.status as any) ?? 'active',
          description: p.description ?? '',
          startDate: p.startDate ?? '',
          endDate: p.endDate ?? '',
          location: p.location ?? '',
          estimatedHours: p.estimatedHours != null ? String(p.estimatedHours) : '',
          notes: p.notes ?? '',
        });
      }).catch(() => {
        toast.error(t('ui.ProjectForm.noSePudoCargarEl'));
      });
    }
  }, [mode, projectId]);

  const onSubmit = async (values: FormInput) => {
    try {
      const payload: any = {
        ...values,
        estimatedHours: values.estimatedHours ? parseFloat(values.estimatedHours) : undefined,
        startDate: values.startDate || undefined,
        endDate: values.endDate || undefined,
        description: values.description || undefined,
        location: values.location || undefined,
        notes: values.notes || undefined,
      };

      let result: any;
      if (mode === 'create') {
        result = await projectService.create(payload);
        toast.success('Proyecto creado');
      } else if (mode === 'edit' && projectId) {
        result = await projectService.update(projectId, payload);
        toast.success('Proyecto actualizado');
      }
      onSaved?.(result);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Error al guardar');
    }
  };

  const STATUSES = Object.keys(PROJECT_STATUS_LABELS) as (keyof typeof PROJECT_STATUS_LABELS)[];

  return (
    <div className="max-w-2xl mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          {/* ── Tipo de proyecto ─────────────────────────── */}
          <Section title={t('ui.ProjectForm.tipoDeProyecto')} icon={<Layers />}>
            <Controller
              control={form.control}
              name="type"
              render={({ field, fieldState }) => (
                <ProjectTypePicker
                  value={field.value as ProjectTypeValue | undefined}
                  onChange={(val) => field.onChange(val)}
                  error={fieldState.error?.message}
                />
              )}
            />
          </Section>

          {/* ── Información básica ───────────────────────── */}
          <Section title={t("ui.ProjectForm.informacionBasica", "Información básica")} icon={<FileText />} contentClassName="space-y-4">

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('ui.ProjectForm.nombreDelProyecto')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("ui.ProjectForm.ejEventoAnual2026Investigacion", "Ej. Evento anual 2026, Investigación #14")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Client selector — hidden when defaultClientId is locked */}
            {!defaultClientId && (
              <FormField
                control={form.control}
                name="clientAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('ui.ProjectForm.cliente')}</FormLabel>
                    <FormControl>
                      <select
                        className="cg-input flex h-10 w-full px-3 py-1 text-sm"
                        {...field}
                      >
                        <option value="">{t('comun.seleccionaUnCliente')}</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("ui.ProjectForm.descripcion", "Descripción")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("ui.ProjectForm.descripcionDelProyectoAlcanceObjetivos", "Descripción del proyecto, alcance, objetivos…")}
                      rows={3}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Section>

          {/* ── Fechas y lugar ────────────────────────────── */}
          <Section title="Fechas y lugar" icon={<CalendarRange />} contentClassName="space-y-4">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('comun.fechaDeInicio')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('ui.ProjectForm.fechaDeFin')}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("ui.ProjectForm.lugarUbicacion", "Lugar / ubicación")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("ui.ProjectForm.centroDeConvencionesQuito", "Centro de convenciones, Quito")} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimatedHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horas estimadas</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="0.5" placeholder="8" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Section>

          {/* ── Estado y notas ───────────────────────────── */}
          <Section title={t('ui.ProjectForm.estadoYNotas')} icon={<ClipboardList />} contentClassName="space-y-4">

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('comun.estado')}</FormLabel>
                  <FormControl>
                    <select
                      className={FIELD_CLS}
                      {...field}
                    >
                      {STATUSES.map((val) => (
                        <option key={val} value={val}>
                          {t(PROJECT_STATUS_LABEL_KEYS[val], PROJECT_STATUS_LABELS[val])}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('comun.notasInternas')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('ui.ProjectForm.notasPrivadasInstruccionesEspeciales')}
                      rows={3}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Section>

          {/* ── Acciones ──────────────────────────────────── */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" className="min-w-28" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="brand"
              className="min-w-28"
            >
              Guardar
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
