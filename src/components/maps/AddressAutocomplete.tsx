import { useCallback, useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin, AlertCircle, Search } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getTenantLocation } from '@/utils/tenantLocation';
import { acquireMap, type PooledMap } from '@/utils/mapPool';
import { useMapPalette } from '@/utils/mapTheme';
import { useMapPopup, mapPopupActions } from '@/components/maps/MapPopup';
import { metrosEntre, useMotorMapa } from '@/utils/mapMotion';
import { formatearCoord, formatearDistancia } from '@/utils/geoMedidas';
import '@/styles/map.css';

export interface AddressComponents {
  address: string;
  addressLine2?: string;
  city: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface AddressAutocompleteProps {
  onAddressSelect: (address: AddressComponents) => void;
  defaultValue?: string;
  placeholder?: string;
  showMap?: boolean;
  mapHeight?: string;
  initialLat?: number;
  initialLng?: number;
  openWithQuery?: string;
  suppressInitialReverse?: boolean;
  onQueryChange?: (query: string) => void;
  onGeocodeResult?: (address: AddressComponents) => void;
  countryCodes?: string[];
}

/**
 * Lo que el operador tiene DELANTE mientras coloca el pin.
 *
 * Aquí no hay geocodificación inversa a propósito (ver el efecto del mapa), así
 * que la «precisión» no puede venir de Google. Las dos medidas que sí existen y
 * no cuestan nada son la exactitud que declara el GPS del navegador y cuánto se
 * ha separado el pin de la dirección que se buscó: con esas dos se sabe si la
 * ubicación guardada es de fiar.
 */
interface Lectura {
  lat: number;
  lng: number;
  /** Dirección con la que se corresponde el pin (la última buscada). */
  direccion: string;
  /** Exactitud declarada por el GPS del navegador, en metros. */
  exactitud: number | null;
  /** Distancia entre el pin y la dirección buscada. */
  desvio: number;
  arrastrando: boolean;
}

export default function AddressAutocomplete({
  onAddressSelect,
  defaultValue = '',
  placeholder = 'Buscar dirección...',
  showMap = true,
  mapHeight = '300px',
  initialLat,
  initialLng,
  openWithQuery,
  onQueryChange,
  onGeocodeResult,
  countryCodes,
}: AddressAutocompleteProps) {
  const { t } = useTranslation();
  const { isLoaded, loadError, google } = useGoogleMaps();

  const inputRef        = useRef<HTMLInputElement>(null);
  const mapRef          = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<any>(null);
  const mapInstanceRef  = useRef<any>(null);
  const pooledRef       = useRef<PooledMap | null>(null);
  const markerRef       = useRef<any>(null);
  const dragDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAddressRef  = useRef<AddressComponents | null>(null);
  /** Punto de la dirección BUSCADA — la referencia contra la que se mide el desvío. */
  const anclaRef        = useRef<{ lat: number; lng: number } | null>(null);

  const [inputValue, setInputValue] = useState(openWithQuery || defaultValue || '');
  const [lectura, setLectura] = useState<Lectura | null>(null);
  /** El mapa vive en una `ref` y no re-renderiza; esto es la señal de que ya está. */
  const [mapaListo, setMapaListo] = useState(false);

  // Paleta viva: la chincheta sigue al acento configurable del CRM y al tema.
  const pal = useMapPalette();
  const palRef = useRef(pal);
  palRef.current = pal;

  // El globo compartido de todos los mapas del CRM.
  const pop = useMapPopup(() => mapInstanceRef.current);
  const popRef = useRef(pop);
  popRef.current = pop;

  // La cámara compartida: centrar es una transición, no un corte.
  const motor = useMotorMapa(mapInstanceRef.current, mapaListo);
  const motorRef = useRef(motor);
  motorRef.current = motor;

  /** Refresca la lectura conservando lo que no cambia y recalcula el desvío. */
  const anotar = useCallback((parche: Partial<Lectura> & { lat: number; lng: number }) => {
    setLectura((prev) => {
      const base: Lectura = prev ?? {
        lat: parche.lat, lng: parche.lng, direccion: '', exactitud: null, desvio: 0, arrastrando: false,
      };
      const siguiente = { ...base, ...parche };
      const ancla = anclaRef.current;
      siguiente.desvio = ancla ? metrosEntre(ancla, { lat: siguiente.lat, lng: siguiente.lng }) : 0;
      return siguiente;
    });
  }, []);

  // ── Classic Autocomplete setup ─────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !google || !inputRef.current) return;
    if (autocompleteRef.current) return;

    // AHORRO · `fields` decide el PRECIO de la llamada final, no `types`.
    //
    // Escribir es gratis: el widget clásico agrupa las pulsaciones en una sesión
    // él solo (no hay que crear ningún `AutocompleteSessionToken`; eso sólo hace
    // falta con `AutocompleteService`, que aquí no se usa). Lo que se factura es
    // UNA llamada de Place Details por dirección elegida, y su nivel lo deciden
    // los campos pedidos:
    //
    //   address_components + formatted_address + geometry → Essentials
    //                                                       $5/1000, 10.000 gratis
    //   …y basta añadir `name`                            → Pro
    //                                                       $17/1000, 5.000 gratis
    //
    // Estaba `name`. Una palabra multiplicaba por 3,4 el precio de cada dirección
    // y partía por la mitad el cupo gratuito. Se usaba sólo como TERCER recurso
    // en `extractAddressComponents`, detrás de `formatted_address`, que nunca
    // viene vacío cuando Google devuelve un sitio. Buscar por rótulo comercial
    // ("Mall del Sol") sigue funcionando —eso lo decide `types`— y el campo se
    // rellena con la dirección formateada del negocio en lugar del rótulo.
    const ac = new google.maps.places.Autocomplete(inputRef.current, {
      ...(countryCodes ? { componentRestrictions: { country: countryCodes } } : {}),
      types: ['geocode', 'establishment'],
      fields: ['address_components', 'formatted_address', 'geometry'],
    });

    autocompleteRef.current = ac;

    const handler = () => {
      const place = ac.getPlace();
      if (!place?.geometry?.location) return;

      const components = extractAddressComponents(place);
      if (!components) return;

      lastAddressRef.current = components;
      lastEmittedRef.current = { lat: components.latitude, lng: components.longitude };
      setInputValue(place.formatted_address ?? components.address);
      onAddressSelect(components);
      onGeocodeResult?.(components);
      onQueryChange?.(place.formatted_address ?? '');

      const position = place.geometry.location;
      const destino = { lat: position.lat(), lng: position.lng() };
      // La dirección elegida pasa a ser el ancla: a partir de aquí, cualquier
      // arrastre se mide contra ella.
      anclaRef.current = destino;
      motorRef.current?.camara.volarA(destino, { zoom: 16 });
      if (markerRef.current) {
        markerRef.current.position = position;
      }
      anotar({
        ...destino,
        direccion: place.formatted_address ?? components.address,
        exactitud: null,
        arrastrando: false,
      });
    };

    ac.addListener('place_changed', handler);

    return () => {
      try { google.maps.event.clearInstanceListeners(ac); } catch { /* ignore */ }
      autocompleteRef.current = null;
    };
  }, [isLoaded, google]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Map setup ─────────────────────────────────────────────────────────────
  //
  // AHORRO: este efecto NO puede depender de `initialLat`/`initialLng`.
  //
  // Google factura cada `new google.maps.Map(...)` como una carga de mapa. Con
  // esas dos props en las dependencias, el efecto se volvía a ejecutar —y por
  // tanto se construía un mapa NUEVO, facturado— cada vez que cambiaban las
  // coordenadas del formulario: al elegir una dirección, y otra vez en CADA
  // arrastre del marcador, porque el arrastre llama a `onAddressSelect` y el
  // padre devuelve las coordenadas nuevas por props. Ajustar el pin con cuatro
  // arrastres eran cinco mapas cobrados en un alta de un solo cliente. Encima el
  // mapa anterior nunca se desmontaba: quedaba huérfano con sus oyentes.
  //
  // Ahora el mapa se construye UNA vez y las coordenadas se aplican
  // desplazándolo (`panTo`), que es gratis. La reserva de `mapPool` va un paso
  // más allá: al desmontar (cambiar de pestaña, retroceder en el asistente,
  // cerrar el modal) el mapa se guarda en vez de tirarse, así que volver a
  // entrar tampoco construye nada.
  const lastEmittedRef = useRef<{ lat: number; lng: number } | null>(null);
  const initialCoordsRef = useRef({ lat: initialLat, lng: initialLng });
  initialCoordsRef.current = { lat: initialLat, lng: initialLng };

