import type { PlatformNotification } from "@/hooks/useNotificationStream";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  BellOff,
  ChevronUp,
  History,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  ABRIR_BANDEJA,
  targetForNotification,
  iconFor,
  tituloLimpio,
  TONE_INK,
} from "./notificationToast";

import {
  GRUPOS_DE_BANDEJA,
  NOMBRE_DE_FAMILIA,
  grupoDe,
  type GrupoDeBandeja,
} from "./catalogoDeAvisos";
import { Deslizable } from "./Deslizable";
import {
  organizarBandeja,
  pasoAntesDeLlegar,
  type Pila,
} from "./organizarBandeja";

import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFileUrl } from "@/lib/fileUrl";
import { SmartImage } from "@/components/kit";
import { useAgente } from "@/lib/agenteDeMarca";
import i18n from "@/i18n";

interface NotificationsPanelProps {
  notifications: PlatformNotification[];
  unreadCount: number;
  connected: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  /** Deslizar a la izquierda: quitar de la bandeja para esta persona. */
  onDismiss: (ids: string[]) => void;
}

function timeAgo(dateStr: string, ahora = Date.now()): string {
  const diff = ahora - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);

  if (m < 1) return i18n.t("ui.NotificationsPanel.ahora", "Ahora");
  if (m < 60)
    return i18n.t("ui.NotificationsPanel.haceMin", {
      defaultValue: "Hace {{n}} min",
      n: m,
    });
  const h = Math.floor(m / 60);

  if (h < 24)
    return i18n.t("ui.NotificationsPanel.haceHoras", {
      defaultValue: "Hace {{n}}h",
      n: h,
    });

  return i18n.t("ui.NotificationsPanel.haceDias", {
    defaultValue: "Hace {{n}}d",
    n: Math.floor(h / 24),
  });
}

/** `HH:MM` en la zona de la EMPRESA, en el idioma de la persona. */
function horaDe(v: string | undefined): string {
  if (!v) return "";
  try {
    return new Intl.DateTimeFormat(i18n.language || "es", {
      timeZone: zonaDeLaEmpresa(),
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(v));
  } catch {
    return "";
  }
}

/** Cabecera de un día: «Hoy», «Ayer» o «jueves, 24 sept.». */
function etiquetaDeDia(dia: string, tipo: "hoy" | "ayer" | "antes"): string {
  if (tipo === "hoy") return i18n.t("ui.NotificationsPanel.hoy", "Hoy");
  if (tipo === "ayer") return i18n.t("ui.NotificationsPanel.ayer", "Ayer");
  try {
    return new Intl.DateTimeFormat(i18n.language || "es", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "short",
    }).format(new Date(`${dia}T12:00:00Z`));
  } catch {
    return dia;
  }
}

