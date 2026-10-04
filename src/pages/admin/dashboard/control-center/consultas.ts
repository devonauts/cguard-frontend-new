/**
 * LAS FUENTES DEL CENTRO DE CONTROL, EN EL CACHÉ COMPARTIDO.
 *
 * El tablero pedía sus catorce listas a mano, dentro de un efecto, cada vez
 * que se montaba. Tres costes, medidos en un refresco:
 *   · EN CASCADA: no arrancaba hasta que terminaba `/auth/me` y se descargaba
 *     el trozo del dashboard — los datos salían a los 2,1 s pudiendo salir a
 *     los 0,5 s;
 *   · SIN MEMORIA: volver al dashboard desde otra pantalla repetía las catorce;
 *   · EN BLANCO: al recargar no se pintaba nada hasta que volvía la última.
 *
 * Aquí cada lista es una consulta de react-query con su clave. Con eso:
 *   · `precargarDashboard()` las lanza al ARRANCAR, en paralelo con `/auth/me`;
 *   · volver dentro de la ventana de frescura no pide nada;
 *   · el caché se guarda en disco (lib/offline/persistCache), así que al
 *     recargar el tablero pinta lo último conocido y se refresca por detrás.
 *
 * Las claves empiezan por la ENTIDAD cuando la hay («stations», «clients»,
 * «security-guards»): es lo que invalida `autoInvalidateForMutation` al editar
 * un puesto o un cliente, así que el tablero no enseña una copia vieja.
 */
import api from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import securityGuardService from "@/lib/api/securityGuardService";
import { supervisorService } from "@/lib/api/supervisorService";
import tenantService from "@/services/tenant.service";
import { leerHistorialDeAvisos } from "@/hooks/useNotificationStream";

const tid = () => localStorage.getItem("tenantId") || "";
const get = (path: string) =>
  api.get(`/tenant/${tid()}${path}`).then((r) => r.data);

/** Cuánto vale una lectura sin volver a pedirla. Lo VIVO (posiciones,
 *  cobertura) lo mueve aparte el sondeo y el socket del propio tablero. */
const FRESCO_MS = 20_000;

const FUENTES = {
  stats: {
    clave: () => ["dashboard", tid(), "stats"],
    pedir: () => get("/dashboard/stats"),
  },
  active: {
    clave: () => ["dashboard", tid(), "active-locations"],
    pedir: () => securityGuardService.activeLocations() as Promise<unknown>,
  },
  stations: {
    clave: () => ["stations", tid(), "dashboard"],
    pedir: () => get("/station?limit=500"),
  },
  posts: {
    clave: () => ["stations", tid(), "dashboard-sedes"],
    pedir: () => get("/post-site?limit=500"),
  },
  clients: {
    clave: () => ["clients", tid(), "dashboard"],
    pedir: () => get("/client-account?limit=500"),
  },
  guards: {
    clave: () => ["security-guards", tid(), "dashboard-recuento"],
    pedir: () => get("/security-guard?limit=1"),
  },
  incidents: {
    clave: () => ["dashboard", tid(), "incidents"],
    pedir: () => get("/incident?limit=50&orderBy=createdAt_DESC"),
  },
  // Recuento de ABIERTOS hecho en el servidor: contarlos dentro de los últimos
  // 50 se quedaba corto en empresas con incidentes abiertos más antiguos.
  openIncidents: {
    clave: () => ["dashboard", tid(), "incidents-abiertos"],
    pedir: () => get("/incident?limit=1&filter[status]=abierto"),
  },
  users: {
    clave: () => ["dashboard", tid(), "users"],
    pedir: () => get("/user"),
  },
  tenant: {
    clave: () => ["dashboard", tid(), "tenant"],
    pedir: () => tenantService.findById(tid()) as Promise<unknown>,
  },
  // La «Actividad reciente». Compartida con la campana: no se vuelve a pedir
  // lo que acaba de llegar.
  events: {
    clave: () => ["dashboard", tid(), "events"],
    pedir: () =>
      leerHistorialDeAvisos(tid()).then((rows) => ({
        rows: rows.slice(0, 40),
      })),
  },
  // Contadores de «hoy», calculados en el servidor con el día de la empresa.
  ops: {
    clave: () => ["dashboard", tid(), "kpis"],
    pedir: () => api.get(`/operations/kpis`).then((r) => r.data),
  },
  sups: {
    clave: () => ["dashboard", tid(), "supervisors"],
    pedir: () => supervisorService.list() as Promise<unknown>,
  },
  // Cobertura EN VIVO por estado; `summaryOnly` trae sólo los recuentos.
  coverage: {
    clave: () => ["dashboard", tid(), "coverage"],
    pedir: () => get("/coverage/live?summaryOnly=1"),
  },
} as const;

export type FuenteDelTablero = keyof typeof FUENTES;

/** Lee una fuente por el caché. `forzar` = el botón de refrescar: red sí o sí. */
export function leerFuente(
  nombre: FuenteDelTablero,
  forzar = false,
): Promise<any> {
  const f = FUENTES[nombre];

  return queryClient.fetchQuery({
    queryKey: f.clave(),
    queryFn: f.pedir as () => Promise<any>,
    staleTime: forzar ? 0 : FRESCO_MS,
    retry: false,
  });
}

/** Lo último conocido de una fuente, sin tocar la red (o `undefined`). */
export function fuenteEnCache(nombre: FuenteDelTablero): any {
  return queryClient.getQueryData(FUENTES[nombre].clave());
}

/** Todo menos el panel ejecutivo, que depende del nivel de quien mira. */
const SIN_NIVEL = (Object.keys(FUENTES) as FuenteDelTablero[]).filter(
  (n) => n !== "stats",
);

/** ¿Hay copia de TODO lo que el tablero necesita para pintarse? */
export function tableroEnCache(): boolean {
  return SIN_NIVEL.every((n) => fuenteEnCache(n) !== undefined);
}

/**
 * Lanza las lecturas del tablero YA, sin esperar a que React monte la pantalla.
 * Se llama al arrancar cuando hay sesión y la ruta es el dashboard. Nunca
 * lanza: una precarga fallida sólo significa que el tablero la pedirá él.
 */
export function precargarDashboard(): void {
  try {
    if (!tid() || !localStorage.getItem("authToken")) return;
    for (const n of SIN_NIVEL) {
      void leerFuente(n).catch(() => undefined);
    }
  } catch {
    /* sin almacenamiento: el tablero carga como siempre */
  }
}
