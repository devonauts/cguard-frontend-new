import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Car, MapPin, Camera, Bell, Users2, Clock } from 'lucide-react';
import { Section, Stagger, SkeletonCards, FormField, FIELD_CLS } from '@/components/kit';
import { ToggleRow, NumberRow, SaveBar } from '../components/SettingsForm';
import SettingsPageShell from '../components/SettingsPageShell';
import patrolSettingsService, { PATROL_DEFAULTS, type PatrolSettings } from '@/lib/api/patrolSettingsService';

/**
 * POLÍTICA DE PATRULLAJE DE SUPERVISIÓN. Lo que la app del supervisor
 * obedece en cada ruta: cómo se verifica la llegada (geocerca), qué se exige
 * para cerrar una parada, qué se permite (omitir, reordenar), cuándo una ruta
 * cuenta como retrasada, y a quién se avisa. Se guarda en `settings.patrol`.
 */
export default function PatrolSettingsPage() {
  const { t } = useTranslation();
  const [row, setRow] = useState<any>(null);
  const [s, setS] = useState<PatrolSettings>(PATROL_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PatrolSettings>(k: K, v: PatrolSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  const setOps = (k: keyof PatrolSettings['notifyOps'], v: boolean) => setS((p) => ({ ...p, notifyOps: { ...p.notifyOps, [k]: v } }));

  useEffect(() => {
    patrolSettingsService.get()
      .then((r) => { setRow(r.row); setS(r.patrol); })
      .catch(() => toast.error(t('settings.patrol.loadError', { defaultValue: 'No se pudo cargar la política de patrullaje.' })))
      .finally(() => setLoading(false));
  }, [t]);

  const save = async () => {
    setSaving(true);
    try { await patrolSettingsService.save(row, s); toast.success(t('settings.patrol.saved', { defaultValue: 'Guardado. Aplica a la próxima ruta que se empiece.' })); }
    catch (e: any) { toast.error(e?.response?.data?.message || t('settings.patrol.saveError', { defaultValue: 'No se pudo guardar.' })); }
    finally { setSaving(false); }
  };

  return (
    <SettingsPageShell icon={<Car />} title={t('settings.patrol.pageTitle', { defaultValue: 'Rutas de supervisión' })} subtitle={t('settings.patrol.pageSubtitle', { defaultValue: 'Cómo se verifica la llegada, qué exige cada parada, qué se permite al supervisor y a quién se avisa.' })}>
      {loading ? <SkeletonCards count={3} /> : (
        <Stagger className="space-y-6">
          <Section title={t('settings.patrol.geofence', { defaultValue: 'Llegada y geocerca' })} icon={<MapPin />}>
            <FormField label={t('settings.patrol.enforcement', { defaultValue: 'Verificación de la llegada' })} hint={t('settings.patrol.enforcementHint', { defaultValue: 'Estricta: fuera del radio no se registra. Aviso: se registra y queda marcada. Sin verificar: no se mide.' })}>
              <select className={FIELD_CLS} value={s.geofenceEnforcement} onChange={(e) => set('geofenceEnforcement', e.target.value as any)}>
                <option value="strict">{t('settings.patrol.strict', { defaultValue: 'Estricta' })}</option>
                <option value="warning">{t('settings.patrol.warning', { defaultValue: 'Aviso (se marca)' })}</option>
                <option value="disabled">{t('settings.patrol.disabled', { defaultValue: 'Sin verificar' })}</option>
              </select>
            </FormField>
            <NumberRow label={t('settings.patrol.arrivalRadius', { defaultValue: 'Radio de llegada' })} hint={t('settings.patrol.arrivalRadiusHint', { defaultValue: 'Si la parada no define el suyo. Los puestos con geocerca propia usan la suya.' })} value={s.arrivalRadiusM} onChange={(n) => set('arrivalRadiusM', n ?? 250)} min={20} max={5000} suffix="m" />
            <NumberRow label={t('settings.patrol.approachRadius', { defaultValue: 'Radio de «acercándose»' })} value={s.approachingRadiusM} onChange={(n) => set('approachingRadiusM', n ?? 500)} min={50} max={10000} suffix="m" />
            <ToggleRow label={t('settings.patrol.allowOverride', { defaultValue: 'Permitir registrar la llegada fuera del radio con motivo' })} hint={t('settings.patrol.allowOverrideHint', { defaultValue: 'Sólo aplica en modo estricto. La visita queda marcada y el motivo, en el registro.' })} checked={s.allowGeofenceOverride} onCheckedChange={(v) => set('allowGeofenceOverride', v)} />
            <ToggleRow label={t('settings.patrol.requireOverrideReason', { defaultValue: 'Exigir motivo en ese caso' })} checked={s.requireOverrideReason} onCheckedChange={(v) => set('requireOverrideReason', v)} disabled={!s.allowGeofenceOverride} />
          </Section>

          <Section title={t('settings.patrol.visit', { defaultValue: 'Cada parada' })} icon={<Camera />}>
            <NumberRow label={t('settings.patrol.minPhotos', { defaultValue: 'Fotos mínimas por visita' })} hint={t('settings.patrol.minPhotosHint', { defaultValue: 'La plantilla o la parada pueden exigir más; nunca menos.' })} value={s.minPhotosPerVisit} onChange={(n) => set('minPhotosPerVisit', n ?? 0)} min={0} max={20} />
            <ToggleRow label={t('settings.patrol.allowGallery', { defaultValue: 'Permitir fotos de la galería' })} hint={t('settings.patrol.allowGalleryHint', { defaultValue: 'Apagado: sólo cámara, tomadas en el momento.' })} checked={s.allowGalleryPhotos} onCheckedChange={(v) => set('allowGalleryPhotos', v)} />
            <ToggleRow label={t('settings.patrol.allowSkip', { defaultValue: 'Permitir omitir paradas desde la app' })} checked={s.allowSkip} onCheckedChange={(v) => set('allowSkip', v)} />
            <ToggleRow label={t('settings.patrol.requireSkipReason', { defaultValue: 'Exigir motivo al omitir' })} checked={s.requireSkipReason} onCheckedChange={(v) => set('requireSkipReason', v)} disabled={!s.allowSkip} />
            <ToggleRow label={t('settings.patrol.allowReorder', { defaultValue: 'Permitir al supervisor reordenar su ruta' })} checked={s.allowSupervisorReorder} onCheckedChange={(v) => set('allowSupervisorReorder', v)} />
            <ToggleRow label={t('settings.patrol.requireClockIn', { defaultValue: 'Exigir turno abierto para empezar una ruta' })} checked={s.requireClockInToStart} onCheckedChange={(v) => set('requireClockInToStart', v)} />
          </Section>

          <Section title={t('settings.patrol.schedule', { defaultValue: 'Retrasos' })} icon={<Clock />}>
            <NumberRow label={t('settings.patrol.late', { defaultValue: 'Retrasada a partir de' })} value={s.lateThresholdMin} onChange={(n) => set('lateThresholdMin', n ?? 15)} min={1} max={240} suffix="min" />
            <NumberRow label={t('settings.patrol.critical', { defaultValue: 'En riesgo a partir de' })} value={s.criticalDelayMin} onChange={(n) => set('criticalDelayMin', n ?? 45)} min={2} max={480} suffix="min" />
          </Section>

          <Section title={t('settings.patrol.notify', { defaultValue: 'Avisos a la central' })} icon={<Bell />}>
            <ToggleRow label={t('settings.patrol.n.routeStart', { defaultValue: 'Ruta iniciada' })} checked={s.notifyOps.routeStart} onCheckedChange={(v) => setOps('routeStart', v)} />
            <ToggleRow label={t('settings.patrol.n.routeCompletion', { defaultValue: 'Ruta finalizada' })} checked={s.notifyOps.routeCompletion} onCheckedChange={(v) => setOps('routeCompletion', v)} />
            <ToggleRow label={t('settings.patrol.n.stopSkipped', { defaultValue: 'Parada omitida' })} checked={s.notifyOps.stopSkipped} onCheckedChange={(v) => setOps('stopSkipped', v)} />
            <ToggleRow label={t('settings.patrol.n.missedStop', { defaultValue: 'Parada no visitada' })} checked={s.notifyOps.missedStop} onCheckedChange={(v) => setOps('missedStop', v)} />
            <ToggleRow label={t('settings.patrol.n.criticalFinding', { defaultValue: 'Hallazgo crítico' })} checked={s.notifyOps.criticalFinding} onCheckedChange={(v) => setOps('criticalFinding', v)} />
            <ToggleRow label={t('settings.patrol.n.lateRoute', { defaultValue: 'Ruta retrasada / en riesgo' })} checked={s.notifyOps.lateRoute} onCheckedChange={(v) => setOps('lateRoute', v)} />
            <ToggleRow label={t('settings.patrol.n.routeAborted', { defaultValue: 'Ruta abortada' })} checked={s.notifyOps.routeAborted} onCheckedChange={(v) => setOps('routeAborted', v)} />
          </Section>

          <Section title={t('settings.patrol.client', { defaultValue: 'El cliente' })} icon={<Users2 />}>
            <FormField label={t('settings.patrol.clientNotify', { defaultValue: 'Avisar al cliente de las visitas de supervisión' })}>
              <select className={FIELD_CLS} value={s.clientNotify} onChange={(e) => set('clientNotify', e.target.value as any)}>
                <option value="per_visit">{t('settings.patrol.cn.perVisit', { defaultValue: 'En cada visita' })}</option>
                <option value="route_completion">{t('settings.patrol.cn.routeCompletion', { defaultValue: 'Al terminar la ruta' })}</option>
                <option value="daily">{t('settings.patrol.cn.daily', { defaultValue: 'Resumen diario' })}</option>
                <option value="never">{t('settings.patrol.cn.never', { defaultValue: 'Nunca' })}</option>
              </select>
            </FormField>
            <ToggleRow label={t('settings.patrol.clientPhotos', { defaultValue: 'Fotos visibles al cliente por defecto' })} checked={s.clientVisiblePhotosDefault} onCheckedChange={(v) => set('clientVisiblePhotosDefault', v)} />
            <ToggleRow label={t('settings.patrol.clientInspection', { defaultValue: 'Resultado de la inspección visible al cliente por defecto' })} hint={t('settings.patrol.clientInspectionHint', { defaultValue: 'Sólo los ítems marcados como visibles en la plantilla. Las novedades internas nunca se muestran.' })} checked={s.clientVisibleInspectionDefault} onCheckedChange={(v) => set('clientVisibleInspectionDefault', v)} />
          </Section>

          <SaveBar onSave={save} saving={saving} />
        </Stagger>
      )}
    </SettingsPageShell>
  );
}
