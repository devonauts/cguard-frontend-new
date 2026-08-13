import { useParams } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import GuardsLayout from '@/layouts/GuardsLayout';
import { useEffect, useState } from 'react';
import securityGuardService from '@/lib/api/securityGuardService';
import { toast } from 'sonner';
import { Settings, Clock, CalendarDays, Bell, Save } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { PageContainer, PageHeader, Section, SkeletonCards, EmptyState } from '@/components/kit';
import { Button } from '@/components/ui/button';
import type { GuardDetail } from '../../guardDetailTypes';

// Per-guard operational settings: a flat map of feature toggles/intervals
// persisted on the guard record under `settings`.
interface GuardSettings {
  allowCallOffShiftBefore?: boolean;
  allowClockInBeforeSchedule?: boolean;
  allowCreateTaskMobile?: boolean;
  allowEmailReport?: boolean;
  allowExchangeShiftWithoutApproval?: boolean;
  allowGuardSetAvailability?: boolean;
  allowViewOtherReports?: boolean;
  askReasonAfter?: string;
  askReasonRemainingClockedIn?: boolean;
  autoAssignConfirmOpenShiftFirstWhoAccepts?: boolean;
  autoCheckInWhenClockedIn?: boolean;
  autoCheckOutWhenClockedOut?: boolean;
  autoClockInBasedOnSchedule?: boolean;
  autoClockOutAfter?: string | number;
  autoClockOutBasedOnSchedule?: boolean;
  autoConfirmPublishedShifts?: boolean;
  callOffBefore?: string;
  disableChats?: boolean;
  disableManualClockIn?: boolean;
  enableAutoApproveAvailabilityHours?: boolean;
  enableAutoApproveReports?: boolean;
  enableAutoApproveTimeLogs?: boolean;
  enableCheckOutBeforeClockOut?: boolean;
  enableClockInInsideGeofence?: boolean;
  enableClockInOutNotes?: boolean;
  enableClockOutInsideGeofence?: boolean;
  enableFallAlert?: boolean;
  enableForceCloseCheckOut?: boolean;
  enableGpsTracking?: boolean;
  enableIdleAlert?: boolean;
  enableUploadFromGallery?: boolean;
  enableWeeklyLimitFlag?: boolean;
  enforceFacialRecognition?: boolean;
  forceAcknowledgeDocs?: boolean;
  idleAlertAfter?: string;
  licenseExpiryDays?: string | number;
  locationAccuracy?: string;
  locationUpdateInterval?: string;
  sendLicenseExpiryNotification?: boolean;
  sendShiftDelayNotification?: boolean;
  sendShiftStartNotification?: boolean;
  sendTaskDelayNotification?: boolean;
  sendTaskStartNotification?: boolean;
  sendVehiclePatrolDelayNotification?: boolean;
  sendVehiclePatrolStartNotification?: boolean;
  shiftDelayTime?: string;
  shiftStartBefore?: string;
  taskDelayAfter?: string;
  taskStartBefore?: string;
  vehiclePatrolDelayTime?: string;
  vehiclePatrolStartBefore?: string;
  weeklyLimit?: string | number;
  [k: string]: string | number | boolean | undefined;
}
type ConfigGuard = GuardDetail & { settings?: GuardSettings };

