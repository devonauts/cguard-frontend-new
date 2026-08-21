# Sistema de diseño del CRM — lo que hay que saber antes de tocar la interfaz

**Antes de escribir un componente, abre `/style-guide` en el navegador.** Está en
vivo, sale del código real y muestra cada pieza con su nombre de importación, sus
estados, su hover y su foco. Si algo ya existe ahí, se usa; no se vuelve a hacer.

La arquitectura en una frase: **superficie acromática (negro y blanco, croma 0) +
UN acento configurable por el usuario.**

## Los archivos y su orden

```
src/styles/tokens.css   → color (variables). Todo deriva de aquí.
src/styles/globals.css  → tipografía y animación base
src/styles/glass.css    → superficies (.glass, .cg-*), y las correcciones
src/components/kit/     → las piezas montadas
src/contexts/AccentContext.tsx → el acento (escribe 2 variables en el <html>)
```

Ese orden importa: `glass.css` se carga el último y **gana a las utilidades de
Tailwind** (ver más abajo).

## La regla que hace que cualquier color funcione

El usuario elige **sólo el tono** (`--brand-h`, 0-360). La luminosidad la fija el
sistema. No es pereza: es lo que garantiza el contraste. Medido sobre los 360
tonos a croma 0.16:

| Luminosidad | Resultado |
|---|---|
| L ≤ 0.50 | tinta **blanca** legible en todos (peor caso 5,09:1) |
| L 0.54–0.58 | **zona muerta** — ninguna tinta pasa en todos |
| L ≥ 0.62 | tinta **negra** legible en todos (peor caso 4,99:1) |

De ahí **dos papeles, que no son dos colores**: `--brand` es el RELLENO (botones,
píldoras, barras) y lleva tinta `--brand-ink` encima. `--brand-text` es el mismo
tono a la luminosidad que necesita el TEXTO sobre el lienzo. Usar el relleno como
color de letra sobre blanco da 2,25:1 — ilegible.

**Nunca expongas la luminosidad en la interfaz.** Es lo único que impide un botón
amarillo con letra blanca.

## No regresionar — cada una costó tiempo

- **Se llama `--brand`, no `--accent`.** shadcn ya usa `--accent` para la
  superficie de *hover* de los menús. Ocuparlo con el color de marca pone cada
  desplegable en mostaza brillante.

- **Los semánticos no derivan del acento.** `--ok / --warn / --bad / --info` son
  fijos. Un pánico es rojo aunque el acento sea rojo, y no se vuelve verde porque
  alguien eligiera verde.

- **`glass.css` va sin `@layer` y gana a Tailwind.** Sobre un elemento con
  `.glass*` o `.cg-input` **no** se pueden pisar `position`, `border-radius`,
  `background`, `border` ni `box-shadow` con clases de utilidad: hay que usar
  `style={{…}}` en línea. Un diálogo con `.glass-raised fixed` se queda en
  `relative` y cae en el flujo del documento. Encapar en `@layer components` es
  el arreglo correcto y está **pendiente**, pero con QA visual delante.

- **`backdrop-filter` nunca dentro de un `map()`.** Obliga al navegador a
  rasterizar el fondo en cada fotograma; en una lista de 500 filas el
  desplazamiento se cae. `.glass` para superficies; `.glass-flat` —mismo aspecto,
  sin desenfoque— para lo que se repite.

- **`--float` y `--glass-raised` no son intercambiables.** `--glass-raised` es un
  TINTE sobre algo que ya existe. Un panel que FLOTA (menú, desplegable, aviso)
  necesita fondo propio (`--float`), porque detrás no hay una tarjeta: está la
  página entera. Confundirlos dejó los menús a un 8,5 % de blanco, con los
  botones de debajo legibles a través.

- **Lo que hace que parezca vidrio es el BORDE, no la transparencia.** Filo de
  1 px más claro arriba que abajo, y que se **desvanece hacia los lados** — un
  filo de brillo uniforme se lee como un subrayado, no como luz. En `.glass` es
  un `::before`; si una librería de terceros ya usa sus pseudo-elementos (sonner
  lo hace, para el gesto de deslizar), va como capa de fondo de 1 px.

- **El CSS de terceros inyectado por JavaScript gana los empates.** sonner no
  trae una hoja que se importe: se inyecta en el `<head>` al montarse, así que
  aterriza después de `glass.css`. Sus reglas son 0,3,0 → las nuestras necesitan
  **0,4,0** (añadiendo `[data-styled='true']`). Sin `!important`.

- **Tipografía: Saira para lo que se lee de un vistazo** (títulos, botones,
  navegación, etiquetas en mayúsculas) e **Inter para cuerpo, tablas y campos**.
  Existe una regla en `glass.css` que devuelve Saira a los encabezados porque
  `.app-shell *` se la comía: **si se borra, todos los `<h1>` vuelven a la fuente
  de cuerpo** y el cambio de fuente parece no haberse aplicado.

- **`.text-primary` está reapuntado a mano** en `glass.css` a `--brand-text`
  (unos 92 usos). `bg-primary` sigue siendo el relleno.

## Mapas y gráficos

- Google Maps y Leaflet **no aceptan `var()`**. El token se lee con una sonda
  invisible: `getPropertyValue` **no evalúa** `calc()` ni la sintaxis relativa
  `oklch(from …)`. Ver `src/utils/mapTheme.ts` y `src/lib/chartColors.ts`.
- **Un mapa con `mapId` ignora el array `styles`.** Y `AdvancedMarkerElement`
  exige `mapId`. Por eso las chinchetas son SVG y no elementos del DOM: para
  conservar el estilo del mapa.
- Cada `new google.maps.Map()` es una carga facturable. No crear mapas dentro de
  bucles ni recrearlos al arrastrar un pin.

## Movimiento

El producto se mira ocho horas seguidas, así que el movimiento **informa, no
decora**:

- Las cifras se animan **sólo cuando cambian**, no al aparecer (`kit/movimiento`
  → `Cifra`). Animar al montar convierte cada carga de página en un espectáculo
  de contadores girando.
- Sin rebotes: un número que rebota se lee como un juguete, y aquí se cuentan
  vigilantes e incidentes.
- Todo respeta `prefers-reduced-motion`, incluido el desenfoque de los velos.

## Estructura

- **`AppLayout` es idempotente**: si ya hay un armazón por encima, sólo pinta los
  hijos. No envuelvas una página en un segundo `AppLayout` — era la causa de la
  doble barra superior.
- **El `<Toaster>` vive una sola vez, en `main.tsx`**, y **sin `richColors`**: el
  tono de un aviso lo lleva la placa del icono, no la caja.
- Los velos de menús y modales se encienden con `:has()` desde `.cg-scrim-menu`,
  que vive dentro de `.app-shell`. No se puede usar `body::before`: `.app-shell`
  tiene `isolation: isolate` y el velo se pintaría por encima de todo.

## Cómo se escribe

- La interfaz está en **español**. El término del producto es **«vigilante»**, no
  «guardia» (los identificadores del código no se tocaron).
- **Nada de jerga técnica en texto que ve el cliente**: ni «servidor», ni
  «backend», ni «endpoint», ni «tenant». Se dice qué pasó y qué hacer.
- Los textos de error explican **qué falló y cómo arreglarlo**. Sin disculpas.

## Pendiente

- Encapar `glass.css` en `@layer components` (arriba).
- El paquete principal ronda los 247 kB comprimidos; partir por rutas.