export function NotificationsPanel({
  notifications,
  unreadCount,
  connected,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
}: NotificationsPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // «Hace 3 min» tiene que seguir siendo verdad un minuto después: sin esto la
  // etiqueta se quedaba congelada hasta que algo más repintaba.
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setAhora(Date.now());
    const id = window.setInterval(() => setAhora(Date.now()), 30_000);

    return () => window.clearInterval(id);
  }, [open]);

  // El resumen de una ráfaga abre la bandeja.
  useEffect(() => {
    const abrir = () => setOpen(true);

    window.addEventListener(ABRIR_BANDEJA, abrir);

    return () => window.removeEventListener(ABRIR_BANDEJA, abrir);
  }, []);

  // Qué pilas ha desplegado la persona (se olvida al cerrar la bandeja).
  const [desplegadas, setDesplegadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) setDesplegadas(new Set());
  }, [open]);
  // The bell is an UNREAD inbox: reading or clearing removes items from here
  // (they remain in the Actividad history). "Clear all" persists to the DB.
  const visible = notifications.filter((n) => !n.read);

  const handleOpen = (n: PlatformNotification) => {
    if (!n.read) onMarkRead(n.id);
    setOpen(false);
    navigate(targetForNotification(n));
  };

  /* ── LA BANDEJA COMO LA DE iOS ─────────────────────────────────────────
     Antes: por grupo y, dentro, por prioridad. El pánico no se enterraba,
     pero las horas saltaban en cada cambio de grupo («hace 4 h, ahora, hace
     1 h») y la bandeja se leía desordenada. Ahora: lo que requiere atención
     arriba; lo demás por tiempo, por días, y en pilas por familia. Ver
     `organizarBandeja`. Las pestañas siguen filtrando por grupo. */
  const cuentaPorGrupo = useMemo(() => {
    const m = new Map<GrupoDeBandeja, number>();

    for (const n of visible) {
      const g = grupoDe(n.eventType);

      m.set(g, (m.get(g) || 0) + 1);
    }

    return m;
  }, [visible]);

  /* Sólo se ofrecen las pestañas que tienen algo. Una fila de seis filtros de
     los que cinco están vacíos es ruido, y además miente sobre lo que hay. */
  const gruposConAvisos = GRUPOS_DE_BANDEJA.filter(
    (g) => (cuentaPorGrupo.get(g.id) ?? 0) > 0,
  );
  const [filtro, setFiltro] = useState<GrupoDeBandeja | "todos">("todos");
  const filtroVivo =
    filtro !== "todos" && gruposConAvisos.some((g) => g.id === filtro)
      ? filtro
      : "todos";

  const bandeja = useMemo(
    () =>
      organizarBandeja(
        filtroVivo === "todos"
          ? visible
          : visible.filter((n) => grupoDe(n.eventType) === filtroVivo),
        { ahora, zona: zonaDeLaEmpresa() },
      ),
    [visible, filtroVivo, ahora],
  );

  const alternar = (clave: string) =>
    setDesplegadas((prev) => {
      const sig = new Set(prev);

      if (sig.has(clave)) sig.delete(clave);
      else sig.add(clave);

      return sig;
    });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {/* Botón circular de cristal, igual que el resto de la cabecera. El
            contador cuelga del canto y late con `.cc-dot` mientras haya algo sin
            leer — el mismo latido que usan los estados del sistema. */}
        <button
          aria-label={
            unreadCount > 0
              ? t("ui.NotificationsPanel.notificacionesSinLeer", {
                  defaultValue: "Notificaciones ({{n}} sin leer)",
                  n: unreadCount,
                })
              : t("ui.NotificationsPanel.titulo", "Notificaciones")
          }
          className="cg-focus cg-btn-glass relative grid h-9 w-9 shrink-0 place-items-center transition-all duration-200 active:scale-95"
          style={{ borderRadius: 9999, color: "var(--ink-soft)" }}
          title={
            connected
              ? t("ui.NotificationsPanel.titulo", "Notificaciones")
              : t(
                  "ui.NotificationsPanel.notificacionesReconectando",
                  "Notificaciones — reconectando",
                )
          }
          type="button"
        >
          {connected ? (
            <Bell
              className="h-[18px] w-[18px]"
              style={unreadCount > 0 ? { color: "var(--ink)" } : undefined}
            />
          ) : (
            <BellOff
              className="h-[18px] w-[18px]"
              style={{ color: "var(--ink-faint)" }}
            />
          )}
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center">
              {/* El latido va DETRÁS del contador: llama la atención sin tapar
                  el número. `.cc-dot` vive en una hoja sin capa y fija su propia
                  posición, por eso se envuelve en vez de colocarse suelto. */}
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="cc-dot" style={{ background: "var(--bad)" }} />
              </span>
              <span
                className="relative grid h-[18px] min-w-[18px] place-items-center px-1 text-[10px] font-bold"
                style={{
                  borderRadius: 9999,
                  background: "var(--bad)",
                  color: "oklch(1 0 0)",
                  boxShadow: "0 0 0 2px var(--glass-solid)",
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            </span>
          )}
        </button>
      </SheetTrigger>

      {/* Cajón de la DERECHA. Era un `Popover` de 384 px colgando de la campana:
          en el teléfono se salía de la pantalla y en escritorio no cabían ni
          cinco avisos sin desplazar. `p-0` porque la hoja trae `p-6` y aquí las
          filas llegan hasta el canto; `flex-col` + `min-h-0` para que la lista
          se desplace dentro y la cabecera y el pie se queden quietos. */}
      <SheetContent
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        side="right"
      >
        <div
          className="shrink-0 px-4 pb-3 pt-4"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          {/* `pr-10`: la hoja pone su propia X arriba a la derecha. */}
          <div className="flex items-center justify-between gap-2 pr-10">
            <div className="flex min-w-0 items-center gap-2">
              {/* Título de la hoja (Radix exige uno para lectores de
                  pantalla); el aspecto es el mismo que el <h2> que había. */}
              <SheetTitle className="truncate text-base font-semibold">
                {t("ui.NotificationsPanel.titulo", "Notificaciones")}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {t("ui.NotificationsPanel.titulo", "Notificaciones")}
              </SheetDescription>
              <span
                className="flex shrink-0 items-center gap-1 text-xs"
                style={{
                  color: connected ? "var(--ok-text)" : "var(--ink-soft)",
                }}
              >
                {connected ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                {connected
                  ? t("ui.NotificationsPanel.enVivo", "En vivo")
                  : t("ui.NotificationsPanel.reconectando", "Reconectando…")}
              </span>
            </div>
          </div>

          {visible.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {/* Las pestañas de grupo. Se desplazan de lado en el teléfono en
                  vez de partirse en dos filas: la cabecera de un cajón no puede
                  crecer hacia abajo y comerse la lista. */}
              <div
                className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5"
                style={{ scrollbarWidth: "none" }}
              >
                <ChipDeGrupo
                  activo={filtroVivo === "todos"}
                  etiqueta={t("ui.NotificationsPanel.todos", "Todo")}
                  n={visible.length}
                  onClick={() => setFiltro("todos")}
                />
                {gruposConAvisos.map((g) => (
                  <ChipDeGrupo
                    key={g.id}
                    activo={filtroVivo === g.id}
                    etiqueta={t(g.claveI18n, g.etiqueta)}
                    n={cuentaPorGrupo.get(g.id) ?? 0}
                    urgente={g.id === "emergencia"}
                    onClick={() => setFiltro(g.id)}
                  />
                ))}
              </div>
              {/* Debajo y no al lado: con las dos cosas en la misma línea, el
                  botón se comía el ancho y la última pestaña salía cortada. */}
              <button
                className="cg-focus self-start rounded-full px-1 py-0.5 text-xs underline-offset-2 hover:underline"
                style={{ color: "var(--ink-faint)" }}
                type="button"
                onClick={onMarkAllRead}
              >
                <Trash2 className="mr-1 inline h-3 w-3 align-[-2px]" />
                {t(
                  "ui.NotificationsPanel.limpiarTodo",
                  "Marcar todo como leído",
                )}
              </button>
            </div>
          )}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {visible.length === 0 ? (
            <div
              className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center text-sm"
              style={{ color: "var(--ink-faint)" }}
            >
              <Bell className="h-8 w-8 opacity-40" />
              <span>
                {t(
                  "ui.NotificationsPanel.sinNotificaciones",
                  "Sin notificaciones",
                )}
              </span>
            </div>
          ) : (
            <>
              {bandeja.atencion.length > 0 && (
                <section>
                  <CabeceraDeSeccion
                    texto={t(
                      "ui.NotificationsPanel.requiereAtencion",
                      "Requiere atención",
                    )}
                    urgente
                  />
                  <div
                    className="divide-y"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    {bandeja.atencion.map((n) => (
                      <Deslizable key={n.id} onQuitar={() => onDismiss([n.id])}>
                        <NotificationItem
                          ahora={ahora}
                          notification={n}
                          onOpen={handleOpen}
                        />
                      </Deslizable>
                    ))}
                  </div>
                </section>
              )}
              {bandeja.secciones.map((sec) => (
                <section key={sec.dia}>
                  <CabeceraDeSeccion texto={etiquetaDeDia(sec.dia, sec.tipo)} />
                  <div
                    className="divide-y"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    {sec.pilas.map((pila) => (
                      <PilaDeAvisos
                        key={pila.clave}
                        ahora={ahora}
                        desplegada={desplegadas.has(pila.clave)}
                        pila={pila}
                        onAlternar={() => alternar(pila.clave)}
                        onQuitar={(ids) => onDismiss(ids)}
                        onLeerPila={() =>
                          pila.avisos.forEach((n) => onMarkRead(n.id))
                        }
                        onOpen={handleOpen}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </ScrollArea>

        {/* La campana es la bandeja de lo NO leído; el histórico completo vive
            en Actividad. Sin esta salida, «limpiar» parecía borrar. */}
        <div
          className="shrink-0 px-4 py-3"
          style={{ borderTop: "1px solid var(--hairline)" }}
        >
          <Button
            className="w-full justify-center gap-2 text-xs"
            size="sm"
            variant="ghost"
            onClick={() => {
              setOpen(false);
              navigate("/activities");
            }}
          >
            <History className="h-3.5 w-3.5" />
            {t("ui.NotificationsPanel.verActividad", "Ver toda la actividad")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Pestaña de grupo con su cuenta. */
function ChipDeGrupo({
  etiqueta,
  n,
  activo,
  urgente,
  onClick,
}: {
  etiqueta: string;
  n: number;
  activo: boolean;
  urgente?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={activo}
      className={cn(
        "cg-focus flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        !activo && "hover:bg-[var(--glass-sunken)]",
      )}
      style={
        activo
          ? {
              background: urgente ? "var(--bad)" : "var(--brand)",
              color: "oklch(1 0 0)",
            }
          : {
              background: "var(--glass-sunken)",
              color: urgente ? "var(--bad-text)" : "var(--ink-soft)",
            }
      }
      type="button"
      onClick={onClick}
    >
      {etiqueta}
      <span className="tabular-nums opacity-80">{n}</span>
    </button>
  );
}

/** Cabecera fija de una sección («Hoy», «Requiere atención»…). */
function CabeceraDeSeccion({
  texto,
  urgente,
}: {
  texto: string;
  urgente?: boolean;
}) {
  return (
    <h3
      className="cg-eyebrow sticky top-0 z-10 px-4 py-2"
      style={{
        background: "var(--glass-solid)",
        borderBottom: "1px solid var(--hairline)",
        color: urgente ? "var(--bad-text)" : "var(--ink-faint)",
      }}
    >
      {texto}
    </h3>
  );
}

/**
 * Una pila de avisos de la misma familia, como las de iOS: cerrada enseña el
 * último y deja ver que hay más debajo; al pulsarla —en cualquier parte, también
 * la tarjeta de arriba— se despliega entera, y sólo entonces cada fila abre su
 * aviso.
 * Con un solo aviso es una fila normal.
 */
function PilaDeAvisos({
  pila,
  desplegada,
  ahora,
  onAlternar,
  onLeerPila,
  onQuitar,
  onOpen,
}: {
  pila: Pila<PlatformNotification>;
  desplegada: boolean;
  ahora: number;
  onAlternar: () => void;
  onLeerPila: () => void;
  /** Deslizar: una fila suelta, o la pila entera si está cerrada (como iOS). */
  onQuitar: (ids: string[]) => void;
  onOpen: (n: PlatformNotification) => void;
}) {
  const { t } = useTranslation();
  const [primero, ...resto] = pila.avisos;

  if (!resto.length) {
    return (
      <Deslizable onQuitar={() => onQuitar([primero.id])}>
        <NotificationItem ahora={ahora} notification={primero} onOpen={onOpen} />
      </Deslizable>
    );
  }
  const nombre = NOMBRE_DE_FAMILIA[pila.familia];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-4 pt-2">
        <span
          className="truncate text-[11px] font-semibold"
          style={{ color: "var(--ink-soft)" }}
        >
          {t(nombre.claveI18n, nombre.etiqueta)} · {pila.avisos.length}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {desplegada && (
            <button
              className="cg-focus flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
              style={{
                background: "var(--glass-sunken)",
                color: "var(--ink-soft)",
              }}
              type="button"
              onClick={onAlternar}
            >
              <ChevronUp className="h-3 w-3" />
              {t("ui.NotificationsPanel.mostrarMenos", "Mostrar menos")}
            </button>
          )}
          <button
            aria-label={t(
              "ui.NotificationsPanel.leerPila",
              "Marcar esta pila como leída",
            )}
            className="cg-focus grid h-6 w-6 place-items-center rounded-full"
            style={{
              background: "var(--glass-sunken)",
              color: "var(--ink-faint)",
            }}
            title={t(
              "ui.NotificationsPanel.leerPila",
              "Marcar esta pila como leída",
            )}
            type="button"
            onClick={onLeerPila}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      {desplegada ? (
        pila.avisos.map((n) => (
          <Deslizable key={n.id} onQuitar={() => onQuitar([n.id])}>
            <NotificationItem ahora={ahora} notification={n} onOpen={onOpen} />
          </Deslizable>
        ))
      ) : (
        /* Cerrada, se desliza la pila ENTERA y pulsarla la DESPLIEGA, como en
           iOS: no abre el aviso de arriba. Ya desplegada, cada fila abre el suyo. */
        <Deslizable onQuitar={() => onQuitar(pila.avisos.map((n) => n.id))}>
          <NotificationItem
            ahora={ahora}
            notification={primero}
            onOpen={onAlternar}
          />
        </Deslizable>
      )}
      {!desplegada && (
        /* Los cantos de las tarjetas de debajo, como en iOS, y la cuenta. */
        <button
          className="cg-focus group relative block w-full px-4 pb-2.5 text-left"
          type="button"
          onClick={onAlternar}
        >
          <span
            aria-hidden
            className="mx-3 block h-1.5 rounded-b-lg"
            style={{
              background: "color-mix(in oklab, var(--ink) 7%, transparent)",
            }}
          />
          {resto.length > 1 && (
            <span
              aria-hidden
              className="mx-6 block h-1.5 rounded-b-lg"
              style={{
                background: "color-mix(in oklab, var(--ink) 4%, transparent)",
              }}
            />
          )}
          <span
            className="mt-1 block text-center text-[11px] font-medium group-hover:underline"
            style={{ color: "var(--brand-text)" }}
          >
            {t("ui.NotificationsPanel.masAvisos", {
              defaultValue: "{{n}} más",
              n: resto.length,
            })}
          </span>
        </button>
      )}
    </div>
  );
}

function NotificationItem({
  notification: n,
  onOpen,
  ahora,
}: {
  notification: PlatformNotification;
  onOpen: (n: PlatformNotification) => void;
  ahora: number;
}) {
  // Migrated to token URLs: NotificationItem is a component, so a hook is safe.
  // payload carries only a raw privateUrl string, so useFileUrl fetches a token.
  const { t } = useTranslation();
  // Cómo se llama el asistente aquí: en el CRM de un socio, el suyo.
  const agente = useAgente();
  const photoUrl = useFileUrl(n.payload?.photoUrl);

  return (
    // Fila de lista: SIN desenfoque. Se dibuja una por notificación y el panel
    // se desplaza; un `backdrop-filter` aquí se rasterizaría por fila.
    <div
      className={cn(
        "cursor-pointer px-4 py-3 transition-colors",
        n.read && "hover:bg-[var(--glass-sunken)]",
        !n.read && "brand-rail",
      )}
      style={!n.read ? { background: "var(--brand-wash)" } : undefined}
      onClick={() => onOpen(n)}
    >
      <div className="flex items-start justify-between gap-2">
        {photoUrl ? (
          <SmartImage
            alt=""
            className="h-11 w-11 shrink-0 border border-[color:var(--hairline)]"
            rounded="rounded-md"
            src={photoUrl}
          />
        ) : (
          /* MISMO icono y MISMO papel de color que el aviso emergente. El panel
             no tenía ninguno: una lista de títulos a pelo, donde un incidente y
             un mensaje se leían igual. Se reutiliza `iconFor` en vez de copiar
             el mapa, o los dos se separan al primer tipo nuevo. */
          (() => {
            const { Icon, tone } = iconFor(n.eventType);
            const papel = TONE_INK[tone];

            return (
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                style={{
                  background: `color-mix(in oklab, ${papel.fill} 14%, transparent)`,
                  color: papel.ink,
                }}
              >
                <Icon className="size-[18px]" />
              </span>
            );
          })()
        )}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "truncate text-sm leading-snug",
              !n.read ? "font-semibold" : "font-normal",
            )}
            style={{ color: "var(--ink)" }}
          >
            {tituloLimpio(n.title)}
          </p>
          {[
            "coverage.post_uncovered",
            "coverage.uncovered",
            "attendance.no_show",
            "guard.inactive",
          ].includes(String(n.eventType || "")) && (
            <button
              className="cg-focus mb-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                background:
                  "color-mix(in oklab, var(--brand) 15%, transparent)",
                color: "var(--brand-text)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                try {
                  window.dispatchEvent(
                    new CustomEvent("vigia:abrir", {
                      detail: {
                        mensaje: t("ui.NotificationsPanel.avisoRecibidoVigia", {
                          defaultValue:
                            "Aviso recibido: {{titulo}}. Puedo mostrarte la cobertura en vivo y sugerir reemplazos — dime «muéstrame» y lo hago.",
                          titulo: n.title,
                        }),
                        escribir: t(
                          "ui.NotificationsPanel.muestrameLaCobertura",
                          "Muéstrame la cobertura y sugiere reemplazos para lo que esté sin cubrir",
                        ),
                      },
                    }),
                  );
                } catch {
                  /* sin widget */
                }
              }}
            >
              {t("ui.NotificationsPanel.resolverConVigia", "Resolver con {{agente}}", {
                agente: agente.nombre,
              })}
            </button>
          )}
          {n.body && (
            <p
              className="mt-0.5 line-clamp-2 text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              {n.body}
            </p>
          )}
          {/* Llegó ahora, pero PASÓ antes: una falta se detecta a la media
              hora de empezar el turno. Sin esta línea «hace 2 min» parecía
              decir que el vigilante faltó hace dos minutos. */}
          {pasoAntesDeLlegar(n) && (
            <p
              className="mt-0.5 text-[11px]"
              style={{ color: "var(--ink-faint)" }}
            >
              {t("ui.NotificationsPanel.pasoALas", {
                defaultValue: "Pasó a las {{hora}}",
                hora: horaDe(n.occurredAt),
              })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="whitespace-nowrap text-[10px] tabular-nums"
            style={{ color: "var(--ink-faint)" }}
            title={horaDe(n.createdAt)}
          >
            {timeAgo(n.createdAt, ahora)}
          </span>
          {!n.read && (
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: "var(--brand)" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
