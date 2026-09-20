import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  Plus,
  Clock,
  Pencil,
  Trash2,
  X,
  ClipboardList,
  Loader2,
  Repeat,
  CalendarDays,
  AlertCircle,
  Bell,
  Video,
  Mic,
  User,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { stationOrderService } from "@/lib/api/stationOrderService";
import {
  Section,
  EmptyState,
  SkeletonCards,
  StatusBadge,
  Segmented,
  SmartImage,
} from "@/components/kit";
import {
  FIELD_CLS_LG,
  LabeledField,
} from "@/pages/admin/clientes/components/_shared/tab-kit";
import { Button } from "@/components/ui/button";
import type { Station } from "@/types";

import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
type Props = { station: Station; stationId: string; postSiteId: string };

type Recurrence =
  | "daily"
  | "weekdays"
  | "weekend"
  | "weekly"
  | "monthly"
  | "once";
interface Order {
  id?: string;
  title: string;
  description?: string;
  time?: string;
  recurrence: Recurrence;
  days?: number[];
  dayOfMonth?: number | null;
  date?: string | null;
  priority: "baja" | "media" | "alta";
  active: boolean;
  notifyEnabled: boolean;
  notifyMinutesBefore: number;
}

const EMPTY: Order = {
  title: "",
  description: "",
  time: "",
  recurrence: "daily",
  days: [],
  dayOfMonth: null,
  date: null,
  priority: "media",
  active: true,
  notifyEnabled: true,
  notifyMinutesBefore: 0,
};
const API_BASE = (import.meta as any).env?.VITE_API_URL || "";
const fileUrl = (u?: string | null) => (u ? `${API_BASE}${u}` : null);
const DOW = ["D", "L", "M", "X", "J", "V", "S"]; // Sun..Sat (index = JS getDay)
const DOW_FULL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
// La prioridad de la consigna se lee con los semánticos fijos del sistema.
const PRIO: Record<string, { label: string; tone: "bad" | "warn" | "info" }> = {
  alta: { label: "Alta", tone: "bad" as const },
  media: { label: "Media", tone: "warn" as const },
  baja: { label: "Baja", tone: "info" as const },
};

function recurrenceSummary(o: Order, t: any): string {
  switch (o.recurrence) {
    case "daily":
      return t("station.orders.rec.daily", "Todos los días");
    case "weekdays":
      return t("station.orders.rec.weekdays", "Lunes a viernes");
    case "weekend":
      return t("station.orders.rec.weekend", "Fines de semana");
    case "weekly":
      return o.days && o.days.length
        ? t("station.orders.rec.weeklyDays", "Cada {{days}}", {
            days: o.days
              .slice()
              .sort()
              .map((d) => DOW_FULL[d])
              .join(", "),
          })
        : t("station.orders.rec.weekly", "Semanal");
    case "monthly":
      return t("station.orders.rec.monthly", "Día {{n}} de cada mes", {
        n: o.dayOfMonth || 1,
      });
    case "once":
      return o.date
        ? t("station.orders.rec.onceDate", "El {{date}}", { date: o.date })
        : t("station.orders.rec.once", "Una sola vez");
    default:
      return "";
  }
}

