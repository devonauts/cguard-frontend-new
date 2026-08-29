# Especificación — traducción del CRM

Traduces **un bloque** del diccionario del CRM a **un idioma**.

## 1. Entrada y salida

- Fuente: `scripts/i18n/bloques/es-<BLOQUE>.json` (español, es la verdad).
- Referencia cruzada: `scripts/i18n/bloques/en-<BLOQUE>.json` (inglés) para
  resolver ambigüedades.
- **ANCLA DE VOCABULARIO, obligatoria**: `../worker-app/src/i18n/locales/<idioma>.json`
  y `../supervisor-app/src/i18n/locales/<idioma>.json`. Las apps móviles YA están
  traducidas a tu idioma. **Los términos del oficio deben coincidir con ellas.**
  Si la app dice `Rundgang`, el CRM no puede decir `Runde`: es la misma empresa
  mirando el mismo dato desde dos pantallas.
- Salida: `scripts/i18n/bloques/<idioma>-<BLOQUE>.json`

Estructura IDÉNTICA a la fuente: mismas claves, mismo anidamiento, mismo orden.
Sólo cambian los valores.

## 2. Qué NO se traduce

Marcas (CGuardPro, C-Guard, VigIA, ATLAS), interpolaciones `{{…}}` —literales,
mismo nombre—, URLs, códigos y siglas técnicas.

## 3. Longitud: distinto que en la app

Esto es un panel de escritorio, no una pantalla de 390 px, así que hay más aire
que en las apps. Pero **dos sitios siguen siendo estrechos**:

- **`sidebar.*`** — el menú lateral. Ahí sí: no pases del 130 % del español.
- **Encabezados de tabla y botones de acción** dentro de `ui.*` y `actions.*`.

En textos de ayuda, descripciones y mensajes de error puedes respirar.

## 4. Vocabulario del sector

El mismo de las apps (ver el ancla del punto 1). Recordatorio:

- **de**: Sicherheitskraft/Wachkraft · Objekt · Rundgang · Dienstplan · Wachbuch ·
  Schichtübergabe · Anweisung · Auftraggeber · Einsatzleiter · Vertretung
- **fr**: agent de sécurité · poste/site · ronde · planning · main courante ·
  relève · consigne · client · vacation (=turno) · RAS (=sin novedad)
- **it**: guardia (giurata) · posto di servizio · ronda · turni · registro di
  servizio · cambio turno · consegne · committente
- **pl**: pracownik ochrony · posterunek · obchód · grafik · książka służby ·
  zdanie służby · instrukcja · zleceniodawca · zastępstwo
- **nl**: beveiliger · post/object · ronde · rooster · wachtboek ·
  dienstoverdracht · werkinstructie · opdrachtgever · invallen

## 5. Quién lee esto

El CRM lo usa la **oficina**: administración, coordinación y dueño. Tono
profesional, no de campo. Trato de cortesía donde el idioma lo pida (alemán,
francés, polaco); en italiano y neerlandés, el registro habitual de software de
empresa.

## 6. Prohibido

Dejar cadenas en español, inventar o reordenar claves, y traducir con calco
literal los términos del oficio.
