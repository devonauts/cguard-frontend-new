import { useParams } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import GuardsLayout from '@/layouts/GuardsLayout';
import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import securityGuardService from '@/lib/api/securityGuardService';
import { toast } from 'sonner';
import { Search, ChevronDown, Plus, X, Paperclip, Filter, BellRing } from 'lucide-react';
import TimeInput from '@/components/TimeInput';
import MultiCombobox from '@/components/app/multicombobox';
import MobileCardList from '@/components/responsive/MobileCardList';
import { PageContainer, PageHeader, Section, EmptyState, IconTile } from "@/components/kit";
import { Button } from '@/components/ui/button';
import type { GuardDetail } from '../../guardDetailTypes';

/** A selectable guard in the "Created For" multi-select. */
interface GuardOption {
  id: string;
  fullName: string;
  status: string;
}

/**
 * A reminder row. NOTE: reminders are held only in local component state — there
 * is no reminder API wired, so they are lost on reload (see FLAGGED in audit).
 */
interface Reminder {
  id: string;
  title: string;
  description: string;
  datetime: string;
  createdFor: string[];
  createdForNames: string[];
  createdBy: string;
  priority: string;
  remind: string;
  repeat: string;
  status: string;
  attachments: File[];
}

export default function GuardRemindersPage() {
  const { id } = useParams();
  const [guard, setGuard] = useState<GuardDetail | null>(null);
  const [guardsList, setGuardsList] = useState<GuardOption[]>([]);
  const guardsMapRef = useRef<Record<string,string>>({});
  const [loading, setLoading] = useState(false);
  const actionRef = useRef<HTMLDivElement>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const { t } = useTranslation();
  const [actionSelection, setActionSelection] = useState<string>(() => t('guards.reminders.action.default', { defaultValue: 'Action' }));
  const [searchQuery, setSearchQuery] = useState('');
  const [remindOpen, setRemindOpen] = useState(false);
  const remindContainerRef = useRef<HTMLDivElement | null>(null);
  const remindOptionsRef = useRef<HTMLDivElement | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState('All');
  const [remindersData, setRemindersData] = useState<Reminder[]>([]);
  const [selectedReminderIds, setSelectedReminderIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    datetime: new Date().toISOString().slice(0,16), // yyyy-mm-ddThh:mm
    createdFor: [] as string[],
    priority: 'Normal',
    remind: '30 Minutes Before',
    repeat: 'Never',
    status: 'Open',
    attachments: [] as File[],
  });

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);
    securityGuardService
      .get(id)
      .then((data: GuardDetail & { guard?: GuardDetail }) => {
        if (!mounted) return;
        const g = data.guard ?? data;
        const fullName = g.fullName ?? `${g.firstName ?? ''} ${g.lastName ?? ''}`.trim();
        setGuard({ ...g, fullName });
      })
      .catch((err: unknown) => {
        console.error('Error cargando vigilante:', err);
        toast.error(t('guards.reminders.toasts.loadError', { defaultValue: 'Could not load guard' }));
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [id]);

  // load guards for Created For multi-select
  useEffect(() => {
    let mounted = true;
    securityGuardService
      .list()
      .then((data: GuardDetail[] | { rows?: GuardDetail[] }) => {
        if (!mounted) return;
        const items: GuardDetail[] = Array.isArray(data) ? data : data?.rows ?? [];
        const list: GuardOption[] = items.map((it) => {
          const g = (it.guard ?? it) as GuardDetail;
          const gid = g.id ?? it.guardId ?? it.id ?? '';
          const fullName = g.fullName ?? `${g.firstName ?? ''} ${g.lastName ?? ''}`.trim();
          const status = (g.status ?? it.status ?? '').toString().toLowerCase();
          return { id: gid, fullName: fullName || '-', status };
        }).filter((x) => x.id && x.status !== 'pending' && x.status !== 'pendiente');
        setGuardsList(list);
        const map: Record<string,string> = {};
        list.forEach((g) => map[g.id] = g.fullName);
        guardsMapRef.current = map;
      })
      .catch((err: unknown) => {
        console.error('Error loading guards list:', err);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!remindOpen) return;
    const handleDocClick = (e: MouseEvent) => {
      if (remindContainerRef.current && !remindContainerRef.current.contains(e.target as Node)) {
        setRemindOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);

    // on open, scroll selected option to top of the list
    const container = remindOptionsRef.current;
    if (container) {
      const selector = container.querySelector(`[data-value="${formData.remind}"]`) as HTMLElement | null;
      if (selector && typeof selector.scrollIntoView === 'function') {
        // align selected option to start so options appear above
        selector.scrollIntoView({ block: 'start' });
      }
    }

    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [remindOpen, formData.remind]);

  const handleAddReminder = () => {
    setShowModal(true);
    setFormData({ title: '', description: '', datetime: new Date().toISOString().slice(0,16), createdFor: guard?.id ? [guard.id] : [], priority: 'Normal', remind: '30 Minutes Before', repeat: 'Never', status: 'Open', attachments: [] });
  };

  const handleCloseModal = () => setShowModal(false);

  const handleSubmitReminder = () => {
    const newRem = {
      title: formData.title,
      description: formData.description,
      datetime: formData.datetime,
      createdFor: formData.createdFor,
      createdForNames: (formData.createdFor || []).map((id: string) => guardsMapRef.current[id] || id),
      createdBy: 'You',
      priority: formData.priority,
      remind: formData.remind,
      repeat: formData.repeat,
      status: formData.status,
      attachments: formData.attachments,
      id: Date.now().toString() + Math.random().toString(36).slice(2,7),
    };
    setRemindersData((prev) => [newRem, ...prev]);
    setShowModal(false);
    setFormData({ title: '', description: '', datetime: new Date().toISOString().slice(0,16), createdFor: [], priority: 'Normal', remind: '30 Minutes Before', repeat: 'Never', status: 'Open', attachments: [] });
  };

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.recordatorios">
        <PageContainer>
          <PageHeader
            icon={<BellRing />}
            title={t('guards.reminders.title', { defaultValue: 'Recordatorios' })}
            subtitle={guard?.fullName
              ? `${t('guards.reminders.subtitle', { defaultValue: 'Recordatorios programados para el vigilante.' })} · ${guard.fullName}`
              : t('guards.reminders.subtitle', { defaultValue: 'Recordatorios programados para el vigilante.' })}
            actions={
              <>
                <Button variant="outline" onClick={() => setShowFilters(true)}>
                  <Filter className="h-4 w-4 text-foreground/70" />
                  {t('guards.reminders.filters.button', { defaultValue: 'Filters' })}
                </Button>
                <Button variant="brand" onClick={handleAddReminder}>
                  <Plus size={16} />
                  {t('guards.reminders.addReminder', { defaultValue: 'Add Reminder' })}
                </Button>
              </>
            }
          />

          <Section
            title={t('guards.reminders.feedTitle', { defaultValue: 'Historial de recordatorios' })}
            icon={<BellRing />}
            action={
              <div className="flex items-center gap-2">
                <div className="relative" ref={actionRef}>
                  <button
                    onClick={() => setActionOpen(!actionOpen)}
                    className="cg-btn-glass cg-focus flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold min-w-[100px]"
                  >
                    {actionSelection}
                    <ChevronDown size={16} />
                  </button>
                  {actionOpen && (
                    <div className="glass-raised absolute left-0 z-10 mt-1 w-full overflow-hidden" style={{ position: 'absolute' }}>
                      <button
                        onClick={() => { setActionSelection(t('guards.reminders.actions.archive', { defaultValue: 'Archive' })); setActionOpen(false); }}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        {t('guards.reminders.actions.archive', { defaultValue: 'Archive' })}
                      </button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder={t('guards.reminders.searchPlaceholder', { defaultValue: 'Search reminders' })}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="cg-input w-56 py-2 pl-8 pr-3 text-sm"
                  />
                </div>
              </div>
            }
          >
            {/* Table */}
            <div>
              <div className="md:block hidden overflow-x-auto">
                <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                      <input
                        type="checkbox"
                        aria-label="select all"
                        checked={remindersData.length > 0 && selectedReminderIds.length === remindersData.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedReminderIds(remindersData.map((r) => r.id));
                          else setSelectedReminderIds([]);
                        }}
                        className="h-4 w-4"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('guards.reminders.table.title', { defaultValue: 'Title' })}</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('guards.reminders.table.datetime', { defaultValue: 'Reminder Date/Time' })}</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('guards.reminders.table.createdBy', { defaultValue: 'Created By' })}</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('guards.reminders.table.priority', { defaultValue: 'Priority' })}</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{t('guards.reminders.table.status', { defaultValue: 'Status' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {remindersData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6">
                        <EmptyState
                          icon={<BellRing />}
                          title={t('guards.reminders.empty.title', { defaultValue: 'No Result Found' })}
                          description={t('guards.reminders.empty.description', { defaultValue: "We can't find any item matching your search" })}
                        />
                      </td>
                    </tr>
                  ) : (
                    remindersData.map((r, idx) => (
                      <tr key={r.id ?? idx} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedReminderIds.includes(r.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedReminderIds((prev) => [...prev, r.id]);
                              else setSelectedReminderIds((prev) => prev.filter((id) => id !== r.id));
                            }}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">{r.title}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{r.datetime}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{r.createdForNames ? r.createdForNames.join(', ') : r.createdBy}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{r.priority}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{r.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                </table>
              </div>

              <div className="md:hidden">
                <MobileCardList
                  items={remindersData || []}
                  loading={false}
                  emptyMessage={t('guards.reminders.empty.title', { defaultValue: 'No Result Found' }) as string}
                  renderCard={(r: Reminder) => (
                    <div className="glass-flat p-4">
                      <div className="text-sm font-semibold">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{r.datetime} • {r.createdBy}</div>
                    </div>
                  )}
                />
              </div>
            </div>
          </Section>

          {/* Modal */}
          {showModal && (
            <div className="glass-scrim fixed inset-0 z-50" onClick={handleCloseModal}>
              <div className="glass-raised fixed bottom-0 right-0 top-0 w-96 overflow-y-auto rounded-l-3xl rounded-r-none" style={{ position: 'fixed' }} onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 flex items-center justify-between border-b p-6" style={{ borderColor: 'var(--hairline)', background: 'var(--glass-solid)' }}>
                  <div className="flex items-center gap-2.5">
                    <IconTile size="sm"><BellRing /></IconTile>
                    <h2 className="text-base font-semibold text-foreground">{t('guards.reminders.modal.title', { defaultValue: 'Add Reminder' })}</h2>
                  </div>
                  <button onClick={handleCloseModal} className="text-muted-foreground hover:text-foreground/70"><X /></button>
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">{t('guards.reminders.form.title', { defaultValue: 'Title' })} <span style={{ color: 'var(--bad-text)' }}>*</span></label>
                    <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder={t('guards.reminders.form.titlePlaceholder', { defaultValue: 'Title*' })} className="cg-input w-full px-3 py-2 text-sm" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">{t('guards.reminders.form.description', { defaultValue: 'Description' })}</label>
                    <textarea value={formData.description ?? ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={t('guards.reminders.form.descriptionPlaceholder', { defaultValue: 'Description' })} className="cg-input w-full resize-none px-3 py-2 text-sm" rows={4} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('guards.reminders.form.selectedDate', { defaultValue: 'Selected Date' })}<span style={{ color: 'var(--bad-text)' }}>*</span></label>
                      <input type="date" value={formData.datetime ? formData.datetime.split('T')[0] : ''} onChange={(e) => setFormData({ ...formData, datetime: `${e.target.value}T${(formData.datetime || '').split('T')[1] || '09:00'}` })} className="cg-input w-full px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('guards.reminders.form.at', { defaultValue: 'At' })}<span style={{ color: 'var(--bad-text)' }}>*</span></label>
                      <TimeInput value={formData.datetime ? (formData.datetime.split('T')[1] || '').slice(0,5) : '09:00'} onChange={(val) => setFormData({ ...formData, datetime: `${(formData.datetime || '').split('T')[0] || new Date().toISOString().slice(0,10)}T${val}` })} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">{t('guards.reminders.form.createdFor', { defaultValue: 'Created For' })}<span style={{ color: 'var(--bad-text)' }}>*</span></label>
                    <MultiCombobox
                      value={formData.createdFor}
                      onChange={(vals) => setFormData({ ...formData, createdFor: vals })}
                      options={guardsList.map((g) => ({ value: g.id, label: g.fullName }))}
                      placeholder={t('guards.reminders.form.selectGuards', { defaultValue: 'Select guards' })}
                      aria-label="Created For"
                      className="w-full h-14"
                      popoverClassName="min-w-[20rem]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">{t('guards.reminders.form.priority', { defaultValue: 'Priority' })}<span style={{ color: 'var(--bad-text)' }}>*</span></label>
                    <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} className="cg-input w-full px-3 py-2 text-sm">
                      <option>{t('guards.reminders.priority.low', { defaultValue: 'Low' })}</option>
                      <option>{t('guards.reminders.priority.medium', { defaultValue: 'Medium' })}</option>
                      <option>{t('guards.reminders.priority.high', { defaultValue: 'High' })}</option>
                    </select>
                  </div>

                  <div className="relative" ref={remindContainerRef}>
                    <label className="block text-sm font-medium text-foreground mb-2">{t('guards.reminders.form.remind', { defaultValue: 'Remind' })}</label>
                    <button
                      type="button"
                      onClick={() => setRemindOpen((s) => !s)}
                      className="w-full px-3 py-2 border rounded-md text-sm flex items-center justify-between"
                    >
                      <span className="text-foreground">{t(`guards.reminders.remindOptions.${(formData.remind ?? '30 Minutes Before').replace(/\s+/g, '_')}`, { defaultValue: formData.remind ?? '30 Minutes Before' })}</span>
                      <ChevronDown size={16} />
                    </button>

                    {remindOpen && (
                      <div ref={remindOptionsRef} className="glass-raised absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto" style={{ position: 'absolute' }}>
                        {[
                          '30 Minutes Before',
                          '1 Hour Before',
                          '2 Hours Before',
                          '4 Hours Before',
                          '8 Hours Before',
                          '1 Day Before',
                          '2 Days Before',
                          '4 Days Before',
                          '8 Days Before',
                          '2 Weeks Before',
                          '4 Weeks Before',
                        ].map((opt) => (
                          <button
                            key={opt}
                            data-value={opt}
                            onClick={() => { setFormData({ ...formData, remind: opt }); setRemindOpen(false); }}
                            className={`w-full text-left px-4 py-3 hover:bg-muted/30 text-sm ${formData.remind === opt ? 'bg-muted' : ''}`}
                          >
                            {t(`guards.reminders.remindOptions.${opt.replace(/\s+/g, '_')}`, { defaultValue: opt })}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">{t('guards.reminders.form.repeat', { defaultValue: 'Repeat' })}</label>
                    <select value={formData.repeat ?? 'Never'} onChange={(e) => setFormData({ ...formData, repeat: e.target.value })} className="cg-input w-full px-3 py-2 text-sm">
                      <option>{t('guards.reminders.repeat.never', { defaultValue: 'Never' })}</option>
                      <option>{t('guards.reminders.repeat.1_week', { defaultValue: '1 Week' })}</option>
                      <option>{t('guards.reminders.repeat.2_weeks', { defaultValue: '2 Weeks' })}</option>
                      <option>{t('guards.reminders.repeat.3_weeks', { defaultValue: '3 Weeks' })}</option>
                      <option>{t('guards.reminders.repeat.monthly', { defaultValue: 'Monthly' })}</option>
                      <option>{t('guards.reminders.repeat.yearly', { defaultValue: 'Yearly' })}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">{t('guards.reminders.form.attachment', { defaultValue: 'Attachment' })}</label>
                    <label className="relative w-full border rounded-md px-3 py-2 flex items-center justify-between text-sm text-foreground/70 cursor-pointer">
                      <span className="truncate">{formData.attachments && formData.attachments.length > 0 ? formData.attachments.map(f => f.name).join(', ') : t('guards.reminders.form.attachmentPlaceholder', { defaultValue: 'Attachment' })}</span>
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <input type="file" multiple onChange={(e) => { const files = e.target.files ? Array.from(e.target.files) : []; setFormData({ ...formData, attachments: files }); }} className="absolute inset-0 opacity-0 cursor-pointer" />
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-6 border-t sticky bottom-0 [background:var(--glass-solid)]">
                  <Button variant="brand" onClick={handleSubmitReminder}>{t('guards.reminders.modal.save', { defaultValue: 'Save' })}</Button>
                </div>
              </div>
            </div>
          )}

          {/* Filters Modal */}
          {showFilters && (
            <div className="glass-scrim fixed inset-0 z-50" onClick={() => setShowFilters(false)}>
              <div className="glass-raised fixed bottom-0 right-0 top-0 w-80 overflow-y-auto rounded-l-3xl rounded-r-none" style={{ position: 'fixed' }} onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 flex items-center justify-between border-b p-6" style={{ borderColor: 'var(--hairline)', background: 'var(--glass-solid)' }}>
                  <div className="flex items-center gap-2.5">
                    <IconTile size="sm"><Filter /></IconTile>
                    <h2 className="text-base font-semibold text-foreground">{t('guards.reminders.filters.title', { defaultValue: 'Filters' })}</h2>
                  </div>
                  <button onClick={() => setShowFilters(false)} className="text-muted-foreground hover:text-foreground/70"><X /></button>
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">{t('guards.reminders.filters.status', { defaultValue: 'Status' })}<span style={{ color: 'var(--bad-text)' }}>*</span></label>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="cg-input w-full px-3 py-2 text-sm">
                      <option>{t('guards.reminders.filters.options.all', { defaultValue: 'All' })}</option>
                      <option>{t('guards.reminders.filters.options.pending', { defaultValue: 'Pending' })}</option>
                      <option>{t('guards.reminders.filters.options.completed', { defaultValue: 'Completed' })}</option>
                      <option>{t('guards.reminders.filters.options.archived', { defaultValue: 'Archived' })}</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-6 border-t sticky bottom-0 [background:var(--glass-solid)]">
                  <Button variant="outline" onClick={() => setShowFilters(false)}>{t('guards.reminders.filters.cancel', { defaultValue: 'Cancel' })}</Button>
                  <Button variant="brand" onClick={() => { /* TODO: apply filters */ setShowFilters(false); }}>{t('guards.reminders.filters.apply', { defaultValue: 'Apply' })}</Button>
                </div>
              </div>
            </div>
          )}
        </PageContainer>
      </GuardsLayout>
    </AppLayout>
  );
}
