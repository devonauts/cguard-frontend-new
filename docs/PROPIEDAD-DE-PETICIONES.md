# Quién pide qué — mapa de propiedad de las peticiones del CRM

**Para qué es este documento.** Cada vez que alguien añade una pantalla que
necesita «los vigilantes» o «la empresa», la tentación es pedirlos otra vez.
Así es como se llegó a **tres peticiones a `/auth/me` por arranque** y a que
volver a `/security-guards` costara cuatro peticiones mientras volver a
`/clients` costaba una.

La regla, en una línea:

> **Un recurso del servidor tiene UN dueño. Los demás leen del dueño.**

### Las ocho reglas que no se discuten

1. **Si un proveedor o un servicio ya es dueño de un recurso, la pantalla NO lo
   vuelve a pedir.** Se lee del dueño.
2. **Ningún `setInterval` sin dueño documentado y sin limpieza.** Y si la
   pantalla es en vivo, va con `useSondeoVisible`, que se para sola con la
   pestaña oculta.
3. **Ningún `socket.on` sin su `off` en la limpieza del efecto.**
4. **Un limitador de concurrencia NUNCA recibe promesas ya arrancadas.**
   `items.map(id => api.get(id))` ya lanzó todas. Se le pasan ENCARGOS:
   `items.map(id => () => api.get(id))`, o directamente `enLotes(items, fn)`.
5. **Ninguna caché sin política de invalidación.** Si se añade un servicio a
   `cachedFetch`, se añade su regla a `URL_ENTITY_MAP` y su prueba a
   `lib/queryClient.test.ts`. Sin eso, la pantalla miente después de guardar.
6. **No se quita un sondeo de respaldo sin recuperación en vivo comprobada.**
   Comprobada quiere decir medida en producción, no «la configuración parece
   correcta».
7. **Ninguna exportación de N filas con N peticiones de detalle.** Si al listado
   le falta un campo, se arregla el contrato —un endpoint de exportación con su
   propia guarda—, no se sube la concurrencia.
8. **El estado local NO se actualiza si la escritura falló.** Ni «por si acaso»,
   ni como respaldo local. Ver más abajo: es el fallo que más caro ha salido.


Antes de escribir `api.get(...)` en una pantalla nueva, búscalo en esta tabla.
Si ya tiene dueño, usa el dueño.

Complementa a `AUDITORIA-REQUESTS.md` (qué estaba mal y cómo se midió). Esto es
la foto de cómo debe quedar.

---

## Las tres capas, y cuándo usar cada una

| Capa | Qué resuelve | Dónde vive |
|---|---|---|
| **Lectura compartida** | varios montajes piden lo mismo a la vez o casi | `lib/lecturaCompartida.ts` |
| **Caché de lectura** | volver a una pantalla no debería repetir la consulta | `lib/queryClient.ts` → `cachedFetch` |
| **Tiempo real** | el dato cambia solo y hay que enterarse | `lib/socket.ts`, `lib/api/eventStream.ts` |

**No son intercambiables.** Un dato operativo en vivo NO se arregla con caché:
se arregla con socket + una recarga corta de respaldo.

---

## Mapa por recurso

### Identidad y sesión

```
RECURSO        el usuario autenticado
DUEÑO          lib/perfilDeLaCuenta.ts  (leerPerfil)
PETICIÓN       GET /auth/me   — vía AuthService, que sí trata el 401
CONSUMIDORES   AuthContext (la sesión) · appearanceSync (tema+acento) · LanguageContext (idioma)
COMPARTIDO     sí — ventana de 15 s, para que un arranque entero use UNA respuesta
INVALIDA       olvidarPerfil() en signOut y al cambiar de cuenta
NO HAGAS       otro api.get("/auth/me"). Eran tres. Ahora es una.
```

```
RECURSO        la empresa (marca, país, huso, coordenadas)
DUEÑO          services/tenant.service.ts  (findById)
COMPARTIDO     sí — ventana de 2 s
INVALIDA       update() y las escrituras de settings llaman a olvidarEmpresa(id);
               findById(id, true) fuerza relectura tras guardar
POR QUÉ 2 s    cubre el arranque (app-layout y sidebar montan con ~127 ms de
               diferencia) y es demasiado poco para enseñar nada viejo
```

```
RECURSO        permisos (catálogo)
DUEÑO          hooks/usePermissionCatalog.ts — caché de módulo, toda la sesión
POR QUÉ        lo define el código del servidor, no el inquilino: no cambia en caliente
```

### Datos de negocio — con caché y con invalidación

