import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './locales/es.json'

/**
 * Sólo el español entra en el bundle de arranque.
 *
 * Antes se importaban los tres idiomas de forma estática: 195 kB de `es`, 180 de
 * `en` y 23 de `pt`, todos dentro del chunk de entrada. Como `lng` y
 * `fallbackLng` son ambos `es`, los otros dos sólo hacen falta si el usuario
 * cambia de idioma — y aun así se los descargaba TODO el mundo, en cada carga.
 *
 * `es` se queda estático a propósito: es el idioma por defecto Y el de respaldo,
 * así que tiene que estar disponible de forma síncrona para el primer pintado.
 * Sin él, la app arrancaría mostrando las claves de traducción en crudo.
 */
i18n.use(initReactI18next).init({
  resources: { es: { translation: es } },
  lng: 'es',
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

/** Los idiomas que se descargan cuando se piden. `es` no está: ya viene dentro. */
const CARGADORES: Record<string, () => Promise<any>> = {
  en: () => import('./locales/en.json'),
  // `pt` apuntaba a `pt_fixed.json`, que estaba INCOMPLETO: 6.270 de 7.828
  // claves. Lo que faltaba salía en español a un usuario brasileño. Ese archivo
  // ya no existe: se quedó atrás cuando esto pasó a `pt.json` y siguió siendo
  // lo que medía el gate de paridad y lo que escribía `scripts/i18n/apply.mjs`
  // —una roja permanente por claves que no le faltaban a nadie, y portugués
  // nuevo cayendo en un archivo que nadie carga—. Sólo hay un diccionario pt.
  pt: () => import('./locales/pt.json'),
  de: () => import('./locales/de.json'),
  fr: () => import('./locales/fr.json'),
  it: () => import('./locales/it.json'),
  pl: () => import('./locales/pl.json'),
  nl: () => import('./locales/nl.json'),
}

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
  const lang = String(code || 'es').slice(0, 2).toLowerCase()

  if (!i18n.hasResourceBundle(lang, 'translation')) {
    const cargar = CARGADORES[lang]
    if (!cargar) return // idioma desconocido: no se toca nada
    try {
      const mod = await cargar()
      i18n.addResourceBundle(lang, 'translation', (mod as any).default ?? mod, true, true)
    } catch {
      return
    }
  }

  await i18n.changeLanguage(lang)
}

export default i18n
