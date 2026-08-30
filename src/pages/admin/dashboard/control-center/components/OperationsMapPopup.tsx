/**
 * ════════════════════════════════════════════════════════════════════════════
 * MAPA DE OPERACIONES — QUÉ DICE CADA GLOBO
 *
 * Aquí NO se pinta nada: se decide QUÉ información merece estar en el globo de
 * cada tipo de entidad y a dónde llevan sus botones. La presentación entera
 * (cabecera, filetes, píldora de estado, botones) es de `MapPopup`, el globo
 * único de todos los mapas del CRM — este archivo sólo le entrega datos.
 *
 * ── EL CRITERIO ────────────────────────────────────────────────────────────
 * Un globo con diez filas no informa: se lee ninguna. Cada tipo lleva lo que
 * un jefe de operaciones necesita para DECIDIR en ese momento:
 *
 *   · puesto      → ¿está cubierto?, ¿con cuántos?, ¿quién está dentro?
 *   · vigilante   → ¿desde cuándo?, ¿cuándo dio señal por última vez?, ¿batería?
 *   · supervisor  → ¿qué zona lleva?, ¿en qué vehículo?, ¿cómo lo llamo?
 *   · cliente     → ¿cuántos puestos tiene?, ¿a quién llamo?, ¿dónde es?
 *
 * ── LO QUE NO SE INVENTA ───────────────────────────────────────────────────
 * Una fila sin dato NO se pinta con un guion: se omite. Un «Batería: —» ocupa
 * el mismo sitio que un dato real y no dice nada.
 * ════════════════════════════════════════════════════════════════════════════
 */
import {
  mapPopupActions,
  type MapPopupAction,
  type MapPopupData,
  type MapPopupField,
  type MapPopupKind,
  type MapPopupTone,
} from "@/components/maps/MapPopup";
import { Crosshair, Users } from "lucide-react";
// Estas son funciones de módulo, no componentes: no hay `useTranslation` que
// valga. Se entra por la instancia de i18next y SIEMPRE dentro de la función
// (nunca en el cuerpo del módulo), que es lo que la mantiene perezosa.
// Precedente: src/components/AppErrorBoundary.tsx
import i18n from "@/i18n";
import securityGuardService from "@/lib/api/securityGuardService";
import type { MapEntity } from "../types";
import { STATUS_LABEL, clockOf, timeAgo } from "../tone";
import { COBERTURA_LABEL, type PuestoEstado, type Racimo } from "./OperationsMapCoverage";

/* ── Lo que el mapa deja hacer desde un globo ─────────────────────────────── */

export interface MandoGlobo {
  /** Navegar dentro del CRM (el globo vive en nuestro árbol de React). */
  irA: (ruta: string) => void;
  /** Llevar la cámara a la entidad, con transición. */
  centrar: (e: MapEntity) => void;
  /** Fijar la cámara a la entidad mientras se mueva. */
  seguir: (e: MapEntity) => void;
  /** Pintar el recorrido realmente caminado (últimas horas). */
  verRastro: (e: MapEntity) => void;
  /** Encuadrar un racimo de sedes. */
  abrirRacimo: (r: Racimo) => void;
  siguiendoId: string | null;
}

/* ── Utilidades de lectura ────────────────────────────────────────────────── */

const KIND_POPUP: Record<MapEntity["kind"], MapPopupKind> = {
  tenant: "site",
  station: "station",
  client: "client",
  guard: "guard",
  supervisor: "supervisor",
  incident: "incident",
};

const COBERTURA_TONO: Record<PuestoEstado["estado"], MapPopupTone> = {
  cubierto: "ok",
  riesgo: "warn",
  sinCubrir: "bad",
  sinDatos: "neutral",
};

const ESTADO_TONO: Record<MapEntity["status"], MapPopupTone> = {
  online: "ok",
  patrol: "brand",
  delayed: "warn",
  incident: "bad",
  emergency: "bad",
  offline: "neutral",
};

