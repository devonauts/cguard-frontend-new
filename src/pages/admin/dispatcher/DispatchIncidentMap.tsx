import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation, Radio, Users, MapPin } from 'lucide-react';

import GoogleMapEmbed, { type MapEmbedMarker } from '@/components/GoogleMap/GoogleMapEmbed';
import { mapPopupActions, mapPopupItems, type MapPopupData, type MapPopupTone } from '@/components/maps/MapPopup';
import { metrosEntre } from '@/utils/mapMotion';
import { aCoord, estimarMinutos, formatearCoord, formatearDistancia, formatearMinutos } from '@/utils/geoMedidas';
import { coverageService, type LiveCoverage } from '@/lib/api/coverageService';
import type { DirectoryOption } from './types';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL MAPA DEL DESPACHO
 *
 * Un incidente en un mapa, solo, no es despacho: es una postal. Lo que el
 * operador necesita en los primeros treinta segundos es UNA respuesta —«¿a quién
 * mando y cuánto tarda?»— y esa respuesta son tres cifras: quién está cerca, a
 * qué distancia y en cuánto tiempo. Esta pantalla las pone delante y deja que se
 * pulse cualquiera de ellas para actuar.
 *
 * ── DE DÓNDE SALEN LOS DATOS (y qué NO se paga por ellos) ───────────────────
 * · Los puestos y sus coordenadas YA están cargados en la ficha del incidente:
 *   se reciben por props, no se vuelven a pedir.
 * · Quién está de verdad en cada puesto sale de `coverage/live`, que es NUESTRO
 *   servidor. Si el usuario no tiene permiso o falla, la lista sigue saliendo
 *   con los puestos y sin nombres: nunca deja al operador sin mapa.
 * · La distancia se calcula aquí (`metrosEntre`). El tiempo se ESTIMA y se
 *   ETIQUETA como estimación: la cifra exacta la daría la Matriz de Distancias
 *   de Google, que se factura por cada par origen-destino y convertiría abrir un
 *   incidente en ocho llamadas de pago. Ver `estimarMinutos` en `geoMedidas`.
 * ════════════════════════════════════════════════════════════════════════════
 */

const ID_INCIDENTE = '__incidente__';

/** Cuántos recursos se ofrecen. Más de seis y deja de ser una decisión. */
const MAX_CERCANOS = 6;

/** Radio de búsqueda. Pasados 25 km ya no es «cerca» por mucho que sea el más próximo. */
const ALCANCE_MAX_M = 25_000;

export interface RecursoCercano {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  metros: number;
  minutos: number;
  /** Vigilantes presentes AHORA según cobertura en vivo. */
  presentes: string[];
  telefono?: string | null;
  direccion?: string | null;
}

/** Las coordenadas de un puesto llegan con seis nombres distintos según el
 *  endpoint que las sirvió. `latitud`/`longitud` (en español) son las que de
 *  verdad devuelve `postSiteService.list`, y eran justo las que nadie miraba. */
export function coordDeSitio(s: DirectoryOption | null | undefined): { lat: number; lng: number } | null {
  if (!s) return null;
  const bruto = s as DirectoryOption & { latitud?: unknown; longitud?: unknown };
  return (
    aCoord(bruto.latitud, bruto.longitud) ??
    aCoord(s.latitude, s.longitude) ??
    aCoord(s.lat, s.lng) ??
    aCoord(s.locationLat, s.locationLng) ??
    aCoord(s.coords?.lat, s.coords?.lng) ??
    (typeof s.location === 'string' && s.location.includes(',')
      ? aCoord(s.location.split(',')[0]?.trim(), s.location.split(',')[1]?.trim())
      : null)
  );
}

function nombreDeSitio(s: DirectoryOption): string {
  return (
    s.stationName || s.name || s.businessName || s.displayName || s.companyName || s.fullName || s.id
  );
}

