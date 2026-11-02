import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  LogIn,
  LogOut,
  UserCheck,
  Route,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  Megaphone,
  Siren,
  Activity as ActivityIcon,
  Search,
  CheckCheck,
  RefreshCw,
  Inbox,
  Radio,
  Loader2,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  GlassPanel,
  IconTile,
  EmptyState,
  Toolbar,
  Segmented,
  SmartImage,
  SearchInput,
} from "@/components/kit";
import { useFileUrl } from "@/lib/fileUrl";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import { targetForNotification } from "@/components/notifications/notificationToast";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

/* ─────────────────────────────────────────────────────────────────────────
   The activity log is powered by the platform Events API:
     GET  /:tenantId/events            → recent history (last 7 days, ≤50)
     GET  /:tenantId/events/stream     → live SSE feed (via useNotificationStream)
     POST /:tenantId/events/:id/read   → mark read
   Events already arrive with localized `title`/`body` from the backend
   notification templates, so we only translate the page chrome here.
   ───────────────────────────────────────────────────────────────────────── */

type Category =
  | "incident"
  | "checkin"
  | "visitor"
  | "patrol"
  | "shift"
  | "other";

interface ActivityEvent {
  id: string;
  eventType: string;
  title: string;
  body?: string;
  createdAt: string;
  read: boolean;
  payload?: any;
  /** La entidad que originó el evento (turno, incidente, tarea…). Es lo que
   *  convierte una fila en un enlace: sin ella sólo se puede llegar a la lista. */
  sourceEntityType?: string;
  sourceEntityId?: string;
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

function visualFor(eventType: string): {
  Icon: typeof ActivityIcon;
  tone: Tone;
  cat: Category;
} {
  const t = (eventType || "").toLowerCase();

  if (t.startsWith("incident"))
    return { Icon: AlertTriangle, tone: "bad", cat: "incident" };
  if (t === "guard.late")
    return { Icon: AlertTriangle, tone: "warn", cat: "incident" };
  if (t === "guard.checkin" || t === "supervisor.checkin")
    return { Icon: LogIn, tone: "ok", cat: "checkin" };
  if (t === "guard.checkout" || t === "supervisor.checkout")
    return { Icon: LogOut, tone: "neutral", cat: "checkin" };
  if (t.startsWith("visitor"))
    return { Icon: UserCheck, tone: "info", cat: "visitor" };
  if (t.startsWith("patrol"))
    return {
      Icon: Route,
      tone: t.includes("missed") ? "warn" : "brand",
      cat: "patrol",
    };
  if (t.startsWith("shift"))
    return { Icon: CalendarClock, tone: "info", cat: "shift" };
  if (t.startsWith("timeoff"))
    return { Icon: CalendarDays, tone: "info", cat: "shift" };
  if (t.startsWith("task"))
    return { Icon: CheckSquare, tone: "ok", cat: "other" };
  if (t.startsWith("memo"))
    return { Icon: Megaphone, tone: "brand", cat: "other" };
  if (t.startsWith("dispatch"))
    return { Icon: Siren, tone: "bad", cat: "other" };

  return { Icon: ActivityIcon, tone: "neutral", cat: "other" };
}

const FILTERS: Category[] = [
  "incident",
  "checkin",
  "visitor",
  "patrol",
  "shift",
  "other",
];

/**
 * El `payload` del evento llega como objeto por el canal en vivo (el servidor ya
 * lo interpreta), pero la lista histórica lo devuelve tal cual sale de la base de
 * datos y según el conector puede venir como texto. Si llega como texto,
 * `payload.photoUrl` es `undefined` y la foto desaparece sin dar ni un error.
 */
function parsePayload(raw: any): any {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export default function ActivitiesPage() {
  const { t, i18n } = useTranslation();
  const tenantId = localStorage.getItem("tenantId") || "";

  /* EL HISTORIAL VIENE DEL MISMO HOOK QUE LOS EVENTOS EN VIVO.
     Antes esta pantalla montaba el hook (que ya siembra el historial reciente)
     Y ADEMÁS pedía `GET /:tenantId/events` por su cuenta con otro `limit`:
     dos peticiones al mismo endpoint separadas por 3 ms en cada visita. Ahora
     el hook siembra `MAX_STORED` filas —las mismas que esta lista puede
     mostrar— y expone `refresh` para el botón «Actualizar». */
  const {
    notifications: live,
    markRead: persistRead,
    markAllRead: persistAllRead,
    connected,
    seeding: loading,
    seedError: error,
    refresh: load,
  } = useNotificationStream(tenantId);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // filters
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const navigate = useNavigate();
  // Un aviso cuyo destino es esta misma página llega como `/activities?focus=<id>`
  // (el respaldo de targetForNotification). Sin leer el parámetro, ese enlace
  // dejaba al usuario en lo alto de una lista de 50 filas buscando la suya.
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");

  // historial + eventos en vivo, ya deduplicados por id dentro del hook
  const events = useMemo<ActivityEvent[]>(() => {
    const map = new Map<string, ActivityEvent>();

    live.forEach((n) =>
      map.set(n.id, {
        id: n.id,
        eventType: n.eventType,
        title: n.title || n.eventType || t("ui.ActivitiesPage.evento", "Evento"),
        body: n.body,
        createdAt: n.createdAt,
        read: !!n.read,
        payload: parsePayload((n as any).payload),
        sourceEntityType: n.sourceEntityType,
        sourceEntityId: n.sourceEntityId,
      }),
    );

    return Array.from(map.values()).sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  }, [live, t]);

  const isRead = useCallback(
    (e: ActivityEvent) => e.read || readIds.has(e.id),
    [readIds],
  );

  const markRead = useCallback(
    (id: string) => {
      setReadIds((s) => new Set(s).add(id));
      persistRead(id); // POSTs to the server
    },
    [persistRead],
  );

  const markAllRead = useCallback(() => {
    const unread = events.filter((e) => !isRead(e)).map((e) => e.id);

    if (!unread.length) return;
    setReadIds((s) => {
      const n = new Set(s);

      unread.forEach((id) => n.add(id));

      return n;
    });
    // One POST /events/read-all, not one request per row (49 in a row).
    persistAllRead();
  }, [events, isRead, persistAllRead]);

  /**
   * Una fila NO es un checkbox de «leído»: es el evento. Antes el clic sólo lo
   * marcaba como leído y ahí terminaba — para ver la entrada de turno, el
   * incidente o la ronda había que adivinar en qué pantalla vivía. Ahora lleva
   * al mismo sitio al que lleva el aviso emergente y la campana, con el mismo
   * mapa de destinos (`targetForNotification`), y de paso lo marca leído.
   */
  const openEvent = useCallback(
    (e: ActivityEvent) => {
      if (!isRead(e)) markRead(e.id);
      const destino = targetForNotification({
        id: e.id,
        eventType: e.eventType,
        title: e.title,
        body: e.body || "",
        payload: e.payload,
        sourceEntityType: e.sourceEntityType,
        sourceEntityId: e.sourceEntityId,
        createdAt: e.createdAt,
      });

      // El respaldo de ese mapa es esta misma página: navegar a ella recargaría la
      // lista para dejarte donde ya estás. En ese caso basta con quedarse y que el
      // resaltado de `?focus=` haga su trabajo.
      if (destino.startsWith("/activities")) return;
      navigate(destino);
    },
    [isRead, markRead, navigate],
  );

  const unreadCount = useMemo(
    () => events.filter((e) => !isRead(e)).length,
    [events, isRead],
  );

  // apply search + category + unread filters
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return events.filter((e) => {
      if (cat !== "all" && visualFor(e.eventType).cat !== cat) return false;
      if (unreadOnly && isRead(e)) return false;
      if (q && !`${e.title} ${e.body ?? ""}`.toLowerCase().includes(q))
        return false;

      return true;
    });
  }, [events, query, cat, unreadOnly, isRead]);