  useEffect(() => {
    if (!isLoaded || !google || !showMap || !mapRef.current) return;
    if (mapInstanceRef.current) return;

    const biz = getTenantLocation();
    const { lat: iLat, lng: iLng } = initialCoordsRef.current;
    const lat = (Number.isFinite(iLat) ? iLat : undefined) ?? biz?.lat ?? -0.2295;
    const lng = (Number.isFinite(iLng) ? iLng : undefined) ?? biz?.lng ?? -78.5236;
    const center = new google.maps.LatLng(lat, lng);
    const oscuro = document.documentElement.classList.contains('dark');

    const pooled = acquireMap(mapRef.current, {
      center,
      zoom: Number.isFinite(iLat) && Number.isFinite(iLng) ? 15 : 12,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: false,
      // El MISMO Map ID que el resto del CRM. Con el identificador de
      // demostración que había antes, este mapa era el único que no seguía al
      // tema: se quedaba en claro dentro de un CRM en oscuro. Y como la reserva
      // agrupa por `mapId`, unificarlo también hace que estos mapas y los del
      // resto de pantallas se presten instancias entre sí.
      mapId: 'd94ad875743639fb1933bbd4',
      colorScheme: oscuro ? 'DARK' : 'LIGHT',
    });
    pooledRef.current = pooled;
    mapInstanceRef.current = pooled.map;

    // La gota del acento: es la chincheta que se ARRASTRA, y su punta señala la
    // coordenada exacta. Antes era el globo rojo de serie de Google — el mismo
    // que el texto de ayuda seguía llamando «marcador rojo».
    let contenido: HTMLElement | undefined;
    try {
      contenido = new google.maps.marker.PinElement({
        background: palRef.current.brand,
        borderColor: palRef.current.brandInk,
        glyphColor: palRef.current.brandInk,
        scale: 1.1,
      }).element as HTMLElement;
      contenido.style.transition = 'transform .16s var(--ease, ease), filter .16s var(--ease, ease)';
      contenido.style.transformOrigin = '50% 100%';
    } catch { contenido = undefined; }

    markerRef.current = new google.maps.marker.AdvancedMarkerElement({
      map: mapInstanceRef.current,
      position: center,
      gmpDraggable: true,
      title: 'Arrastra para ajustar la ubicación exacta',
      ...(contenido ? { content: contenido } : {}),
    });

    anclaRef.current = { lat, lng };
    if (Number.isFinite(iLat) && Number.isFinite(iLng)) {
      anotar({ lat, lng, direccion: defaultValue || '', exactitud: null, arrastrando: false });
    }

    const leerPos = () => {
      const pos = markerRef.current?.position as any;
      if (!pos) return null;
      return {
        lat: typeof pos.lat === 'function' ? pos.lat() : (pos.lat as number),
        lng: typeof pos.lng === 'function' ? pos.lng() : (pos.lng as number),
      };
    };

    /** Levanta la chincheta mientras va cogida: es la señal de «lo tengo». */
    const levantar = (activo: boolean) => {
      if (!contenido) return;
      contenido.style.transform = activo ? 'translateY(-8px) scale(1.08)' : '';
      contenido.style.filter = activo ? 'drop-shadow(0 10px 12px rgba(0,0,0,.32))' : '';
    };

    markerRef.current.addListener('gmp-dragstart', () => {
      popRef.current.close();
      levantar(true);
      const ll = leerPos();
      if (ll) anotar({ ...ll, arrastrando: true, exactitud: null });
    });

    // El arrastre dispara en CADA fotograma. La lectura se refresca a ritmo de
    // pantalla para no pelearse con el propio gesto.
    let pendiente = 0;
    markerRef.current.addListener('gmp-drag', () => {
      const ll = leerPos();
      if (!ll) return;
      cancelAnimationFrame(pendiente);
      pendiente = requestAnimationFrame(() => anotar({ ...ll, arrastrando: true }));
    });

    // Debounced drag handler — no reverse-geocoding (Geocoding API not required)
    markerRef.current.addListener('gmp-dragend', () => {
      cancelAnimationFrame(pendiente);
      levantar(false);
      if (dragDebounceRef.current) clearTimeout(dragDebounceRef.current);
      dragDebounceRef.current = setTimeout(() => {
        const pos = markerRef.current?.position;
        if (!pos) return;
        const newLat = typeof (pos as any).lat === 'function' ? (pos as any).lat() : (pos as any).lat;
        const newLng = typeof (pos as any).lng === 'function' ? (pos as any).lng() : (pos as any).lng;
        // Se recuerda lo último emitido para que el efecto de re-centrado no
        // pelee con el arrastre cuando el padre nos devuelva estas coordenadas.
        lastEmittedRef.current = { lat: newLat, lng: newLng };
        // Carry forward the last resolved address, update only coordinates
        const updated: AddressComponents = {
          ...(lastAddressRef.current ?? { address: '', city: '', postalCode: '', country: '' }),
          latitude: newLat,
          longitude: newLng,
        };
        lastAddressRef.current = updated;
        anotar({ lat: newLat, lng: newLng, arrastrando: false, exactitud: null });
        onAddressSelect(updated);
        onGeocodeResult?.(updated);
      }, 300);
    });

    // Pulsar la chincheta cuenta exactamente qué se va a guardar.
    const abrirGlobo = () => {
      const ll = leerPos();
      if (!ll) return;
      popRef.current.open(markerRef.current, {
        id: 'pin',
        kind: 'point',
        title: lastAddressRef.current?.address || inputRef.current?.value || 'Ubicación elegida',
        subtitle: 'Arrastra la chincheta para afinarla',
        tone: 'brand',
        fields: [{ label: 'Coordenadas', value: formatearCoord(ll.lat, ll.lng), mono: true, wide: true }],
        actions: [mapPopupActions.directions(ll.lat, ll.lng)],
      });
    };
    try { markerRef.current.gmpClickable = true; } catch { /* versión antigua */ }
    try { markerRef.current.addListener('gmp-click', abrirGlobo); } catch { /* versión antigua */ }

    setMapaListo(true);

    return () => {
      cancelAnimationFrame(pendiente);
      if (dragDebounceRef.current) clearTimeout(dragDebounceRef.current);
      if (markerRef.current) {
        try { markerRef.current.map = null; } catch { /* ignore */ }
        markerRef.current = null;
      }
      // Devolver ≠ destruir: el mapa queda disponible para el siguiente montaje.
      try { pooledRef.current?.release(); } catch { /* ignore */ }
      pooledRef.current = null;
      mapInstanceRef.current = null;
      setMapaListo(false);
    };
  }, [isLoaded, google, showMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Coordenadas nuevas por props → desplazar, nunca reconstruir ────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !google) return;
    if (!Number.isFinite(initialLat) || !Number.isFinite(initialLng)) return;

    // Si son las que acabamos de emitir nosotros (arrastre del pin), no tocar
    // nada: re-centrar aquí daría un salto visible en mitad del gesto.
    const last = lastEmittedRef.current;
    if (last && Math.abs(last.lat - (initialLat as number)) < 1e-7 && Math.abs(last.lng - (initialLng as number)) < 1e-7) {
      return;
    }

    const destino = { lat: initialLat as number, lng: initialLng as number };
    motorRef.current?.camara.volarA(destino, (map.getZoom?.() ?? 0) < 15 ? { zoom: 15 } : undefined);
    if (markerRef.current) markerRef.current.position = new google.maps.LatLng(destino.lat, destino.lng);
    anclaRef.current = destino;
    anotar({ ...destino, arrastrando: false });
  }, [initialLat, initialLng, google, anotar]);

  // El tema del CRM cambia → las teselas de Google cambian con él. Es la misma
  // vigilancia que hace `GoogleMapEmbed`; sin ella este mapa era el único
  // rectángulo blanco de una pantalla en oscuro.
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const map = mapInstanceRef.current;
      if (!map) return;
      try {
        map.setOptions({
          colorScheme: document.documentElement.classList.contains('dark') ? 'DARK' : 'LIGHT',
        });
      } catch { /* versión sin colorScheme */ }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // ── Address extraction ─────────────────────────────────────────────────────
  const extractAddressComponents = (place: any): AddressComponents | null => {
    if (!place?.geometry?.location) return null;

    let streetNumber = '';
    let route        = '';
    let city         = '';
    let postalCode   = '';
    let country      = '';

    (place.address_components ?? []).forEach((comp: any) => {
      const types: string[] = comp.types ?? [];
      const long = comp.long_name ?? '';
      if (types.includes('street_number'))                        streetNumber = long;
      if (types.includes('route'))                                route = long;
      if (types.includes('locality'))                             city = long;
      if (types.includes('postal_code'))                          postalCode = long;
      if (types.includes('country'))                              country = long;
      if (!city && types.includes('administrative_area_level_2')) city = long;
      if (!city && types.includes('administrative_area_level_1')) city = long;
    });

    // Sin `place.name`: ya no se pide a Google (subía la llamada al nivel Pro) y
    // `formatted_address` cubre el mismo hueco — siempre viene informado cuando
    // la respuesta trae geometría, que es lo que este método exige arriba.
    const address =
      [route, streetNumber].filter(Boolean).join(' ') ||
      place.formatted_address ||
      '';

    return {
      address:    address.substring(0, 200),
      city:       city.substring(0, 100),
      postalCode: postalCode.substring(0, 20),
      country:    country.substring(0, 100),
      latitude:   place.geometry.location.lat(),
      longitude:  place.geometry.location.lng(),
    };
  };

  // ── Geolocation (no reverse-geocoding — just move the pin) ─────────────────
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('La geolocalización no está soportada en este navegador');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        if (mapInstanceRef.current && markerRef.current) {
          motorRef.current?.camara.volarA({ lat, lng }, { zoom: 16 });
          markerRef.current.position = new google.maps.LatLng(lat, lng);
        }

        // Update coords in the form (address text unchanged)
        lastEmittedRef.current = { lat, lng };
        const updated: AddressComponents = {
          ...(lastAddressRef.current ?? { address: '', city: '', postalCode: '', country: '' }),
          latitude: lat,
          longitude: lng,
        };
        lastAddressRef.current = updated;
        anclaRef.current = { lat, lng };
        // La exactitud llega GRATIS en la misma respuesta del navegador y es la
        // única medida de precisión real que hay en esta pantalla: un «±840 m»
        // avisa de que la ubicación viene de la antena de la operadora y no vale
        // para fijar un puesto.
        anotar({
          lat,
          lng,
          exactitud: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          arrastrando: false,
        });
        onAddressSelect(updated);
        onGeocodeResult?.(updated);
      },
      (error) => {
        console.error('[AddressAutocomplete] Geolocation error:', error);
        toast.error('No se pudo obtener la ubicación actual');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No se pudo cargar el mapa. Revisa la configuración de mapas de la cuenta.
        </AlertDescription>
      </Alert>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-4" style={{ borderColor: 'var(--hairline)' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Cargando el mapa…</span>
      </div>
    );
  }

  // Por encima de 100 m la ubicación del navegador viene de la antena, no del
  // satélite: sirve para situar la ciudad, no para fijar un puesto.
  const exactitudFloja = (lectura?.exactitud ?? 0) > 100;

  return (
    <div className="space-y-3">
      {/* Search row — styled like a prominent search bar */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            className="cg-focus h-10 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleUseCurrentLocation}
          className="flex shrink-0 items-center gap-1.5"
        >
          <MapPin className="h-4 w-4" />
          <span className="hidden text-sm sm:inline">{t("ui.AddressAutocomplete.miUbicacion", "Mi ubicación")}</span>
        </Button>
      </div>

      {showMap && (
        <div className="overflow-hidden rounded-lg border border-border shadow-sm">
          <div className="cc-map-frame w-full" style={{ height: mapHeight }}>
            <div ref={mapRef} className="cc-map-canvas" />
            {pop.portal}
          </div>

          {/* La lectura del pin. Sin esto, «arrastra para ajustar» se hace a
              ciegas: no se sabe dónde cayó ni cuánto se separó de la dirección
              que se buscó, que es justo el error que luego rompe una geocerca. */}
          <div className="border-t border-border px-3 py-2 text-xs" style={{ background: 'var(--glass-sunken)' }}>
            {lectura ? (
              <>
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 shrink-0" style={{ color: 'var(--brand-text)' }} />
                  <span className="truncate font-medium" style={{ color: 'var(--ink)' }}>
                    {lectura.arrastrando
                      ? 'Suelta para fijar el punto'
                      : lectura.direccion || 'Punto elegido a mano'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-mono tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                    {formatearCoord(lectura.lat, lectura.lng)}
                  </span>
                  {lectura.exactitud != null && (
                    <span className="font-semibold" style={{ color: exactitudFloja ? 'var(--warn-text)' : 'var(--ok-text)' }}>
                      · GPS ±{formatearDistancia(lectura.exactitud)}{exactitudFloja ? ' · poco fiable' : ''}
                    </span>
                  )}
                  {lectura.exactitud == null && lectura.desvio > 25 && (
                    <span className="font-semibold" style={{ color: 'var(--warn-text)' }}>
                      · {formatearDistancia(lectura.desvio)} de la dirección buscada
                    </span>
                  )}
                </div>
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" style={{ color: 'var(--brand-text)' }} />
                Busca una dirección o arrastra la chincheta para fijar la ubicación exacta.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
