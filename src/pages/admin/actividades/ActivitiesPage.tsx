import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle, LogIn, LogOut, UserCheck, Route, CalendarClock, CalendarDays,
  CheckSquare, Megaphone, Siren, Activity as ActivityIcon, Search, CheckCheck,
  RefreshCw, Inbox, Radio, Loader2,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, StatusBadge, GlassPanel, IconTile, EmptyState, Toolbar, Segmented } from "@/components/kit";
import api from "@/lib/api";
import { fileUrlFromPrivate } from "@/lib/fileUrl";
import { useNotificationStream } from "@/hooks/useNotificationStream";

/* ─────────────────────────────────────────────────────────────────────────
   The activity log is powered by the platform Events API:
     GET  /:tenantId/events            → recent history (last 7 days, ≤50)
     GET  /:tenantId/events/stream     → live SSE feed (via useNotificationStream)
     POST /:tenantId/events/:id/read   → mark read
   Events already arrive with localized `title`/`body` from the backend
   notification templates, so we only translate the page chrome here.
   ───────────────────────────────────────────────────────────────────────── */

type Category = "incident" | "checkin" | "visitor" | "patrol" | "shift" | "other";

interface ActivityEvent {
  id: string;
  eventType: string;
  title: string;
  body?: string;
  createdAt: string;
  read: boolean;
  payload?: any;
}

/**
 * Traduce un tipo de evento del servidor (p. ej. "guard.checkin") a icono, papel
 * de color y categoría de filtro.
 *
 * El papel no es un color: es uno de los del sistema. Un incidente es `bad`
 * pase lo que pase con el acento; una entrada es `ok`; lo que pertenece a la
 * marca (memos, rondas) usa `brand` y cambia con la preferencia del usuario.
 */
type Tone = "brand" | "neutral" | "ok" | "warn" | "bad" | "info";

function visualFor(eventType: string): { Icon: typeof ActivityIcon; tone: Tone; cat: Category } {
  const t = (eventType || "").toLowerCase();
  if (t.startsWith("incident")) return { Icon: AlertTriangle, tone: "bad", cat: "incident" };
  if (t === "guard.late") return { Icon: AlertTriangle, tone: "warn", cat: "incident" };
  if (t === "guard.checkin" || t === "supervisor.checkin") return { Icon: LogIn, tone: "ok", cat: "checkin" };
  if (t === "guard.checkout" || t === "supervisor.checkout") return { Icon: LogOut, tone: "neutral", cat: "checkin" };
  if (t.startsWith("visitor")) return { Icon: UserCheck, tone: "info", cat: "visitor" };
  if (t.startsWith("patrol")) return { Icon: Route, tone: t.includes("missed") ? "warn" : "brand", cat: "patrol" };
  if (t.startsWith("shift")) return { Icon: CalendarClock, tone: "info", cat: "shift" };
  if (t.startsWith("timeoff")) return { Icon: CalendarDays, tone: "info", cat: "shift" };
  if (t.startsWith("task")) return { Icon: CheckSquare, tone: "ok", cat: "other" };
  if (t.startsWith("memo")) return { Icon: Megaphone, tone: "brand", cat: "other" };
  if (t.startsWith("dispatch")) return { Icon: Siren, tone: "bad", cat: "other" };
  return { Icon: ActivityIcon, tone: "neutral", cat: "other" };
}

const FILTERS: Category[] = ["incident", "checkin", "visitor", "patrol", "shift", "other"];

