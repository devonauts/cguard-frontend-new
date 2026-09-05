/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — CABECERA
 * Barra superior de cristal. El contenedor de app-layout ya lleva `.app-header`
 * (fondo translúcido + desenfoque + filo inferior), así que AQUÍ DENTRO NO SE
 * PINTA NINGÚN FONDO: hacerlo taparía el cristal y dejaría una barra opaca.
 * Lo único que cambia al desplazar es la densidad — el cristal se cierra un
 * punto y aparece la sombra, que es lo que separa la barra del contenido que
 * pasa por debajo.
 *
 * Nada de colores escritos a mano: relleno, tinta y filos salen de las
 * variables, así que la barra se ve correcta en claro, en oscuro y con
 * cualquier acento que elija el usuario en Configuración › Apariencia.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Menu,
  Search,
  MessageSquare,
  HelpCircle,
  ChevronDown,
  Settings,
  CreditCard,
  Clock,
  History,
  LogOut,
  Star,
  Radio,
  Palette,
  CornerDownLeft,
  LayoutGrid,
  Settings2,
  X,
  Check,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { subscribeRadio, getRadioSnapshot, toggleWidget, radioResume } from "@/lib/radioVoiceManager";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from 'react-i18next';
import { toast } from "sonner";
import { alarmService } from "@/lib/api/alarmService";
import { ApiService } from "@/services/api/apiService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNotificationStream, type PlatformNotification } from "@/hooks/useNotificationStream";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import { showNotificationToast } from "@/components/notifications/notificationToast";
import { PanicAlertOverlay } from "@/components/notifications/PanicAlertOverlay";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import TrialDaysBadge from "@/components/TrialDaysBadge";
import { ThemeSwitch } from "@/components/theme-switch";
import { IconTile, FIELD_CLS, FIELD_CLS_LG } from "@/components/kit";
import MENU from "@/data/sidebar-menu.json";
import NAVS from "@/data/settings-nav.json";
import TenantSwitcher from '@/components/TenantSwitcher';

type HeaderProps = {
  toggleSidebar: () => void;
  sidebarOpen?: boolean;
  notificationsCount?: number;
};

