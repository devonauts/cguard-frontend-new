/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — GLOBO ÚNICO DE LOS MAPAS
 *
 * UN solo globo para TODOS los mapas del CRM: puesto, sede, cliente, vigilante,
 * supervisor, incidente, vehículo, punto de control, ronda. Cabecera con baldosa
 * tonal + título + píldora de estado, cuerpo de datos, métricas y una fila de
 * ACCIONES (ver ficha, llamar, centrar, ver ronda…). Aguanta que el detalle se
 * pida al pulsar: se abre con lo que ya sabe la chincheta y se rellena solo.
 *
 * ── POR QUÉ ES DOM Y NO SVG ────────────────────────────────────────────────
 * Las chinchetas son SVG en data-URL porque un mapa con `mapId` ignora el array
 * `styles` (ver `utils/mapPins.ts`), y un SVG servido como imagen no ve ni las
 * fuentes web ni el CSS del documento. El globo NO tiene esa atadura: va dentro
 * de un `InfoWindow`, que es DOM del documento, así que hereda las variables de
 * `tokens.css` y puede llevar botones de verdad con `onClick`.
 *
 * ── POR QUÉ UN PORTAL Y NO UN createRoot ───────────────────────────────────
 * `createPortal` mantiene el árbol de React del consumidor: dentro del globo
 * siguen funcionando el router, react-query y los contextos. Con `createRoot`
 * sobre el nodo del InfoWindow se perdería todo eso y cada acción tendría que
 * viajar por callbacks sueltos.
 *
 * ── COLOR ──────────────────────────────────────────────────────────────────
 * Ni un color escrito a mano: todo sale de `var(--brand*|--ink*|--ok|--warn|
 * --bad|--info|--hairline)`. La severidad es FIJA — un incidente crítico es
 * `--bad` aunque el acento del CRM sea rojo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EJEMPLO DE USO (el contrato completo en 20 líneas)
 * ────────────────────────────────────────────────────────────────────────────
 * ```tsx
 * import { useMapPopup, mapPopupActions } from "@/components/maps/MapPopup";
 *
 * const mapRef = useRef<any>(null);
 * // Se le pasa un GETTER porque el mapa nace dentro de un `.then()` y no
 * // provoca re-render: así `open()` siempre ve la instancia viva.
 * const pop = useMapPopup(() => mapRef.current);
 *
 * marker.addListener("click", () => {
 *   pop.open(
 *     marker,                                   // ancla: marcador o {lat,lng}
 *     {                                         // lo que ya se sabe: instantáneo
 *       id: e.id, kind: "station", title: e.label, subtitle: "Puesto · Norte",
 *       status: { label: "Cubierto", tone: "ok", live: true },
 *       fields: [{ label: "Vigilantes", value: 3 }],
 *     },
 *     async () => {                             // opcional: detalle bajo demanda
 *       const { data } = await api.get(`/post-site/${e.id}`);
 *       return {
 *         fields: [{ label: "Encargado", value: data.manager }],
 *         actions: mapPopupItems(                // filtra los huecos y tipa bien
 *           mapPopupActions.detail(() => navigate(`/admin/puestos/${e.id}`)),
 *           mapPopupActions.call(data.phone),    // null si no hay teléfono
 *         ),
 *       };
 *     },
 *   );
 * });
 *
 * return (
 *   <div className="cc-map-frame">
 *     <div ref={ref} className="cc-map-canvas" />
 *     {pop.portal}   // ← OBLIGATORIO: sin esto el globo no se pinta
 *   </div>
 * );
 * ```
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";

// `mapPopupActions` son funciones sueltas, no componentes: el traductor entra
// por la instancia de i18next (los hooks aquí no valen).
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Car,
  Crosshair,
  ExternalLink,
  Eye,
  Flag,
  Locate,
  MapPin,
  Navigation,
  Phone,
  Radio,
  Route,
  Shield,
  User,
  UserCog,
  X,
} from "lucide-react";

