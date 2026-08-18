/**
 * Persistencia del caché de datos — la mitad "lectura" del modo offline.
 *
 * TODA la lectura del CRM ya pasa por react-query (cachedFetch en
 * lib/queryClient.ts), pero ese caché vivía solo en memoria: cerrar la pestaña
 * o perder la red al arrancar dejaba la app en blanco. Esto lo vuelca a
 * IndexedDB y lo restaura al arrancar, así que un corte de internet en la
 * oficina deja un CRM que ABRE y muestra todo lo último conocido (clientes,
 * guardias, horarios, incidentes) en vez de una pantalla de error.
 *
 * Qué NO es: un caché HTTP ciego. El service worker deja pasar /api directo a
 * la red; lo que se persiste son los RESULTADOS ya normalizados de react-query,
 * cuyas claves ya llevan el tenant (["clients", tid(), …]) — así una cuenta con
 * dos empresas nunca ve datos cruzados.
 *
 * Seguridad: es información operativa en el disco de la máquina. Por eso
 * (a) caduca sola (MAX_AGE), (b) se BORRA en el cierre de sesión
 * (clearPersistedCache, cableado en AuthContext.signOut) y (c) el buster la
 * invalida entera si cambia la forma de los datos entre versiones.
 */
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get, set, del } from "idb-keyval";
import { queryClient } from "@/lib/queryClient";

const IDB_KEY = "crm.queryCache.v1";

/** Vida máxima de un dato restaurado. Un corte de oficina dura minutos u horas,
 *  no días: datos de más de 24 h confunden más de lo que ayudan. */
const MAX_AGE = 24 * 60 * 60 * 1000;

/** Cambiar este texto invalida TODO el caché persistido (migraciones de forma). */
const BUSTER = "crm-offline-v1";

const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key: string) => get(key).then((v) => v ?? null),
    setItem: (key: string, value: string) => set(key, value),
    removeItem: (key: string) => del(key),
  },
  key: IDB_KEY,
  // Volcar como mucho una vez por segundo: el caché de un CRM denso cambia en
  // ráfagas y serializarlo entero en cada tick costaría más que la red.
  throttleTime: 1000,
});

/** Arranca la persistencia. Llamar UNA vez, al inicio (main.tsx). */
export function startCachePersistence(): void {
  try {
    persistQueryClient({
      queryClient,
      persister,
      maxAge: MAX_AGE,
      buster: BUSTER,
      dehydrateOptions: {
        // Solo lecturas completadas con éxito. Un error o un fetch a medias no
        // es un dato — restaurarlo pintaría estados rotos.
        shouldDehydrateQuery: (q) => q.state.status === "success",
      },
    });
  } catch (e) {
    // Sin IndexedDB (modo incógnito estricto) el CRM sigue siendo el de antes:
    // caché solo en memoria. Nunca romper el arranque por esto.
    console.warn("[offline] persistencia de caché no disponible:", e);
  }
}

/** Borra el caché persistido Y el de memoria. Cableado en el cierre de sesión:
 *  en una máquina compartida, el siguiente usuario no hereda datos del anterior. */
export async function clearPersistedCache(): Promise<void> {
  try { queryClient.clear(); } catch { /* ignore */ }
  try { await del(IDB_KEY); } catch { /* ignore */ }
}
