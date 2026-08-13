# Auditoría de consumo — API de Google Maps

**Fecha:** 2026-08-12 · **Alcance:** `frontend/` (CRM), `worker-app/`, `supervisor-app/`, `backend/`
**Naturaleza:** auditoría de sólo lectura. Este documento **mide y decide**; la implementación la hace otro agente.

---

## 1. Resumen ejecutivo

Lo primero, una corrección al diagnóstico de partida:

> ❌ **«`sessionToken`: 0 usos → se paga por pulsación, ~18 peticiones en vez de 1»** — **es un falso positivo.**
> El CRM usa el *widget* clásico `google.maps.places.Autocomplete`, y la documentación de Google dice literalmente: *«If your app is using the Autocomplete Widget you don't need to implement sessions, as the widget handles sessions automatically in the background»*. El token existe, lo crea el widget. **No hay que tocar nada de tokens.**
> El token manual sólo hace falta con `AutocompleteService.getPlacePredictions()` o `AutocompleteSuggestion`, y **no hay ni un solo uso de ninguno de los dos en todo el repositorio** (verificado con grep en las 4 aplicaciones).

Dicho eso, sí hay dinero yéndose, y está en otro sitio:

| # | Dónde se va | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | **La clave no puede estar bien restringida**: la misma clave sirve al CRM web y a las dos apps nativas | Riesgo de factura ajena, sin techo | Mínimo (consola) |
| 2 | **Remontaje del formulario de dirección**: cada arrastre del pin y cada selección construye un mapa NUEVO | ×2–4 sobre cada formulario de dirección | Bajo (2 archivos) |
| 3 | **`name` en los campos de Places**: mueve la llamada de $5/1000 a $17/1000 y le quita la mitad del cupo gratis | ×3,4 sobre cada dirección elegida | Trivial (1 línea) |
| 4 | **24 puntos que montan un mapa dinámico ($7/1000)** donde muchos son miniaturas sin interacción | Static Maps cuesta $2/1000 | Medio |
| 5 | **Geocodificación de Google en 5 sitios sin caché**, incluyendo las dos apps móviles en cada marcación | Escala con la plantilla, no con la oficina | Medio |
| 6 | Ya existe un geocodificador **gratis y cacheado** en el backend que casi nadie usa | Puede matar la línea de Geocoding entera | Medio |

Y algo importante: **con el volumen actual probablemente estés en $0**, porque cada SKU trae 10.000 llamadas gratis al mes. El problema no es la factura de hoy, es que **no hay techo**: sin restricción de clave ni cuotas configuradas, el día que crezcas o que alguien copie la clave, la factura no avisa. Las acciones 1 y 2 se hacen aunque no se hiciera ninguna otra.

---

## 2. Cómo factura Google (precios verificados el 2026-08-12)

