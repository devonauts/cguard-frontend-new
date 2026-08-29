# Especificación — sacar del código el texto escrito a fuego

Tu lote es un JSON `{ "ruta/del/fichero.tsx": ["Texto 1", "Texto 2", …] }`. Esos
textos están **escritos literalmente en el JSX** y no pasan por el traductor:
salen en español con la interfaz en alemán, en polaco o en el idioma que sea.

## Qué hacer, fichero por fichero

1. Abre el fichero y localiza cada literal de la lista.
2. Sustitúyelo por `t('<clave>', '<el mismo texto español>')`.
3. Anota la clave y su texto en **tu propio archivo**:
   `scripts/i18n/literales/<tu-lote>-claves.json`, con forma `{"clave.completa": "Texto"}`.

**NO EDITES `src/locales/es.json`.** Hay diez agentes trabajando a la vez sobre
los mismos lotes; si todos escriben ese archivo se pisan y se pierden claves. El
coordinador las fusiona al final. Tú sólo tocas los `.tsx` de tu lote y tu
archivo de claves.

## Cómo nombrar la clave

Sigue el patrón que ya usa ese mismo fichero. Mira sus otras llamadas `t()` y
usa su mismo prefijo. Si el fichero no tiene ninguna, deriva el prefijo de su
ruta: `pages/admin/alarm/AlarmPanels.tsx` → `alarm.panels.*`.

**Antes de inventar una clave, busca si el texto YA existe en `es.json`** (léelo,
no lo edites).** Muchos
de estos literales están repetidos («Guardar», «Cancelar», «Sin datos»); reutiliza
la clave existente en vez de crear una nueva.

## Reglas

- **`t` tiene que estar disponible** en ese componente. Si no lo está, añade
  `const { t } = useTranslation()` y su import. Si el literal está fuera de un
  componente de React (una constante de módulo, un array de configuración),
  **guarda la CLAVE, no el texto**, y traduce donde se pinta — nunca llames a
  `t()` en el cuerpo del módulo: se evalúa al cargar, antes de que el idioma
  esté listo, y se queda congelado.
- **No toques marcas, códigos ni identificadores** (CGuardPro, VigIA, IDs, siglas).
- **No cambies la maqueta ni la lógica.** Sólo el texto.
- **No traduzcas a otros idiomas**: eso va en un paso posterior. Aquí sólo
  español, tal cual estaba.
- **Los ficheros de tu lote son tuyos y de nadie más.** No toques ninguno que no
  esté en tu JSON.
- Si un literal ya no existe en el fichero (lo cambió otro), sáltalo y dilo.

## Verificación antes de entregar

```
npx tsc --noEmit
```
Tiene que salir limpio. Si rompes la compilación, arréglalo tú.

Responde SOLO:
`{"lote":"<nombre>","ficheros":N,"literales_sacados":N,"claves_nuevas":N,"reutilizadas":N,"saltados":[...],"notes":"..."}`