import i18n from "@/i18n";
import { tablaDeEtiquetas } from "@/lib/i18nLabel";
import "@/styles/map.css";

/* ═══════════════════════════════════════════════════════════════════════════
   TIPOS — el contrato
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * El eje de color. `brand` sigue el acento del CRM; el resto son SEMÁNTICOS y
 * no se mueven: un incidente crítico es `bad` con el acento que sea.
 */
export type MapPopupTone = "brand" | "ok" | "warn" | "bad" | "info" | "neutral";

/** Qué se pulsó. Decide el icono de la cabecera y la etiqueta por defecto. */
export type MapPopupKind =
  | "site" // sede de la empresa
  | "station" // puesto / post site
  | "client" // cliente
  | "guard" // vigilante
  | "supervisor" // supervisor
  | "incident" // incidente / novedad
  | "vehicle" // vehículo de patrullaje
  | "checkpoint" // punto de control (NFC/QR)
  | "route" // ronda / recorrido
  | "zone" // zona o geocerca
  | "point"; // punto genérico (hito de un recorrido, etc.)

/** Un dato del cuerpo: etiqueta arriba en versalitas, valor debajo. */
export interface MapPopupField {
  label: string;
  value: ReactNode;
  /** Colorea el valor con un semántico (batería baja, retraso…). */
  tone?: MapPopupTone;
  /** Cifras tabulares: horas, coordenadas, identificadores. */
  mono?: boolean;
  /** Ocupa las dos columnas (direcciones, notas largas). */
  wide?: boolean;
}

/** Una cifra grande. Van en fila, separadas del resto por filetes. */
export interface MapPopupMetric {
  label: string;
  value: ReactNode;
  tone?: MapPopupTone;
}

/**
 * Un botón del pie. `onClick` y `href` son excluyentes en la práctica: con
 * `href` se pinta un enlace de verdad (pulsación central, abrir en pestaña).
 *
 * NAVEGACIÓN: el globo es agnóstico del router a propósito — para ir a una
 * ficha del CRM usa `onClick: () => navigate("/admin/...")` con tu `useNavigate`
 * (el portal vive en TU árbol, así que el hook del router funciona), o `href`
 * si es un enlace externo (`tel:`, Google Maps, un PDF).
 */
export interface MapPopupAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick?: (ev: MouseEvent<HTMLElement>) => void;
  href?: string;
  /** Abre el `href` en otra pestaña (añade el icono correspondiente). */
  external?: boolean;
  /** Color del botón. Por defecto hereda el tono del globo. */
  tone?: MapPopupTone;
  /** `primary` = relleno del tono; `ghost` = filete. Por defecto: el primero
   *  de la lista es `primary` y el resto `ghost`. */
  variant?: "primary" | "ghost";
  disabled?: boolean;
  /** Muestra el botón trabajando (bloquea la pulsación). */
  busy?: boolean;
  /** Cierra el globo tras pulsar. Por defecto NO se cierra. */
  closeOnClick?: boolean;
  /** Texto del `title`/`aria-label` cuando la etiqueta es un icono suelto. */
  hint?: string;
}

