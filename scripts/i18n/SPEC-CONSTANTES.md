# Especificación — constantes de módulo con texto en español

Es el mismo fallo de las dos tandas anteriores, pero en su forma más dañina.

## El problema

```ts
// mal — se evalúa AL CARGAR el módulo
const ESTADO = { activo: 'Activo', pausa: 'En pausa' }
const OPCIONES = [{ id: 'dia', label: 'Turno de día' }]
```

Ese objeto se construye cuando el navegador importa el fichero, **antes** de que
i18next sepa qué idioma quiere el usuario. Llamar a `t()` ahí congela el texto en
el idioma de arranque para toda la sesión: cambias de idioma y esa etiqueta se
queda como estaba. Por eso **nunca** se llama a `t()` en el ámbito del módulo.

## La solución: guardar la CLAVE, traducir donde se pinta

```ts
// bien
const ESTADO = {
  activo: { label: 'Activo', labelKey: 'tasks.estado.activo' },
  pausa:  { label: 'En pausa', labelKey: 'tasks.estado.pausa' },
}
// …y en el render, dentro del componente:
{t(ESTADO[k].labelKey, ESTADO[k].label)}
```

El texto español se queda como **valor por defecto**: si la clave faltara, la
pantalla sigue leyéndose.

### Cuando el consumidor no es un componente de React

Si quien pinta es una función suelta, un `.ts` sin JSX o un componente de clase,
entra por `i18n.t()` **DENTRO de la función**, nunca en el cuerpo del módulo —
ahí se evalúa al llamarla, que es justo lo que quieres. Precedente en el
repositorio: `src/components/AppErrorBoundary.tsx` y `src/lib/api/alarmService.ts`.

### Esquemas zod de módulo

zod 4 acepta una **función** en `error`, y la ejecuta al validar, no al construir
el esquema:

```ts
z.string().min(1, { error: () => i18n.t('clave', 'Texto') })
```

### Valores por defecto de parámetros

`function X({ etiqueta = 'Sin datos' })` también se evalúa antes del cuerpo. Quita
el valor por defecto y resuélvelo dentro: `etiqueta ?? t('clave', 'Sin datos')`.

## Trampas que ya nos han mordido

- **La clave del mapa a veces ES el dato.** En `SystemStatus`, el `label` era
  además la clave de otro `Record`. Si traduces el objeto entero, rompes la
  búsqueda. Traduce sólo **al pintar**.
- **Un `Record<Tipo, string>` a medias no compila.** Si das clave a una entrada,
  dásela a todas las hermanas.
- **`t` como nombre de variable.** En varios `.map((t) => …)` y en
  `getMissingFields(t: Tenant)` el parámetro se llama `t` y tapa la función de
  traducción. Renombra el parámetro (no la función) o entra por `i18n.t`.
- **Añade `t` a las dependencias** de los `useMemo`/`useCallback` que ahora lo
  usan, o se quedan con el traductor viejo al cambiar de idioma.

## Lo que NO se traduce

- Texto de `console.log/warn/error/debug`: no lo ve nadie desde la interfaz.
- Comentarios de código.
- Tablas de datos (nombres de países), datos ficticios de la demo, marcas.
- **Mapas cuya cadena española es una LLAVE de búsqueda, no una etiqueta.**
  Ejemplos reales de tu lista: `COUNTRY_TZ` (`'méxico' → zona horaria`) y
  `DOW_NUM` (`'miércoles' → 3`) se consultan contra un dato, no se pintan.
  Compruébalo antes de tocar: si la cadena aparece a la izquierda de un `:` y se
  usa para *buscar*, se queda como está.

## Entrada y salida

- Tu lote: `scripts/i18n/constantes/lote-NN.json` — lista de ficheros con las
  constantes y su línea aproximada (la línea puede haberse movido; busca por
  nombre).
- **Escribe las claves nuevas SÓLO en `scripts/i18n/constantes/lote-NN-claves.json`**
  (plano: `{"a.b.c": "Texto español"}`). **No toques `src/locales/es.json`**: hay
  otros agentes trabajando a la vez y os pisaríais perdiendo claves sin avisar.
- Antes de inventar una clave, mira si ya existe una equivalente en
  `src/locales/es.json` y reúsala.
- Sí editas los ficheros de `src/` de tu lote y los consumidores que hagan falta,
  **pero sólo si ningún otro lote los reclama** (mira los demás `lote-NN.json`).
  Si el consumidor es de otro lote, deja la clave puesta en la constante, anótalo
  en `diferidas` y no toques su fichero.

## Antes de terminar

`npx tsc --noEmit` tiene que salir limpio para tus ficheros. Puede haber errores
transitorios en ficheros de otros agentes: ignóralos, no los arregles.

Devuelve un JSON compacto:
`{"lote":"lote-NN","constantes":N,"claves_nuevas":N,"reutilizadas":N,"diferidas":N,"saltadas":["… y por qué"],"notas":"…"}`