/** Una batería por debajo de un quinto deja al vigilante sin radio a mitad de
 *  turno: eso es una alerta operativa, no un adorno. */
function tonoBateria(pct: number): MapPopupTone {
  return pct <= 20 ? "bad" : pct <= 40 ? "warn" : "ok";
}

/** El silencio de un GPS es información: a los 15 min ya hay que preguntar. */
function tonoSenal(iso?: string): MapPopupTone {
  if (!iso) return "neutral";
  const min = (Date.now() - new Date(iso).getTime()) / 60000;
  if (!Number.isFinite(min)) return "neutral";
  return min > 45 ? "bad" : min > 15 ? "warn" : "ok";
}

/** Etiqueta honesta cuando la posición que se ve ya no es de ahora mismo. */
function etiquetaSenal(iso?: string): string[] | undefined {
  if (!iso) return [i18n.t("map.popup.noTimestamp", "Sin marca de tiempo")];
  const t = tonoSenal(iso);
  return t === "ok" ? undefined : [t === "bad" ? "Sin señal" : "Señal rezagada"];
}

/** Añade la fila sólo si hay dato. Ver la cabecera: nada de guiones de relleno. */
function fila(campos: MapPopupField[], label: string, value: unknown, extra: Partial<MapPopupField> = {}) {
  if (value == null || value === "" || (typeof value === "number" && !Number.isFinite(value))) return;
  campos.push({ label, value: value as MapPopupField["value"], ...extra });
}

function acciones(...lista: Array<MapPopupAction | null | undefined>): MapPopupAction[] {
  return lista.filter((a): a is MapPopupAction => !!a);
}

/**
 * El modo DEMOSTRACIÓN sella todos sus identificadores con este prefijo
 * (ver `demoData.ts`). Lo que sale de ahí no existe en el servidor: ni se le
 * pide el recorrido ni se ofrece ir a una ficha que devolvería un 404.
 */
const esMuestra = (id: string) => id.startsWith("demo-");

/** Los dos botones que todo elemento del mapa comparte. */
function centrarYSeguir(e: MapEntity, mando: MandoGlobo, seguible: boolean): MapPopupAction[] {
  const centrar = mapPopupActions.center(() => mando.centrar(e));
  if (!seguible) return [centrar];
  const activo = mando.siguiendoId === e.id;
  return [
    centrar,
    {
      id: "follow",
      label: activo ? "Dejar de seguir" : "Seguir",
      icon: <Crosshair />,
      tone: activo ? "warn" : undefined,
      onClick: () => mando.seguir(e),
      closeOnClick: true,
    },
  ];
}

/* ── El globo de cada tipo ────────────────────────────────────────────────── */

