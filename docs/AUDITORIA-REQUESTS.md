# Auditoría de peticiones duplicadas — CRM (frontend)

**Fecha:** 2026-09-15
**Entorno medido:** `https://app.cguardpro.com` (producción, inquilino Seguridad B.A.S.)
**Build servido:** `index-DteAeqbS.js` — build de **producción** (Vite con hash). Dato
importante: en un build de producción React **no** duplica los efectos por `StrictMode`.
Todo duplicado que se vea aquí es duplicado de verdad, escrito en el código.
**Método:** instrumentación de `fetch` + `XMLHttpRequest` en la propia página, navegación
SPA (sin recargar), 5–8 s de espera por ruta y 20–25 s extra en reposo para detectar sondeo.
Sólo lectura: no se envió ningún formulario ni se pulsó ninguna acción irreversible.

---

## 1. Conclusión principal (y corrección al diagnóstico de partida)

La hipótesis de entrada era: «311 archivos con `useEffect` y sólo uno con `useQuery` → toda
la app hace fetching a mano → por eso hay duplicados en todas partes».

**Los dos hechos son ciertos pero no están conectados.** Medidas 24 rutas: **20 salen
limpias**. El fetching a mano no produce duplicados por sí mismo — produce ausencia de
caché entre visitas, que es otro problema (menos grave). Los duplicados vienen de **cuatro
causas concretas y localizadas**, cada una con su propio arreglo:

| # | Causa | Alcance | Peticiones extra |
|---|---|---|---|
| A | El layout y la pestaña piden lo mismo | ficha de vigilante y de supervisor | 2× perfil + 2× valoración en 8 de 13 pestañas |
| B | La cabecera no se comparte entre pestañas | 13 pestañas de la ficha | 3 peticiones por cada cambio de pestaña |
| C | Dos efectos con las mismas dependencias piden el mismo endpoint | 4 pantallas | 2×–4× por carga |
| D | Un `id` equivocado propagado a 3 endpoints | ficha de vigilante | 1 × **404** + 2 llamadas con el id que no toca |

Y dos cosas que **parecen** bug y no lo son — conviene dejarlas escritas para no
«arreglarlas» por error:

- **`POST /api/track` 2× en cada navegación no es un duplicado.** Es `VisitBeacon`:
  el desmontaje cierra la pantalla anterior y el montaje abre la nueva. Dos avisos de dos
  pantallas distintas, no dos avisos de la misma. Ver §5.
- **No hay sondeo en ninguna parte.** 25 s en reposo en `/dashboard`, `/alarm/queue` y
  `/activities` → **0 peticiones**. Lo de tiempo real va por websocket/SSE. No hay nada
  que preguntar ni nada que tocar aquí.

---

## 2. Inventario medido

`@ms` son milisegundos desde el arranque de la instrumentación; lo que importa es la
distancia **entre** repeticiones del mismo endpoint.

### 2.1 Rutas limpias (1× cada endpoint)

| Ruta | Peticiones API | Veredicto |
|---|---|---|
| `/dashboard` | — (+0 en 25 s de reposo) | limpia |
| `/alarm/queue` | `alarm/cases` 1× (+0 en 25 s) | limpia |
| `/stations` | `station/cards` 1× | limpia |
| `/dispatch-tickets` | `client-account`, `business-info`, `request` 1× | limpia |
| `/inventory` | `global-inventory` 1× | limpia |
| `/clients` | `email-preferences`, `category`, `client-account`, `card-meta` 1× | limpia |
| `/customer-requests` | `request` 1× | limpia |
| `/guard-ratings` | `guard-ratings`, `security-guard` 1× | limpia |
| `/reports` | ninguna | limpia |
| `/security/audit` | `security/audit-logs` 1× | limpia |
| `/security-guards` | `security-guard`, `stations`, `assignment-map`, `guard-ratings/summary` 1× | limpia |
| `/supervisors` | `supervisors` 1× | limpia |
| `/back-office` | `client-account`, `user`, `auth/me` 1× | limpia |
| `/schedule` | `scheduler/overview` 1× | limpia |
| `/nomina/dashboard` | `attendance/dashboard` 1× | limpia |
| `/tasks` | `task/approvals`, `message-unread` 1× | limpia |
| `/live-tracking` | `supervisors`, `route`, `route-runs`, `active-locations` 1× | limpia |
| `/analytics/guard` | `operations/analytics`, `performance/guards` 1× | limpia |
| `/setting` | ninguna | limpia |
| `/guards/{id}/horario`, `/documentos` | 4 peticiones, todas 1× | limpia (salvo §2.3) |

### 2.2 Las cuatro peores

**① `/post-sites/{id}/stations/{id}/overview` — la peor de todas**