  // group filtered events by day bucket (today / yesterday / explicit date)
  const groups = useMemo(() => {
    const locale = localeActual();
    const startOfDay = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const now = new Date();
    const out: { key: string; label: string; items: ActivityEvent[] }[] = [];
    const byKey = new Map<string, { label: string; items: ActivityEvent[] }>();

    for (const e of filtered) {
      const d = new Date(e.createdAt);
      const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
      let key: string, label: string;

      if (diff <= 0) {
        key = "today";
        label = t("activity.group.today");
      } else if (diff === 1) {
        key = "yesterday";
        label = t("activity.group.yesterday");
      } else {
        label = d.toLocaleDateString(locale, { timeZone: zonaDeLaEmpresa(),
          day: "numeric",
          month: "long",
          ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
        });
        key = label;
      }
      if (!byKey.has(key)) {
        const g = { label, items: [] as ActivityEvent[] };

        byKey.set(key, g);
        out.push({ key, ...g });
      }
      byKey.get(key)!.items.push(e);
    }

    return out;
  }, [filtered, t, i18n.language]);

  const timeAgo = useCallback(
    (iso: string) => {
      const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

      if (s < 60) return t("activity.time.now");
      if (s < 3600)
        return t("activity.time.minsAgo", { n: Math.floor(s / 60) });
      if (s < 86400)
        return t("activity.time.hoursAgo", { n: Math.floor(s / 3600) });

      return t("activity.time.daysAgo", { n: Math.floor(s / 86400) });
    },
    [t],
  );