export function globoDe(e: MapEntity, cob: PuestoEstado | undefined, mando: MandoGlobo): MapPopupData {
  const m = e.meta ?? {};
  // Un identificador de muestra no lleva a ninguna ficha real: se anula aquí y
  // los botones que dependen de él sencillamente no se pintan.
  const id = esMuestra(e.id) ? "" : m.entityId || e.id;
  const campos: MapPopupField[] = [];

  switch (e.kind) {
    /* ── PUESTO ────────────────────────────────────────────────────────── */
    case "station": {
      const estado = cob?.estado ?? "sinDatos";
      fila(campos, "Sede", m.postSiteName);
      fila(campos, "Cliente", m.clientName);
      fila(campos, "Geocerca", m.geofencePolygon?.length ? "Perímetro trazado" : `${cob?.radio ?? 150} m`, { mono: true });
      fila(campos, "Dirección", m.address, { wide: true });
      if (cob?.dentro.length) {
        fila(campos, "En el puesto", cob.dentro.map((v) => v.label).join(", "), { wide: true });
      }

      const rutaPuesto = m.postSiteId && id && !esMuestra(String(m.postSiteId))
        ? `/post-sites/${m.postSiteId}/stations/${id}`
        : null;
      return {
        id: e.id,
        kind: "station",
        title: e.label,
        subtitle: [m.clientName, m.postSiteName].filter(Boolean).join(" · ") || "Puesto de servicio",
        status: {
          label: i18n.t(COBERTURA_LABEL[estado].labelKey, COBERTURA_LABEL[estado].label),
          tone: COBERTURA_TONO[estado],
          live: estado !== "sinDatos",
        },
        tone: COBERTURA_TONO[estado],
        metrics: [
          { label: i18n.t("map.popup.nowOnPost", "Ahora en el puesto"), value: cob?.n ?? 0, tone: COBERTURA_TONO[estado] },
          ...(m.guardsCount != null ? [{ label: "Asignados", value: m.guardsCount }] : []),
        ],
        fields: campos,
        tags: m.isMobile ? ["Puesto móvil"] : undefined,
        note: estado === "sinDatos"
          ? "Nadie está enviando posición: el mapa no puede confirmar la cobertura."
          : undefined,
        actions: acciones(
          rutaPuesto ? mapPopupActions.detail(() => mando.irA(rutaPuesto)) : null,
          rutaPuesto ? mapPopupActions.tour(() => mando.irA(`${rutaPuesto}/site-tours`), "Ver rondas") : null,
          ...centrarYSeguir(e, mando, false),
          mapPopupActions.directions(e.lat, e.lng),
        ),
      };
    }

    /* ── CLIENTE / SEDE ────────────────────────────────────────────────── */
    case "client": {
      fila(campos, "Cliente", m.clientName);
      fila(campos, "Ciudad", m.city);
      fila(campos, "Nivel de riesgo", m.riskLevel);
      fila(campos, "Dirección", m.address, { wide: true });

      // La ficha de una SEDE es la del sitio; la de un cliente sin sedes
      // ubicadas es la del cliente. `entityId` distingue una de otra.
      const esSede = e.id.startsWith("cl-") && !e.id.startsWith("cl-acc-");
      const rutaSede = esSede && id ? `/post-sites/${id}` : null;
      const rutaCliente = m.clientId && !esMuestra(String(m.clientId))
        ? `/clients/${m.clientId}/overview`
        : null;
      return {
        id: e.id,
        kind: "client",
        title: e.label,
        subtitle: esSede ? `Sede · ${m.clientName || "Cliente"}` : "Cliente",
        tone: "neutral",
        metrics: m.stationsCount != null ? [{ label: "Puestos", value: m.stationsCount }] : undefined,
        fields: campos,
        actions: acciones(
          rutaSede
            ? mapPopupActions.detail(() => mando.irA(rutaSede), "Ver sede")
            : rutaCliente
            ? mapPopupActions.detail(() => mando.irA(rutaCliente), "Ver cliente")
            : null,
          rutaSede && rutaCliente
            ? { id: "client", label: "Ver cliente", icon: <Users />, onClick: () => mando.irA(rutaCliente) }
            : null,
          mapPopupActions.call(m.phone),
          ...centrarYSeguir(e, mando, false),
          mapPopupActions.directions(e.lat, e.lng),
        ),
      };
    }

    /* ── VIGILANTE ─────────────────────────────────────────────────────── */
    case "guard": {
      const senal = m.lastSeenAt || m.punchInTime;
      fila(campos, "Puesto", m.stationName || e.sub);
      if (m.punchInTime) fila(campos, "Entrada", clockOf(m.punchInTime), { mono: true });
      if (senal) fila(campos, "Última señal", timeAgo(senal), { mono: true, tone: tonoSenal(senal) });
      if (m.accuracy != null) fila(campos, "Precisión", `± ${Math.round(m.accuracy)} m`, { mono: true });

      return {
        id: e.id,
        kind: "guard",
        title: e.label,
        subtitle: `Vigilante · ${m.stationName || e.sub || "En servicio"}`,
        status: { label: STATUS_LABEL[e.status], tone: ESTADO_TONO[e.status], live: e.status !== "offline" },
        tone: ESTADO_TONO[e.status],
        metrics: m.battery != null
          ? [{ label: "Batería", value: `${Math.round(m.battery)} %`, tone: tonoBateria(m.battery) }]
          : undefined,
        fields: campos,
        // La posición que se ve puede ser vieja: decirlo es parte del dato.
        tags: etiquetaSenal(senal),
        actions: acciones(
          id ? mapPopupActions.detail(() => mando.irA(`/guards/${id}/resumen`)) : null,
          id ? mapPopupActions.tour(() => mando.verRastro(e), "Ver recorrido") : null,
          mapPopupActions.call(m.phone),
          ...centrarYSeguir(e, mando, true),
        ),
      };
    }

    /* ── SUPERVISOR ────────────────────────────────────────────────────── */
    case "supervisor": {
      const senal = m.lastSeenAt;
      fila(campos, "Zona", m.zone);
      fila(campos, "Vehículo", m.vehicle);
      if (m.onDutySince) fila(campos, "En servicio desde", clockOf(m.onDutySince), { mono: true });
      if (senal) fila(campos, "Última señal", timeAgo(senal), { mono: true, tone: tonoSenal(senal) });
      if (m.dutyLateMinutes) fila(campos, "Retraso", `${m.dutyLateMinutes} min`, { mono: true, tone: "warn" });

      return {
        id: e.id,
        kind: "supervisor",
        title: e.label,
        subtitle: `Supervisor · ${m.zone || "En patrulla"}`,
        status: { label: STATUS_LABEL[e.status], tone: ESTADO_TONO[e.status], live: e.status !== "offline" },
        tone: e.status === "patrol" ? "info" : ESTADO_TONO[e.status],
        fields: campos,
        tags: etiquetaSenal(senal || m.onDutySince),
        actions: acciones(
          id ? mapPopupActions.detail(() => mando.irA(`/supervisors/${id}`)) : null,
          mapPopupActions.call(m.phone),
          id ? mapPopupActions.tour(() => mando.irA(`/supervisors/${id}/cobertura`), "Cobertura") : null,
          ...centrarYSeguir(e, mando, true),
        ),
      };
    }

    /* ── INCIDENTE ─────────────────────────────────────────────────────── */
    case "incident": {
      fila(campos, "Ubicación", e.sub, { wide: true });
      if (m.lastSeenAt) fila(campos, "Reportado", timeAgo(m.lastSeenAt), { mono: true });
      return {
        id: e.id,
        kind: "incident",
        title: e.label,
        subtitle: "Incidente",
        status: { label: STATUS_LABEL[e.status], tone: "bad", live: true },
        tone: "bad",
        fields: campos,
        actions: acciones(
          id ? mapPopupActions.detail(() => mando.irA(`/reports/incident/${id}`)) : null,
          ...centrarYSeguir(e, mando, false),
          mapPopupActions.directions(e.lat, e.lng),
        ),
      };
    }

    /* ── SEDE DEL NEGOCIO ──────────────────────────────────────────────── */
    default: {
      fila(campos, "Dirección", m.address || e.sub, { wide: true });
      return {
        id: e.id,
        kind: KIND_POPUP[e.kind],
        title: e.label,
        subtitle: "Sede central",
        tone: "brand",
        fields: campos,
        actions: acciones(
          mapPopupActions.call(m.phone),
          ...centrarYSeguir(e, mando, false),
          mapPopupActions.directions(e.lat, e.lng),
        ),
      };
    }
  }
}