Fuente: [lista oficial de precios de Google Maps Platform](https://developers.google.com/maps/billing-and-pricing/pricing).
**Cada SKU tiene su propio cupo gratis mensual** (ya no hay un crédito único de $200 compartido).

| SKU | Gratis/mes | 0–100k | 100k–500k |
|---|---|---|---|
| **Dynamic Maps** (Maps JavaScript API) `FAF4-3B2D-51B2` | 10.000 | **$7,00** /1000 | $5,60 |
| **Static Maps** `3C2D-B525-2E5F` | 10.000 | **$2,00** /1000 | $1,60 |
| **Geocoding** `BAC8-4E68-E261` | 10.000 | **$5,00** /1000 | $4,00 |
| **Place Details Essentials** `6E05-E1C3-8D85` | 10.000 | **$5,00** /1000 | $4,00 |
| **Place Details Pro** `4ED6-464A-2AFC` | **5.000** | **$17,00** /1000 | $13,60 |
| **Autocomplete Requests** `4EF4-B17C-B31A` | 10.000 | $2,83 /1000 | $2,27 |
| **Autocomplete (incluido con Place Details) – Per Session** `E9C9-934B-DDB1` | **ilimitado** | **sin cargo** | — |
| **Directions** `28A8-3EB4-4595` | 10.000 | $5,00 /1000 | $4,00 |

### Las dos reglas que hay que tener en la cabeza

**Regla 1 — «Dynamic Maps» se cobra por CADA `new google.maps.Map()`, no por página.**
Dos mapas en una pantalla son dos eventos. Un mapa que se reconstruye tres veces son tres eventos.
**No se cobra** por mover, hacer zoom, añadir marcadores, polilíneas, geocercas ni InfoWindows. Una vez cargado, la interacción es gratis.

**Regla 2 — el autocompletado se cobra por lo que pides, no por lo que escribes.**
Con el widget (sesión automática), escribir se agrupa en una sesión gratuita y **lo que se paga es la llamada final de Place Details**. El nivel de esa llamada lo deciden los `fields`:

| Campo pedido | Nivel | Precio |
|---|---|---|
| `address_components`, `formatted_address`, `geometry` (location/viewport), `types` | **Essentials** | $5/1000, 10.000 gratis |
| `name` → `displayName`, `business_status` | **Pro** | $17/1000, **5.000** gratis |

---

## 3. Inventario real

### 3.A · Maps JavaScript API — «Dynamic Maps» ($7/1000)

**Seis sitios construyen un mapa.** Son los únicos seis puntos donde se genera el cargo:

| # | Archivo | Línea |
|---|---|---|
| 1 | `frontend/src/components/maps/AddressAutocomplete.tsx` | 112 |
| 2 | `frontend/src/components/GoogleMap/GoogleMapEmbed.tsx` | 274 |
| 3 | `frontend/src/components/GoogleMap/StationGeofencePolygon.tsx` | 90 |
| 4 | `frontend/src/pages/admin/gps-tracker/RouteTrackingMap.tsx` | 105 |
| 5 | `frontend/src/pages/admin/gps-tracker/TrailMap.tsx` | 91 |
| 6 | `frontend/src/pages/admin/dashboard/control-center/components/OperationsMap.tsx` | 186 |

**Veinticuatro pantallas los montan.** Ésta es la superficie real de cobro:

<details>
<summary><b>GoogleMapEmbed — directo (7 pantallas)</b></summary>

- `frontend/src/components/EmpresaDireccionForm.tsx`
- `frontend/src/components/notifications/PanicAlertOverlay.tsx:225` — **está en el header, es global**: un pánico en cualquier pantalla monta un mapa
- `frontend/src/pages/admin/clientes/components/ClientCoverage/ClientCoverage.tsx:422`
- `frontend/src/pages/admin/clientes/components/ClientIncidents/ClientIncidents.tsx:282`
- `frontend/src/pages/admin/clientes/components/ClientPostSites/ClientPostSites.tsx:282`
- `frontend/src/pages/admin/Configuration/components/ProfileCompanyForm.tsx:658`
- `frontend/src/pages/admin/nomina/NominaRecords.tsx:461` y `:493` — **dos mapas por cada registro de turno que se abre** (entrada + salida)

</details>

<details>
<summary><b>IncidentMap — envoltorio de GoogleMapEmbed (8 pantallas)</b></summary>

`frontend/src/components/IncidentMap/IncidentMap.tsx` es literalmente un `GoogleMapEmbed` de 12 líneas. Cada uso es un mapa dinámico completo:

- `components/post-sites/PostSiteMiniInfo.tsx:35`
- `pages/admin/dispatcher/DispatchDetailsPage.tsx:352`
- `pages/admin/dispatcher/DispatchPrintablePage.tsx:328` — **en una vista para imprimir**
- `pages/admin/post-sites/components/PostsiteProfile/Profile.tsx:356`
- `pages/admin/post-sites/components/PostsiteOverview/Overview.tsx:249`
- `pages/admin/post-sites/station-detail/components/StationOverview.tsx:396`
- `pages/admin/clientes/components/ClientOverview/ClientOverview.tsx:135`
- `pages/public/DispatchPublicView.tsx:198` — **página PÚBLICA, sin sesión**

</details>

<details>
<summary><b>AddressAutocomplete — con mapa por defecto (7 pantallas)</b></summary>

`showMap` vale `true` por omisión, así que cada uno de estos monta mapa **además** del autocompletado:

- `components/EmpresaDireccionForm.tsx:19`
- `components/TenantJoinModal.tsx:834`
- `components/onboarding/OnboardingWizard.tsx:454`
- `pages/admin/Configuration/components/ProfileCompanyForm.tsx:624`
- `pages/admin/post-sites/PostSiteWizard.tsx:1020`
- `pages/admin/security-guards/NewSecurityGuardPage.tsx:729`
- `pages/admin/clientes/ClientForm.tsx:993`

</details>

<details>
<summary><b>Resto (5 pantallas)</b></summary>

- `StationGeofencePolygon` → `AddStationPage.tsx:545`, `PostsiteStations/Stations.tsx`, `StationOverview.tsx:586`
- `OperationsMap` → `MapPanel.tsx:49` (panel del dashboard), `MobileCommandCenter.tsx:161`, `OperationsMapFull.tsx:100` (pestaña propia, `/dashboard/operations-map`)
- `TrailMap` → `gps-tracker/TrackingHistory.tsx:171`
- `RouteTrackingMap` → `gps-tracker/LiveTracking.tsx:244`

</details>

#### Los multiplicadores (aquí está el dinero)

**M1 · `ClientForm` remonta el formulario entero en cada cambio de coordenada** — `pages/admin/clientes/ClientForm.tsx:162` y `:994`

```ts
const addressMapKey = `${watchedLat || ''}_${watchedLng || ''}_${mode}_${id || ''}`;
// ...
<AddressAutocomplete key={addressMapKey} ... />
```

`watchedLat`/`watchedLng` son valores observados de react-hook-form. Cuando el usuario elige una dirección, el propio `onAddressSelect` hace `form.setValue('latitude', ...)` → cambia `addressMapKey` → **React desmonta y vuelve a montar el componente** → `new google.maps.Map()` otra vez → **+1 cargo**. Y cuando arrastra el pin para afinar la ubicación, pasa exactamente lo mismo: **+1 cargo por arrastre**.

Efecto colateral: **el mapa se resetea cada vez que arrastras el pin.** No es sólo un cargo, es un fallo de uso.

**M2 · El efecto del mapa se re-ejecuta y no destruye el anterior** — `components/maps/AddressAutocomplete.tsx:112` y `:154`

```ts
}, [isLoaded, google, showMap, initialLat, initialLng]);
```

`initialLat`/`initialLng` están entre las dependencias, y la función de limpieza (líneas 147-153) **sólo quita el marcador; nunca desecha el mapa**. Cada cambio de coordenada construye otro `google.maps.Map` sobre el mismo `div`: **otro cargo, y además una fuga de memoria** (el mapa viejo queda vivo, con sus escuchas).

Con M1 y M2 juntos, rellenar una dirección de cliente cuesta hoy entre **3 y 5 cargas de mapa** donde debería costar **1**.

**M3 · Pantallas que montan dos mapas a la vez**

- `StationOverview.tsx` → `IncidentMap` (línea 396) **+** `StationGeofencePolygon` (línea 586) = 2 mapas en una pestaña
- `ProfileCompanyForm.tsx` → `AddressAutocomplete` con mapa (624) **+** `GoogleMapEmbed` (658) = hasta 2
- `NominaRecords.tsx` → 2 por cada registro abierto; revisar 50 turnos = **100 cargas**

### 3.B · Places API — Autocomplete

| Sitio | Código | Coste |
|---|---|---|
| `components/maps/AddressAutocomplete.tsx:64` | `fields: ['address_components','formatted_address','geometry','name']` | ⚠️ **Place Details Pro** — $17/1000, 5.000 gratis, **por culpa de `name`** |
| `components/GoogleMap/StationGeofencePolygon.tsx:126` | `fields: ["geometry"]` | ✅ Essentials — $5/1000, 10.000 gratis |

Escribir es gratis (sesión automática). Lo que se paga es **una** llamada final por dirección elegida. Pero el `name` de la primera fila la sube de nivel: **3,4× más cara y con la mitad de cupo gratis**.

Se usa en `extractAddressComponents` (línea 181) sólo como tercer recurso, después de `formatted_address`. Es prescindible.

### 3.C · Geocoding API ($5/1000)

**Los cinco sitios que pagan:**

| Archivo | Línea | Cuándo se dispara | Caché |
|---|---|---|---|
| `frontend/.../GoogleMapEmbed.tsx` | 194 | Al montar, si llega `address` sin lat/lng | ❌ ninguna |
| `frontend/.../GoogleMapEmbed.tsx` | 363 | En **cada arrastre** del pin (geocodificación inversa) | ❌ ninguna |
| `frontend/.../ProfileCompanyForm.tsx` | 375 | **Mientras se escribe**, debounce 700 ms | ❌ ninguna |
| `worker-app/src/lib/geo.ts` | 130 | `SelfieClockIn` — **cada marcación de cada vigilante** | ❌ ninguna |
| `supervisor-app/src/lib/geo.ts` | 130 | `SelfieClockIn` + `Emergency` (2 llamadas) | ❌ ninguna |

Dos detalles que importan:

- **`ProfileCompanyForm.tsx:375`** geocodifica *mientras el usuario teclea*. El debounce de 700 ms no agrupa una dirección entera: agrupa hasta la siguiente pausa. Escribir «Av. Amazonas N24-03 y Colón, Quito» a mano son fácilmente **4-6 peticiones pagadas** para una sola dirección.
- **Las apps móviles llaman a `maps.googleapis.com` directamente desde el dispositivo**, con la clave dentro del paquete. Este volumen **escala con el número de vigilantes**, no con los usuarios de oficina — y sólo sirve para mostrar la dirección en texto bonito en la pantalla de marcación.

**Y mientras tanto, ya existe una alternativa gratis que casi nadie usa:**

| Archivo | Qué es |
|---|---|
| `backend/src/api/geocode.ts` | Proxy `GET /geocode/reverse` y `/geocode/search` → **Nominatim (OSM), sin clave, gratis**, con caché de 24 h |
| `backend/src/lib/geocode.ts` | Geocodificación directa a Nominatim con caché de 24 h + estrangulador de 1 req/s |
| `frontend/src/lib/geocodeClient.ts` | El cliente del proxy… |
| `…usado únicamente en` | `pages/admin/post-sites/station-detail/components/StationOverview.tsx:132` |

**Un solo consumidor.** Toda la infraestructura para no pagar geocodificación ya está escrita y desplegada.

### 3.D · Directions API ($5/1000) — prioridad baja

`pages/admin/vehicle-patrol/PatrullaBoardPage.tsx:55` — `DirectionsService` con `optimizeWaypoints: true`.
**Verificado: no está en bucle.** Se dispara sólo al pulsar «optimizar ruta», y sólo con ≥3 paradas con coordenadas (línea 51). Volumen bajísimo.
Nota: la optimización de waypoints y las rutas con más de 10 paradas se facturan a la tarifa «Advanced», más cara. Con este volumen no compensa tocarlo.

### 3.E · Static Maps API ($2/1000)

| Archivo | Uso |
|---|---|
| `worker-app/src/lib/station.ts:47` | Fondo del héroe «en servicio» — `useGuardMap.ts:93` |
| `supervisor-app/src/lib/station.ts:47` | Ídem — `GuardMap.tsx:98` |

Las URLs son deterministas por lat/lng, así que el navegador y la WebView las cachean. Bien resuelto.

**El CRM no usa Static Maps en ningún sitio.** Ésa es la oportunidad de la sección 5.4.

### 3.F · Lo que está BIEN — no tocar

Esto ya está bien hecho y el agente de implementación **no debe regresionarlo**:

- ✅ **`frontend/src/utils/loadGoogleMaps.ts`** deduplica el script con una promesa compartida y detecta etiquetas ya presentes en el DOM (línea 27). Una sola carga de librería por pestaña.
- ✅ **`useControlCenter.ts:279`** sondea posiciones cada 15 s, pero **sólo mueve marcadores** (`OperationsMap.tsx:262-269`). El mapa se crea una vez, con dependencias `[]` (línea 207). **Cero coste de Maps**, aunque sí pegue al backend.
- ✅ **`useMovil.ts`** decide en JavaScript en vez de con clases `md:` **precisamente para no montar dos mapas y enseñar uno**. El comentario del archivo lo explica. Respetarlo.
- ✅ `GoogleMapEmbed`, `OperationsMap`, `TrailMap`, `RouteTrackingMap` y `StationGeofencePolygon` inicializan el mapa en efectos con dependencias `[]`: una construcción por montaje. **Correcto.** El problema de M2 es exclusivo de `AddressAutocomplete`.
- ✅ Los cambios de tema (`GoogleMapEmbed.tsx:437`, `OperationsMap.tsx:212`) usan `setOptions()` en vez de reconstruir el mapa. Correcto — y es la técnica que hay que copiar para arreglar M2.

---

## 4. Estimación con supuestos explícitos

⚠️ **Estos números son una fórmula con supuestos inventados por mí, no una lectura de tu factura.** Los precios sí son reales (sección 2). Para los volúmenes reales, ver la sección 7.

### Fórmula

```
Cargas de mapa/mes  =  U × P × R × D
    U = usuarios de CRM activos al día
    P = pantallas con mapa que abre cada uno al día
    R = factor de remontaje  (hoy ≈ 2–4 en formularios de dirección; 1 con el arreglo)
    D = días laborables al mes (22)

Coste = MAX(0, cargas − 10.000) ÷ 1000 × $7,00
```

```
Geocodificaciones móviles/mes  =  V × M × D
    V = vigilantes con app
    M = marcaciones al día (entrada + salida = 2)

Coste = MAX(0, geocodificaciones − 10.000) ÷ 1000 × $5,00
```

```
Direcciones nuevas/mes  =  A
Coste HOY (con `name`, nivel Pro)  = MAX(0, A − 5.000)  ÷ 1000 × $17,00
Coste con el arreglo (Essentials)  = MAX(0, A − 10.000) ÷ 1000 × $5,00
```

### Tres escenarios (supuestos, no medidos)

| | **Hoy** (20 usuarios) | **Crecimiento** (80 usuarios) | **Crecimiento + arreglos** |
|---|---|---|---|
| U × P × D | 20 × 8 × 22 = 3.520 | 80 × 8 × 22 = 14.080 | 14.080 |
| Extra por remontaje (M1+M2) | +1.760 | +7.040 | **+0** |
| Miniaturas movidas a Static | — | — | −8.448 (60 %) |
| **Dynamic Maps facturables** | **0** (bajo el cupo) | **11.120** | **0** (5.632, bajo el cupo) |
| **$ Dynamic Maps** | **$0** | **$77,84** | **$0** |
| Geocodificación móvil (V=400) | 17.600 → 7.600 facturables | 17.600 → 7.600 | **0** (vía proxy Nominatim) |
| **$ Geocoding** | **$38,00** | **$38,00** | **$0** |
| Direcciones nuevas A = 8.000 | Pro: 3.000 × $17 = **$51,00** | **$51,00** | Essentials: 0 → **$0** |
| **TOTAL/mes** | **≈ $89** | **≈ $167** | **≈ $0** |

**Lo que hay que leer aquí:** la partida grande de hoy no son los mapas, es la **geocodificación móvil** ($38) y el **nivel Pro innecesario de Places** ($51). Los mapas dinámicos sólo empiezan a doler cuando dupliques o tripliques usuarios — pero cuando duelan, el multiplicador de remontaje ya estará cobrando el triple.

---

## 5. Estrategia de ahorro, ordenada por ahorro ÷ esfuerzo

---

### 5.1 · Restringir la clave y poner techo en Google Cloud 🔴 HACER PRIMERO

**Ahorro:** no es ahorro, es **seguro contra catástrofe**. Es la única medida que pone un límite superior a la factura.
**Esfuerzo:** ~30 min en la consola de Google Cloud. **Cero código.**

**Lo que encontré (sin exponer ningún secreto):**

- La **misma clave**, byte a byte, está en `frontend/.env`, `worker-app/.env` y `supervisor-app/.env`. Verificado comparando huellas SHA-256, no valores.
- Esa clave **viaja dentro de los paquetes compilados** de Android e iOS de ambas apps móviles (`worker-app/android/.../assets/public/assets/index-*.js`, `worker-app/ios/App/App/public/assets/…`, y los equivalentes de supervisor-app). Cualquiera que descomprima el APK la tiene. Esto es inevitable con claves de cliente; lo que no es inevitable es que no esté restringida.
- ✅ Buena noticia: **ni los `.env` ni esos paquetes están versionados en git** (comprobado con `git ls-files`). La clave no está en GitHub.
- `frontend/INICIO_RAPIDO_DIRECCIONES.md:81` y `IMPLEMENTACION_AUTOCOMPLETADO_DIRECCIONES.md:86` **recomiendan** restringir por referente HTTP, pero eso es una recomendación en un documento, no una prueba de configuración.

**La deducción que importa:** una clave que funciona a la vez en un navegador **y** en una WebView de Capacitor (cuyo origen es `capacitor://localhost` o `https://localhost`) **no puede estar restringida sólo por referente HTTP**. O está sin restringir, o la lista incluye `localhost`, que en la práctica es lo mismo. **Hay que verificarlo en la consola.**

**Qué hacer:**

1. **Partir la clave en tres.** Una por superficie:

   | Clave | Restricción de aplicación | Restricción de API |
   |---|---|---|
   | Web (CRM) | Referentes HTTP: `https://app.cguardpro.com/*` (+ el dominio de pruebas) | Maps JavaScript API, Places API, Geocoding API |
   | Android | Nombre del paquete + huella SHA-1 del certificado de firma | Maps Static API, Geocoding API |
   | iOS | Identificador del paquete | Maps Static API, Geocoding API |

   Las apps móviles **no usan** Maps JavaScript ni Places. Quitárselo cierra la puerta más cara.

2. **Cuota diaria por API** (Google Cloud → APIs y servicios → Cuotas). Un tope diario en Maps JavaScript API, Geocoding API y Places API a ~3× el uso normal. Si algo se desboca, deja de funcionar en vez de facturar.

3. **Presupuesto y alertas** (Facturación → Presupuestos). Un presupuesto mensual con avisos al 50 %, 90 % y 100 %.

**Riesgo:** si se restringe mal, los mapas dejan de cargar. **Mitigación:** desplegar las claves nuevas primero en un entorno de pruebas; y para Android, recordar que la huella SHA-1 de depuración y la de publicación son distintas — hay que registrar las dos.

---

### 5.2 · Matar el remontaje del formulario de dirección 🔴

**Ahorro:** de 3–5 cargas por dirección a 1 → **−60 a −75 %** del consumo de mapas en formularios.
**Esfuerzo:** bajo, 2 archivos.
**Extra:** arregla un fallo de uso real (el mapa se resetea al arrastrar el pin) y una fuga de memoria.

**Cambio A — `frontend/src/pages/admin/clientes/ClientForm.tsx`**

Quitar `watchedLat`/`watchedLng` de `addressMapKey` (línea 162). La `key` sólo debe cambiar cuando cambia el registro que se edita, no cuando cambian sus coordenadas:

```ts
const addressMapKey = `${mode}_${id || ''}`;
```

**Cambio B — `frontend/src/components/maps/AddressAutocomplete.tsx`**

El efecto del mapa (líneas 104-154) debe **construir el mapa una vez** y luego reaccionar a las coordenadas con `panTo`/`setCenter`, igual que ya hace `GoogleMapEmbed.tsx:437` y `OperationsMap.tsx:212`:

- Efecto de construcción: dependencias `[isLoaded, google, showMap]`, y su limpieza debe soltar de verdad el mapa y el marcador.
- Efecto separado de recentrado: dependencias `[initialLat, initialLng]`, que sólo llame a `mapInstanceRef.current.panTo(...)` y mueva `markerRef.current.position`.

Revisar el mismo patrón en `TenantJoinModal.tsx:836`, `OnboardingWizard.tsx:456` y `PostSiteWizard.tsx:1026`, que pasan `initialLat`/`initialLng` desde estado de formulario igual que `ClientForm`.

**Riesgo:** bajo. Hay que comprobar que al elegir una dirección el mapa sigue centrándose (lo hace ya el manejador `place_changed`, líneas 86-92) y que al abrir un cliente existente el mapa arranca en sus coordenadas.

---

### 5.3 · Quitar `name` de los campos de Places 🟢

**Ahorro:** $17/1000 → $5/1000 y el cupo gratis pasa de 5.000 a 10.000. **−70 % del coste por dirección.**
**Esfuerzo:** una línea.

**`frontend/src/components/maps/AddressAutocomplete.tsx:67`**

```ts
fields: ['address_components', 'formatted_address', 'geometry'],   // fuera 'name'
```

Y en `extractAddressComponents` (línea 181), quitar `place.name` de la cadena de recursos. `formatted_address` ya la precede y cubre el caso.

**Riesgo:** muy bajo. Sólo afecta a buscar por nombre de negocio («Mall del Sol») en vez de por dirección: seguiría encontrándolo (`types: ['geocode','establishment']` no cambia), pero rellenaría el campo con la dirección formateada en vez de con el rótulo comercial. Si el usuario valora el rótulo, la alternativa es dejar `name` **sólo** en los formularios de cliente y quitarlo del resto — pero verificar antes si a alguien le importa.

---

### 5.4 · Static Maps para las miniaturas sin interacción 🟡

**Ahorro:** $7/1000 → $2/1000 (**−71 %**) en cada pantalla convertida, más cupo gratis propio de 10.000, más una carga visualmente instantánea (una imagen, no un lienzo con teselas).
**Esfuerzo:** medio — un componente nuevo y sustituirlo en 8-10 sitios.

**Candidatos, por orden de rentabilidad:**

| Pantalla | Por qué | Nota |
|---|---|---|
| `pages/public/DispatchPublicView.tsx:198` | **Página pública sin sesión.** Un rastreador o un enlace compartido factura cargas sin límite | 🔴 el más urgente |
| `pages/admin/dispatcher/DispatchPrintablePage.tsx:328` | Es una vista **para imprimir**. Un mapa interactivo en papel no tiene sentido | Ganancia limpia |
| `pages/admin/nomina/NominaRecords.tsx:461` y `:493` | **Dos mapas por registro abierto**; el revisor de nómina abre decenas al día | El mayor volumen |
| `components/post-sites/PostSiteMiniInfo.tsx:35` | Miniatura informativa | |
| `PostsiteOverview/Overview.tsx:249`, `PostsiteProfile/Profile.tsx:356`, `ClientOverview.tsx:135` | Fichas de resumen | |
| `notifications/PanicAlertOverlay.tsx:225` | ⚠️ **NO convertir.** El operador necesita hacer zoom y ver el entorno en un pánico | Excepción |

**Cómo:** portar `staticMapUrl()` de `worker-app/src/lib/station.ts:31-48` a `frontend/src/utils/` y crear un `<MapaEstatico>` que renderice `<img>` con un botón «ver mapa interactivo» que monte el `GoogleMapEmbed` de verdad bajo demanda. Así no se pierde ninguna función: se pospone el cargo hasta que alguien lo pide.

**Detalles a no olvidar:**
- La URL debe ser determinista (mismo lat/lng/tamaño → misma URL) para que el navegador la cachee. `station.ts` ya lo hace bien.
- Añadir `loading="lazy"` al `<img>`.
- Con `scale=2` la imagen sale a doble densidad y sigue siendo **una** petición.
- La clave web tendrá que permitir también Maps Static API (ver 5.1).

**Riesgo:** bajo, pero es un cambio visible. Conviene hacerlo pantalla a pantalla y no en un solo golpe.

---

### 5.5 · Toda la geocodificación por el backend, cacheada y compartida 🟡

**Ahorro:** puede llevar la línea de Geocoding a **$0**. En el escenario de 400 vigilantes son ~$38/mes que desaparecen, y el ahorro crece con la plantilla.
**Esfuerzo:** medio-alto — 5 sitios de llamada + subir la caché a base de datos.

**La respuesta a la pregunta «¿caché en cliente o en el backend?»: en el backend, sin duda.** Una caché en el cliente sirve a un usuario y muere al recargar. Una caché en el servidor sirve a **todos los usuarios de todos los tenants**: la sede de un cliente se geocodifica una vez en la vida de la empresa, no una vez por cada persona que abre la ficha. Y las direcciones de los puestos se repiten muchísimo — las mismas coordenadas de marcación, turno tras turno, día tras día.

**Ya existe la mitad del trabajo:**
- `backend/src/api/geocode.ts` — proxy a Nominatim (gratis, sin clave) con caché de 24 h
- `backend/src/lib/geocode.ts` — geocodificación directa con caché de 24 h y estrangulador de 1 req/s
- `frontend/src/lib/geocodeClient.ts` — el cliente, hoy con **un solo consumidor**

**Plan:**

1. **Persistir la caché en base de datos**, no en un `Map` de memoria. Hoy `geocode.ts:6` y `lib/geocode.ts:22` usan objetos en memoria: se pierden en cada reinicio y, con PM2 en clúster, **cada proceso tiene la suya** (el mismo problema que documenta `scheduler-duplication`). Una tabla `geocodeCache(clave, lat, lng, direccion, proveedor, actualizadoEn)` con la clave normalizada (coordenadas redondeadas a ~5 decimales para el inverso, texto normalizado para el directo) resuelve las tres cosas.

2. **Redondear las coordenadas antes de consultar.** En geocodificación inversa de marcaciones, 4 decimales son ~11 m: suficiente para una dirección postal, y hace que dos marcaciones del mismo puesto compartan entrada de caché. Esto solo ya elimina la mayor parte del volumen móvil.

3. **Migrar los llamantes:**
   - `worker-app/src/lib/geo.ts:130` y `supervisor-app/src/lib/geo.ts:130` → llamar a `/geocode/reverse` del backend en vez de a `maps.googleapis.com`. **Bonus de seguridad:** deja de hacer falta la clave de Maps en las apps móviles para esto.
   - `GoogleMapEmbed.tsx:194` y `:363` → mismo proxy.
   - `ProfileCompanyForm.tsx:375` → mismo proxy, **y subir el debounce a 1.200 ms o mejor aún, disparar sólo al perder el foco del campo**. Geocodificar mientras se teclea es tirar peticiones.

4. **Google como respaldo, no como primera opción.** Nominatim es gratis pero su cobertura en Ecuador es peor que la de Google. La estrategia sensata: caché → Nominatim → Google sólo si Nominatim devuelve vacío, y **guardar siempre el resultado en la caché** venga de donde venga. Así se paga a Google una vez por dirección en toda la vida del sistema, en vez de una vez por vista.

**Riesgo:** medio. La calidad de las direcciones puede bajar en los casos que Nominatim no resuelve. **Mitigación:** el respaldo a Google del punto 4, y medir durante dos semanas qué porcentaje de consultas necesita el respaldo antes de decidir si merece la pena mantenerlo.

---

### 5.6 · Montar los mapas sólo cuando se ven 🟡

**Ahorro:** proporcional a cuántos mapas hay bajo el pliegue o en pestañas cerradas. En pantallas como `StationOverview` (2 mapas) y `NominaRecords` puede ser la mitad.
**Esfuerzo:** bajo — un `IntersectionObserver` dentro de `GoogleMapEmbed`.

Hoy, `GoogleMapEmbed` construye el mapa en cuanto se monta el componente, esté visible o no. En una ficha larga con el mapa al fondo, se paga aunque nadie baje a verlo.

Envolver la construcción (`GoogleMapEmbed.tsx:153-405`) en un `IntersectionObserver` que espere a que el contenedor entre en el viewport. Un cambio, y beneficia a las 15 pantallas que pasan por `GoogleMapEmbed`/`IncidentMap`.

**Riesgo:** bajo. Cuidado con los contenedores de altura cero antes de que se resuelva el diseño; conviene un `rootMargin` generoso (p. ej. `200px`) para que el mapa esté listo justo antes de aparecer.

---

### 5.7 · Reutilizar la instancia de mapa entre rutas 🔵 DEJAR PARA EL FINAL

**Ahorro:** alto en teoría — navegar dashboard → cliente → puesto → dashboard son hoy 4 cargas y podrían ser 1.
**Esfuerzo:** **alto**. **Riesgo:** medio-alto.

La técnica es un `<MapHost>` singleton montado una vez en la raíz de la aplicación, cuyo `div` se reubica en el DOM (o se posiciona en absoluto sobre el hueco) según qué pantalla lo pida. Es un patrón conocido pero delicado: choca con las transiciones de ruta, con los diálogos, con `fitBounds` durante el movimiento y con las pantallas que quieren dos mapas a la vez.

**Recomendación: no hacerlo todavía.** Las medidas 5.1 a 5.6 dan la mayor parte del ahorro con una fracción del riesgo. Volver a esto sólo si, ya medido en la consola de Google, «Dynamic Maps» sigue siendo la partida dominante.

---

### 5.8 · Agrupación de marcadores — 🔵 esto NO ahorra dinero

Ponerlo aquí para zanjar el asunto: **los marcadores no se facturan.** Google cobra la carga del mapa; añadir 5 marcadores o 500 cuesta exactamente lo mismo.

La agrupación sirve para **rendimiento**, y ahí sí hace falta: `OperationsMap.tsx:239-282` crea un `g.maps.Marker` por entidad y **los repinta enteros cada 15 segundos** cuando llega el sondeo de posiciones. Con 300 vigilantes en pantalla eso son 300 objetos DOM/lienzo reconstruidos cuatro veces por minuto.

Si se aborda, que sea con esa justificación —fluidez del centro de mando—, no como medida de ahorro. Y de paso: `OperationsMap` usa `g.maps.Marker`, que Google tiene marcado como obsoleto; `AdvancedMarkerElement` (que ya se usa en `GoogleMapEmbed`) rinde mejor con volumen. Eso sí requiere un `mapId`, que hoy sólo tiene `GoogleMapEmbed` (línea 281, escrito a mano) — `VITE_GOOGLE_MAPS_MAP_ID` no está definido en ningún `.env`, y `AddressAutocomplete.tsx:118` usa `'DEMO_MAP_ID'`, que es el identificador de ejemplo de la documentación de Google. Conviene crear un Map ID propio y ponerlo en la variable de entorno, que `utils/mapMarker.ts:31` ya está preparado para leer.

---

## 6. Cuadro de mando de la implementación

| Orden | Acción | Archivos | Ahorro | Riesgo |
|---|---|---|---|---|
| 1 | Partir la clave en 3 + cuotas + presupuesto | Consola GCP, 3 × `.env` | Pone techo | Medio si se restringe mal |
| 2 | Quitar `name` de los campos de Places | `AddressAutocomplete.tsx:67,181` | −70 % por dirección | Muy bajo |
| 3 | Matar el remontaje del formulario | `ClientForm.tsx:162`, `AddressAutocomplete.tsx:104-154` | −60/−75 % en formularios | Bajo |
| 4 | Montar el mapa sólo cuando se ve | `GoogleMapEmbed.tsx:153` | −30/−50 % en fichas | Bajo |
| 5 | Static Maps en las miniaturas | 8-10 pantallas + util nuevo | −71 % por pantalla | Bajo, visible |
| 6 | Geocodificación por el backend con caché en BD | 5 llamantes + `backend/src/api/geocode.ts` | Geocoding → ~$0 | Medio (calidad) |
| 7 | Map ID propio + marcadores avanzados en OperationsMap | `.env`, `OperationsMap.tsx:262` | $0 — rendimiento | Bajo |
| 8 | Reutilizar la instancia de mapa entre rutas | Arquitectónico | Alto | Alto |
| — | ~~Tokens de sesión en Places~~ | — | **Ninguno: ya lo hace el widget** | — |
| — | ~~Agrupación de marcadores como ahorro~~ | — | **Ninguno: los marcadores son gratis** | — |

---

## 7. Cómo medir de verdad (antes de creerse la sección 4)

Los números de la sección 4 son una fórmula con supuestos míos. Los reales están en Google Cloud, y sacarlos es cuestión de minutos:

1. **Google Cloud Console → Facturación → Informes.** Agrupar por **SKU** y por mes, últimos 6 meses. Eso da la respuesta exacta a «¿en qué se me va el dinero?». Buscar concretamente: `Dynamic Maps`, `Geocoding`, `Places API Place Details Pro`, `Autocomplete Requests`, `Static Maps`.
2. **APIs y servicios → Panel → Métricas.** Tráfico por API y por día. Aquí se ve si el consumo tiene picos (un bot en `DispatchPublicView`, una pantalla que remonta en bucle) o si es plano.
3. **Contrastar con la sección 3.** Si `Dynamic Maps` sale muy por encima de `usuarios × pantallas × días`, el multiplicador de remontaje (M1/M2) está confirmado y la acción 3 sube al primer puesto.
4. **Métrica de referente**, en el informe de métricas: si aparece tráfico desde referentes que no son `app.cguardpro.com`, la clave está siendo usada por terceros y la acción 1 pasa a ser urgente de verdad.

---

## 8. Fuentes

- [Google Maps Platform — lista de precios de servicios base](https://developers.google.com/maps/billing-and-pricing/pricing) (precios y cupos gratuitos de la sección 2)
- [Maps JavaScript API — Usage and Billing](https://developers.google.com/maps/documentation/javascript/usage-and-billing) («Dynamic Maps are billed per load»; mover y hacer zoom no factura)
- [Place Autocomplete (JavaScript)](https://developers.google.com/maps/documentation/javascript/place-autocomplete) («*If your app is using the Autocomplete Widget you don't need to implement sessions, as the widget handles sessions automatically in the background*»)
- [Places API — Session tokens](https://developers.google.com/maps/documentation/places/web-service/session-tokens)
- [Places API — Autocomplete session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing)
- [Places API — Data fields (niveles Essentials / Pro / Enterprise)](https://developers.google.com/maps/documentation/places/web-service/data-fields) (`displayName` es Pro)
