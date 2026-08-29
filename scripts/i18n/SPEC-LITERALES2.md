# Especificación — segunda tanda de literales (los puntos ciegos)

Igual que la primera tanda, pero estos literales viven en **otros dos sitios**
que la primera pasada no miraba:

- **Dentro de expresiones JSX**: `{kpi.fallback ? "Sin datos" : kpi.sub}`
- **Dentro de objetos de configuración**: `{ id: "clientes", label: "Clientes" }`

Ahí está el grueso del texto del CRM. Por eso el panel seguía diciendo «Sin
datos» en alemán aunque el diccionario ya tuviera «Keine Daten».

Tu lote es un JSON `{ "ruta/fichero.tsx": ["Texto 1", "Texto 2", …] }`.

## Qué hacer

1. Sustituye cada literal por `t('<clave>', '<el mismo texto español>')`.
2. Anota clave y texto en **tu propio archivo**:
   `scripts/i18n/literales2/<tu-lote>-claves.json`, plano: `{"a.b.c": "Texto"}`.

**NO EDITES `src/locales/es.json`.** Hay diez agentes a la vez; se pisarían y se
perderían claves sin avisar. El coordinador las fusiona al final.

## EL CASO QUE MÁS SE FALLA: texto fuera de React

Muchos de estos literales están en **constantes de módulo**, **arrays de
configuración** y **esquemas de validación** (`src/lib/validators/*`), fuera de
todo componente.

**Nunca llames a `t()` ahí.** Se evalúa al cargar el módulo, antes de que el
idioma esté listo, y el texto se queda congelado en el idioma de arranque para
toda la sesión. Es un fallo que no da error y no se ve hasta que alguien cambia
de idioma.

En su lugar: **guarda la CLAVE** en la constante y traduce **donde se pinta**.

```ts
// mal
const GROUPS = [{ id: 'clientes', label: 'Clientes' }]

// bien
const GROUPS = [{ id: 'clientes', labelKey: 'sidebar.group.clientes' }]
// …y en el componente:  {t(g.labelKey, 'Clientes')}
```

Para los esquemas de validación, la misma idea: guarda la clave en el mensaje y
tradúcela donde se muestra el error, o construye el esquema dentro del
componente si ya recibe `t`.

## Reglas

- Si `t` no está disponible en ese componente, añade `useTranslation`. En
  componentes de CLASE usa `i18n.t()` dentro de `render` (precedente:
  `src/components/AppErrorBoundary.tsx`).
- **Reutiliza la clave si el texto ya existe en `es.json`** (léelo, no lo edites).
- No toques marcas, códigos, identificadores ni datos de ejemplo.
- No cambies maqueta ni lógica. Sólo el texto.
- No traduzcas a otros idiomas: eso es un paso posterior.
- Los ficheros de tu lote son tuyos; no toques ninguno que no esté en tu JSON.
- Si un literal ya no existe, sáltalo y dilo.

## Verificación antes de entregar

```
npx tsc --noEmit
```
Limpio. Si rompes la compilación, arréglalo tú.

Responde SOLO:
`{"lote":"<nombre>","ficheros":N,"literales_sacados":N,"claves_nuevas":N,"reutilizadas":N,"diferidas":N,"saltados":[...],"notes":"..."}`