Los cuatro que pasan por `cachedFetch`. **La invalidación es automática**: cada
respuesta de escritura pasa por `autoInvalidateForMutation`, que mira la URL y
tira la clave correspondiente (`lib/queryClient.ts` → `URL_ENTITY_MAP`).

| Recurso | Dueño | Clave | Ventana | La tira cualquier escritura a… |
|---|---|---|---|---|
| clientes | `clientService.getClients` | `["clients", …]` | 30 s | `/client-account` |
| incidentes | *(sin caché — ver abajo)* | — | — | escuchan `incident:changed` |
| categorías | `categoryService.list` | `["categories", …]` | 60 s | `/category` |
| vigilantes (censo) | `securityGuardService.list` | `["security-guards", …]` | 20 s | `/security-guard*` |
| puestos y estaciones | `stationService.list` **y** `postSiteService.list` | `["stations", …]` | 20–30 s | `/station`, `/post-site`, `/business-info`, `/shift`, `/guard-assignment`, `/scheduler`… |
| valoraciones | `guardRatingService.summary` | `["guard-ratings", …]` | 60 s | *(nada — las escribe el cliente desde su app, no el CRM)* |

**Los dos servicios de puestos comparten clave a propósito.** `/post-site` es un
alias literal de `/business-info` en el backend (`api/postSite/index.ts`,
«Legacy compatibility routes»): misma tabla, mismos manejadores. Una escritura
por cualquiera de los dos refresca a los dos.

Si añades un servicio a `cachedFetch`, **añade también su regla a
`URL_ENTITY_MAP`** — y una prueba en `lib/queryClient.test.ts`, que es donde
está escrito qué escritura tira qué caché.

### Tiempo real — NO se cachea

Aquí el patrón es siempre el mismo:

```
GET inicial  →  suscripción  →  el evento AVISA  →  se vuelve a leer
```

**Los eventos del backend no transportan filas, avisan.** Está escrito en el
propio emisor (`services/realtime/coverageEvent.ts`, `shiftPunchEvent.ts`,
`eventosDeEstado.ts`): *«EL EVENTO AVISA, NO TRANSPORTA. Ids y hora, nunca
filas.»* Se hizo así para que el filtrado por permisos viva en un solo sitio.
**Por eso la recarga tras un evento no es un duplicado: es obligatoria.**

Las dos excepciones —eventos que sí traen el dato entero— son
`location:update` y `notification`, y sus consumidores ya aplican el dato en
sitio sin volver a pedir nada.

| Recurso | Instantánea | Canal | Respaldo | Recuperación |
|---|---|---|---|---|
| posiciones en vivo | `securityGuardService.activeLocations` | `location:update` (dato completo) | reloj 15 s, pausado si la pestaña se oculta | `connect` recarga |
| cobertura | `coverageService.live` | `coverage:changed`, `shift:punch` | reloj 30 s, pausado | `connect` recarga |
| cola de alarmas / SOS | `alarmService.cases` | `alarm:case` + SSE aparte | reloj 120 s, pausado | `connect` + hueco de secuencia |
| rondas en curso (lista) | `routeService.activeRuns` | `route:progress` (agrupado 700 ms) | reloj 45 s, pausado | `connect` recarga |
| ronda en curso (detalle) | `routeService.runDetail` | `route:progress` filtrado por ruta, agrupado 700 ms | reloj 20 s **sólo si** la ruta sigue abierta Y el socket está caído | `connect` → UNA lectura autoritativa |
| avisos | `GET /:tenantId/events` | `notification` (dato completo) | ninguno | botón «Actualizar» |
| mensajes sin leer | `messageService.unreadCount` | `message:changed` | reloj 60 s, pausado | `connect` (sólo RE-conexión) |
| radio | roster de LiveKit | eventos de LiveKit | — | reconexión de LiveKit |

**Ninguno de estos relojes sobra.** Se quedan porque el reparto de eventos entre
los dos workers de PM2 depende de Redis, y eso **no está confirmado en
producción**. El comentario de `useControlCenter.ts` lo dice con todas las
letras: el reloj se va *«hasta que se compruebe en producción que `shift:punch`
llega SIEMPRE»*. Hasta entonces, quitarlos cambia un tablero que gasta de más
por uno que miente.

---

## El contrato de los eventos: AVISAN, no transportan

Hay dos clases de evento y se tratan distinto:

**A · EVENTOS DE AVISO (invalidación).** Traen ids y una hora. Dicen «el recurso
X cambió», no *qué* cambió. Son la mayoría: `incident:changed`, `shift:punch`,
`coverage:changed`, `alarm:case`, `route:progress`, `message:changed`,
`schedule:changed`. **Obligan a volver a leer.** Esa lectura NO es un duplicado
—es la única forma de enterarse—, y se hace así a propósito para que el filtrado
por permisos viva en un solo sitio, el endpoint.

**B · EVENTOS CON DATO.** Traen la fila entera y se aplican en sitio, sin pedir
nada: `location:update` (la posición completa) y `notification` (el aviso
entero). Si vuelves a pedir tras uno de éstos, estás gastando una petición para
nada.

**No trates un evento de aviso como si transportara la fila.** `route:progress`,
por ejemplo, trae contadores y la parada actual — nunca las visitas, ni las
fotos, ni las respuestas de la inspección.

## Reconexión: un socket sólo entrega lo que pasa MIENTRAS escuchas

socket.io no guarda ni reenvía lo emitido mientras el cliente estaba caído. Una
pantalla en vivo necesita las cuatro piezas:

```
inicial      GET autoritativo al montar
conectado    los eventos actualizan el estado
caído        la interfaz DICE que está degradada (no se queda fingiendo)
reconectado  UNA lectura autoritativa y se sigue
```

La lectura al reconectar **no es un duplicado: es la recuperación del estado**.
`RouteRunDetailPage` no la tenía: si el socket se caía treinta segundos mientras
un supervisor pasaba dos puntos de control, la pantalla se quedaba congelada en
lo anterior, sin marcar nada, hasta que por casualidad llegara otro aviso.

Y si el recurso es crítico y la caída se alarga, un sondeo de respaldo
**condicionado**: `useSondeoVisible(load, 20_000, sigueAbierto && !enVivo)` —
sólo mientras hace falta, nunca junto a un socket sano.

## El estado local no se actualiza si la escritura falló

Dos casos reales encontrados, con la misma forma:

- **Memos**: el borrado iba a una ruta que no existe (`DELETE /memos/:id`;
  el backend sólo registra `DELETE /memos?ids=`). Express devolvía 404, el
  frontend quitaba la fila igual, y el memo volvía al recargar.
- **Notas de cliente**: si el guardado fallaba, se mostraba el error **y además**
  se insertaba una nota inventada en el navegador. Al editar quedaban dos: la
  falsa y la original sin cambiar.

La regla: la fila se quita **después** de que la petición haya ido bien. Si
falla, se avisa y no se toca la lista (y si era un formulario, se deja abierto
con lo escrito, para poder reintentar).

Optimista **con reversión** sí es correcto: pinta ya, y al fallar deshace o
vuelve a leer. Lo que no vale es pintar el éxito y no deshacer nunca.

## Lo que NO se cachea nunca, y por qué

Esto es una plataforma de seguridad privada. Un dato viejo aquí no es una
molestia: es un vigilante que parece estar en un puesto que abandonó.

- **SOS, pánico y la cola de alarmas** — podría esconder un aviso nuevo o
  enseñar como abierto un caso ya cerrado.
- **Posiciones en vivo y rastro GPS** — una chincheta vieja durante un incidente.
- **Cobertura en vivo** — ya pasó una vez: un puesto cerrado seguía saliendo
  cubierto.
- **Fichaje (entrada/salida) y su estado actual** — doble fichaje, o enseñarle a
  alguien que está fuera de turno cuando está dentro.
- **Consola de radio** — estado del pase de novedades en curso.
- **Mensajería** — ya es por evento; poner caché encima reintroduce el fallo que
  el cambio a socket vino a arreglar.
- **Nómina y registros de asistencia** — si algún día se cachean, será por
  invalidación explícita, nunca por tiempo.

---

## Trampas conocidas

**`useEventoEnVivo` + caché.** Ese hook recarga cuando llega un evento del
servidor, llamando a la función de carga de la pantalla. Si esa carga pasa por
`cachedFetch` con una ventana larga, **la recarga devuelve lo cacheado y el
evento en vivo deja de servir para nada**. Una lectura que consuma
`useEventoEnVivo` o se deja sin cachear, o el manejador llama a
`invalidateEntity` antes de recargar.

**Compartir sólo la promesa en vuelo no basta.** Es una carrera que suele salir
bien. Al quitar dos peticiones de `/auth/me` el arranque se aceleró, dos efectos
dejaron de solaparse por 127 ms y reapareció un duplicado que llevaba meses
tapado por la lentitud. Comparte también el RESULTADO, aunque sean dos segundos.