/** El globo de un racimo de sedes: qué hay dentro y cómo abrirlo. */
export function globoDeRacimo(r: Racimo, mando: MandoGlobo): MapPopupData {
  const nombres = r.miembros.slice(0, 6).map((m) => m.label);
  const resto = r.miembros.length - nombres.length;
  return {
    id: r.id,
    kind: "client",
    title: i18n.t('controlCenter.map.sedes', { count: r.miembros.length, defaultValue: '{{count}} sedes' }),
    subtitle: "Agrupadas por cercanía",
    tone: "neutral",
    fields: [{
      label: "Incluye",
      value: nombres.join(", ") + (resto > 0 ? ` y ${resto} más` : ""),
      wide: true,
    }],
    actions: [{
      id: "expand",
      label: "Ver por separado",
      icon: <Crosshair />,
      variant: "primary",
      onClick: () => mando.abrirRacimo(r),
      closeOnClick: true,
    }],
  };
}

/* ── Detalle bajo demanda ─────────────────────────────────────────────────── */

export interface Rastro {
  puntos: Array<{ lat: number; lng: number; at: string; battery?: number; speed?: number; accuracy?: number }>;
  pedidoEn: number;
}

/** Ventana del recorrido que se pide al pulsar un vigilante. */
const HORAS_RASTRO = 3;
const TOPE_PUNTOS = 400;