  const absoluteTime = useCallback(
    (iso: string) => {
      const locale = localeActual();

      return new Date(iso).toLocaleString(locale, { timeZone: zonaDeLaEmpresa(),
        dateStyle: "medium",
        timeStyle: "short",
      });
    },
    [i18n.language],
  );

  return (
    <AppLayout>

      <div>
        <PageContainer width="wide">
          {/* ── Header ───────────────────────────────────────────────────────── */}
          <PageHeader
            actions={
              <>
                <Button
                  disabled={loading}
                  size="sm"
                  variant="outline"
                  onClick={load}
                >
                  <RefreshCw
                    className={[
                      "mr-2 h-4 w-4",
                      loading ? "animate-spin" : "",
                    ].join(" ")}
                  />
                  {t("activity.refresh")}
                </Button>
                <Button
                  disabled={unreadCount === 0}
                  size="sm"
                  variant="outline"
                  onClick={markAllRead}
                >
                  <CheckCheck className="mr-2 h-4 w-4" />
                  {t("activity.markAllRead")}
                </Button>
              </>
            }
            badges={
              <>
                <StatusBadge tone={connected ? "ok" : "neutral"}>
                  <Radio
                    className={connected ? "animate-pulse" : ""}
                    size={12}
                  />
                  {connected ? t("activity.live") : t("activity.offline")}
                </StatusBadge>
                {unreadCount > 0 && (
                  <StatusBadge dot={false} tone="brand">
                    {t("activity.unreadCount", { count: unreadCount })}
                  </StatusBadge>
                )}
              </>
            }
            icon={<ActivityIcon />}
            subtitle={t("activity.subtitle")}
            title={t("activity.title")}
          />

          {/* ── Barra: búsqueda + categorías + solo sin leer ──────────────────── */}
          <Toolbar className="gap-3">
            <SearchInput
              className="w-full max-w-xs"
              placeholder={t("activity.search")}
              value={query}
              onChange={(v) => setQuery(v)}
            />

            {/* Elegir UNA categoría es exactamente lo que hace `Segmented`; la
              copia local iba 2px más estrecha y con otro fondo inactivo, así que
              cambiar el conmutador del kit rompía la paridad sólo aquí.
              En el teléfono va en su propia fila (`w-full`): al lado del
              buscador quedaba fuera de la pantalla (QA-144). */}
            <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto sm:flex-1">
              <Segmented<Category | "all">
                options={[
                  { value: "all", label: t("activity.filters.all") },
                  ...FILTERS.map((c) => ({
                    value: c,
                    label: t(`activity.filters.${c}`),
                  })),
                ]}
                value={cat}
                onChange={setCat}
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
                  action={
                    <Button size="sm" variant="outline" onClick={load}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {t("activity.refresh")}
                    </Button>
                  }
                  className="border-none"
                  icon={<AlertTriangle />}
                  title={t("activity.loadError")}
                />
              </div>
            ) : events.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  className="border-none"
                  description={t("activity.empty.description")}
                  icon={<Inbox />}
                  title={t("activity.empty.title")}
                />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  className="border-none"
                  description={t("activity.noResults.description")}
                  icon={<Search />}
                  title={t("activity.noResults.title")}
                />
              </div>
            ) : (
              <div
                className="divide-y"
                style={{ borderColor: "var(--hairline)" }}
              >
                {groups.map((g) => (
                  <div key={g.key}>
                    {/* Cabecera de día pegajosa: fondo OPACO y sin desenfoque. Un
                      `backdrop-filter` aquí se repite por cada grupo y el
                      navegador tendría que rasterizar la lista entera en cada
                      fotograma del desplazamiento. */}
                    <div
                      className="cg-eyebrow sticky top-0 z-10 px-4 py-2"
                      style={{
                        background: "var(--glass-solid)",
                        borderBottom: "1px solid var(--hairline)",
                      }}
                    >
                      {g.label}
                    </div>
                    {g.items.map((e) => (
                      <ActivityRow
                        key={e.id}
                        absoluteTime={absoluteTime}
                        event={e}
                        focused={e.id === focusId}
                        read={isRead(e)}
                        timeAgo={timeAgo}
                        onOpen={openEvent}
                      />
                    ))}
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

/**
 * Una fila del registro.
 *
 * Es un COMPONENTE, y no el JSX suelto dentro del `map()` que había antes, por
 * la foto: el selfie del fichaje viaja en el evento como una `privateUrl` cruda,
 * y desde el blindaje del IDOR el backend responde 403 a un
 * `/file/download?privateUrl=…` sin sesión — que es exactamente lo que es un
 * `<img>` del navegador, porque no lleva la cabecera de autorización. Resultado:
 * el vigilante fichaba con foto y en Actividad no se veía nada. `useFileUrl`
 * canjea esa ruta por un enlace con testigo firmado, pero es un hook y dentro de
 * un `map()` no se puede llamar. De ahí el componente.
 */
function ActivityRow({
  event: e,
  read,
  focused,
  onOpen,
  timeAgo,
  absoluteTime,
}: {
  event: ActivityEvent;
  read: boolean;
  focused: boolean;
  onOpen: (e: ActivityEvent) => void;
  timeAgo: (iso: string) => string;
  absoluteTime: (iso: string) => string;
}) {
  const { Icon, tone } = visualFor(e.eventType);
  // Los eventos con foto la traen en `photoUrl` (fichaje, incidente, tarea,
  // visita); el aviso al cliente la llama `selfieUrl`. Se aceptan las dos.
  const photoUrl = useFileUrl(
    e.payload?.photoUrl || e.payload?.selfieUrl || "",
  );

  // Llegar desde un aviso a la fila correcta: se desplaza hasta ella al montar.
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (focused && ref.current) {
      ref.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focused]);

  return (
    <button
      ref={ref}
      className="cg-focus group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--glass-sunken)]!"
      style={{
        ...(read ? {} : { background: "var(--brand-wash)" }),
        ...(focused ? { boxShadow: "inset 0 0 0 2px var(--brand)" } : {}),
      }}
      onClick={() => onOpen(e)}
    >
      {/* punto de «sin leer» */}
      <span
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={
          read
            ? undefined
            : {
                background: "var(--brand)",
                boxShadow: "0 0 10px 0 var(--brand-glow)",
              }
        }
      />
      <IconTile className="mt-0.5" size="sm" tone={tone}>
        <Icon />
      </IconTile>
      <div className="min-w-0 flex-1">
        <p
          className={["truncate text-sm", read ? "" : "font-semibold"].join(
            " ",
          )}
          style={{ color: read ? "var(--ink-soft)" : "var(--ink)" }}
        >
          {e.title}
        </p>
        {e.body && (
          <p
            className="mt-0.5 line-clamp-2 text-xs"
            style={{ color: "var(--ink-soft)" }}
          >
            {e.body}
          </p>
        )}
        {photoUrl && (
          <SmartImage
            alt=""
            className="mt-2 h-24 w-24"
            fit="cover"
            rounded="rounded-xl"
            src={photoUrl}
            style={{ border: "1px solid var(--hairline)" }}
          />
        )}
      </div>
      <span
        className="shrink-0 text-[11px] tabular-nums"
        style={{ color: "var(--ink-faint)" }}
        title={absoluteTime(e.createdAt)}
      >
        {timeAgo(e.createdAt)}
      </span>
    </button>
  );
}

/* Conmutador de DOS estados (encendido/apagado), que no es lo mismo que elegir
   uno de varios: por eso no es `Segmented`. Las medidas sí son las suyas, para
   que los dos controles de la misma barra tengan la misma altura. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      className="cg-focus rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200"
      style={
        active
          ? {
              background: "var(--brand)",
              color: "var(--brand-ink)",
              boxShadow: "0 0 18px -6px var(--brand-glow)",
            }
          : { background: "var(--glass-sunken)", color: "var(--ink-soft)" }
      }
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SkeletonList() {
  return (
    <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
      <div
        className="flex items-center gap-2 px-4 py-6 text-sm"
        style={{ color: "var(--ink-faint)" }}
      >
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