function getDisplayName(user?: any) {
  const first = user?.firstName?.trim();
  const last = user?.lastName?.trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  const email = user?.email || "";
  return email.split("@")[0] || "Usuario";
}
function getInitials(text: string) {
  const parts = (text || "").trim().split(/\s+/);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Botón circular de cristal. El aro y la tinta salen de las variables, así que
 *  el mismo botón vale en claro y en oscuro. */
function GlassButton({
  onClick, label, children, dot,
}: {
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  /** Punto de estado con latido — `.cc-dot` de la capa de cristal. */
  dot?: { color: string; pulse?: boolean } | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="cg-focus cg-btn-glass relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-200 active:scale-95 [&_svg]:size-[18px]"
      style={{ color: 'var(--ink-soft)' }}
    >
      {children}
      {dot && (
        // El punto va DENTRO de un envoltorio posicionado: `.cc-dot` fija
        // `position: relative` desde una hoja sin capa, y eso gana a la utilidad
        // `absolute` de Tailwind — colocarlo directamente lo dejaría descolgado.
        <span className="pointer-events-none absolute right-1.5 top-1.5 h-2 w-2">
          <span
            className={dot.pulse ? "cc-dot" : "block h-2 w-2 rounded-full"}
            style={{ background: dot.color }}
          />
        </span>
      )}
    </button>
  );
}

// ── Buscador global ─────────────────────────────────────────────────────────
type Destino = { id: string; label: string; path: string; grupo: 'menu' | 'config'; contexto?: string };

/** Sin tildes y en minúsculas: «vigilancia» encuentra «Vigilância» y «RONDAS». */
const plano = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * El conmutador del panel lateral.
 *
 * Sustituye a la hamburguesa, que era el icono más genérico posible y —lo que
 * importa— NO DECÍA NADA: tres rayas no informan de qué va a pasar al pulsarlas.
 * Este glifo dibuja el panel y el sentido del movimiento, así que se entiende
 * antes de pulsarlo: el riel se estrecha cuando el panel se va a plegar, y la
 * punta señala hacia dónde. Al conmutar, las dos cosas se animan.
 */
function IconoPanel({ abierto }: { abierto: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
      {/* el marco: la pantalla */}
      <rect x="1.25" y="2.75" width="15.5" height="12.5" rx="3.25"
            stroke="currentColor" strokeWidth="1.4" opacity=".55" />
      {/* el riel: el propio panel lateral, ancho cuando está desplegado */}
      <rect x="2.9" y="4.4" width={abierto ? 4.2 : 2} height="9.2" rx="1"
            fill="currentColor"
            style={{ transition: 'width .22s cubic-bezier(.22,1,.36,1), opacity .22s' }}
            opacity={abierto ? '.95' : '.5'} />
      {/* la punta: hacia dónde irá */}
      <path d={abierto ? 'M12.9 6.9 10.6 9l2.3 2.1' : 'M10.6 6.9 12.9 9l-2.3 2.1'}
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Header({
  toggleSidebar,
  sidebarOpen = true,
  notificationsCount = 1,
}: HeaderProps) {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const radio = useSyncExternalStore(subscribeRadio, getRadioSnapshot);

  const userName = getDisplayName(user);
  const userEmail = user?.email ?? "";
  const avatar: string | undefined = user?.avatar || user?.photoURL || undefined;
  const tenantName =
    (user && (user.tenant && (user.tenant.tenant?.name || user.tenant.name))) ||
    (user && Array.isArray(user.tenants) && user.tenants[0] && (user.tenants[0].tenant?.name || user.tenants[0].tenantName)) ||
    "";

  const showTenant = Boolean(
    (user && user.tenant) || (user && Array.isArray(user.tenants) && user.tenants.length > 0)
  );

  // Derive tenantId for SSE notification stream
  const tenantId = useMemo(() => {
    if (user && Array.isArray(user.tenants) && user.tenants.length > 0) {
      return user.tenants[0].tenantId || user.tenants[0].tenant?.id || null;
    }
    try { return localStorage.getItem('tenantId'); } catch { return null; }
  }, [user]);

  // Active panic alerts (from the realtime stream). A panic shows a full-screen
  // red alarm overlay instead of a passing toast.
  const [panicAlerts, setPanicAlerts] = useState<PlatformNotification[]>([]);

  // Silencing an SOS REQUIRES recording the action taken → acknowledge the alarm
  // case (logged to history). Only on success do we remove the alert; on failure
  // we keep it on screen (never silently lose an SOS).
  const handleAcknowledgePanic = async (alert: PlatformNotification, action: string) => {
    const caseId = (alert.payload as any)?.caseId;
    try {
      if (caseId) {
        await alarmService.acknowledge(String(caseId), action);
        toast.success(t('header.sos.ackOk'));
      }
    } catch {
      toast.error(t('header.sos.ackError'));
      return; // keep the alert up; don't silence on failure
    }
    setPanicAlerts((prev) => prev.filter((a) => a.id !== alert.id));
  };

  // On mount, re-surface any UNACKNOWLEDGED panic case (status 'queued') so a page
  // reload / navigation never loses an active SOS — it stays until acknowledged.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cases = await alarmService.cases({ status: "queued" });
        const panic = (Array.isArray(cases) ? cases : []).filter(
          (c) => c.category === "panic" || String(c.title || "").includes("SOS"),
        );
        if (!alive || !panic.length) return;
        setPanicAlerts((prev) => {
          const have = new Set(prev.map((a) => a.id));
          const seeded = panic
            .filter((c) => !have.has(c.id))
            .map((c) => ({
              id: c.id,
              eventType: "panic.alert",
              createdAt: c.createdAt || new Date().toISOString(),
              payload: {
                source: c.customerId ? "client" : "guard",
                caseId: c.id,
                title: c.title,
                stationName: String(c.title || "").split("·").pop()?.trim() || null,
                incidentId: c.incidentId,
                priority: "critical",
              },
            })) as unknown as PlatformNotification[];
          return [...seeded, ...prev];
        });
      } catch { /* non-fatal; the live stream still delivers new ones */ }
    })();
    return () => { alive = false; };
  }, [tenantId]);

  const { notifications, unreadCount, connected, markRead, markAllRead } =
    useNotificationStream(tenantId, (n) => {
      if (n.eventType === "panic.alert") {
        setPanicAlerts((prev) =>
          prev.some((a) => a.id === n.id) ? prev : [n, ...prev],
        );
      } else {
        showNotificationToast(n, navigate);
      }
    });

  const [openUser, setOpenUser] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // El cuadro de ayuda tiene dos caras: el menú de las cuatro opciones y el
  // formulario del ticket. Se queda dentro del MISMO diálogo para que «volver»
  // sea volver, y no cerrar y empezar de cero.
  const [ticketAbierto, setTicketAbierto] = useState(false);
  const [ticketEnviado, setTicketEnviado] = useState(false);
  const [ticketEnviando, setTicketEnviando] = useState(false);
  const [ticket, setTicket] = useState({ subject: '', message: '', category: 'problema', priority: 'normal' });
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setOpenUser(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Densidad al desplazar ────────────────────────────────────────────────
  // El contenido se desplaza dentro de <main>, no de la ventana: el evento no
  // burbujea, así que se escucha en fase de CAPTURA. Sin esto la cabecera nunca
  // se enteraría de que hay contenido pasando por debajo.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement | null;
      const top = el && 'scrollTop' in el ? el.scrollTop : window.scrollY;
      setScrolled((prev) => (prev === top > 6 ? prev : top > 6));
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, []);

  // ── Buscador global ──────────────────────────────────────────────────────
  const [consulta, setConsulta] = useState("");
  const [buscando, setBuscando] = useState(false);   // panel de resultados abierto
  const [movil, setMovil] = useState(false);         // el campo ocupa toda la barra
  const [cursor, setCursor] = useState(0);
  const campoRef = useRef<HTMLInputElement>(null);
  const buscadorRef = useRef<HTMLDivElement>(null);

  /** El menú lateral y el índice de Configuración SON el mapa del producto: el
   *  buscador los reutiliza en vez de mantener una segunda lista que se queda
   *  desfasada en cuanto alguien añade una página. */
  const destinos = useMemo<Destino[]>(() => {
    const etiqueta = (...claves: string[]) => {
      for (const k of claves) {
        const v = t(k, { defaultValue: "" }) as string;
        if (v && typeof v === "string") return v;
      }
      return "";
    };
    const out: Destino[] = [];
    for (const item of MENU as any[]) {
      const nombre = etiqueta(`sidebar.${item.id}.label`, `sidebar.${item.id}`) || item.name;
      if (item.path) out.push({ id: item.id, label: nombre, path: item.path, grupo: 'menu' });
      for (const sub of (item.subItems ?? []) as any[]) {
        const subNombre = etiqueta(`sidebar.${item.id}.${sub.id}`, `sidebar.${sub.id}`) || sub.name;
        out.push({ id: `${item.id}.${sub.id}`, label: subNombre, path: sub.path, grupo: 'menu', contexto: nombre });
      }
    }
    const config = (NAVS as any)?.configuracion;
    for (const sec of (config?.sections ?? []) as any[]) {
      for (const it of (sec.items ?? []) as any[]) {
        out.push({
          id: `cfg.${it.id}`,
          label: etiqueta(`settings.configuracion.${it.id}`) || it.label,
          path: it.path,
          grupo: 'config',
          contexto: sec.label ? String(sec.label).toLowerCase() : undefined,
        });
      }
    }
    out.push({ id: 'cfg.apariencia', label: 'Apariencia', path: '/setting/apariencia', grupo: 'config', contexto: 'mi cuenta' });
    return out;
  }, [t]);

  const resultados = useMemo(() => {
    const q = plano(consulta.trim());
    if (!q) return [];
    const marca = (d: Destino) => {
      const l = plano(d.label);
      if (l.startsWith(q)) return 0;
      if (l.includes(q)) return 1;
      if (plano(d.contexto ?? "").includes(q)) return 2;
      return 99;
    };
    return destinos
      .map((d) => ({ d, r: marca(d) }))
      .filter((x) => x.r < 99)
      .sort((a, b) => a.r - b.r)
      .slice(0, 8)
      .map((x) => x.d);
  }, [consulta, destinos]);

  useEffect(() => { setCursor(0); }, [consulta]);

  const cerrarBusqueda = useCallback(() => {
    setBuscando(false);
    setMovil(false);
    setConsulta("");
  }, []);

  const irA = useCallback((d: Destino) => {
    cerrarBusqueda();
    campoRef.current?.blur();
    navigate(d.path);
  }, [cerrarBusqueda, navigate]);

  // ⌘K / Ctrl+K desde cualquier punto del CRM. Esc cierra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMovil(true);
        setBuscando(true);
        requestAnimationFrame(() => { campoRef.current?.focus(); campoRef.current?.select(); });
      } else if (e.key === "Escape") {
        cerrarBusqueda();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cerrarBusqueda]);

  // Clic fuera → se cierra el panel de resultados.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (buscadorRef.current && !buscadorRef.current.contains(e.target as Node)) {
        setBuscando(false);
        setMovil(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const teclasBusqueda = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, Math.max(resultados.length - 1, 0))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter") { const d = resultados[cursor]; if (d) { e.preventDefault(); irA(d); } }
  };

  const esMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/login");
      toast.success(t('auth.logout_success'));
    } catch {
      toast.error(t('auth.logout_failed'));
    }
  };

  const handleFeedbackSubmit = async () => {
    if (rating === 0) {
      toast.error(t('header.select_rating'));
      return;
    }
    // Persist to the backend (surfaced to superadmin). Best-effort — always thank.
    try {
      const tid = localStorage.getItem('tenantId');
      if (tid) {
        await ApiService.post(`/tenant/${tid}/feedback`, { rating, comment: feedbackText.trim() || undefined });
      }
    } catch { /* still acknowledge locally */ }
    toast.success(t('header.feedback_thanks'));
    setFeedbackOpen(false);
    setRating(0);
    setHoverRating(0);
    setFeedbackText("");
  };

  const handleFeedbackClose = () => {
    setFeedbackOpen(false);
    setRating(0);
    setHoverRating(0);
    setFeedbackText("");
  };

  /**
   * ── ENVIAR UN TICKET DE SOPORTE ─────────────────────────────────────────
   * A diferencia de la valoración de arriba, esto NO es «lo mejor que se
   * pueda»: si el envío falla hay que decirlo. Una valoración perdida no le
   * cuesta nada a nadie; un ticket perdido deja a una empresa esperando una
   * respuesta que nadie sabe que tiene que dar — que es exactamente lo que
   * pasaba cuando estos botones no tenían `onClick`.
   */
  const enviarTicket = async () => {
    const asunto = ticket.subject.trim();
    const mensaje = ticket.message.trim();
    if (!asunto || !mensaje) {
      toast.error(t('header.support.form.required', 'Escribe un asunto y cuéntanos qué pasa.'));
      return;
    }
    setTicketEnviando(true);
    try {
      const tid = localStorage.getItem('tenantId');
      if (!tid) throw new Error('sin empresa');
      await ApiService.post(`/tenant/${tid}/support/ticket`, {
        subject: asunto,
        message: mensaje,
        category: ticket.category,
        priority: ticket.priority,
        // La pantalla desde la que se pide ayuda es la mitad de la respuesta.
        pageUrl: window.location.pathname + window.location.search,
      });
      setTicketEnviado(true);
      setTicket({ subject: '', message: '', category: 'problema', priority: 'normal' });
    } catch (e: any) {
      toast.error(e?.message || t('header.support.form.error', 'No se pudo enviar. Inténtalo de nuevo.'));
    } finally {
      setTicketEnviando(false);
    }
  };

  /** Cerrar el cuadro lo devuelve al menú: la próxima vez no se abre a medias. */
  const cerrarAyuda = (abierto: boolean) => {
    setHelpOpen(abierto);
    if (!abierto) {
      setTicketAbierto(false);
      setTicketEnviado(false);
    }
  };

  const enlaceMenu = "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--glass-sunken)]";

  return (
    <>
    {/* El overlay del SOS vive en la cabecera GLOBAL, que se monta FUERA del
        AppErrorBoundary de las rutas (App.tsx · PersistentChrome). Sin este
        cerrojo, cualquier error de render aquí —un campo que llega como objeto
        en un SOS— tumbaba el CRM ENTERO a pantalla blanca. Aislado, si el
        overlay fallara, el resto del panel sigue vivo. */}
    <AppErrorBoundary scope="panic-overlay">
      <PanicAlertOverlay alerts={panicAlerts} onAcknowledge={handleAcknowledgePanic} />
    </AppErrorBoundary>
    {/* Sin fondo propio: el cristal lo pone `.app-header` del contenedor. */}
    <header
      className="relative flex h-14 items-center gap-2 px-3 transition-shadow duration-300 sm:px-4"
      style={{ boxShadow: scrolled ? 'var(--lift-2)' : 'none' }}
    >
      <button
        onClick={toggleSidebar}
        className="cg-focus cg-btn-glass grid h-9 w-9 shrink-0 place-items-center rounded-xl"
        aria-label={sidebarOpen ? t('header.sidebar.collapse') : t('header.sidebar.expand')}
        aria-expanded={sidebarOpen}
        title={sidebarOpen ? t('header.sidebar.collapse') : t('header.sidebar.expand')}
      >
        {/* En MÓVIL sí toca hamburguesa: ahí el menú es un cajón que se superpone,
            no un panel que se pliega, y las tres rayas son la convención que todo
            el mundo reconoce sin pensar. En escritorio el glifo dice hacia dónde
            va el panel, que es información que en móvil no aplica. */}
        <span className="md:hidden"><Menu className="h-[19px] w-[19px]" /></span>
        <span className="hidden md:block"><IconoPanel abierto={sidebarOpen} /></span>
      </button>

      {/* ── Buscador global ─────────────────────────────────────────────── */}
      <div
        ref={buscadorRef}
        className={movil ? "absolute inset-x-3 z-30" : "hidden min-w-0 flex-1 md:block md:max-w-md"}
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: 'var(--ink-faint)' }}
          />
          <input
            ref={campoRef}
            value={consulta}
            onChange={(e) => { setConsulta(e.target.value); setBuscando(true); }}
            onFocus={() => setBuscando(true)}
            onKeyDown={teclasBusqueda}
            placeholder={t('header.searchPlaceholder', { defaultValue: 'Buscar en C-Guard Pro…' }) as string}
            aria-label={t('header.search')}
            className="cg-input h-9 w-full pl-9 pr-20 text-sm outline-none"
          />
          {/* El atajo, a la vista: un buscador con atajo invisible no lo usa nadie. */}
          {consulta ? (
            <button
              type="button"
              onClick={cerrarBusqueda}
              aria-label={t('common.clear', { defaultValue: 'Limpiar' }) as string}
              className="cg-focus absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full transition-colors hover:bg-[var(--glass-sunken)]"
              style={{ color: 'var(--ink-faint)' }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd
              className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold sm:inline-flex"
              style={{ borderColor: 'var(--hairline)', background: 'var(--glass-raised)', color: 'var(--ink-faint)' }}
            >
              {esMac ? '⌘' : 'Ctrl'} K
            </kbd>
          )}

          {buscando && consulta.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2">
            <div className="glass-raised cg-flotante cc-rise max-h-[62vh] overflow-y-auto p-1.5">
              {resultados.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--ink-faint)' }}>
                  No hay nada con «{consulta.trim()}»
                </div>
              ) : (
                resultados.map((d, i) => {
                  const activo = i === cursor;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => irA(d)}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors"
                      style={activo
                        ? { background: 'var(--brand-wash)', boxShadow: 'inset 0 0 0 1px var(--brand-line)' }
                        : undefined}
                    >
                      <IconTile tone={activo ? 'brand' : 'neutral'} size="sm">
                        {d.grupo === 'config' ? <Settings2 /> : <LayoutGrid />}
                      </IconTile>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>{d.label}</span>
                        <span className="block truncate text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                          {d.grupo === 'config' ? t('header.cmdk.settingsGroup') : t('header.cmdk.mainGroup')}
                          {d.contexto ? ` · ${d.contexto}` : ''}
                        </span>
                      </span>
                      {activo && <CornerDownLeft className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--brand-text)' }} />}
                    </button>
                  );
                })
              )}
            </div>
            </div>
          )}
        </div>
      </div>

      {/* `md:ml-auto` empuja el grupo al extremo derecho. Sin él, `md:flex-none`
          lo dejaba pegado al buscador con media barra vacía a la derecha, y el
          perfil parecía estar en el medio. */}
      <div className="flex flex-1 items-center justify-end gap-1.5 md:ml-auto md:flex-none">
        {/* Selector de empresa — sólo aparece para quien administra más de una.
            Va lo primero del grupo derecho porque cambia el significado de TODO
            lo que hay en pantalla: los datos, los permisos y la marca son de la
            empresa activa. */}
        <div className="mr-1 hidden sm:block">
          <TenantSwitcher />
        </div>

        <div className="mr-1 hidden sm:block">
          <TrialDaysBadge />
        </div>

        {/* En pantallas estrechas el campo no cabe: el botón lo despliega sobre
            la barra entera. */}
        <span className="md:hidden">
          <GlassButton
            label={t('header.search')}
            onClick={() => {
              setMovil(true);
              setBuscando(true);
              requestAnimationFrame(() => campoRef.current?.focus());
            }}
          >
            <Search />
          </GlassButton>
        </span>

        <span className="hidden sm:inline-flex">
          <GlassButton label={t('header.feedback')} onClick={() => setFeedbackOpen(true)}>
            <MessageSquare />
          </GlassButton>
        </span>

        <span className="hidden sm:inline-flex">
          <GlassButton label={t('header.help')} onClick={() => setHelpOpen(true)}>
            <HelpCircle />
          </GlassButton>
        </span>

        {/* Radio: abre el widget persistente del canal general. */}
        <GlassButton
          label="Radio · Canal general"
          onClick={() => { radioResume(); toggleWidget(); }}
          dot={radio.on ? { color: radio.speaker ? 'var(--brand)' : 'var(--ok)', pulse: Boolean(radio.speaker) } : null}
        >
          <Radio style={radio.on ? { color: 'var(--brand-text)' } : undefined} />
        </GlassButton>

        {/* Campana en vivo (SSE) */}
        <NotificationsPanel
          notifications={notifications}
          unreadCount={unreadCount}
          connected={connected}
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
        />

        <span className="hidden sm:inline-flex"><ThemeSwitch /></span>
        <span className="sm:hidden"><ThemeSwitch compact /></span>

        <span className="mx-0.5 hidden h-6 w-px sm:block" style={{ background: 'var(--hairline)' }} />

        <div ref={userRef} className="relative">
          <button
            onClick={() => setOpenUser((v) => !v)}
            className="cg-focus cg-btn-glass flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition-all duration-200 active:scale-[0.98]"
            title={userName || t('header.account')}
            aria-label={t('header.account')}
            aria-expanded={openUser}
          >
            {avatar ? (
              <img
                src={avatar}
                alt={userName}
                className="h-7 w-7 rounded-full object-cover"
                style={{ boxShadow: '0 0 0 2px var(--brand-line)' }}
              />
            ) : (
              <span
                className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold"
                style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}
              >
                {getInitials(userName)}
              </span>
            )}
            <span className="hidden leading-tight sm:block">
              {showTenant && tenantName && (
                <span className="block max-w-[140px] truncate text-[10px] font-medium" style={{ color: 'var(--ink-faint)' }}>
                  {tenantName}
                </span>
              )}
              <span className="block max-w-[140px] truncate text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>
                {userName}
              </span>
            </span>
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 transition-transform duration-200"
              style={{ color: 'var(--ink-faint)', transform: openUser ? 'rotate(180deg)' : undefined }}
            />
          </button>

          {openUser && (
            <div className="absolute right-0 z-50 mt-2 w-[290px]">
            <div className="glass-raised cg-flotante cc-rise overflow-hidden">
              <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--brand-wash)' }}>
                <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{t('header.connected_as', { defaultValue: 'Conectado como' })}</div>
                <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{userEmail}</div>
                {showTenant && tenantName && (
                  <div className="mt-1 truncate text-[11px] font-medium" style={{ color: 'var(--brand-text)' }}>{tenantName}</div>
                )}
              </div>

              <div className="py-1.5" onClick={() => setOpenUser(false)}>
                <NavLink to="/setting" className={enlaceMenu} style={{ color: 'var(--ink)' }}>
                  <Settings className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} />
                  {t('header.settings')}
                </NavLink>
                <NavLink to="/setting/apariencia" className={enlaceMenu} style={{ color: 'var(--ink)' }}>
                  <Palette className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} />
                  Apariencia
                </NavLink>
                <NavLink to="/setting/billing" className={enlaceMenu} style={{ color: 'var(--ink)' }}>
                  <CreditCard className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} />
                  {t('header.subscription')}
                </NavLink>
                <NavLink to="/registros-sistema" className={enlaceMenu} style={{ color: 'var(--ink)' }}>
                  <Clock className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} />
                  {t('header.system_logs')}
                </NavLink>
                <NavLink to="/historial-inicio-sesion" className={enlaceMenu} style={{ color: 'var(--ink)' }}>
                  <History className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} />
                  {t('header.login_history')}
                </NavLink>
              </div>

              <div className="p-1.5" style={{ borderTop: '1px solid var(--hairline)' }}>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
                  style={{ color: 'var(--bad-text)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in oklab, var(--bad) 12%, transparent)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <LogOut className="h-4 w-4" />
                  {t('header.logout')}
                </button>
              </div>
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Modal */}
      <Dialog open={feedbackOpen} onOpenChange={handleFeedbackClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-semibold">C-Guard Pro</DialogTitle>
            <DialogDescription className="text-center">{t('header.feedback_modal_desc')}</DialogDescription>
          </DialogHeader>

          <div className="py-6">
            <h3 className="mb-8 text-center text-base" style={{ color: 'var(--ink)' }}>{t('header.feedback_modal_title')}</h3>

            <div className="mb-6 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => {
                const activo = star <= (hoverRating || rating);
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="cg-focus rounded-full transition-transform hover:scale-110"
                    aria-label={`${star}`}
                  >
                    <Star
                      className="h-10 w-10"
                      style={{
                        fill: activo ? 'var(--brand)' : 'none',
                        color: activo ? 'var(--brand)' : 'var(--ink-faint)',
                      }}
                    />
                  </button>
                );
              })}
            </div>

            <Textarea
              placeholder={t('header.feedback_placeholder')}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="min-h-[120px] resize-none"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleFeedbackSubmit} className="px-8">
              {t('header.send')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AYUDA ────────────────────────────────────────────────────────────
          Las cuatro tarjetas de este cuadro NO TENÍAN `onClick`. Ninguna de las
          cuatro. Una empresa con un problema pulsaba «Enviar Ticket» y no
          pasaba nada: ni se enviaba, ni se avisaba de que no se había enviado.
          Un canal de soporte que no existe es peor que no tener botón, porque
          el cliente se queda esperando una respuesta que nadie sabe que tiene
          que dar.

          Hoy funciona el ticket. Las otras tres lo dicen —«Próximamente»— y no
          se pueden pulsar: prometer un chat que no hay es el mismo error otra
          vez, sólo que más caro. */}
      <Dialog open={helpOpen} onOpenChange={cerrarAyuda}>
        <DialogContent className="sm:max-w-[600px]">
          {ticketEnviado ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-center text-lg font-semibold">
                  {t('header.support.sent.title', 'Ticket enviado')}
                </DialogTitle>
                <DialogDescription className="text-center">
                  {t('header.support.sent.body', 'Lo recibimos. Te contactamos al correo o al teléfono de tu cuenta.')}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center py-6">
                <IconTile size="lg" tone="ok"><Check /></IconTile>
              </div>
              <Button onClick={() => cerrarAyuda(false)} className="w-full">
                {t('actions.close', 'Cerrar')}
              </Button>
            </>
          ) : ticketAbierto ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold">{t('header.support.ticket', 'Enviar Ticket')}</DialogTitle>
                <DialogDescription>
                  {t('header.support.form.intro', 'Cuéntanos qué pasa. Recibimos el aviso al instante.')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <div>
                  <label className="cg-eyebrow mb-1 block" htmlFor="ticket-asunto">
                    {t('header.support.form.subject', 'Asunto')}
                  </label>
                  <Input
                    id="ticket-asunto"
                    value={ticket.subject}
                    maxLength={200}
                    onChange={(e) => setTicket((x) => ({ ...x, subject: e.target.value }))}
                    placeholder={t('header.support.form.subjectHint', 'Ej.: no puedo marcar entrada')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="cg-eyebrow mb-1 block" htmlFor="ticket-categoria">
                      {t('header.support.form.category', 'Tipo')}
                    </label>
                    <select
                      id="ticket-categoria"
                      className={FIELD_CLS}
                      value={ticket.category}
                      onChange={(e) => setTicket((x) => ({ ...x, category: e.target.value }))}
                    >
                      <option value="problema">{t('header.support.cat.problema', 'Algo no funciona')}</option>
                      <option value="pregunta">{t('header.support.cat.pregunta', 'Tengo una duda')}</option>
                      <option value="sugerencia">{t('header.support.cat.sugerencia', 'Sugerencia')}</option>
                      <option value="facturacion">{t('header.support.cat.facturacion', 'Facturación')}</option>
                      <option value="otro">{t('header.support.cat.otro', 'Otro')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="cg-eyebrow mb-1 block" htmlFor="ticket-prioridad">
                      {t('header.support.form.priority', 'Urgencia')}
                    </label>
                    <select
                      id="ticket-prioridad"
                      className={FIELD_CLS}
                      value={ticket.priority}
                      onChange={(e) => setTicket((x) => ({ ...x, priority: e.target.value }))}
                    >
                      <option value="baja">{t('header.support.prio.baja', 'Puede esperar')}</option>
                      <option value="normal">{t('header.support.prio.normal', 'Normal')}</option>
                      <option value="alta">{t('header.support.prio.alta', 'Nos tiene parados')}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="cg-eyebrow mb-1 block" htmlFor="ticket-mensaje">
                    {t('header.support.form.message', 'Qué pasa')}
                  </label>
                  <textarea
                    id="ticket-mensaje"
                    rows={5}
                    maxLength={5000}
                    className={FIELD_CLS_LG}
                    value={ticket.message}
                    onChange={(e) => setTicket((x) => ({ ...x, message: e.target.value }))}
                    placeholder={t('header.support.form.messageHint', 'Qué intentabas hacer, qué pasó y en qué pantalla.')}
                  />
                </div>

                <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                  {t('header.support.form.note', 'Enviamos también la pantalla desde la que escribes, para no tener que preguntártelo.')}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={ticketEnviando} onClick={() => setTicketAbierto(false)}>
                  {t('actions.back', 'Atrás')}
                </Button>
                <Button className="flex-1" disabled={ticketEnviando} onClick={enviarTicket}>
                  {ticketEnviando ? t('header.support.form.sending', 'Enviando…') : t('header.support.form.send', 'Enviar ticket')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-center text-lg font-semibold">{t("ui.header.comoPodemosAyudar", "¿Cómo podemos ayudar?")}</DialogTitle>
                <DialogDescription className="text-center">{t("ui.header.encuentraArticulosVideosYSoporte", "Encuentra artículos, videos y soporte para resolver tus dudas.")}</DialogDescription>
              </DialogHeader>

              {/* Dos columnas de ~164 px menos 48 px de relleno dejan 116 px para
                  «Chat en vivo con soporte»: en el teléfono va a una columna. */}
              <div className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2">
                {[
                  { id: 'ticket', icono: <Settings />, titulo: t('header.support.ticket'), pie: t('header.support.ticketSub'), listo: true },
                  { id: 'chat', icono: <MessageSquare />, titulo: t('header.support.chat'), pie: t('header.support.chatSub'), listo: false },
                  { id: 'centro', icono: <HelpCircle />, titulo: t('header.support.helpCenter'), pie: t('header.support.helpCenterSub'), listo: false },
                  { id: 'videos', icono: <Clock />, titulo: t('header.support.videos'), pie: t('header.support.videosSub'), listo: false },
                ].map((c) => (
                  <button
                    key={c.id}
                    className="glass flex flex-col items-center gap-3 p-6 text-center transition-opacity disabled:cursor-not-allowed"
                    style={c.listo ? undefined : { opacity: 0.55 }}
                    type="button"
                    disabled={!c.listo}
                    onClick={c.listo ? () => setTicketAbierto(true) : undefined}
                  >
                    <IconTile size="lg">{c.icono}</IconTile>
                    <span>
                      <span className="mb-1 block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{c.titulo}</span>
                      <span className="block text-xs" style={{ color: 'var(--ink-soft)' }}>{c.pie}</span>
                      {!c.listo && (
                        <span className="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{ background: 'var(--glass-sunken)', color: 'var(--ink-faint)' }}>
                          {t('header.support.soon', 'Próximamente')}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

    </header>
    </>
  );
}