| Endpoint | n | @ms | Veredicto |
|---|---|---|---|
| `GET /guard-shift` | **4×** | 510197, 510198, **510833**, 510835 | duplicado (1 ms) + segunda ronda a 635 ms |
| `GET /post-site/{id}` | **2×** | 510199, **510839** | duplicado (640 ms) |
| `GET /station/{id}/positions` | **2×** | 510201, **510840** | duplicado (639 ms) |
| `GET /station/{id}` | 1× | 510211 | legítima |
| `GET /geocode/reverse` | 1× | 510836 | legítima |
| `GET /rotation-styles` | 1× | 510847 | legítima |

13 peticiones donde caben 6. El patrón de los ~640 ms es una **cascada**: un efecto guarda
estado, el estado dispara un segundo efecto que vuelve a pedir lo mismo.
Origen: `StationOverview.tsx` líneas 263 y 381, dos efectos con dependencias idénticas
(`[stationId]`) pidiendo el mismo endpoint.

**② `/post-sites/{id}/stations/{id}/shifts`**

| Endpoint | n | @ms | Veredicto |
|---|---|---|---|
| `GET /guard-assignments` | **3×** | 518202, 518207, **520612** | duplicado (5 ms) + tercera a 2,4 s |
| `GET /station/{id}/positions` | 1× | 518204 | legítima |
| `GET /shift` | 1× | 518205 | legítima |

Origen: `StationShifts.tsx` — `useEffect(…, [loadAsignados])` con `loadAsignados`
inestable, más un tercer efecto que vuelve a llamarlo.

**③ `/guards/{id}/resumen`**

| Endpoint | n | @ms | Veredicto |
|---|---|---|---|
| `GET /security-guard/{id}` | **2×** | 164002, 164006 | duplicado (4 ms) |
| `GET /guard-ratings/summary` | **2×** | 164004, 164006 | duplicado (2 ms) |
| `GET /security-guard/{id}/performance` | 1× | 164965 | **404** — ver §4 |
| `GET /security-guard/{id}/employment` | 1× | 164004 | legítima |
| `GET /staff/{id}/role-options` | 1× | 164644 | legítima |
| `GET /memos`, `/assignments`, `/schedule` | 1× | 164958–164967 | legítimas (id equivocado, §4) |

Reproducido en dos cargas separadas, cifras idénticas. Mismo patrón en `/guards/{id}/perfil`.

**④ `/guards/{id}/licencias`**

| Endpoint | n | @ms | Veredicto |
|---|---|---|---|
| `GET /security-guard/{id}/licenses` | **2×** | 206885, 206889 | duplicado (4 ms) |
| `GET /security-guard/{id}` | 1× | 206883 | de la cabecera (§2.3) |
| `GET /guard-ratings/summary` | 1× | 206884 | de la cabecera (§2.3) |

Confirmado por traza de pila: dos entradas a `getSecurityGuardLicenses` desde el mismo
montaje. Origen: `GuardLicensespage.tsx` líneas **258** y **312** — dos efectos con las
**mismas dependencias** `[id, page, limit]`, uno con la petición en línea y otro llamando a
`loadLicenses()`. Copia y pega.

**⑤ `/activities`**

| Endpoint | n | @ms | Veredicto |
|---|---|---|---|
| `GET /{tenantId}/events` | **2×** | 390028, 390031 | duplicado (3 ms) |

No es el mismo efecto dos veces: son **dos consumidores distintos** pidiendo lo mismo con
límites distintos — `ActivitiesPage.load()` pide `?limit=50` y `useNotificationStream()`
(el hook de la campana, que la página también monta) siembra `?limit=30`.

### 2.3 El coste de cambiar de pestaña en la ficha

`GuardsLayout` pide, **en cada montaje**, tres cosas:

```
GET /security-guard/{id}
GET /guard-ratings/summary
GET /staff/{id}/role-options
```

Medido pestaña a pestaña (`/horario`, `/documentos`, `/licencias`): las tres salen otra vez
en cada una. Como no hay ruta padre que envuelva las 13 pestañas, el layout se desmonta y
se vuelve a montar en cada click.

**13 pestañas × 3 peticiones = 39 peticiones para leer una sola ficha**, de las cuales 36
son relecturas de datos que no han cambiado. Y en `/resumen` y `/perfil` dos de esas tres
salen **duplicadas**, porque la pestaña pide por su cuenta lo que el layout ya tiene.

---

## 3. Las cuatro causas, en código

### A · El layout y la pestaña piden lo mismo

`GuardsLayout.tsx:68` carga el perfil y la valoración para pintar la cabecera.
`GuardOverviewPage.tsx:72` carga **el mismo perfil** para pintar el cuerpo, y `:58` **la
misma valoración**. Ninguno sabe del otro. Salen con 2–4 ms de diferencia porque los dos
efectos corren en el mismo ciclo de montaje.