/** Todo lo que pinta el globo. Sólo `title` es obligatorio. */
export interface MapPopupData {
  /** Identidad de lo abierto — sirve para resaltar la chincheta seleccionada. */
  id?: string;
  kind?: MapPopupKind;
  title: string;
  /** Segunda línea. Convención: «Puesto · Cliente» o «Vigilante · Turno». */
  subtitle?: string;
  /** Píldora de estado de la cabecera. `live` le pone el latido. */
  status?: { label: string; tone?: MapPopupTone; live?: boolean };
  /** Tono rector. Por defecto: el de `status`, o el que toque por `kind`. */
  tone?: MapPopupTone;
  /** Sustituye al icono deducido de `kind`. */
  icon?: ReactNode;
  /* Listas ESTRICTAS a propósito: hay consumidores que RELEEN `data.fields`
     para fusionar telemetría fresca sobre las filas que ya estaban, y con
     huecos falsos admitidos en el tipo eso deja de compilar. Para montarlas
     en línea con condiciones está `mapPopupItems(...)`, que filtra y devuelve
     ya el tipo estrecho (`.filter(Boolean)` a secas NO lo estrecha). */
  fields?: MapPopupField[];
  metrics?: MapPopupMetric[];
  /** Etiquetas cortas (tipo de servicio, turno, armado…). */
  tags?: string[];
  /** Línea suelta al pie del cuerpo, en tinta suave. */
  note?: string;
  actions?: MapPopupAction[];
  /**
   * Desplazamiento en píxeles respecto al ancla. La chincheta la dibuja cada
   * mapa y sólo él sabe su altura: con un orbe (`orbPin`) el 0 va bien, y con
   * una ficha (`chipPin`) suele hacer falta subir el globo para no taparla.
   */
  offsetX?: number;
  offsetY?: number;
  /** Pinta el esqueleto de carga en el cuerpo. Lo activa solo el cargador. */
  loading?: boolean;
  /** Mensaje de fallo — se pinta en `--bad` y desactiva el esqueleto. */
  error?: string | null;
  /** Escotilla de escape: cualquier cosa bajo el cuerpo. */
  footer?: ReactNode;
}

/** Lo que devuelve el cargador se FUSIONA sobre lo que ya se mostraba. */
export type MapPopupLoader = () => Promise<Partial<MapPopupData>>;

/** Marcador de Google (`Marker`/`AdvancedMarkerElement`) o una coordenada. */
export type MapPopupAnchor = any | { lat: number; lng: number };

