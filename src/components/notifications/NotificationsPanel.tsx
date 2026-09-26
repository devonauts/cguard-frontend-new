import type { PlatformNotification } from "@/hooks/useNotificationStream";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BellOff, History, Trash2, Wifi, WifiOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  targetForNotification,
  iconFor,
  tituloLimpio,
  TONE_INK,
} from "./notificationToast";

import {
  GRUPOS_DE_BANDEJA,
  PESO_DE_PRIORIDAD,
  grupoDe,
  prioridadDe,
  type GrupoDeBandeja,
} from "./catalogoDeAvisos";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
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

export function NotificationsPanel({
  notifications,
  unreadCount,
  connected,
  onMarkRead,
  onMarkAllRead,
}: NotificationsPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // The bell is an UNREAD inbox: reading or clearing removes items from here
  // (they remain in the Actividad history). "Clear all" persists to the DB.
  const visible = notifications.filter((n) => !n.read);

  const handleOpen = (n: PlatformNotification) => {
    if (!n.read) onMarkRead(n.id);
    setOpen(false);
    navigate(targetForNotification(n));
  };

  /* ── LA BANDEJA SE ORDENA POR LO QUE IMPORTA, NO POR LA HORA ────────────
     Antes era una lista plana por hora: un pánico de hace media hora quedaba
     enterrado bajo catorce fichajes de hace dos minutos. Ahora cada aviso cae
     en su grupo (`grupoDe`, espejo del catálogo del servidor), los grupos van
     en orden de urgencia y DENTRO de cada uno manda la prioridad declarada y
     luego la hora. */
  const porGrupo = useMemo(() => {
    const mapa = new Map<GrupoDeBandeja, PlatformNotification[]>();

    for (const n of visible) {
      const g = grupoDe(n.eventType);

      if (!mapa.has(g)) mapa.set(g, []);
      mapa.get(g)!.push(n);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => {
        const pa = PESO_DE_PRIORIDAD[prioridadDe(a.eventType)];
        const pb = PESO_DE_PRIORIDAD[prioridadDe(b.eventType)];

        if (pa !== pb) return pb - pa;

        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
    }

    return mapa;
  }, [visible]);

  /* Sólo se ofrecen las pestañas que tienen algo. Una fila de seis filtros de
     los que cinco están vacíos es ruido, y además miente sobre lo que hay. */
  const gruposConAvisos = GRUPOS_DE_BANDEJA.filter(
    (g) => (porGrupo.get(g.id)?.length ?? 0) > 0,
  );
  const [filtro, setFiltro] = useState<GrupoDeBandeja | "todos">("todos");
  const filtroVivo =
    filtro !== "todos" && gruposConAvisos.some((g) => g.id === filtro)
      ? filtro
      : "todos";
  const aMostrar =
    filtroVivo === "todos"
      ? gruposConAvisos
      : gruposConAvisos.filter((g) => g.id === filtroVivo);

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
              <h2 className="truncate text-base font-semibold">
                {t("ui.NotificationsPanel.titulo", "Notificaciones")}
              </h2>
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
                    n={porGrupo.get(g.id)!.length}
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
            aMostrar.map((g) => (
              <section key={g.id}>
                {/* La cabecera sólo aparece con «Todo»: filtrando por un grupo,
                    repetir su nombre encima de su única lista no dice nada. */}
                {filtroVivo === "todos" && (
                  <h3
                    className="cg-eyebrow sticky top-0 z-10 px-4 py-2"
                    style={{
                      background: "var(--glass-solid)",
                      borderBottom: "1px solid var(--hairline)",
                      color:
                        g.id === "emergencia"
                          ? "var(--bad-text)"
                          : "var(--ink-faint)",
                    }}
                  >
                    {t(g.claveI18n, g.etiqueta)} · {porGrupo.get(g.id)!.length}
                  </h3>
                )}
                <div
                  className="divide-y"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  {porGrupo.get(g.id)!.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onOpen={handleOpen}
                    />
                  ))}
                </div>
              </section>
            ))
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

function NotificationItem({
  notification: n,
  onOpen,
}: {
  notification: PlatformNotification;
  onOpen: (n: PlatformNotification) => void;
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
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="whitespace-nowrap text-[10px] tabular-nums"
            style={{ color: "var(--ink-faint)" }}
          >
            {timeAgo(n.createdAt)}
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