Barrido estático del repo — páginas que piden algo que su propio layout ya pidió:

```
GuardsLayout  ← GuardOverviewPage      (securityGuardService.get + guardRatingService.summary)
GuardsLayout  ← GuardProfilepage       (securityGuardService.get)
GuardsLayout  ← GuardAsignarSitiosPage (securityGuardService.get)
GuardsLayout  ← GuardAvailabilitypage  (securityGuardService.get)
GuardsLayout  ← GuardDepartamentoPage  (securityGuardService.get)
GuardsLayout  ← GuardFilesPage         (securityGuardService.get)
GuardsLayout  ← GuardMemosPage         (securityGuardService.get)
GuardsLayout  ← GuardReviewsPage       (securityGuardService.get)
GuardsLayout  ← SupervisorDetailPage   (supervisorService.get)
```

### B · No hay ruta padre para la ficha

`App.tsx:1253–1381` declara las 17 rutas `/guards/:id/*` como **hermanas**, cada una
montando su propio `<GuardsLayout>`. Un `<Route path="/guards/:id" element={<GuardsLayout/>}>`
con las pestañas como hijas y un `<Outlet/>` deja la cabecera montada y el perfil se carga
una sola vez por ficha.

### C · Dos efectos con las mismas dependencias

Confirmados por medición y lectura:

| Archivo | Líneas | Endpoint |
|---|---|---|
| `GuardLicensespage.tsx` | 258, 312 | `/security-guard/{id}/licenses` |
| `StationOverview.tsx` | 263, 381 | `/post-site/{id}`, `/station/{id}/positions` |
| `StationShifts.tsx` | — | `/guard-assignments` (`useEffect(…, [loadAsignados])` inestable) |
| `ActivitiesPage.tsx` + `useNotificationStream.ts:134` | 206 / 134 | `/{tenantId}/events` |

Candidatos del mismo patrón, **sin medir todavía** (mismas dependencias, dos efectos de
red; hay que comprobar uno a uno si es el mismo endpoint o no):
`SiteTours.tsx` (380, 1043) · `PostsiteIncidents/Incidents.tsx` (213, 257) ·
`DispatcherPage.tsx` (231, 313) · `ShiftTemplates.tsx` (109, 130) ·
`GuardAsignarSitiosPage.tsx` (205, 210) · `Visitors.tsx` (777, 825) ·
`SupervisorPositionsPage.tsx` (121, 128) · `PostSiteKPIs.tsx` · `AlarmPanels.tsx` ·
`MessengerPage.tsx` · `AssignGuards.tsx` · `RadioDispatch.tsx`.
Descartados tras leerlos (deps iguales pero endpoints distintos → **no** son duplicados):
`ClientContacts.tsx`, `SecurityGuardsPage.tsx`, `GuardMemosPage.tsx`,
`GuardOverviewPage.tsx` (sus 3 efectos con `[id]` piden tres cosas distintas).

### D · Dos ids para el mismo vigilante

Confirmado con códigos de estado reales:

```
200  /security-guard/89797e3e-700e-4615-915e-fa1a85150bfe            ← id de la FICHA (el de la URL)
200  /security-guard/89797e3e-…/employment
404  /security-guard/01b88d2d-65e3-4899-a1c3-1f494d18e676/performance ← id de USUARIO
200  /security-guard/01b88d2d-…/assignments
200  /security-guard/01b88d2d-…/schedule
```

Raíz única, en el frontend. `GuardOverviewPage.tsx:78` hace
`const g = (data.guard ?? data)` y guarda ese objeto en el estado. `data.guard` es el
**usuario vinculado**, así que `guard.id` deja de ser el id de la ficha y pasa a ser el id
de usuario. `GuardSummarypage.tsx` usa `guard.id` en las líneas **191** (`getAssignments`),
**214** (`getPerformance`) y **240** (`getSchedule`).

Por qué sólo falla `performance` y las otras dos no: en el backend,
`securityGuardAssignments.ts:27–41` resuelve el id de las dos formas (prueba
`securityGuard.id` y luego `securityGuard.guardId`). `guardPerformanceService.ts:364` no:
busca sólo `where: { id }` y lanza `Error404` si no lo encuentra. Las otras dos **parecen**
funcionar por la tolerancia del backend, no porque el id sea el correcto.

Y el 404 no se ve: la pantalla lo pinta como «sin datos» en vez de como error.

---

## 4. Hallazgos aparte (no son duplicados, pero salieron en la medición)