export interface MapPopupController {
  /** Abre el globo. Con `load`, arranca en carga y se rellena al resolver. */
  open: (
    anchor: MapPopupAnchor,
    data: MapPopupData,
    load?: MapPopupLoader,
  ) => void;
  /** Parchea el globo abierto (posición nueva, estado en vivo…). */
  update: (patch: Partial<MapPopupData>) => void;
  close: () => void;
  isOpen: boolean;
  /** `data.id` de lo que hay abierto — para resaltar su chincheta. */
  openId?: string;
  /** ¡RENDERÍZALO! Es el portal donde vive el globo. */
  portal: ReactNode;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TABLAS PÚBLICAS — para que todos los mapas digan lo mismo
   ═══════════════════════════════════════════════════════════════════════════ */

// Se resuelven AL LEERLAS (ver lib/i18nLabel): esta tabla la importan otros
// módulos y se evalúa al cargarlos, mucho antes de saber en qué idioma lee
// quien va a abrir el mapa.
export const MAP_POPUP_KIND_LABEL: Record<MapPopupKind, string> =
  tablaDeEtiquetas({
    site: "maps.kind.site",
    station: "maps.kind.station",
    client: "maps.kind.client",
    guard: "maps.kind.guard",
    supervisor: "maps.kind.supervisor",
    incident: "maps.kind.incident",
    vehicle: "maps.kind.vehicle",
    checkpoint: "maps.kind.checkpoint",
    route: "maps.kind.route",
    zone: "maps.kind.zone",
    point: "maps.kind.point",
  });

const KIND_ICON: Record<MapPopupKind, ReactNode> = {
  site: <Building2 />,
  station: <Shield />,
  client: <Briefcase />,
  guard: <User />,
  supervisor: <UserCog />,
  incident: <AlertTriangle />,
  vehicle: <Car />,
  checkpoint: <Flag />,
  route: <Route />,
  zone: <Crosshair />,
  point: <MapPin />,
};

/** Tono de arranque por tipo, cuando ni `tone` ni `status.tone` mandan. */
const KIND_TONE: Record<MapPopupKind, MapPopupTone> = {
  site: "brand",
  station: "brand",
  client: "brand",
  guard: "brand",
  supervisor: "info",
  incident: "bad",
  vehicle: "info",
  checkpoint: "neutral",
  route: "brand",
  zone: "neutral",
  point: "neutral",
};

/**
 * Estado (o cobertura, o severidad) → tono. Entiende los valores que ya circulan
 * por el CRM en inglés (`LiveStatus`) y en español (cobertura y severidad), para
 * que ningún mapa tenga que inventarse su propia tabla.
 */
export function toneForStatus(status?: string | null): MapPopupTone {
  switch (String(status ?? "").toLowerCase()) {
    case "online":
    case "activo":
    case "cubierto":
    case "completada":
    case "presente":
    case "ok":
    case "baja":
      return "ok";
    case "patrol":
    case "patrulla":
    case "en patrulla":
    case "ruta":
      return "brand";
    case "delayed":
    case "retraso":
    case "riesgo":
    case "pendiente":
    case "warn":
    case "media":
    case "advertencia":
      return "warn";
    case "incident":
    case "emergency":
    case "incidente":
    case "emergencia":
    case "sincubrir":
    case "sin cubrir":
    case "critica":
    case "crítica":
    case "alta":
    case "bad":
    case "panico":
    case "pánico":
      return "bad";
    case "supervisor":
    case "info":
    case "aviso":
      return "info";
    default:
      return "neutral";
  }
}

/** Nombre de la variable del tono — puente con `mapTheme.ts` para las chinchetas:
 *  `tokenHex(toneToken("bad"))` da el mismo rojo que pinta el globo. */
export function toneToken(tone: MapPopupTone): string {
  return tone === "brand"
    ? "--brand"
    : tone === "neutral"
      ? "--ink-faint"
      : `--${tone}`;
}

/** El mismo tono listo para un `style` de React: `color: toneVar("warn")`. */
export function toneVar(tone: MapPopupTone): string {
  return `var(${toneToken(tone)})`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACCIONES DE CATÁLOGO — las cinco que pide cualquier mapa
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Monta una lista dejando huecos condicionales, con el tipo ya estrecho:
 *
 * ```ts
 * actions: mapPopupItems(
 *   mapPopupActions.detail(() => navigate(ruta)),
 *   mapPopupActions.call(guardia.phone),   // devuelve null si no hay teléfono
 *   esAdmin && mapPopupActions.tour(verRonda),
 * )
 * ```
 * Existe porque `.filter(Boolean)` NO estrecha el tipo con la configuración de
 * TypeScript de este proyecto, y las listas de `MapPopupData` son estrictas
 * para que se puedan releer.
 */
export function mapPopupItems<T>(
  ...items: Array<T | null | undefined | false>
): T[] {
  return items.filter(Boolean) as T[];
}

export const mapPopupActions = {
  /** Ir a la ficha. Pásale `onClick: () => navigate(ruta)` (router del CRM). */
  detail(
    onClick: (ev: MouseEvent<HTMLElement>) => void,
    label = i18n.t("map.actions.verFicha", "Ver ficha"),
  ): MapPopupAction {
    return { id: "detail", label, icon: <Eye />, onClick, variant: "primary" };
  },
  /** Llamar. Devuelve `null` si no hay teléfono, para poder encadenar con filter. */
  call(
    phone?: string | null,
    label = i18n.t("map.actions.llamar", "Llamar"),
  ): MapPopupAction | null {
    const limpio = String(phone ?? "").replace(/[^\d+]/g, "");

    if (limpio.length < 6) return null;

    return {
      id: "call",
      label,
      icon: <Phone />,
      href: `tel:${limpio}`,
      hint: String(phone),
    };
  },
  /** Centrar el mapa en el elemento. */
  center(
    onClick: (ev: MouseEvent<HTMLElement>) => void,
    label = i18n.t("map.actions.centrar", "Centrar"),
  ): MapPopupAction {
    return { id: "center", label, icon: <Locate />, onClick };
  },
  /** Cómo llegar — abre Google Maps en otra pestaña. */
  directions(
    lat: number,
    lng: number,
    label = i18n.t("map.actions.comoLlegar", "Cómo llegar"),
  ): MapPopupAction {
    return {
      id: "directions",
      label,
      icon: <Navigation />,
      external: true,
      href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    };
  },
  /** Ver la ronda / el recorrido. */
  tour(
    onClick: (ev: MouseEvent<HTMLElement>) => void,
    label = i18n.t("map.actions.verRonda", "Ver ronda"),
  ): MapPopupAction {
    return { id: "tour", label, icon: <Route />, onClick };
  },
  /** Radio / pase de novedades. */
  radio(
    onClick: (ev: MouseEvent<HTMLElement>) => void,
    label = i18n.t("map.actions.radio", "Radio"),
  ): MapPopupAction {
    return { id: "radio", label, icon: <Radio />, onClick };
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   EL COMPONENTE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface MapPopupProps {
  data: MapPopupData;
  /** Sin esto no se pinta el botón de cerrar (útil si lo incrustas en un panel). */
  onClose?: () => void;
  className?: string;
}

function tonoDe(data: MapPopupData): MapPopupTone {
  return (
    data.tone ??
    data.status?.tone ??
    (data.kind ? KIND_TONE[data.kind] : "neutral")
  );
}

/**
 * El globo, suelto. Normalmente NO se usa directo: `useMapPopup` lo monta sobre
 * un `InfoWindow`. Se exporta para incrustarlo en un panel lateral o en una
 * hoja móvil reutilizando exactamente la misma piel.
 */
export function MapPopup({ data, onClose, className }: MapPopupProps) {
  const tono = tonoDe(data);
  const icono = data.icon ?? (data.kind ? KIND_ICON[data.kind] : <MapPin />);
  const acciones = (data.actions ?? []).filter(Boolean) as MapPopupAction[];
  const campos = (data.fields ?? []).filter(Boolean) as MapPopupField[];
  const metricas = (data.metrics ?? []).filter(Boolean) as MapPopupMetric[];

  return (
    <div
      aria-label={data.title}
      className={`cc-mpop${className ? ` ${className}` : ""}`}
      data-kind={data.kind || "point"}
      data-tone={tono}
      role="dialog"
    >
      {onClose && (
        <button
          aria-label={i18n.t("ui.MapPopup.cerrar", "Cerrar")}
          className="cc-mpop-x"
          type="button"
          onClick={onClose}
        >
          <X aria-hidden />
        </button>
      )}

      <div className="cc-mpop-head">
        <span aria-hidden className="cc-mpop-tile">
          {icono}
        </span>
        <div className="cc-mpop-htext">
          <div className="cc-mpop-t" title={data.title}>
            {data.title}
          </div>
          {data.subtitle && <div className="cc-mpop-s">{data.subtitle}</div>}
          {data.status && (
            <span className="cc-mpop-pill" data-tone={data.status.tone ?? tono}>
              {data.status.live && <i aria-hidden className="cc-mpop-live" />}
              {data.status.label}
            </span>
          )}
        </div>
      </div>

      {metricas.length > 0 && (
        <div className="cc-mpop-metrics">
          {metricas.map((m, i) => (
            <div
              key={`${m.label}-${i}`}
              className="cc-mpop-m"
              data-tone={m.tone ?? undefined}
            >
              <div className="cc-mpop-ml">{m.label}</div>
              <div
                className="cc-mpop-mv"
                style={m.tone ? { color: "var(--tono-text)" } : undefined}
              >
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {(campos.length > 0 ||
        data.loading ||
        data.error ||
        data.note ||
        data.tags?.length ||
        data.footer) && (
        <div className="cc-mpop-body">
          {campos.length > 0 && (
            <div className="cc-mpop-grid">
              {campos.map((f, i) => (
                <div
                  key={`${f.label}-${i}`}
                  className={`cc-mpop-f${f.wide ? " cc-mpop-f--wide" : ""}`}
                  data-tone={f.tone ?? undefined}
                >
                  <div className="cc-mpop-fl">{f.label}</div>
                  <div
                    className={`cc-mpop-fv${f.mono ? " cc-mpop-fv--num" : ""}`}
                    style={f.tone ? { color: "var(--tono-text)" } : undefined}
                  >
                    {f.value === null || f.value === undefined || f.value === ""
                      ? "—"
                      : f.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Carga: el esqueleto va DEBAJO de lo que ya se sabe, nunca lo tapa —
              la cabecera de la chincheta se lee desde el primer fotograma. */}
          {data.loading && !data.error && (
            <div
              aria-label={i18n.t("ui.MapPopup.cargandoDetalle", "Cargando detalle")}
              className={`cc-mpop-load${campos.length ? " cc-mpop-load--sep" : ""}`}
            >
              <span className="cc-mpop-sk" style={{ width: "62%" }} />
              <span className="cc-mpop-sk" style={{ width: "88%" }} />
              <span className="cc-mpop-sk" style={{ width: "45%" }} />
            </div>
          )}

          {data.error && <div className="cc-mpop-err">{data.error}</div>}

          {data.tags && data.tags.length > 0 && (
            <div className="cc-mpop-tags">
              {data.tags.map((t, i) => (
                <span key={`${t}-${i}`} className="cc-mpop-tag">
                  {t}
                </span>
              ))}
            </div>
          )}

          {data.note && <div className="cc-mpop-note">{data.note}</div>}
          {data.footer}
        </div>
      )}

      {acciones.length > 0 && (
        <div className="cc-mpop-acts">
          {acciones.map((a, i) => (
            <Accion
              key={a.id || i}
              accion={a}
              primaria={i === 0}
              onClose={onClose}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Accion({
  accion,
  primaria,
  onClose,
}: {
  accion: MapPopupAction;
  primaria: boolean;
  onClose?: () => void;
}) {
  const variante = accion.variant ?? (primaria ? "primary" : "ghost");
  const clase = `cc-mpop-a cc-mpop-a--${variante}`;
  const bloqueado = accion.disabled || accion.busy;

  const alPulsar = (ev: MouseEvent<HTMLElement>) => {
    if (bloqueado) {
      ev.preventDefault();

      return;
    }
    accion.onClick?.(ev);
    if (accion.closeOnClick) onClose?.();
  };

  const dentro = (
    <>
      {accion.busy ? (
        <i aria-hidden className="cc-mpop-spin" />
      ) : (
        accion.icon && (
          <span aria-hidden className="cc-mpop-ai">
            {accion.icon}
          </span>
        )
      )}
      <span className="cc-mpop-al">{accion.label}</span>
      {accion.external && <ExternalLink aria-hidden className="cc-mpop-ax" />}
    </>
  );

  if (accion.href && !bloqueado) {
    return (
      <a
        className={clase}
        data-tone={accion.tone ?? undefined}
        href={accion.href}
        rel={accion.external ? "noreferrer noopener" : undefined}
        target={accion.external ? "_blank" : undefined}
        title={accion.hint || accion.label}
        onClick={alPulsar}
      >
        {dentro}
      </a>
    );
  }

  return (
    <button
      className={clase}
      data-tone={accion.tone ?? undefined}
      disabled={bloqueado}
      title={accion.hint || accion.label}
      type="button"
      onClick={alPulsar}
    >
      {dentro}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   EL CONTROLADOR — el globo montado sobre un InfoWindow de Google
   ═══════════════════════════════════════════════════════════════════════════ */

/** El mapa: la instancia, o un getter (lo normal, porque vive en una ref). */
export type MapPopupMapRef = any | (() => any);

export interface UseMapPopupOptions {
  /** Ancho máximo que se le pide a Google. Por defecto 340. */
  maxWidth?: number;
  /** Cerrar al pulsar el mapa. Por defecto sí. */
  closeOnMapClick?: boolean;
  /** Se avisa cuando el globo se cierra (por la X, por ESC o por el mapa). */
  onClose?: () => void;
}

function esPosicion(a: any): a is { lat: number; lng: number } {
  return (
    !!a &&
    typeof a === "object" &&
    typeof a.lat === "number" &&
    typeof a.lng === "number"
  );
}

function mensajeError(e: any): string {
  const m = e?.response?.data?.message || e?.message;

  return typeof m === "string" && m.trim() ? m : i18n.t("maps.popup.loadError");
}

/**
 * Monta el globo sobre un `InfoWindow` y devuelve el mando.
 *
 * Detalles que ya están resueltos aquí y no hay que repetir en cada mapa:
 *  · una sola `InfoWindow` reutilizada — abrir otro globo cierra el anterior;
 *  · el contenido se pinta ANTES de abrir (`flushSync`), así Google mide bien y
 *    el globo no aparece un fotograma con tamaño cero;
 *  · un `ResizeObserver` reabre la ventana cuando el contenido crece (es lo que
 *    hace que el paso «cargando → cargado» no deje el pico descolocado);
 *  · ESC y pulsar el mapa cierran; el chrome de Google se apaga por CSS.
 */
export function useMapPopup(
  map: MapPopupMapRef,
  options?: UseMapPopupOptions,
): MapPopupController {
  const [estado, setEstado] = useState<{
    data: MapPopupData;
    token: number;
  } | null>(null);

  const contenedor = useMemo(
    () =>
      typeof document === "undefined" ? null : document.createElement("div"),
    [],
  );
  const ventanaRef = useRef<any>(null);
  const anclaRef = useRef<MapPopupAnchor | null>(null);
  const tokenRef = useRef(0);
  const abiertoRef = useRef(false);
  const fuenteRef = useRef<MapPopupMapRef>(map);
  const opcionesRef = useRef<UseMapPopupOptions | undefined>(options);

  useEffect(() => {
    fuenteRef.current = map;
    opcionesRef.current = options;
  });
  useEffect(() => {
    abiertoRef.current = !!estado;
  }, [estado]);

  const obtenerMapa = useCallback(() => {
    const f = fuenteRef.current;

    return typeof f === "function" ? (f as () => any)() : f;
  }, []);

  /** Pintar SÍNCRONO: Google mide el contenido en el momento de abrir. */
  const pintar = useCallback(
    (v: { data: MapPopupData; token: number } | null) => {
      try {
        flushSync(() => setEstado(v));
      } catch {
        setEstado(v);
      }
    },
    [],
  );

  const abrirVentana = useCallback(
    (mapa: any, ancla: MapPopupAnchor, foco: boolean) => {
      const v = ventanaRef.current;

      if (!v || !mapa) return;
      const o: any = { map: mapa };

      if (esPosicion(ancla)) o.position = ancla;
      else o.anchor = ancla;
      if (!foco) o.shouldFocus = false;
      v.open(o);
    },
    [],
  );

  const close = useCallback(() => {
    tokenRef.current += 1;
    abiertoRef.current = false;
    try {
      ventanaRef.current?.close();
    } catch {
      /* la ventana ya no existe */
    }
    setEstado(null);
    opcionesRef.current?.onClose?.();
  }, []);

  const open = useCallback(
    (anchor: MapPopupAnchor, data: MapPopupData, load?: MapPopupLoader) => {
      const mapa = obtenerMapa();
      const g = (window as any).google;

      if (!mapa || !g?.maps || !contenedor) return;

      if (!ventanaRef.current) {
        ventanaRef.current = new g.maps.InfoWindow({
          maxWidth: opcionesRef.current?.maxWidth ?? 340,
          // El globo trae su propio botón de cerrar (44 px, táctil). `headerDisabled`
          // es de las versiones nuevas de la API; en las viejas se ignora y el CSS
          // esconde igualmente la cabecera de Google.
          headerDisabled: true,
        });
        ventanaRef.current.addListener("closeclick", () => close());
        ventanaRef.current.setContent(contenedor);
      }

      const token = ++tokenRef.current;

      abiertoRef.current = true;
      anclaRef.current = anchor;
      // La altura de la chincheta la sabe el mapa que la dibujó, no el globo.
      ventanaRef.current.setOptions({
        pixelOffset: new g.maps.Size(data.offsetX ?? 0, data.offsetY ?? 0),
      });
      pintar({
        data: {
          ...data,
          loading: data.loading ?? !!load,
          error: data.error ?? null,
        },
        token,
      });
      abrirVentana(mapa, anchor, true);

      if (!load) return;
      Promise.resolve()
        .then(load)
        .then(
          (parche) => {
            if (tokenRef.current !== token) return; // se cerró o se abrió otro
            setEstado((prev) =>
              prev && prev.token === token
                ? { ...prev, data: { ...prev.data, ...parche, loading: false } }
                : prev,
            );
          },
          (e) => {
            if (tokenRef.current !== token) return;
            setEstado((prev) =>
              prev && prev.token === token
                ? {
                    ...prev,
                    data: {
                      ...prev.data,
                      loading: false,
                      error: mensajeError(e),
                    },
                  }
                : prev,
            );
          },
        );
    },
    [abrirVentana, close, contenedor, obtenerMapa, pintar],
  );

  const update = useCallback((patch: Partial<MapPopupData>) => {
    setEstado((prev) =>
      prev ? { ...prev, data: { ...prev.data, ...patch } } : prev,
    );
  }, []);

  /* El globo crece cuando llega el detalle. Un `InfoWindow` mide su contenido al
     abrirse y NO se reajusta solo: sin esto el pico se queda a media altura y la
     mitad de la ficha sale fuera del mapa. Reabrir con la misma ancla vuelve a
     medir (y reencuadra si hace falta), sin robar el foco. */
  useEffect(() => {
    if (!contenedor || typeof ResizeObserver === "undefined") return;
    let ultimo = 0;
    let pendiente = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(pendiente);
      pendiente = requestAnimationFrame(() => {
        if (!abiertoRef.current || !anclaRef.current) return;
        const alto = Math.round(contenedor.getBoundingClientRect().height);

        if (!alto || alto === ultimo) return;
        ultimo = alto;
        abrirVentana(obtenerMapa(), anclaRef.current, false);
      });
    });

    ro.observe(contenedor);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(pendiente);
    };
  }, [abrirVentana, contenedor, obtenerMapa]);

  /* ESC y pulsar el mapa cierran. Se registran sólo mientras hay globo. */
  useEffect(() => {
    if (!estado) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("keydown", alTeclado);

    let escucha: any = null;
    const mapa = obtenerMapa();

    if (mapa && (opcionesRef.current?.closeOnMapClick ?? true)) {
      escucha = mapa.addListener?.("click", () => close());
    }

    return () => {
      document.removeEventListener("keydown", alTeclado);
      try {
        escucha?.remove?.();
      } catch {
        /* el mapa ya se destruyó */
      }
    };
  }, [close, estado, obtenerMapa]);

  /* Al desmontar el mapa, la ventana se va con él. */
  useEffect(
    () => () => {
      try {
        ventanaRef.current?.close();
      } catch {
        /* nada que cerrar */
      }
      ventanaRef.current = null;
    },
    [],
  );

  const portal =
    contenedor && estado
      ? createPortal(
          <MapPopup data={estado.data} onClose={close} />,
          contenedor,
        )
      : null;

  return {
    open,
    update,
    close,
    isOpen: !!estado,
    openId: estado?.data.id,
    portal,
  };
}

export default MapPopup;
