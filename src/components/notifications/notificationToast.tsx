import type { PlatformNotification } from "@/hooks/useNotificationStream";

import { toast } from "sonner";
import {
  LogIn,
  LogOut,
  AlertTriangle,
  Route,
  CalendarClock,
  UserCheck,
  Siren,
  ShieldAlert,
  MapPinOff,
  RadioTower,
  FileText,
  Megaphone,
  Bell,
  X,
  MessageSquare,
  ClipboardList,
} from "lucide-react";

import { targetForNotification } from "./destinoDelAviso";
import { familiaDe } from "./catalogoDeAvisos";

import { useFileUrl } from "@/lib/fileUrl";
import { SmartImage } from "@/components/kit";
import i18n from "@/i18n";

/**
 * Tono del aviso. Eran diez hexadecimales sueltos (verde, ámbar, morado, rosa…):
 * diez colores que ignoraban el acento elegido y chocaban con la mitad de los
 * tonos posibles. Ahora cada familia de evento cae en uno de los seis tonos del
 * sistema. Se repiten a propósito —hay más familias que tonos— porque el tono
 * dice QUÉ CLASE de aviso es (bueno / atención / grave / neutro), no cuál de las
 * diez familias: para eso ya está el icono.
 *
 * `fill` es el color del lavado de fondo; `ink` la tinta del icono encima, que
 * es una variable distinta porque el color de relleno usado como tinta no
 * contrasta (ver la medición en la cabecera de tokens.css).
 */
export type ToastTone = "brand" | "ok" | "warn" | "bad" | "info" | "neutral";

export const TONE_INK: Record<ToastTone, { fill: string; ink: string }> = {
  brand: { fill: "var(--brand)", ink: "var(--brand-text)" },
  ok: { fill: "var(--ok)", ink: "var(--ok-text)" },
  warn: { fill: "var(--warn)", ink: "var(--warn-text)" },
  bad: { fill: "var(--bad)", ink: "var(--bad-text)" },
  info: { fill: "var(--info)", ink: "var(--info-text)" },
  neutral: { fill: "var(--ink-faint)", ink: "var(--ink-soft)" },
};

/**
 * ── EL ICONO SALE DE LA FAMILIA, NO DE UNA LISTA DE PREFIJOS ────────────────
 *
 * Esto era una escalera de `startsWith` escrita a mano, y le faltaban justo los
 * eventos que más importan: `panic.*`, `sos` y `alarm.*` no estaban, así que un
 * PÁNICO caía en el `return` final y se pintaba con la misma campana azul que
 * un memo. Medido en el inquilino de demo: las cinco emergencias de la bandeja
 * salían con el icono y el color de «aviso genérico».
 *
 * Ahora la familia la decide `familiaDe` —espejo del catálogo del servidor, que
 * es quien de verdad clasifica— y aquí sólo se elige con qué se dibuja cada
 * una. Un evento nuevo del servidor entra por su prefijo sin tocar este archivo.
 *
 * Las excepciones de abajo son por EVENTO y no por familia porque dicen algo
 * que la familia no sabe: entrar y salir son la misma familia y no el mismo
 * suceso.
 */
export function iconFor(eventType: string): {
  Icon: typeof Bell;
  tone: ToastTone;
} {
  const t = (eventType || "").toLowerCase();

  // Excepciones por evento: la dirección del fichaje.
  if (t === "guard.checkin") return { Icon: LogIn, tone: "ok" };
  if (t === "guard.checkout") return { Icon: LogOut, tone: "neutral" };
  if (t === "attendance.clockout_requested")
    return { Icon: LogOut, tone: "warn" };

  switch (familiaDe(t)) {
    // Rojo fijo: `--bad` no depende del acento de la empresa justamente para
    // que una emergencia no se pueda confundir con nada.
    case "sos":
      return { Icon: Siren, tone: "bad" };
    case "dispatch":
      return { Icon: Siren, tone: "bad" };
    case "incident":
      return { Icon: AlertTriangle, tone: "bad" };
    case "coverage":
      return { Icon: ShieldAlert, tone: "warn" };
    case "checkpoint":
      return { Icon: MapPinOff, tone: "warn" };
    case "patrol":
      return { Icon: Route, tone: "info" };
    case "attendance":
      return { Icon: UserCheck, tone: "warn" };
    case "shift":
      return { Icon: CalendarClock, tone: "brand" };
    case "task":
      return { Icon: ClipboardList, tone: "warn" };
    case "radio_report":
      return { Icon: RadioTower, tone: "brand" };
    case "memo":
      return { Icon: FileText, tone: "brand" };
    case "announcement":
      return { Icon: Megaphone, tone: "info" };
    case "message":
      return { Icon: MessageSquare, tone: "brand" };
    case "visitor":
      return { Icon: UserCheck, tone: "info" };
    default:
      return { Icon: Bell, tone: "info" };
  }
}