1. **`GET /tenant/{id}/file/token` ×12 en `/activities`.** No es duplicado —
   `fileUrl.ts` tiene caché de módulo y mapa de peticiones en vuelo, y funciona. Son 12
   ficheros privados **distintos** (12 avatares), un token cada uno. Es un N+1 de diseño;
   se arregla con un endpoint que firme un lote, no tocando el frontend.
2. **`tenantService.findById` sale 2× al arrancar la sesión** — `app-layout.tsx:291` y
   `sidebar.tsx:582`. Es 2× por sesión, no por navegación. Impacto bajo, arreglo trivial.
3. **`AuthContext.tsx:937` pasa `value={{…}}` sin `useMemo`**, y hay varios `setUser`
   encadenados en el arranque (líneas 456, 563, 767, 788, 833). Los 11 efectos del repo con
   dependencia `[user]`/`[currentUser]` se re-disparan cada vez que cambia esa identidad.
   No lo vi en las mediciones, pero es una fuente latente de duplicados en el arranque.
4. **Los enlaces del menú lateral están en el DOM dos veces** (riel de escritorio + cajón
   móvil). No genera peticiones; anotado sólo para que no despiste al depurar.
5. **`OPTIONS` (preflight CORS).** Duplican visualmente cada llamada en el panel de red y
   no aparecen en esta instrumentación. No son el bug, pero subir `Access-Control-Max-Age`
   en el backend quita la mitad de las idas y venidas. Trabajo de backend, aparte.

---

## 5. Por qué `POST /api/track` 2× no se toca

`VisitBeacon.tsx` monta un efecto por `location.pathname`. Al navegar:

- la limpieza del efecto anterior llama a `cerrar()` → un aviso con `cerrada: true` que
  lleva los segundos de atención y el scroll de la pantalla **que se abandona**;
- el efecto nuevo llama a `enviar(false)` → la apertura de la pantalla **nueva**.

Son dos avisos de dos pantallas distintas con `pv.id` distinto. Fusionarlos rompería la
medición de tiempo por pantalla del panel del dueño. Si molesta el número de peticiones, lo
correcto es **agrupar** los dos cuerpos en un solo POST, no eliminar uno.

---

## 6. Plan de corrección propuesto (rendimiento por esfuerzo)

Ordenado por peticiones eliminadas ÷ riesgo. Un commit por punto.

| # | Cambio | Archivos | Elimina |
|---|---|---|---|
| 1 | Ruta padre `/guards/:id` con `<Outlet/>`; el perfil se carga una vez y las pestañas lo consumen por contexto | `App.tsx`, `GuardsLayout.tsx`, las 8 pestañas de §3A | ~36 de 39 peticiones al recorrer la ficha |
| 2 | `guard.id` → id de la ficha en `GuardSummary`; y que `performance` resuelva los dos ids como ya hace `assignments` | `GuardOverviewPage.tsx:78`, `GuardSummarypage.tsx:191/214/240`, `guardPerformanceService.ts:364` | el 404 + el lío de ids |
| 3 | Borrar el efecto duplicado de licencias | `GuardLicensespage.tsx:258` | 1× por carga |
| 4 | Unificar la cascada de `StationOverview` y `StationShifts` | 2 archivos | 5× por carga (la peor pantalla) |
| 5 | Que `/activities` consuma el backlog de `useNotificationStream` en vez de pedirlo aparte | `ActivitiesPage.tsx` | 1× por carga |
| 6 | `useMemo` en el `value` de `AuthContext` | `AuthContext.tsx:937` | latente |
| 7 | Quitar el `findById` repetido del sidebar | `sidebar.tsx:582` | 1× por sesión |
| 8 | Revisar los 12 candidatos sin medir de §3C | varios | por determinar |

**Lo que NO se propone:** migrar las 311 ocurrencias de `useEffect` a `useQuery`. La
medición no lo justifica — 20 de 24 rutas ya salen limpias. Donde `react-query` sí aporta
es en **caché entre visitas**, que es un problema distinto del de los duplicados, y para
eso el repo ya tiene la pieza puesta y funcionando: `cachedFetch()` en `lib/queryClient.ts`,
adoptado por `stationService`, `clientService` y `categoryService`. Extenderlo servicio a
servicio es barato y no toca ni una pantalla. Eso sí merece una segunda tanda, medida
aparte y con criterio de frescura caso por caso.

## 7. Criterios de aceptación

- Cero repeticiones a menos de 50 ms del mismo endpoint en las rutas auditadas.
- Cambiar de pestaña en la ficha no vuelve a pedir el perfil.
- `GET /security-guard/{id}/performance` responde 200 con el id de la ficha.
- Ninguna pantalla pierde frescura: no se cachea nada sin decidirlo caso por caso.
- `npm run build` y `npm test` en verde.
- Re-medición con el mismo método, tabla antes/después.
