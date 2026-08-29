# Especificación — traducción de las 567 claves nuevas del CRM

Traduces **todo el fichero** `scripts/i18n/traducir2/pendientes.json` a **un solo
idioma**. Son las cadenas que acaban de salir del código (estaban escritas a mano
dentro de los componentes) y que hoy sólo existen en español.

## 1. Entrada y salida

- Fuente: `scripts/i18n/traducir2/pendientes.json` — plano, `{"clave.con.puntos": "Texto"}`.
- **Contexto obligatorio**: `src/locales/es.json` y `src/locales/<idioma>.json`
  ya tienen 8.424 claves traducidas. Antes de inventar un término, **mira cómo se
  tradujo ya** en tu idioma. La clave te dice dónde se pinta (`ui.ClientPortal.*`
  es el portal del contratante, `sidebar.*` es el menú, `alarm.*` la central de
  alarmas). Coherencia con lo ya traducido > elegancia.
- **Ancla de vocabulario**: `../worker-app/src/i18n/locales/<idioma>.json` y
  `../supervisor-app/src/i18n/locales/<idioma>.json`. Las apps móviles ya están
  en tu idioma; los términos del oficio tienen que coincidir. Es la misma empresa
  mirando el mismo dato desde dos pantallas.
- Salida: `scripts/i18n/traducir2/<idioma>.json`, **plano, mismas 567 claves, mismo
  orden**. Sólo cambian los valores. No anides.

## 2. Qué NO se traduce

Marcas (CGuardPro, C-Guard, VigIA, ATLAS), interpolaciones `{{…}}` y URLs.

**Las `{{variables}}` son sagradas**: puedes usar MENOS de las que trae el
español si tu idioma no las necesita, pero **no puedes inventar ninguna**. Una
variable que el código no pasa se pinta literalmente en pantalla como
`{{loQueSea}}`.

## 3. Longitud

Panel de escritorio, hay más aire que en la app. Pero dos sitios son estrechos:

- **`sidebar.*`** — el menú lateral: no pases del 130 % del español.
- **Encabezados de tabla, botones y píldoras de estado** (`.actions.`, `.tbl.`,
  `label`, `title`). En ayudas, descripciones y errores puedes respirar.

## 4. Vocabulario del sector

- **de**: Sicherheitskraft/Wachkraft · Rundgang · Dienstplan · Wachbuch ·
  Schichtübergabe · Anweisung · Auftraggeber · Einsatzleiter · Vertretung.
  **Ojo con «sitio/puesto/ubicación»**, que en las apps se habían mezclado:
  `Objekt` = el puesto de servicio (estación), `Einsatzobjekt` = la sede del
  contratante, `Standort` **sólo** para geografía (coordenadas, ciudad, mapa).
  Nunca uses `Standort` para un puesto de trabajo.
- **fr**: agent de sécurité · poste/site · ronde · planning · main courante ·
  relève · consigne · client · vacation (=turno) · RAS (=sin novedad)
- **it**: guardia (giurata) · posto di servizio · ronda · turni · registro di
  servizio · cambio turno · consegne · committente
- **pl**: pracownik ochrony · posterunek · obchód · grafik · książka służby ·
  zdanie służby · instrukcja · zleceniodawca · zastępstwo
- **nl**: beveiliger · post/object · ronde · rooster · wachtboek ·
  dienstoverdracht · werkinstructie · opdrachtgever · invallen
- **pt**: português **do Brasil** (vigilante, ronda, escala, livro de ocorrências,
  passagem de serviço, contratante)
- **en**: security guard · post/site · patrol · schedule · logbook · handover ·
  post orders · client

## 5. Quién lee esto

La **oficina**: administración, coordinación y dueño. Tono profesional, no de
campo. Trato de cortesía donde el idioma lo pida (alemán, francés, polaco); en
italiano, neerlandés y portugués, el registro habitual del software de empresa.

Y una regla del producto que también aplica traduciendo: **nada de jerga
técnica** en el texto que ve el cliente. Ni «servidor», ni «backend», ni
«endpoint», ni «tenant». Se dice qué pasó y qué hacer.

## 6. Prohibido

Dejar cadenas en español (en portugués e italiano hay cognados legítimos —
«Total», «Normal» — pero si TODA tu salida se parece al español, no tradujiste),
inventar claves, quitar claves, reordenar, y calcar literalmente los términos del
oficio.