/**
 * ── EL TÍTULO, SIN EMOJIS ───────────────────────────────────────────────────
 *
 * Algunos avisos llegaban del servidor con un emoji delante: «📋 Nueva tarea»,
 * «⚠️ Puesto sin cubrir». Sobra por dos razones. La primera es que el icono YA
 * lo pone `iconFor` a partir del tipo del evento, con su papel de color: el
 * emoji duplica esa señal y además la contradice, porque su color no es el del
 * sistema y no cambia en modo oscuro. La segunda es que un emoji se dibuja con
 * la fuente del SO — se ve distinto en cada teléfono y en cada Windows, y en un
 * panel de operaciones eso lee como aficionado.
 *
 * Se limpia AL PINTAR y no sólo en el servidor porque en la base ya hay avisos
 * guardados con el emoji dentro: arreglar sólo el origen dejaría el historial
 * sucio para siempre.
 */
export function tituloLimpio(texto: string | null | undefined): string {
  if (!texto) return "";

  return (
    String(texto)
      // Emojis y símbolos al PRINCIPIO, con su posible selector de variación y
      // los espacios que arrastran. Sólo al principio: un emoji que alguien
      // escribió dentro de un mensaje es suyo y no se toca.
      .replace(
        /^(?:[\u2190-\u2BFF\u2600-\u27BF\uFE0F\u{1F000}-\u{1FAFF}]|\u200D)+\s*/u,
        "",
      )
      .trim()
  );
}

/**
 * Fire a custom in-CRM alert when a live notification arrives. Shows the full
 * details (icon/photo, title, body) and navigates to the event on click.
 */
export function showNotificationToast(
  n: PlatformNotification,
  navigate?: (to: string) => void,
) {
  const { Icon, tone } = iconFor(n.eventType);
  const { fill, ink } = TONE_INK[tone];
  const target = targetForNotification(n);

  toast.custom(
    (id) => (
      <div
        className="glass-raised glass-hover flex w-[360px] max-w-[88vw] cursor-pointer items-start gap-3 p-3"
        role="button"
        tabIndex={0}
        onClick={() => {
          if (target && navigate) navigate(target);
          toast.dismiss(id);
        }}
      >
        <NotifPhoto Icon={Icon} fill={fill} ink={ink} n={n} />
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-semibold leading-snug"
            style={{ color: "var(--ink)" }}
          >
            {tituloLimpio(n.title)}
          </p>
          {n.body && (
            <p
              className="mt-0.5 line-clamp-3 text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              {n.body}
            </p>
          )}
          <p className="cg-eyebrow mt-1.5">
            {i18n.t("ui.NotificationsPanel.ahora", "Ahora")}
          </p>
        </div>
        <button
          aria-label={i18n.t("actions.close", "Cerrar")}
          className="cg-focus -m-1 grid size-9 shrink-0 place-items-center rounded-full transition-colors"
          style={{ color: "var(--ink-faint)" }}
          onClick={(e) => {
            e.stopPropagation();
            toast.dismiss(id);
          }}
        >
          <X size={16} />
        </button>
      </div>
    ),
    { duration: 8000 },
  );
}

/** Evento para abrir la bandeja desde fuera (el resumen de una ráfaga). */
export const ABRIR_BANDEJA = "avisos:abrir";

/**
 * VARIOS AVISOS A LA VEZ = UN SOLO AVISO EMERGENTE.
 *
 * Los barridos del servidor escriben en el mismo tic todo lo que encuentran: a
 * las 07:00 llegaban diecisiete tarjetas seguidas, tres a la vista y catorce en
 * cola durante dos minutos. Ahora sale una: cuántos son, los tres primeros y
 * un botón que abre la bandeja, donde ya están ordenados.
 */