/**
 * El recorrido caminado de un vigilante, cacheado por vigilante.
 *
 * Va SÓLO al pulsar la chincheta —nunca en el sondeo— y una sola vez sirve para
 * las dos cosas: la telemetría del globo (batería, velocidad, última señal
 * reales) sale del último punto, y el rastro dibujado sale de la lista entera.
 * Pedirlo dos veces sería pagar la misma consulta dos veces.
 */
export async function pedirRastro(
  guardId: string,
  cache: Map<string, Rastro>,
  frescoMs = 45_000,
): Promise<Rastro | null> {
  const previo = cache.get(guardId);
  if (previo && Date.now() - previo.pedidoEn < frescoMs) return previo;
  try {
    const puntos = await securityGuardService.trail(guardId, {
      from: new Date(Date.now() - HORAS_RASTRO * 3600_000).toISOString(),
      limit: TOPE_PUNTOS,
    });
    const rastro: Rastro = { puntos: Array.isArray(puntos) ? puntos : [], pedidoEn: Date.now() };
    cache.set(guardId, rastro);
    return rastro;
  } catch {
    // Un 403 (el usuario no llega a nivel de despacho) o un fallo de red no
    // pueden romper el globo: se queda con lo que ya sabía la chincheta.
    return null;
  }
}

/**
 * Lo que el último punto del recorrido añade al globo YA abierto.
 *
 * El parche se fusiona en superficie sobre lo que se estaba mostrando
 * (`{...previo, ...parche}`), así que devolver `fields` a secas BORRARÍA las
 * filas que ya había. Por eso se fusiona aquí por etiqueta: lo que llega fresco
 * pisa su fila y lo demás se conserva en su sitio.
 */
export function telemetriaDe(rastro: Rastro | null, base: MapPopupData): Partial<MapPopupData> {
  const ultimo = rastro?.puntos[rastro.puntos.length - 1];
  if (!ultimo) return {};

  const frescas: MapPopupField[] = [];
  if (ultimo.at) fila(frescas, "Última señal", timeAgo(ultimo.at), { mono: true, tone: tonoSenal(ultimo.at) });
  if (ultimo.speed != null) fila(frescas, "Velocidad", `${Math.round(ultimo.speed * 3.6)} km/h`, { mono: true });
  if (ultimo.accuracy != null) fila(frescas, "Precisión", `± ${Math.round(ultimo.accuracy)} m`, { mono: true });

  const porEtiqueta = new Map(frescas.map((f) => [f.label, f]));
  const fusionadas = (base.fields ?? []).map((f) => {
    const nueva = porEtiqueta.get(f.label);
    if (!nueva) return f;
    porEtiqueta.delete(f.label);
    return nueva;
  });
  porEtiqueta.forEach((f) => fusionadas.push(f));

  return {
    metrics: ultimo.battery != null
      ? [{ label: "Batería", value: `${Math.round(ultimo.battery)} %`, tone: tonoBateria(ultimo.battery) }]
      : base.metrics,
    fields: fusionadas.length ? fusionadas : base.fields,
  };
}