**`.map()` arranca la petición.** `items.map(id => api.get(id))` lanza todas al
construir el array; lo que venga después no limita nada. Para eso está
`lib/enLotes.ts`, que recibe ENCARGOS (`() => api.get(id)`) y mantiene seis en
vuelo.

**Hay dos clientes HTTP** (`lib/api.ts` con axios y `services/api/apiService.ts`
con fetch) y no hacen lo mismo: sólo el de fetch trata el 401 devolviendo al
login; sólo él pausa ante un 429; sólo el de axios manda `Accept-Language` y
gestiona el muro de pago. Al mover una llamada de uno a otro, mira qué pierdes.

---

## Estación y puesto de servicio NO son lo mismo

Confunde porque los endpoints se solapan, así que conviene tenerlo claro:

| | PUESTO DE SERVICIO | ESTACIÓN |
|---|---|---|
| qué es | la sede del cliente | un puesto concreto dentro de esa sede |
| tabla | `businessInfos` | `stations` (FK `postSiteId → businessInfos.id`) |
| endpoints | `/business-info` **y** `/post-site` (alias literal) | `/station`, `/stations` |
| servicio | `postSiteService` | `stationService` (sólo `getStationCards` y `list({postSite})`) |

Son **conceptos distintos**, no dos nombres de lo mismo: 161 sedes contra 273
estaciones, con clave foránea entre ellas.

**Trampa medida, no la toques a la ligera.** `stationService` es híbrido: buena
parte de su CRUD apunta a `/post-site`, o sea a la SEDE, no a la estación — de
ahí su nombre engañoso (hay un comentario en `ClientCoverage.tsx` que ya lo
avisa: *«stationService.delete() actually deletes POST-SITES»*).

Y aun así **no se pueden intercambiar**: `stationService.create` envía
`serviceType` y `serviceConfig`, que el backend SÍ guarda, y `postSiteService`
no los manda. Cambiar un `stationService.create` por `postSiteService.create`
perdería la configuración de servicio en silencio. Se dejó como está a
propósito: el problema es de NOMBRES y de contratos de escritura divergentes,
no de recursos duplicados. Unificarlos exige primero reconciliar los dos juegos
de campos, que es una decisión de contrato, no un renombrado.

## La línea base medida (para saber si algo empeora)

Medido sobre un build de PRODUCCIÓN servido en local contra el backend local,
inquilino de demostración, navegando por el router (sin recargar). Son
**referencias, no aserciones**: el número exacto depende de los datos del
inquilino y de la carrera entre montajes. Si alguna sube al doble, algo se
rompió; si sube en uno, es ruido.

| ruta | en frío | vuelve <5 s | vuelve ~30 s |
|---|---|---|---|
| `/security-guards` | 10 | **0** | 4 |
| `/clients` | 11 | 1 | 4 |
| `/dashboard` | 21 | 15 | 17 |
| `/schedule` | 14 | 7 | 9 |

No se cuenta el latido de analítica (`POST /track`), que manda dos por cambio de
pantalla por diseño.

**El tablero y el Horario no bajan a propósito.** Lo que piden al volver es
cobertura, posiciones, incidentes abiertos y personal en turno: datos operativos
que tienen que estar frescos. Un tablero de 8 peticiones con datos viejos es
peor que uno de 15 con datos buenos.

**Exportación de despachos: de O(N) a 1.** Antes se pedía el detalle de cada
solicitud seleccionada (hasta 5.000 peticiones en 625 tandas). Ahora es UNA
llamada a `GET /tenant/:t/request/export?ids=…`. Medido con 1, 10, 50 y 92
solicitudes: siempre una sola petición.

Cómo volver a medir: los guiones viven fuera del repo (eran de la auditoría),
pero el método está escrito en `AUDITORIA-REQUESTS.md`. Lo esencial: **build de
producción** (en desarrollo React duplica los efectos y todo parece el doble) y
navegar por el router, no recargando.

## En desarrollo, esto se vigila solo

`lib/diagnosticoDeRed.ts` cuenta las lecturas y avisa por consola cuando la
misma se repite más de tres veces en un segundo u ocho en diez:

```
[RED] posible tormenta de peticiones
  GET /tenant/:id/security-guard
  12 peticiones en 1 s
  desde: SecurityGuardsPage.tsx:546  ←  useEffect
```

No bloquea nada, no sale en producción, y **no registra la cadena de consulta**
—ahí viajan búsquedas por nombre, correos y coordenadas—, sólo la ruta con los
identificadores sustituidos.