export default function GuardConfiguracionPage() {
  const { id } = useParams();
  const [guard, setGuard] = useState<ConfigGuard | null>(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<GuardSettings>({});
  const [activeTab, setActiveTab] = useState<'general' | 'time' | 'scheduler' | 'notifications'>('general');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);
    securityGuardService
      .get(id)
      .then((data: ConfigGuard & { guard?: ConfigGuard }) => {
        if (!mounted) return;
        const g = data.guard ?? data;
        const fullName = g.fullName ?? `${g.firstName ?? ''} ${g.lastName ?? ''}`.trim();
        setGuard({ ...g, fullName });
        setSettings(g.settings ?? {});
      })
      .catch((err: unknown) => {
        console.error('Error cargando vigilante:', err);
        toast.error('No se pudo cargar vigilante');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [id]);

  const handleSaveConfirmed = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await securityGuardService.update(id, { settings });
      toast.success('Configuración guardada');
      // refresh guard
      const refreshed = await securityGuardService.get(id);
      const g = refreshed.guard ?? refreshed;
      const fullName = g.fullName ?? `${g.firstName ?? ''} ${g.lastName ?? ''}`.trim();
      setGuard({ ...g, fullName });
      setSettings(g.settings ?? {});
      setConfirmOpen(false);
    } catch (err: any) {
      console.error('Error guardando configuración:', err);
      toast.error('No se pudo guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.configuracion">
        <PageContainer>
          <PageHeader
            icon={<Settings />}
            title={'Configuración'}
            subtitle={guard?.fullName
              ? `Ajustes operativos del vigilante · ${guard.fullName}`
              : 'Ajustes operativos del vigilante.'}
            actions={
              <Button variant="brand" disabled={!id || saving} onClick={() => setConfirmOpen(true)}>
                <Save size={16} />
                Save Settings
              </Button>
            }
          />

          {loading ? (
            <SkeletonCards count={4} />
          ) : guard ? (
            <Section className="relative">
              {/* Tabs */}
              <div className="border-b">
                {(() => {
                  const tabs = [
                    { key: 'general' as const, label: 'General', icon: <Settings size={15} /> },
                    { key: 'time' as const, label: 'Time Clock', icon: <Clock size={15} /> },
                    { key: 'scheduler' as const, label: 'Scheduler', icon: <CalendarDays size={15} /> },
                    { key: 'notifications' as const, label: 'Notifications', icon: <Bell size={15} /> },
                  ];
                  return (
                    <nav className="grid grid-cols-4 text-sm">
                      {tabs.map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => setActiveTab(tab.key)}
                          className={`flex items-center justify-center gap-2 py-3 font-medium transition-colors ${activeTab === tab.key ? 'border-b-2 brand-text [border-color:var(--brand)]' : '[color:var(--ink-soft)] hover:[color:var(--ink)]'}`}
                        >
                          {tab.icon}
                          {tab.label}
                        </button>
                      ))}
                    </nav>
                  );
                })()}
              </div>

              <div className="py-6">
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <label className="flex items-center gap-3">
                        <input type="checkbox" className="w-4 h-4" checked={!!settings.enableUploadFromGallery} onChange={e => setSettings({...settings, enableUploadFromGallery: e.target.checked})} />
                        <span>Enable guard to upload the media from gallery</span>
                      </label>

                      <label className="flex items-center gap-3">
                        <input type="checkbox" className="w-4 h-4" checked={!!settings.forceAcknowledgeDocs} onChange={e => setSettings({...settings, forceAcknowledgeDocs: e.target.checked})} />
                        <span>Force guard to acknowledge and sign docs & company policies before using the app.</span>
                      </label>

                      <label className="flex items-center gap-3">
                        <input type="checkbox" className="w-4 h-4" checked={!!settings.allowCreateTaskMobile} onChange={e => setSettings({...settings, allowCreateTaskMobile: e.target.checked})} />
                        <span>Allow guards to create task for himself in mobile app</span>
                      </label>

                      <label className="flex items-center gap-3">
                        <input type="checkbox" className="w-4 h-4" checked={!!settings.enableFallAlert} onChange={e => setSettings({...settings, enableFallAlert: e.target.checked})} />
                        <span>Enable guard/device fall alert in mobile app</span>
                      </label>
                    </div>

                    <div className="space-y-4">
                      <label className="flex items-center gap-3">
                        <input type="checkbox" className="w-4 h-4" checked={!!settings.enableAutoApproveReports} onChange={e => setSettings({...settings, enableAutoApproveReports: e.target.checked})} />
                        <span>Enable auto approve reports</span>
                      </label>

                      <label className="flex items-center gap-3">
                        <input type="checkbox" className="w-4 h-4" checked={!!settings.enableGpsTracking} onChange={e => setSettings({...settings, enableGpsTracking: e.target.checked})} />
                        <span>Enable GPS Tracking</span>
                      </label>

                      <div className="flex items-center gap-4">
                        <div className="max-w-xs">
                          <label className="cg-eyebrow mb-1.5 block">Update location every</label>
                          <select className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.locationUpdateInterval ?? '00:05:00'} onChange={e => setSettings({...settings, locationUpdateInterval: e.target.value})}>
                            <option>00:05:00</option>
                            <option>00:10:00</option>
                            <option>00:15:00</option>
                          </select>
                        </div>

                        <div className="max-w-xs">
                          <label className="cg-eyebrow mb-1.5 block">Select Accuracy</label>
                          <select className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.locationAccuracy ?? 'Medium'} onChange={e => setSettings({...settings, locationAccuracy: e.target.value})}>
                            <option>Low</option>
                            <option>Medium</option>
                            <option>High</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-3">
                          <input type="checkbox" className="w-4 h-4" checked={!!settings.enableIdleAlert} onChange={e => setSettings({...settings, enableIdleAlert: e.target.checked})} />
                          <span>Enable idle alert after</span>
                        </label>

                        <div className="max-w-xs">
                          <select className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.idleAlertAfter ?? '00:20'} onChange={e => setSettings({...settings, idleAlertAfter: e.target.value})}>
                            <option>00:05</option>
                            <option>00:10</option>
                            <option>00:20</option>
                            <option>00:30</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4" checked={!!settings.allowEmailReport} onChange={e => setSettings({...settings, allowEmailReport: e.target.checked})} />
                      <span>Allow guard to email report</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4" checked={!!settings.disableChats} onChange={e => setSettings({...settings, disableChats: e.target.checked})} />
                      <span>Disable creating group and individual chats for guards</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4" checked={!!settings.allowViewOtherReports} onChange={e => setSettings({...settings, allowViewOtherReports: e.target.checked})} />
                      <span>Allow guard to view other guards submitted reports</span>
                    </label>
                  </div>
                </div>
              )}

              {activeTab === 'time' && (
                <div className="space-y-4">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.disableManualClockIn} onChange={e => setSettings({...settings, disableManualClockIn: e.target.checked})} />
                    <span>Disable manual clock-in</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.enableAutoApproveTimeLogs} onChange={e => setSettings({...settings, enableAutoApproveTimeLogs: e.target.checked})} />
                    <span>Enable auto approve time logs</span>
                  </label>
                  
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.autoClockOutAfter24h} onChange={e => setSettings({...settings, autoClockOutAfter24h: e.target.checked})} />
                    <span>Automatically clock-out guard after 24 hours of working</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.enableClockInOutNotes} onChange={e => setSettings({...settings, enableClockInOutNotes: e.target.checked})} />
                    <span>Enable clock-in and clock-out notes</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.enableForceCloseCheckOut} onChange={e => setSettings({...settings, enableForceCloseCheckOut: e.target.checked})} />
                    <span>Enable clock-out and check-out when app is force closed</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.enableCheckOutBeforeClockOut} onChange={e => setSettings({...settings, enableCheckOutBeforeClockOut: e.target.checked})} />
                    <span>Enable check-out before clock-out</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.autoCheckInWhenClockedIn} onChange={e => setSettings({...settings, autoCheckInWhenClockedIn: e.target.checked})} />
                    <span>Automatically Check-In when Clocked-In</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.autoCheckOutWhenClockedOut} onChange={e => setSettings({...settings, autoCheckOutWhenClockedOut: e.target.checked})} />
                    <span>Automatically Check-Out when Clocked-Out</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.enableClockInInsideGeofence} onChange={e => setSettings({...settings, enableClockInInsideGeofence: e.target.checked})} />
                    <span>Enable Clock-In inside geofence</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.enableClockOutInsideGeofence} onChange={e => setSettings({...settings, enableClockOutInsideGeofence: e.target.checked})} />
                    <span>Enable Clock-Out inside geofence</span>
                  </label>

                  <div className="flex items-start gap-4">
                    <label className="flex items-center gap-3 mt-1">
                      <input type="checkbox" className="w-4 h-4" checked={!!settings.enableWeeklyLimitFlag} onChange={e => setSettings({...settings, enableWeeklyLimitFlag: e.target.checked})} />
                      <span>
                        Enable guard weekly work hour limit flag when worked over (
                        <span className="mx-1 font-semibold">{settings.weeklyLimit ?? 40}</span>
                        ) hrs/week
                      </span>
                    </label>
                  </div>

                  {settings.enableWeeklyLimitFlag && (
                    <div className="max-w-xs">
                      <label className="cg-eyebrow mb-1.5 block">Weekly Limit</label>
                      <input type="number" min={1} className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.weeklyLimit ?? 40} onChange={e => setSettings({...settings, weeklyLimit: Number(e.target.value)})} />
                      <div className="text-sm text-muted-foreground mt-1">hrs/week</div>
                    </div>
                  )}

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.enforceFacialRecognition} onChange={e => setSettings({...settings, enforceFacialRecognition: e.target.checked})} />
                    <span>Enforce facial recognition before clock-in and clock-out</span>
                  </label>
                </div>
              )}

              {activeTab === 'scheduler' && (
                <div className="space-y-4">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.allowClockInBeforeSchedule} onChange={e => setSettings({...settings, allowClockInBeforeSchedule: e.target.checked})} />
                    <span>Allow guard to clock-in before schedule start time</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.allowExchangeShiftWithoutApproval} onChange={e => setSettings({...settings, allowExchangeShiftWithoutApproval: e.target.checked})} />
                    <span>Allow guard to exchange shift without approval</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.autoClockInBasedOnSchedule} onChange={e => setSettings({...settings, autoClockInBasedOnSchedule: e.target.checked})} />
                    <span>Allow system to auto clock-in based on scheduled time</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.autoClockOutBasedOnSchedule} onChange={e => setSettings({...settings, autoClockOutBasedOnSchedule: e.target.checked})} />
                    <span>Allow system to auto clock-out based on scheduled time</span>
                  </label>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4" checked={!!settings.askReasonRemainingClockedIn} onChange={e => setSettings({...settings, askReasonRemainingClockedIn: e.target.checked})} />
                      <span>Ask for a reason for remaining Clocked-In when the shift is over after</span>
                    </label>
                    <div className="max-w-xs">
                      <select className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.askReasonAfter ?? '00:05'} onChange={e => setSettings({...settings, askReasonAfter: e.target.value})}>
                        <option>00:05</option>
                        <option>00:10</option>
                        <option>00:15</option>
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.allowGuardSetAvailability} onChange={e => setSettings({...settings, allowGuardSetAvailability: e.target.checked})} />
                    <span>Allow guard to set availability</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.enableAutoApproveAvailabilityHours} onChange={e => setSettings({...settings, enableAutoApproveAvailabilityHours: e.target.checked})} />
                    <span>Enable auto approve availability hours</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.autoAssignConfirmOpenShiftFirstWhoAccepts} onChange={e => setSettings({...settings, autoAssignConfirmOpenShiftFirstWhoAccepts: e.target.checked})} />
                    <span>Automatically assign and confirm open shift for the first guard who accepts the shift</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="w-4 h-4" checked={!!settings.autoConfirmPublishedShifts} onChange={e => setSettings({...settings, autoConfirmPublishedShifts: e.target.checked})} />
                    <span>Auto confirm published shifts</span>
                  </label>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4" checked={!!settings.allowCallOffShiftBefore} onChange={e => setSettings({...settings, allowCallOffShiftBefore: e.target.checked})} />
                      <span>Allow guard to call-off shift before</span>
                    </label>
                    <div className="max-w-xs">
                      <select className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.callOffBefore ?? '00:30'} onChange={e => setSettings({...settings, callOffBefore: e.target.value})}>
                        <option>00:05</option>
                        <option>00:10</option>
                        <option>00:15</option>
                        <option>00:30</option>
                        <option>01:00</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4" checked={!!settings.sendLicenseExpiryNotification} onChange={e => setSettings({...settings, sendLicenseExpiryNotification: e.target.checked})} />
                      <span className="flex items-center gap-2">Send license expiry notification before</span>
                      <div className="w-20">
                        <input type="number" min={0} className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.licenseExpiryDays ?? 60} onChange={e => setSettings({...settings, licenseExpiryDays: Number(e.target.value)})} />
                      </div>
                      <span>Day</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4" checked={!!settings.sendVehiclePatrolStartNotification} onChange={e => setSettings({...settings, sendVehiclePatrolStartNotification: e.target.checked})} />
                      <span>Send vehicle patrol route start notification before</span>
                      <div className="max-w-xs">
                        <select className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.vehiclePatrolStartBefore ?? '01:00'} onChange={e => setSettings({...settings, vehiclePatrolStartBefore: e.target.value})}>
                          <option>00:15</option>
                          <option>00:30</option>
                          <option>01:00</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" className="w-4 h-4" checked={!!settings.sendVehiclePatrolDelayNotification} onChange={e => setSettings({...settings, sendVehiclePatrolDelayNotification: e.target.checked})} />
                        <span>Send vehicle patrol route delay notification</span>
                      </div>
                      <div className="ml-10">
                        <div className="text-sm text-muted-foreground mb-2">Delay Time</div>
                        <div className="max-w-xs">
                          <select className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.vehiclePatrolDelayTime ?? '00:15'} onChange={e => setSettings({...settings, vehiclePatrolDelayTime: e.target.value})}>
                            <option>00:05</option>
                            <option>00:10</option>
                            <option>00:15</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4" checked={!!settings.sendTaskStartNotification} onChange={e => setSettings({...settings, sendTaskStartNotification: e.target.checked})} />
                      <span>Task/Tour start notification before</span>
                      <div className="max-w-xs">
                        <select className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.taskStartBefore ?? '00:15'} onChange={e => setSettings({...settings, taskStartBefore: e.target.value})}>
                          <option>00:05</option>
                          <option>00:10</option>
                          <option>00:15</option>
                          <option>00:30</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4" checked={!!settings.sendTaskDelayNotification} onChange={e => setSettings({...settings, sendTaskDelayNotification: e.target.checked})} />
                      <span>Send Task/Tour delay notification after</span>
                      <div className="max-w-xs">
                        <select className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.taskDelayAfter ?? '00:05'} onChange={e => setSettings({...settings, taskDelayAfter: e.target.value})}>
                          <option>00:05</option>
                          <option>00:10</option>
                          <option>00:15</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4" checked={!!settings.sendShiftStartNotification} onChange={e => setSettings({...settings, sendShiftStartNotification: e.target.checked})} />
                      <span>Send shift start notification before</span>
                      <div className="max-w-xs">
                        <select className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.shiftStartBefore ?? '01:00'} onChange={e => setSettings({...settings, shiftStartBefore: e.target.value})}>
                          <option>00:15</option>
                          <option>00:30</option>
                          <option>01:00</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" className="w-4 h-4" checked={!!settings.sendShiftDelayNotification} onChange={e => setSettings({...settings, sendShiftDelayNotification: e.target.checked})} />
                        <span>Send shift delay notification</span>
                      </div>
                      <div className="ml-10">
                        <div className="text-sm text-muted-foreground mb-2">Delay Time</div>
                        <div className="max-w-xs">
                          <select className="cg-input cg-focus h-9 w-full px-3 text-sm" value={settings.shiftDelayTime ?? '00:15'} onChange={e => setSettings({...settings, shiftDelayTime: e.target.value})}>
                            <option>00:05</option>
                            <option>00:10</option>
                            <option>00:15</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </div>

              {/* Confirm dialog */}
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar cambios</AlertDialogTitle>
                    <AlertDialogDescription>¿Desea guardar estos ajustes para {guard.fullName}?</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSaveConfirmed}>
                      {saving ? 'Guardando...' : 'Sí, guardar'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Section>
          ) : (
            <EmptyState
              icon={<Settings />}
              title="No se pudo cargar el vigilante"
            />
          )}
        </PageContainer>
      </GuardsLayout>
    </AppLayout>
  );
}
