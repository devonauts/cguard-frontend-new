# Cuarta pasada — la cola larga

Estos 114 literales son lo que se le escapó a las tres tandas anteriores: **nodos
de texto JSX** (`>Texto<`) y **atributos de texto** (`placeholder`, `title`,
`aria-label`, `alt`, `label`) escritos a mano.

Casi todos están DENTRO de un componente, así que aquí sí se llama a `t()`
directamente. Lo que hay que vigilar:

- Si el componente aún no tiene traductor, añade `useTranslation()`. Si es un
  componente de CLASE, usa `i18n.t()` dentro de `render` (precedente
  `src/components/AppErrorBoundary.tsx`).
- **Si el literal está en un valor por defecto de un parámetro**
  (`function X({ titulo = 'Sin datos' })`), eso se evalúa antes del cuerpo: quita
  el defecto y resuélvelo dentro con `titulo ?? t('clave', 'Sin datos')`.
- **Si está en una constante de módulo**, guarda la CLAVE y traduce donde se
  pinta; nunca `t()` en el ámbito del módulo.
- **Traduce las ramas hermanas de un ternario.** Dejar una mitad sin traducir
  parte la frase en dos idiomas.

## Lo que NO se traduce

Texto de `console.*`, comentarios, marcas (CGuardPro, VigIA, ATLAS), y cualquier
cadena que sea un DATO (valor de `<option>` que se guarda, llave de un `Record`
que se consulta). Ante la duda, mira si esa cadena viaja al backend.

## Nombres de clave

Reusa una clave existente de `src/locales/es.json` antes de inventar (busca por
el texto español). Si inventas, sigue el patrón del fichero: `ui.<Componente>.<algo>`.

## Salida

Claves nuevas SÓLO en `scripts/i18n/jsx4/lote-NN-claves.json`, plano
(`{"a.b.c": "Texto español"}`). **No toques `src/locales/es.json`**: hay más
agentes trabajando a la vez.

`npx tsc --noEmit` limpio para tus ficheros antes de terminar.

Devuelve: `{"lote":"lote-NN","ficheros":N,"literales":N,"claves_nuevas":N,"reutilizadas":N,"saltados":["… y por qué"],"notas":"…"}`