export default function ActivitiesPage() {
  const { t, i18n } = useTranslation();
  const tenantId = localStorage.getItem("tenantId") || "";

  const { notifications: live, markRead: persistRead, connected } = useNotificationStream(tenantId);
  const [history, setHistory] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // filters
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const res = await api.get(`/${tenantId}/events`, {
        params: { limit: 50 },
        toast: { silentError: true },
      } as any);
      const rows = (res.data?.rows ?? []) as any[];
      setHistory(rows.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        title: e.title || e.eventType || "Evento",
        body: e.body,
        createdAt: e.createdAt,
        read: e.deliveryStatus === "read",
        payload: e.payload,
      })));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  // merge live SSE events with fetched history, de-duplicated by id, newest first
  const events = useMemo<ActivityEvent[]>(() => {
    const map = new Map<string, ActivityEvent>();
    history.forEach((e) => map.set(e.id, e));
    live.forEach((n) => map.set(n.id, {
      id: n.id,
      eventType: n.eventType,
      title: n.title || n.eventType || "Evento",
      body: n.body,
      createdAt: n.createdAt,
      read: !!n.read,
      payload: (n as any).payload,
    }));
    return Array.from(map.values()).sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  }, [history, live]);

  const isRead = useCallback((e: ActivityEvent) => e.read || readIds.has(e.id), [readIds]);

  const markRead = useCallback((id: string) => {
    setReadIds((s) => new Set(s).add(id));
    persistRead(id); // POSTs to the server
  }, [persistRead]);

  const markAllRead = useCallback(() => {
    const unread = events.filter((e) => !isRead(e)).map((e) => e.id);
    if (!unread.length) return;
    setReadIds((s) => { const n = new Set(s); unread.forEach((id) => n.add(id)); return n; });
    unread.forEach((id) => persistRead(id));
  }, [events, isRead, persistRead]);

  const unreadCount = useMemo(() => events.filter((e) => !isRead(e)).length, [events, isRead]);

  // apply search + category + unread filters
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (cat !== "all" && visualFor(e.eventType).cat !== cat) return false;
      if (unreadOnly && isRead(e)) return false;
      if (q && !(`${e.title} ${e.body ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [events, query, cat, unreadOnly, isRead]);

  // group filtered events by day bucket (today / yesterday / explicit date)
  const groups = useMemo(() => {
    const locale = i18n.language?.startsWith("en") ? "en-US" : i18n.language?.startsWith("pt") ? "pt-BR" : "es-ES";
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const now = new Date();
    const out: { key: string; label: string; items: ActivityEvent[] }[] = [];
    const byKey = new Map<string, { label: string; items: ActivityEvent[] }>();
    for (const e of filtered) {
      const d = new Date(e.createdAt);
      const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
      let key: string, label: string;
      if (diff <= 0) { key = "today"; label = t("activity.group.today"); }
      else if (diff === 1) { key = "yesterday"; label = t("activity.group.yesterday"); }
      else {
        label = d.toLocaleDateString(locale, {
          day: "numeric", month: "long",
          ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
        });
        key = label;
      }
      if (!byKey.has(key)) { const g = { label, items: [] as ActivityEvent[] }; byKey.set(key, g); out.push({ key, ...g }); }
      byKey.get(key)!.items.push(e);
    }
    return out;
  }, [filtered, t, i18n.language]);

  const timeAgo = useCallback((iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return t("activity.time.now");
    if (s < 3600) return t("activity.time.minsAgo", { n: Math.floor(s / 60) });
    if (s < 86400) return t("activity.time.hoursAgo", { n: Math.floor(s / 3600) });
    return t("activity.time.daysAgo", { n: Math.floor(s / 86400) });
  }, [t]);

  const absoluteTime = useCallback((iso: string) => {
    const locale = i18n.language?.startsWith("en") ? "en-US" : i18n.language?.startsWith("pt") ? "pt-BR" : "es-ES";
    return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  }, [i18n.language]);

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: t("dashboard.title"), path: "/dashboard" },
          { label: t("activity.title") },
        ]}
      />

      <div className="p-4 sm:p-6">
        <PageContainer width="wide">
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <PageHeader
          icon={<ActivityIcon />}
          title={t("activity.title")}
          subtitle={t("activity.subtitle")}
          badges={
            <>
              <StatusBadge tone={connected ? "ok" : "neutral"}>
                <Radio size={12} className={connected ? "animate-pulse" : ""} />
                {connected ? t("activity.live") : t("activity.offline")}
              </StatusBadge>
              {unreadCount > 0 && (
                <StatusBadge tone="brand" dot={false}>
                  {t("activity.unreadCount", { count: unreadCount })}
                </StatusBadge>
              )}
            </>
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={["mr-2 h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
                {t("activity.refresh")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={markAllRead}
                disabled={unreadCount === 0}
              >
                <CheckCheck className="mr-2 h-4 w-4" />
                {t("activity.markAllRead")}
              </Button>
            </>
          }
        />

        {/* ── Barra: búsqueda + categorías + solo sin leer ──────────────────── */}
        <Toolbar className="gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--ink-faint)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("activity.search")}
              className="cg-input cg-focus h-9 w-full pl-9 pr-3 text-sm"
            />
          </div>

          {/* Elegir UNA categoría es exactamente lo que hace `Segmented`; la
              copia local iba 2px más estrecha y con otro fondo inactivo, así que
              cambiar el conmutador del kit rompía la paridad sólo aquí. */}
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            <Segmented<Category | "all">
              value={cat}
              onChange={setCat}
              options={[
                { value: "all", label: t("activity.filters.all") },
                ...FILTERS.map((c) => ({ value: c, label: t(`activity.filters.${c}`) })),
              ]}
            />
          </div>

          <Chip active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
            {t("activity.unreadOnly")}
          </Chip>
        </Toolbar>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <GlassPanel className="overflow-hidden">
          {loading ? (
            <SkeletonList />
          ) : error ? (
            <div className="p-5">
              <EmptyState
                icon={<AlertTriangle />}
                title={t("activity.loadError")}
                action={<Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />{t("activity.refresh")}</Button>}
                className="border-none"
              />
            </div>
          ) : events.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Inbox />}
                title={t("activity.empty.title")}
                description={t("activity.empty.description")}
                className="border-none"
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Search />}
                title={t("activity.noResults.title")}
                description={t("activity.noResults.description")}
                className="border-none"
              />
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
              {groups.map((g) => (
                <div key={g.key}>
                  {/* Cabecera de día pegajosa: fondo OPACO y sin desenfoque. Un
                      `backdrop-filter` aquí se repite por cada grupo y el
                      navegador tendría que rasterizar la lista entera en cada
                      fotograma del desplazamiento. */}
                  <div
                    className="cg-eyebrow sticky top-0 z-10 px-4 py-2"
                    style={{ background: "var(--glass-solid)", borderBottom: "1px solid var(--hairline)" }}
                  >
                    {g.label}
                  </div>
                  {g.items.map((e) => {
                    const { Icon, tone } = visualFor(e.eventType);
                    const read = isRead(e);
                    // NOTE (token migration): inside a .map() callback, so the
                    // useFileUrl hook can't be used (hooks rules), and the event
                    // payload only carries a raw photoUrl privateUrl string (no
                    // companion downloadUrl). Left on fileUrlFromPrivate as a
                    // documented transitional fallback; when the backend adds a
                    // token downloadUrl to the activity payload, switch to it.
                    const photoUrl = fileUrlFromPrivate(e.payload?.photoUrl);
                    return (
                      <button
                        key={e.id}
                        onClick={() => !read && markRead(e.id)}
                        className="cg-focus group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--glass-sunken)]!"
                        style={read ? undefined : { background: "var(--brand-wash)" }}
                      >
                        {/* punto de «sin leer» */}
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={read ? undefined : { background: "var(--brand)", boxShadow: "0 0 10px 0 var(--brand-glow)" }}
                        />
                        <IconTile tone={tone} size="sm" className="mt-0.5">
                          <Icon />
                        </IconTile>
                        <div className="min-w-0 flex-1">
                          <p
                            className={["truncate text-sm", read ? "" : "font-semibold"].join(" ")}
                            style={{ color: read ? "var(--ink-soft)" : "var(--ink)" }}
                          >
                            {e.title}
                          </p>
                          {e.body && <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: "var(--ink-soft)" }}>{e.body}</p>}
                          {photoUrl && (
                            <img
                              src={photoUrl}
                              alt=""
                              loading="lazy"
                              className="mt-2 h-24 w-24 rounded-xl object-cover"
                              style={{ border: "1px solid var(--hairline)" }}
                              onError={(ev) => ((ev.currentTarget.style.display = "none"))}
                            />
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--ink-faint)" }} title={absoluteTime(e.createdAt)}>
                          {timeAgo(e.createdAt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
        </PageContainer>
      </div>
    </AppLayout>
  );
}

/* ── small presentational helpers ─────────────────────────────────────────── */

/* Conmutador de DOS estados (encendido/apagado), que no es lo mismo que elegir
   uno de varios: por eso no es `Segmented`. Las medidas sí son las suyas, para
   que los dos controles de la misma barra tengan la misma altura. */
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="cg-focus rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200"
      style={
        active
          ? { background: "var(--brand)", color: "var(--brand-ink)", boxShadow: "0 0 18px -6px var(--brand-glow)" }
          : { background: "var(--glass-sunken)", color: "var(--ink-soft)" }
      }
    >
      {children}
    </button>
  );
}

function SkeletonList() {
  return (
    <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex items-center gap-2 px-4 py-6 text-sm" style={{ color: "var(--ink-faint)" }}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <span className="cg-skeleton mt-0.5 h-11 w-11 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2 py-1">
            <div className="cg-skeleton h-3 w-1/3" />
            <div className="cg-skeleton h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
