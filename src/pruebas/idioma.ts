/**
 * El español, síncrono, para las pruebas.
 *
 * En la aplicación ningún diccionario va en el arranque (ver `src/i18n.ts`):
 * se descarga el idioma activo. Las pruebas no esperan a nadie y comparan
 * contra el texto en español, así que aquí se registra antes de cada archivo.
 */
import i18n from "@/i18n";
import es from "@/locales/es.json";

i18n.addResourceBundle("es", "translation", es, true, true);
await i18n.changeLanguage("es");