export default function StationOrders({ stationId }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<Order | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"list" | "log">("list");

  const load = async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const res: any = await stationOrderService.list(stationId);
      const list = Array.isArray(res) ? res : (res?.rows ?? []);
      setRows(
        list.map((r: any) => ({
          ...r,
          days: Array.isArray(r.days)
            ? r.days
            : (() => {
                try {
                  return JSON.parse(r.days || "[]");
                } catch {
                  return [];
                }
              })(),
        })),
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("station.orders.loadError", "No se pudieron cargar las consignas"),
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [stationId]);

  const save = async () => {
    if (!modal) return;
    if (!modal.title.trim()) {
      toast.error(
        t("station.orders.titleRequired", "El título es obligatorio"),
      );
      return;
    }
    setSaving(true);
    try {
      const payload = { ...modal, title: modal.title.trim() };
      if (modal.id)
        await stationOrderService.update(stationId, modal.id, payload);
      else await stationOrderService.create(stationId, payload);
      toast.success(t("station.orders.saved", "Consigna guardada"));
      setModal(null);
      await load();
    } catch (e: any) {
      toast.error(
        e?.message || t("station.orders.saveError", "No se pudo guardar"),
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (o: Order) => {
    if (!o.id) return;
    if (
      !(await confirmDialog({
        title: "Eliminar consigna",
        message: t("station.orders.confirmDelete", "¿Eliminar esta consigna?"),
        confirmText: "Eliminar",
        tone: "danger",
      }))
    )
      return;
    try {
      await stationOrderService.remove(stationId, o.id);
      setRows((r) => r.filter((x) => x.id !== o.id));
      toast.success(t("station.orders.deleted", "Consigna eliminada"));
    } catch (e: any) {
      toast.error(
        e?.message || t("station.orders.deleteError", "No se pudo eliminar"),
      );
    }
  };

  const toggleActive = async (o: Order) => {
    if (!o.id) return;
    try {
      await stationOrderService.update(stationId, o.id, { active: !o.active });
      setRows((r) =>
        r.map((x) => (x.id === o.id ? { ...x, active: !o.active } : x)),
      );
    } catch (e: any) {
      toast.error(e?.message || "Error");
    }
  };

  return (
    <div className="space-y-4">
      {/* header */}
      <Section
        icon={<ClipboardList />}
        title={t("station.orders.title", "Consignas específicas")}
        action={
          /* El selector y el botón juntos pasan de 380 px: en un teléfono tienen
             que poder caer uno debajo del otro o sacan la cabecera de pantalla. */
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Segmented
              value={view}
              onChange={(v) => setView(v)}
              options={[
                {
                  value: "list",
                  label: t("station.orders.tabList", "Consignas"),
                },
                {
                  value: "log",
                  label: t("station.orders.tabLog", "Registro de actividad"),
                },
              ]}
            />
            {view === "list" && (
              <Button
                variant="brand"
                size="sm"
                onClick={() => setModal({ ...EMPTY })}
              >
                <Plus size={16} /> {t("station.orders.add", "Agregar consigna")}
              </Button>
            )}
          </div>
        }
      >
        <p className="-mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
          {t(
            "station.orders.subtitle",
            "Requisitos recurrentes que los vigilantes deben completar en esta estación.",
          )}
        </p>
      </Section>

      {view === "log" ? (
        <ActivityLog
          stationId={stationId}
          t={t as unknown as (key: string, def?: string) => string}
        />
      ) : /* list */ loading ? (
        <SkeletonCards count={4} className="lg:grid-cols-2" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title={t("station.orders.emptyTitle", "Sin consignas")}
          description={t(
            "station.orders.emptyHint",
            "Agrega tareas recurrentes (por ejemplo: abrir los baños públicos a las 09:00) que el vigilante deberá completar.",
          )}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((o) => (
            <div
              key={o.id}
              className={`glass-flat glass-hover p-4 ${o.active ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">
                      {o.title}
                    </h3>
                    <StatusBadge
                      tone={PRIO[o.priority]?.tone || "warn"}
                      dot={false}
                      className="shrink-0"
                    >
                      {PRIO[o.priority]?.label || o.priority}
                    </StatusBadge>
                  </div>
                  {o.description && (
                    <p
                      className="mt-0.5 line-clamp-2 text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {o.description}
                    </p>
                  )}
                  <div
                    className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {o.time && (
                      <span className="flex items-center gap-1">
                        <Clock
                          size={12}
                          style={{ color: "var(--brand-text)" }}
                        />
                        {o.time}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Repeat
                        size={12}
                        style={{ color: "var(--brand-text)" }}
                      />
                      {recurrenceSummary(o, t)}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => toggleActive(o)}
                    aria-pressed={o.active}
                    title={
                      o.active
                        ? t("station.orders.deactivate", "Desactivar")
                        : t("station.orders.activate", "Activar")
                    }
                    className="cg-focus relative h-5 w-9 rounded-full transition-colors"
                    style={{
                      background: o.active
                        ? "var(--brand)"
                        : "var(--glass-sunken)",
                    }}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${o.active ? "left-[18px]" : "left-0.5"}`}
                      style={{
                        background: o.active
                          ? "var(--brand-ink)"
                          : "var(--ink-faint)",
                      }}
                    />
                  </button>
                  <button
                    onClick={() => setModal({ ...o })}
                    aria-label={t("station.orders.edit", "Editar consigna")}
                    className="cg-btn-ghost cg-focus rounded-md p-1.5"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => remove(o)}
                    aria-label={t("actions.delete", "Eliminar")}
                    className="cg-focus rounded-md p-1.5"
                    style={{ color: "var(--bad-text)" }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <OrderModal
          value={modal}
          onChange={setModal}
          onClose={() => setModal(null)}
          onSave={save}
          saving={saving}
          t={
            t as unknown as (
              key: string,
              def?: string,
              opts?: Record<string, unknown>,
            ) => string
          }
        />
      )}
    </div>
  );
}

function OrderModal({
  value,
  onChange,
  onClose,
  onSave,
  saving,
  t,
}: {
  value: Order;
  onChange: (o: Order) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  t: (key: string, def?: string, opts?: Record<string, unknown>) => string;
}) {
  const o: Order = value;
  const set = (patch: Partial<Order>) => onChange({ ...o, ...patch });
  const toggleDay = (d: number) =>
    set({
      days: o.days?.includes(d)
        ? o.days.filter((x) => x !== d)
        : [...(o.days || []), d],
    });

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="glass-scrim absolute inset-0" />
      <div
        className="glass-raised relative max-h-[90vh] w-full max-w-lg overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">
            {o.id
              ? t("station.orders.edit", "Editar consigna")
              : t("station.orders.add", "Agregar consigna")}
          </h3>
          <button
            onClick={onClose}
            aria-label={t("actions.close", "Cerrar")}
            className="cg-btn-ghost cg-focus rounded-lg p-1.5"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <LabeledField label={t("station.orders.fTitle", "Título")}>
            <input
              className={FIELD_CLS_LG}
              value={o.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={t(
                "station.orders.fTitlePh",
                "Ej: Abrir baños públicos",
              )}
            />
          </LabeledField>
          <LabeledField label={t("station.orders.fDesc", "Descripción")}>
            <textarea
              className={FIELD_CLS_LG}
              rows={2}
              value={o.description || ""}
              onChange={(e) => set({ description: e.target.value })}
              placeholder={t(
                "station.orders.fDescPh",
                "Detalles de lo que debe hacerse...",
              )}
            />
          </LabeledField>

          <div className="grid grid-cols-2 gap-3">
            <LabeledField
              label={
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {t("station.orders.fTime", "Hora")}
                </span>
              }
            >
              <input
                type="time"
                className={FIELD_CLS_LG}
                value={o.time || ""}
                onChange={(e) => set({ time: e.target.value })}
              />
            </LabeledField>
            <LabeledField
              label={
                <span className="flex items-center gap-1">
                  <AlertCircle size={12} />
                  {t("station.orders.fPriority", "Prioridad")}
                </span>
              }
            >
              <select
                className={FIELD_CLS_LG}
                value={o.priority}
                onChange={(e) => set({ priority: e.target.value as any })}
              >
                <option value="alta">
                  {t("station.orders.prio.alta", "Alta")}
                </option>
                <option value="media">
                  {t("station.orders.prio.media", "Media")}
                </option>
                <option value="baja">
                  {t("station.orders.prio.baja", "Baja")}
                </option>
              </select>
            </LabeledField>
          </div>

          <LabeledField
            label={
              <span className="flex items-center gap-1">
                <Repeat size={12} />
                {t("station.orders.fRecurrence", "Recurrencia")}
              </span>
            }
          >
            <select
              className={FIELD_CLS_LG}
              value={o.recurrence}
              onChange={(e) =>
                set({ recurrence: e.target.value as Recurrence })
              }
            >
              <option value="daily">
                {t("station.orders.rec.daily", "Todos los días")}
              </option>
              <option value="weekdays">
                {t("station.orders.rec.weekdays", "Lunes a viernes")}
              </option>
              <option value="weekend">
                {t("station.orders.rec.weekend", "Fines de semana")}
              </option>
              <option value="weekly">
                {t(
                  "station.orders.recSel.weekly",
                  "Días específicos de la semana",
                )}
              </option>
              <option value="monthly">
                {t("station.orders.recSel.monthly", "Mensual")}
              </option>
              <option value="once">
                {t("station.orders.recSel.once", "Una sola vez")}
              </option>
            </select>
          </LabeledField>

          {o.recurrence === "weekly" && (
            <LabeledField label={t("station.orders.fDays", "Días")}>
              <div className="flex gap-1.5">
                {DOW.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    aria-pressed={!!o.days?.includes(i)}
                    className="cg-focus grid h-9 w-9 place-items-center rounded-lg border text-xs font-semibold transition-colors"
                    style={
                      o.days?.includes(i)
                        ? {
                            background: "var(--brand)",
                            borderColor: "var(--brand)",
                            color: "var(--brand-ink)",
                          }
                        : {
                            borderColor: "var(--hairline)",
                            color: "var(--ink-soft)",
                          }
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            </LabeledField>
          )}
          {o.recurrence === "monthly" && (
            <LabeledField
              label={t("station.orders.fDayOfMonth", "Día del mes")}
            >
              <input
                type="number"
                min={1}
                max={31}
                className={`${FIELD_CLS_LG} w-24`}
                value={o.dayOfMonth || ""}
                onChange={(e) =>
                  set({ dayOfMonth: Number(e.target.value) || null })
                }
              />
            </LabeledField>
          )}
          {o.recurrence === "once" && (
            <LabeledField
              label={
                <span className="flex items-center gap-1">
                  <CalendarDays size={12} />
                  {t("station.orders.fDate", "Fecha")}
                </span>
              }
            >
              <input
                type="date"
                className={FIELD_CLS_LG}
                value={o.date || ""}
                onChange={(e) => set({ date: e.target.value })}
              />
            </LabeledField>
          )}

          {/* Notifications */}
          <div className="glass-sunken p-3">
            <label className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Bell size={14} style={{ color: "var(--brand-text)" }} />
                {t(
                  "station.orders.fNotify",
                  "Avisar a los vigilantes en su teléfono",
                )}
              </span>
              <button
                type="button"
                aria-pressed={o.notifyEnabled}
                onClick={() => set({ notifyEnabled: !o.notifyEnabled })}
                className="cg-focus relative h-5 w-9 rounded-full transition-colors"
                style={{
                  background: o.notifyEnabled
                    ? "var(--brand)"
                    : "var(--glass-sunken)",
                }}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${o.notifyEnabled ? "left-[18px]" : "left-0.5"}`}
                  style={{
                    background: o.notifyEnabled
                      ? "var(--brand-ink)"
                      : "var(--ink-faint)",
                  }}
                />
              </button>
            </label>
            {o.notifyEnabled && (
              <div
                className="mt-2 flex items-center gap-2 text-sm"
                style={{ color: "var(--ink-soft)" }}
              >
                <span>{t("station.orders.fNotifyBefore", "Avisar")}</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  className={`${FIELD_CLS_LG} w-20`}
                  value={o.notifyMinutesBefore}
                  onChange={(e) =>
                    set({ notifyMinutesBefore: Number(e.target.value) || 0 })
                  }
                />
                <span>
                  {t("station.orders.fNotifyMin", "minutos antes de la hora")}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {t("common.cancel", "Cancelar")}
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="cg-btn-brand cg-focus flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}{" "}
            {t("common.save", "Guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A guard's completion of a station consigna, with captured evidence. */
interface CompletionPhoto {
  downloadUrl?: string | null;
}
interface CompletionRow {
  id?: string;
  order?: { title?: string; time?: string } | null;
  guardName?: string;
  completedAt: string;
  note?: string;
  photos?: CompletionPhoto[];
  videoDownloadUrl?: string | null;
  audioDownloadUrl?: string | null;
}

/** Activity log — guard completions of this station's consignas, with evidence. */
function ActivityLog({
  stationId,
  t,
}: {
  stationId: string;
  t: (key: string, def?: string) => string;
}) {
  const [rows, setRows] = useState<CompletionRow[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!stationId) return;
    setLoading(true);
    stationOrderService
      .completions(stationId)
      .then((res: any) => setRows(Array.isArray(res) ? res : (res?.rows ?? [])))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [stationId]);

  if (loading) return <SkeletonCards count={3} className="sm:grid-cols-1" />;
  if (!rows.length)
    return (
      <EmptyState
        icon={<CheckCircle2 />}
        title={t("station.orders.logEmpty", "Sin actividad registrada")}
        description={t(
          "station.orders.logEmptyHint",
          "Cuando un vigilante complete una consigna, aparecerá aquí con su evidencia.",
        )}
      />
    );

  return (
    <div className="space-y-3">
      {/* `glass-flat` y no `glass`: el registro de actividad se repite por fila y
          un `backdrop-filter` por fila tumba el desplazamiento. */}
      {rows.map((c) => (
        <div key={c.id} className="glass-flat p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="grid h-8 w-8 place-items-center rounded-lg"
                style={{
                  background: "color-mix(in oklab, var(--ok) 14%, transparent)",
                  color: "var(--ok-text)",
                }}
              >
                <CheckCircle2 size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {c.order?.title || t("station.orders.order", "Consigna")}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <User size={11} />
                  {c.guardName || "—"} ·{" "}
                  {new Date(c.completedAt).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa(),
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </div>
            {c.order?.time && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock size={11} />
                {c.order.time}
              </span>
            )}
          </div>
          {c.note && (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-foreground">
              <FileText
                size={13}
                className="mt-0.5 shrink-0 text-muted-foreground"
              />
              {c.note}
            </p>
          )}
          {(c.photos?.length || c.videoDownloadUrl || c.audioDownloadUrl) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(c.photos || []).map(
                (ph: CompletionPhoto, i: number) =>
                  fileUrl(ph.downloadUrl) && (
                    <a
                      key={i}
                      href={fileUrl(ph.downloadUrl)!}
                      target="_blank"
                      rel="noreferrer"
                      className="block h-16 w-16 overflow-hidden rounded-lg border border-border"
                    >
                      <SmartImage
                        src={fileUrl(ph.downloadUrl)!}
                        alt=""
                        rounded="rounded-none"
                        className="h-full w-full"
                      />
                    </a>
                  ),
              )}
              {c.videoDownloadUrl && (
                <a
                  href={fileUrl(c.videoDownloadUrl)!}
                  target="_blank"
                  rel="noreferrer"
                  className="cg-btn-glass cg-focus flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs"
                >
                  <Video size={14} />{" "}
                  {t("station.orders.viewVideo", "Ver video")}
                </a>
              )}
              {c.audioDownloadUrl && (
                <span className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
                  <Mic size={13} className="text-muted-foreground" />
                  <audio
                    src={fileUrl(c.audioDownloadUrl)!}
                    controls
                    className="h-7"
                  />
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
