import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * NINGÚN DICCIONARIO VA DENTRO DEL ARCHIVO DE ARRANQUE.
 *
 * El español iba importado de forma estática «porque es el de respaldo». Pero
 * los diccionarios crecieron: cada idioma pesa ~830 kB (200 kB comprimido), y
 * el de entrada llevaba casi la mitad de su peso en español — que además se
 * bajaba ENTERO quien usa el panel en inglés, encima del suyo.
 *
 * Ahora:
 *   · se descarga SÓLO el idioma en el que se va a pintar (`idiomaDeArranque`),
 *     y `main.tsx` espera a `idiomaListo` antes de montar — CON LÍMITE: si la
 *     red no contesta se monta igual y el texto llega cuando llegue;
 *   · `index.html` empieza a bajarlo a la vez que el código (ver el plugin
 *     `precargaDeIdioma` en vite.config.ts), no detrás de él;
 *   · NO se descarga el español «de respaldo». Los ocho diccionarios tienen
 *     exactamente las mismas claves (lo vigila la prueba de paridad), así que
 *     una clave que falta en el idioma activo falta también en español: el
 *     respaldo no la habría encontrado, y traerlo «por si acaso» costaba
 *     200 kB a cada usuario que no lee en español. Medido: bastaba UNA clave
 *     dinámica sin traducir para que se descargara en cada carga.
 *
 * Las pruebas cargan el español de forma síncrona en `src/pruebas/idioma.ts`.
 */
const CARGADORES: Record<string, () => Promise<any>> = {
  es: () => import("./locales/es.json"),
  en: () => import("./locales/en.json"),
  // `pt` apuntaba a `pt_fixed.json`, que estaba INCOMPLETO: 6.270 de 7.828
  // claves. Lo que faltaba salía en español a un usuario brasileño. Ese archivo
  // ya no existe: se quedó atrás cuando esto pasó a `pt.json` y siguió siendo
  // lo que medía el gate de paridad y lo que escribía `scripts/i18n/apply.mjs`
  // —una roja permanente por claves que no le faltaban a nadie, y portugués
  // nuevo cayendo en un archivo que nadie carga—. Sólo hay un diccionario pt.
  pt: () => import("./locales/pt.json"),
  de: () => import("./locales/de.json"),
  fr: () => import("./locales/fr.json"),
  it: () => import("./locales/it.json"),
  pl: () => import("./locales/pl.json"),
  nl: () => import("./locales/nl.json"),
};

/**
 * El idioma del primer pintado, sin red: el último que usó este navegador
 * (`app_language`, que LanguageContext escribe en cada arranque), si no el del
 * navegador, y si no inglés. Tiene que coincidir con la precarga de
 * `index.html`: es la misma regla escrita dos veces, a propósito corta.
 */
export function idiomaDeArranque(): string {
  if (import.meta.env.MODE === "test") return "es";
  try {
    const guardado = (localStorage.getItem("app_language") || "")
      .slice(0, 2)
      .toLowerCase();

    if (CARGADORES[guardado]) return guardado;
    const nav = (navigator.language || "").slice(0, 2).toLowerCase();

    if (CARGADORES[nav]) return nav;
  } catch {
    /* sin almacenamiento */
  }

  return "en";
}

const enCurso = new Map<string, Promise<boolean>>();

/** Descarga y registra un diccionario (una sola vez). `false` si no se pudo. */
function registrar(lang: string): Promise<boolean> {
  if (i18n.hasResourceBundle(lang, "translation")) return Promise.resolve(true);
  const cargar = CARGADORES[lang];

  if (!cargar) return Promise.resolve(false);
  let p = enCurso.get(lang);

  if (!p) {
    p = cargar().then(
      (mod) => {
        i18n.addResourceBundle(
          lang,
          "translation",
          (mod as any).default ?? mod,
          true,
          true,
        );

        return true;
      },
      () => {
        enCurso.delete(lang); // red caída: que el siguiente intento vuelva a pedir

        return false;
      },
    );
    enCurso.set(lang, p);
  }

  return p;
}

const INICIAL = idiomaDeArranque();

i18n.use(initReactI18next).init({
  resources: {},
  lng: INICIAL,
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  // `bindI18nStore`: un diccionario que llega DESPUÉS de montar (el arranque
  // venció su límite, o hizo falta el respaldo) repinta lo que ya está en
  // pantalla, en vez de dejar las claves a la vista hasta navegar.
  react: { useSuspense: false, bindI18nStore: "added" },
});

/** Se resuelve cuando el idioma del primer pintado está cargado (o falló). */
export const idiomaListo: Promise<boolean> = registrar(INICIAL);

/**
 * Cambia el idioma, descargando su diccionario si aún no está registrado.
 *
 * ÚSALO EN VEZ DE `i18n.changeLanguage` directamente: llamar al de i18next con un
 * idioma no cargado deja la interfaz en el respaldo (español) sin decir nada, y
 * el fallo es silencioso y difícil de ver.
 *
 * Si la descarga falla —red caída a mitad— se conserva el idioma actual en vez de
 * dejar la interfaz a medio traducir.
 */
export async function setAppLanguage(code: string): Promise<void> {
  const lang = String(code || "es")
    .slice(0, 2)
    .toLowerCase();

  if (!CARGADORES[lang]) return; // idioma desconocido: no se toca nada
  if (!(await registrar(lang))) return;

  await i18n.changeLanguage(lang);
}

// `<html lang>` sigue al idioma de la interfaz. Si se queda en «es» con la pantalla en
// inglés, el navegador cree que el texto está en otro idioma y ofrece traducirlo.
if (typeof document !== "undefined") {
  const marcarIdioma = (lng: string) => {
    if (lng) document.documentElement.lang = String(lng).slice(0, 2).toLowerCase();
  };
  if (i18n.language) marcarIdioma(i18n.language);
  i18n.on("languageChanged", marcarIdioma);
}

export default i18n;