export default function DispatchIncidentMap({
  lat,
  lng,
  ticket,
  tipo,
  estado,
  prioridad,
  direccion,
  cliente,
  sites,
  height = 380,
}: {
  lat: number;
  lng: number;
  /** Referencia corta del incidente (lo que se dice por radio). */
  ticket?: string;
  tipo?: string;
  estado?: string;
  prioridad?: string;
  direccion?: string;
  cliente?: string;
  /** Puestos ya cargados por la ficha. No se vuelven a pedir. */
  sites?: DirectoryOption[];
  height?: number;
}) {
  const navigate = useNavigate();
  const incidente = useMemo(() => ({ lat, lng }), [lat, lng]);

  const [cobertura, setCobertura] = useState<LiveCoverage | null>(null);
  const [foco, setFoco] = useState<{ id: string; nonce: number } | null>(null);
  const nonceRef = useRef(0);

  // Cobertura en vivo: una sola llamada, y si no se puede, no pasa nada.
  useEffect(() => {
    let vivo = true;
    coverageService
      .live()
      .then((d) => { if (vivo) setCobertura(d); })
      .catch(() => { /* sin permiso o sin servicio: se sigue sin nombres */ });
    return () => { vivo = false; };
  }, []);

  /** Vigilantes presentes ahora mismo, agrupados por puesto. */
  const presentesPorSitio = useMemo(() => {
    const mapa = new Map<string, string[]>();
    (cobertura?.stations || []).forEach((st) => {
      if (!st.postSiteId || !st.present?.length) return;
      const previo = mapa.get(st.postSiteId) || [];
      st.present.forEach((p) => {
        const nombre = (p.fullName || '').trim();
        if (nombre && !previo.includes(nombre)) previo.push(nombre);
      });
      mapa.set(st.postSiteId, previo);
    });
    return mapa;
  }, [cobertura]);

  /** Quién está cerca, ordenado por distancia. */
  const cercanos = useMemo<RecursoCercano[]>(() => {
    const salida: RecursoCercano[] = [];
    (sites || []).forEach((s) => {
      const c = coordDeSitio(s);
      if (!c) return;
      const metros = metrosEntre(incidente, c);
      if (metros > ALCANCE_MAX_M) return;
      // El propio sitio del incidente no es un recurso al que despachar.
      if (metros < 5) return;
      salida.push({
        id: s.id,
        nombre: nombreDeSitio(s),
        lat: c.lat,
        lng: c.lng,
        metros,
        minutos: estimarMinutos(metros),
        presentes: presentesPorSitio.get(s.id) || [],
        direccion: s.address ?? null,
      });
    });
    return salida.sort((a, b) => a.metros - b.metros).slice(0, MAX_CERCANOS);
  }, [incidente, presentesPorSitio, sites]);

  /** Con gente dentro primero: un puesto vacío no responde a nada. */
  const conGente = useMemo(() => cercanos.filter((r) => r.presentes.length > 0), [cercanos]);

  const tonoIncidente: MapPopupTone = useMemo(() => {
    const p = String(prioridad ?? '').toLowerCase();
    if (p.includes('crit') || p.includes('alta') || p.includes('urgen')) return 'bad';
    if (p.includes('media') || p.includes('medium')) return 'warn';
    return 'bad'; // un incidente es un incidente: el rojo es su sitio natural
  }, [prioridad]);

  const marcadores = useMemo<MapEmbedMarker[]>(() => {
    const lista: MapEmbedMarker[] = [
      {
        id: ID_INCIDENTE,
        lat: incidente.lat,
        lng: incidente.lng,
        label: ticket ? `Incidente ${ticket}` : 'Incidente',
        role: 'crit',
        kind: 'incident',
        subtitle: [tipo, cliente].filter(Boolean).join(' · ') || undefined,
        // El latido va SÓLO aquí: es lo único que está pasando ahora mismo.
        pulse: true,
        status: estado ? { label: estado, tone: tonoIncidente, live: true } : undefined,
      },
    ];
    cercanos.forEach((r) => {
      lista.push({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        label: r.nombre,
        // Con vigilante dentro es un recurso disponible; vacío, sólo un punto en
        // el mapa. Que se distingan de un vistazo es media decisión tomada.
        role: r.presentes.length ? 'ok' : 'muted',
        kind: 'station',
        subtitle: `${formatearDistancia(r.metros)} · ${formatearMinutos(r.minutos)} aprox.`,
        status: r.presentes.length
          ? { label: `${r.presentes.length} en puesto`, tone: 'ok' }
          : { label: 'Sin vigilante ahora', tone: 'neutral' },
      });
    });
    return lista;
  }, [cercanos, cliente, estado, incidente, ticket, tipo, tonoIncidente]);

  /** El detalle de cada globo: cifras de despacho y botones que hacen algo. */
  const globoDe = (m: MapEmbedMarker): Partial<MapPopupData> | null => {
    if (m.id === ID_INCIDENTE) {
      return {
        tone: tonoIncidente,
        fields: mapPopupItems(
          tipo ? { label: 'Tipo', value: tipo } : null,
          prioridad ? { label: 'Prioridad', value: prioridad } : null,
          direccion ? { label: 'Ubicación', value: direccion, wide: true } : null,
          { label: 'Coordenadas', value: formatearCoord(m.lat, m.lng), mono: true, wide: true },
        ),
        metrics: mapPopupItems(
          conGente.length
            ? { label: 'Más cercano con vigilante', value: formatearDistancia(conGente[0].metros) }
            : null,
          conGente.length
            ? { label: 'Llegada estimada', value: formatearMinutos(conGente[0].minutos) }
            : null,
        ),
        actions: mapPopupItems(mapPopupActions.directions(m.lat, m.lng, 'Cómo llegar')),
      };
    }

    const r = cercanos.find((x) => x.id === m.id);
    if (!r) return null;
    return {
      subtitle: r.direccion || undefined,
      metrics: mapPopupItems(
        { label: 'Distancia', value: formatearDistancia(r.metros) },
        { label: 'Llegada estimada', value: formatearMinutos(r.minutos) },
      ),
      fields: mapPopupItems(
        {
          label: 'En puesto ahora',
          value: r.presentes.length ? r.presentes.join(', ') : 'Nadie',
          tone: r.presentes.length ? 'ok' : 'warn',
          wide: true,
        },
      ),
      note: 'Tiempo estimado en vehículo por distancia; no contempla el tráfico.',
      actions: mapPopupItems(
        mapPopupActions.detail(() => navigate(`/post-sites/${r.id}/overview`), 'Ver puesto'),
        mapPopupActions.directions(r.lat, r.lng, 'Ruta al incidente'),
        mapPopupActions.radio(() => navigate('/radio'), 'Radio'),
      ),
    };
  };

  const enfocar = (id: string) => {
    nonceRef.current += 1;
    setFoco({ id, nonce: nonceRef.current });
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--hairline)' }}>
        <GoogleMapEmbed
          lat={incidente.lat}
          lng={incidente.lng}
          zoom={15}
          height={`${height}px`}
          className="w-full"
          markers={marcadores}
          markerPopup={globoDe}
          focusMarker={foco}
          hud={
            <div className="cc-map-hud" style={{ left: 10, top: 10 }}>
              {/* El color va en el punto, no en la etiqueta: `.cc-map-key` pinta
                  su `i` con `currentColor`, y teñir el `span` entero dejaría los
                  rótulos de la leyenda en rojo y en verde. */}
              <div className="cc-map-card flex items-center gap-3 px-3 py-2">
                <span className="cc-map-key">
                  <i style={{ color: 'var(--bad)' }} /> Incidente
                </span>
                <span className="cc-map-key">
                  <i style={{ color: 'var(--ok)' }} /> Puesto con vigilante
                </span>
                <span className="cc-map-key">
                  <i style={{ color: 'var(--ink-faint)' }} /> Puesto vacío
                </span>
              </div>
            </div>
          }
        />
      </div>

      {/* La lista es la que se lee de verdad cuando hay prisa: el mapa dice
          dónde, y esto dice a quién en qué orden. */}
      <aside className="rounded-xl border" style={{ borderColor: 'var(--hairline)' }}>
        <div
          className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink)' }}
        >
          <Users className="h-3.5 w-3.5" style={{ color: 'var(--brand-text)' }} />
          Quién está cerca
        </div>

        {cercanos.length === 0 ? (
          <p className="px-3 py-4 text-xs" style={{ color: 'var(--ink-soft)' }}>
            Ningún puesto con coordenadas a menos de {formatearDistancia(ALCANCE_MAX_M)} de este
            incidente.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {cercanos.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => enfocar(r.id)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--glass-sunken)]"
                >
                  <MapPin
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    style={{ color: r.presentes.length ? 'var(--ok)' : 'var(--ink-faint)' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-xs font-semibold"
                      style={{ color: 'var(--ink)' }}
                    >
                      {r.nombre}
                    </span>
                    <span
                      className="mt-0.5 flex items-center gap-1.5 text-[11px] tabular-nums"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      <Navigation className="h-3 w-3" />
                      {formatearDistancia(r.metros)}
                      <span aria-hidden>·</span>
                      {formatearMinutos(r.minutos)}
                    </span>
                    <span
                      className="mt-0.5 block truncate text-[11px]"
                      style={{ color: r.presentes.length ? 'var(--ok-text)' : 'var(--warn-text)' }}
                    >
                      {r.presentes.length ? r.presentes.join(', ') : 'Sin vigilante ahora'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p
          className="flex items-start gap-1.5 border-t px-3 py-2 text-[11px]"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-faint)' }}
        >
          <Radio className="mt-px h-3 w-3 shrink-0" />
          Distancia en línea recta; el tiempo es una estimación en vehículo, sin tráfico.
        </p>
      </aside>
    </div>
  );
}
