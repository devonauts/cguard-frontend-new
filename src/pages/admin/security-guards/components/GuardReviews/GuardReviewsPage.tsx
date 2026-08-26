import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import GuardsLayout from '@/layouts/GuardsLayout';
import securityGuardService from '@/lib/api/securityGuardService';
import guardRatingService, { GuardRatingRecord } from '@/lib/api/guardRatingService';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, Section, StatCard, EmptyState, PageContainer, SkeletonCards } from '@/components/kit';
import { MeterBar } from '@/components/charts';
import { toast } from 'sonner';
import {
  Star, MessageSquareWarning, FileText, Loader2, Building2, MapPin, Calendar,
} from 'lucide-react';
import type { GuardDetail } from '../../guardDetailTypes';

function Stars({ value, size = 'h-4 w-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={size}
          style={
            i <= Math.round(value)
              ? { fill: 'var(--warn)', color: 'var(--warn)' }
              : { color: 'var(--ink-faint)' }
          }
        />
      ))}
    </span>
  );
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function GuardReviewsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const tenantId = localStorage.getItem('tenantId') || '';

  const [guardName, setGuardName] = useState('');
  const [rows, setRows] = useState<GuardRatingRecord[]>([]);
  const [average, setAverage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // "Generar memo/observación" modal, seeded from a specific review.
  const [action, setAction] = useState<{ review: GuardRatingRecord; type: 'memo' | 'observacion' } | null>(null);
  const [form, setForm] = useState({ subject: '', content: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await guardRatingService.list({ guardId: id, limit: 500 });
      setRows(res.rows || []);
      setAverage(res.average);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    if (!id) return;
    securityGuardService.get(id).then((d: GuardDetail & { guard?: GuardDetail }) => {
      const g = d?.guard ?? d;
      setGuardName(g?.fullName || `${g?.firstName || ''} ${g?.lastName || ''}`.trim());
    }).catch(() => {});
  }, [id]);

  // Star distribution (5→1).
  const dist = useMemo(() => {
    const d = [0, 0, 0, 0, 0];
    rows.forEach((r) => { const n = Math.round(r.rating); if (n >= 1 && n <= 5) d[5 - n]++; });
    return d;
  }, [rows]);
  const total = rows.length;

  const openAction = (review: GuardRatingRecord, type: 'memo' | 'observacion') => {
    const label = type === 'memo' ? 'Memo' : 'Observación';
    setForm({
      subject: `${label} · calificación ${review.rating}★${review.clientName ? ' de ' + review.clientName : ''}`,
      content: review.comment
        ? `En referencia a la reseña del cliente: "${review.comment}".\n\n`
        : '',
    });
    setAction({ review, type });
  };

  const save = async () => {
    if (!action || !id) return;
    if (!form.subject.trim()) { toast.error(t('comun.elAsuntoEsObligatorio')); return; }
    setSaving(true);
    try {
      await api.post(`/tenant/${tenantId}/memos`, {
        data: {
          subject: form.subject.trim(),
          content: form.content.trim(),
          dateTime: new Date().toISOString(),
          guardName: id,
          type: action.type,
          guardRatingId: action.review.id,
          wasAccepted: false,
        },
      });
      toast.success(action.type === 'memo' ? 'Memo enviado al vigilante' : 'Observación registrada');
      setAction(null);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo registrar');
    } finally { setSaving(false); }
  };

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.reviews">
        <PageContainer>
          {/* Summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={<Star />}
              accent="warn"
              label={t('ui.GuardReviewsPage.promedioDelVigilante')}
              value={average != null ? average.toFixed(2) : '—'}
              hint={average != null ? <Stars value={average} /> : undefined}
            />
            <StatCard icon={<MessageSquareWarning />} accent="brand" label={t("ui.GuardReviews.resenasRecibidas", "Reseñas recibidas")} value={total} />
            {/* Tercera ficha de la MISMA fila: mismas medidas y misma etiqueta
                que las otras dos, o se lee como un hueco. */}
            <Section title={t("ui.GuardReviews.distribucion", "Distribución")} className="p-4" contentClassName="space-y-1">
              {dist.map((c, i) => {
                const starVal = 5 - i;
                const pct = total ? Math.round((c / total) * 100) : 0;
                return (
                  <div key={starVal} className="flex items-center gap-2 text-xs">
                    <span className="w-3 tabular-nums" style={{ color: 'var(--ink-soft)' }}>{starVal}</span>
                    <Star className="h-3 w-3" style={{ fill: 'var(--warn)', color: 'var(--warn)' }} />
                    <MeterBar className="flex-1" pct={pct} height={6} tone="warn" ariaLabel={`${starVal} estrellas`} />
                    <span className="w-6 text-right tabular-nums" style={{ color: 'var(--ink-soft)' }}>{c}</span>
                  </div>
                );
              })}
            </Section>
          </div>

          {/* Reviews list */}
          <Section title={t("ui.GuardReviews.resenasDeClientes", "Reseñas de clientes")} icon={<Star className="h-4 w-4" />}>
            {guardName && (
              <p className="mb-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
                Calificaciones enviadas por los clientes sobre {guardName}.
              </p>
            )}
            {loading ? (
              <SkeletonCards count={2} className="sm:grid-cols-1" />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Star className="h-5 w-5" />}
                title={t("ui.GuardReviews.sinResenasTodavia", "Sin reseñas todavía")}
                description={t('ui.GuardReviewsPage.cuandoUnClienteCalifiqueA')}
              />
            ) : (
              <div className="space-y-3">
                {rows.map((r) => (
                  <div key={r.id} className="glass-flat glass-hover p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Stars value={r.rating} />
                          <span className="text-sm font-semibold tabular-nums">{r.rating}.0</span>
                        </div>
                        {r.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{r.comment}</p>}
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {r.clientName && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {r.clientName}</span>}
                          {r.stationName && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {r.stationName}</span>}
                          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(r.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => openAction(r, 'memo')}>
                          <FileText className="mr-1.5 h-3.5 w-3.5" /> Generar memo
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openAction(r, 'observacion')}>
                          <MessageSquareWarning className="mr-1.5 h-3.5 w-3.5" /> Observación
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </PageContainer>

        {/* Generate memo/observación modal */}
        <Modal
          open={!!action}
          onOpenChange={(o) => { if (!o && !saving) setAction(null); }}
          title={action?.type === 'memo' ? 'Generar memo' : 'Registrar observación'}
          icon={action?.type === 'memo' ? <FileText className="h-5 w-5" /> : <MessageSquareWarning className="h-5 w-5" />}
          size="md"
          footer={
            <>
              <Button variant="outline" onClick={() => setAction(null)} disabled={saving}>{t('actions.cancel')}</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Guardando…</> : (action?.type === 'memo' ? 'Enviar memo' : 'Registrar')}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {action?.type === 'memo'
                ? 'El memo se envía al vigilante y queda en su historial (con acuse de recibo).'
                : 'La observación queda en el historial interno del vigilante para conversar sobre el servicio.'}
              {' '}Origen: reseña de {action?.review.clientName || 'cliente'} ({action?.review.rating}★).
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Asunto</label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Contenido</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={6}
                className="cg-input w-full resize-none px-3 py-2 text-sm leading-relaxed"
                placeholder={t('ui.GuardReviewsPage.detalleParaConversarConEl')}
              />
            </div>
          </div>
        </Modal>
      </GuardsLayout>
    </AppLayout>
  );
}