export function showBurstToast(ns: PlatformNotification[]) {
  if (!ns.length) return;
  // Los iconos distintos de lo que llegó, como las pilas de iOS.
  const vistos = new Set<string>();
  const iconos = ns
    .map((n) => ({ n, ...iconFor(n.eventType) }))
    .filter(({ tone, Icon }) => {
      const k = `${tone}|${Icon.displayName || Icon.name}`;

      if (vistos.has(k)) return false;
      vistos.add(k);

      return true;
    })
    .slice(0, 3);
  const abrir = () => window.dispatchEvent(new CustomEvent(ABRIR_BANDEJA));

  toast.custom(
    (id) => (
      <div
        className="glass-raised glass-hover flex w-[360px] max-w-[88vw] cursor-pointer items-start gap-3 p-3"
        role="button"
        tabIndex={0}
        onClick={() => {
          abrir();
          toast.dismiss(id);
        }}
      >
        <span className="relative mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center">
          {iconos.map(({ Icon, tone }, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute grid h-8 w-8 place-items-center rounded-lg"
              style={{
                background: `color-mix(in oklab, ${TONE_INK[tone].fill} 18%, var(--glass-solid))`,
                color: TONE_INK[tone].ink,
                transform: `translate(${(i - (iconos.length - 1) / 2) * 9}px, ${(i - (iconos.length - 1) / 2) * 5}px)`,
                boxShadow: "0 0 0 2px var(--glass-solid)",
                zIndex: 3 - i,
              }}
            >
              <Icon size={16} />
            </span>
          ))}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-semibold leading-snug"
            style={{ color: "var(--ink)" }}
          >
            {i18n.t("ui.NotificationsPanel.nuevosAvisos", {
              defaultValue: "{{n}} avisos nuevos",
              n: ns.length,
            })}
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {ns.slice(0, 3).map((n) => (
              <li
                key={n.id}
                className="truncate text-xs"
                style={{ color: "var(--ink-soft)" }}
              >
                {tituloLimpio(n.title)}
              </li>
            ))}
          </ul>
          <p className="cg-eyebrow mt-1.5">
            {i18n.t("ui.NotificationsPanel.verEnLaBandeja", "Ver en la bandeja")}
          </p>
        </div>
        <button
          aria-label={i18n.t("actions.close", "Cerrar")}
          className="cg-focus -m-1 grid size-9 shrink-0 place-items-center rounded-full transition-colors"
          style={{ color: "var(--ink-faint)" }}
          onClick={(e) => {
            e.stopPropagation();
            toast.dismiss(id);
          }}
        >
          <X size={16} />
        </button>
      </div>
    ),
    { duration: 8000 },
  );
}

/**
 * La foto del aviso (el selfie del fichaje, la del incidente…).
 *
 * Va en un componente propio porque `showNotificationToast` es una función
 * imperativa y `useFileUrl` es un hook. Y hace falta el hook: la notificación
 * trae una `privateUrl` cruda, y un `<img>` pidiéndola sin sesión recibe un 403
 * desde el blindaje del IDOR — se veía el aviso, pero nunca la cara. El hook la
 * canjea por un enlace con testigo firmado; mientras tanto manda el icono.
 */
function NotifPhoto({
  n,
  fill,
  ink,
  Icon,
}: {
  n: PlatformNotification;
  fill: string;
  ink: string;
  Icon: typeof Bell;
}) {
  const photoUrl = useFileUrl(
    n.payload?.photoUrl || n.payload?.selfieUrl || "",
  );

  return (
    <SmartImage
      alt=""
      className="h-12 w-12 shrink-0 border border-[color:var(--hairline)]"
      fallback={
        <span
          className="grid h-full w-full place-items-center"
          style={{
            background: `color-mix(in oklab, ${fill} 14%, transparent)`,
            color: ink,
          }}
        >
          <Icon size={20} />
        </span>
      }
      rounded="rounded-lg"
      src={photoUrl}
    />
  );
}

/* Se reexporta desde su nuevo sitio: hay pantallas que la importan de aquí. */
export { targetForNotification } from "./destinoDelAviso";
