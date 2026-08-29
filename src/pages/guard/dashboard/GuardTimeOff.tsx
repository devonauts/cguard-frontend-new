import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarOff, Loader2, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import guardMeService from '@/lib/api/guardMeService';
import { PageContainer, PageHeader, Section, EmptyState, FadeIn } from '@/components/kit';
import { Button } from '@/components/ui/button';

import { localeActual } from '@/lib/localeActual'
export default function GuardTimeOff() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [type, setType] = useState('vacaciones');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await guardMeService.timeOffList();
      setRows(res?.rows || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async () => {
    if (!startDate || !endDate) {
      toast.error(t('guard.timeOff.pickDates', 'Selecciona fechas de inicio y fin'));
      return;
    }
    setSaving(true);
    try {
      await guardMeService.timeOffCreate({ type, startDate, endDate, reason });
      toast.success('Solicitud enviada');
      setShowForm(false);
      setType('vacaciones');
      setStartDate('');
      setEndDate('');
      setReason('');
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'Error al enviar solicitud');
    } finally {
      setSaving(false);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle size={14} style={{ color: 'var(--ok-text)' }} />;
      case 'rejected': return <XCircle size={14} style={{ color: 'var(--bad-text)' }} />;
      default: return <Clock size={14} style={{ color: 'var(--warn-text)' }} />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'approved': return 'Aprobado';
      case 'rejected': return 'Rechazado';
      default: return 'Pendiente';
    }
  };

  const fmtDay = (v: any) => {
    if (!v) return '-';
    try { return new Intl.DateTimeFormat(localeActual(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(v)); }
    catch { return String(v); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <PageContainer width="narrow" className="px-4 pt-4 sm:px-6 sm:pt-6">
      <PageHeader
        icon={<CalendarOff />}
        title={t('guard.timeOff.title', 'Mis Permisos')}
        subtitle="Solicita y consulta tus permisos"
        actions={
          <Button variant="brand" onClick={() => setShowForm(!showForm)}>
            <Plus size={16} /> Solicitar
          </Button>
        }
      />

      {/* New Request Form */}
      {showForm && (
        <FadeIn>
          <Section title={t('ui.GuardTimeOff.nuevaSolicitud')}>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{t('comun.tipo')}</label>
                <select value={type} onChange={e => setType(e.target.value)} className="w-full h-9 px-2.5 border border-input bg-background rounded-lg text-sm">
                  <option value="vacaciones">Vacaciones</option>
                  <option value="enfermedad">Enfermedad</option>
                  <option value="personal">Personal</option>
                  <option value="calamidad">{t("ui.GuardTimeOff.calamidadDomestica", "Calamidad doméstica")}</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{t('comun.desde')}</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full h-9 px-2.5 border border-input bg-background rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{t('comun.hasta')}</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full h-9 px-2.5 border border-input bg-background rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{t('comun.motivoOpcional')}</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="w-full px-2.5 py-2 border border-input bg-background rounded-lg text-sm resize-none" placeholder={t('ui.GuardTimeOff.describeElMotivo')} />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={() => setShowForm(false)}>{t('actions.cancel')}</Button>
                <Button variant="brand" onClick={handleSubmit} disabled={saving}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : 'Enviar'}
                </Button>
              </div>
            </div>
          </Section>
        </FadeIn>
      )}

      {/* Existing requests */}
      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarOff />}
          title={t('ui.GuardTimeOff.sinSolicitudes')}
          description={t('ui.GuardTimeOff.noTienesSolicitudesDePermiso', 'No tienes solicitudes de permiso.')}
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r: any) => (
            <div key={r.id} className="cg-card cg-card-hover p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground capitalize">{r.type || 'Permiso'}</p>
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  {statusIcon(r.status)}
                  {statusLabel(r.status)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {fmtDay(r.startDate)} — {fmtDay(r.endDate)}
              </p>
              {r.reason && <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
