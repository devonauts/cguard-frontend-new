/**
 * DETECTOR DE TORMENTAS DE PETICIONES — SÓLO EN DESARROLLO.
 *
 * La auditoría encontró que lo que se veía como «la pantalla va lenta» eran,
 * en realidad, la misma petición repetida tres o cuatro veces por carga, y en
 * algunos flujos miles. Nada de eso se veía hasta que alguien abría la pestaña
 * de red y contaba a mano.
 *
 * Esto lo dice solo, en la consola, mientras se programa:
 *
 *   [RED] posible tormenta
 *     GET /tenant/:id/security-guard
 *     12 peticiones en 1,8 s
 *     desde: SecurityGuardsPage.tsx:546 · useEffect
 *
 * REGLAS QUE NO SE ROMPEN:
 *
 *  · NO corre en producción. El cuerpo entero está detrás de `import.meta.env.DEV`,
 *    así que el minificador lo borra del bundle publicado.
 *  · NO bloquea ni retrasa ninguna petición. Sólo cuenta y avisa.
 *  · NO registra NADA sensible. Se guarda la ruta NORMALIZADA (los ids se
 *    sustituyen por `:id`) y se tira la cadena de consulta entera, porque ahí
 *    es donde viajan los términos de búsqueda, los correos, las coordenadas y
 *    los filtros con nombres de personas. Nunca cabeceras, cuerpos ni tokens.
 */

/** Cuántas veces puede repetirse la MISMA lectura antes de sospechar. */
const EN_1S = 3;
const EN_10S = 8;

type Marca = { t: number };
const historial = new Map<string, Marca[]>();
const yaAvisado = new Map<string, number>();
/** No repetir el mismo aviso más de una vez por minuto. */
const SILENCIO_MS = 60_000;

/**
 * Deja la URL en una forma agrupable Y ANÓNIMA.
 * `/api/tenant/9f3a…/security-guard?q=Pérez&lat=19.4` → `/tenant/:id/security-guard`
 */
export function rutaAnonima(url: string): string {
  let camino = url;

  try {
    // `URL` necesita base para las relativas; el origen se descarta después.
    camino = new URL(url, "http://x").pathname;
  } catch {
    camino = String(url).split("?")[0];
  }

  return (
    camino
      .replace(/^\/api/, "")
      // uuid
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
      // ids numéricos
      .replace(/\/\d+(?=\/|$)/g, "/:n")
      // tokens/hashes largos sueltos
      .replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, "/:token") || "/"
  );
}

/**
 * De dónde salió la petición, en dos líneas de pila y sin rutas absolutas.
 * Se queda con los marcos del propio código (`src/…`), que son los útiles.
 */
function deDonde(): string {
  const pila = new Error().stack || "";

  const marcos = pila
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter(
      (l) =>
        !l.includes("diagnosticoDeRed") &&
        !l.includes("node_modules") &&
        /\.(tsx?|jsx?)/.test(l),
    )
    .slice(0, 3)
    .map((l) => l.replace(/https?:\/\/[^/]+/g, "").replace(/^at\s+/, ""));

  return marcos.length ? marcos.join("  ←  ") : "(sin pila)";
}

/**
 * La detección, SIN efectos y sin depender del entorno: devuelve el texto del
 * aviso o `null`. Separada de `anotarPeticion` para poder probarla con un reloj
 * de mentira, igual que `sondeoVisible` y `lecturaCompartida`.
 */
export function detectarTormenta(
  method: string,
  url: string,
  ahora: number = Date.now(),
): string | null {
  // Sólo las lecturas: una ráfaga de escrituras suele ser una acción de lote
  // legítima (y ya la limita `enLotes`), no un bucle de render.
  if (String(method).toUpperCase() !== "GET") return null;

  const clave = `GET ${rutaAnonima(url)}`;
  const marcas = historial.get(clave) || [];

  marcas.push({ t: ahora });
  // Ventana deslizante de 10 s.
  const vivas = marcas.filter((m) => ahora - m.t <= 10_000);

  historial.set(clave, vivas);

  const en1s = vivas.filter((m) => ahora - m.t <= 1_000).length;
  const en10s = vivas.length;

  if (en1s <= EN_1S && en10s <= EN_10S) return null;

  /* `has`, no `|| 0`: con `|| 0` un «nunca avisado» se leía como «avisado en el
     instante cero», y entonces `ahora - 0 < SILENCIO_MS` silenciaba el primer
     aviso siempre que el reloj fuera pequeño. Con `Date.now()` no se notaba
     —son billones— pero la lógica estaba mal, y una prueba con reloj propio lo
     destapó enseguida. */
  const ultimo = yaAvisado.get(clave);

  if (ultimo !== undefined && ahora - ultimo < SILENCIO_MS) return null;
  yaAvisado.set(clave, ahora);

  const ventana = en1s > EN_1S ? "1 s" : "10 s";
  const cuantas = en1s > EN_1S ? en1s : en10s;

  return (
    `[RED] posible tormenta de peticiones\n` +
    `  ${clave}\n` +
    `  ${cuantas} peticiones en ${ventana}\n` +
    `  desde: ${deDonde()}\n` +
    `  (aviso de DESARROLLO — no sale en producción, y no bloquea nada)`
  );
}

/**
 * Registra una petición. Llamar desde el cliente HTTP, antes de enviarla.
 * En PRODUCCIÓN no hace absolutamente nada: la guarda está aquí, de modo que
 * el minificador se lleva el cuerpo entero del bundle publicado.
 */
export function anotarPeticion(method: string, url: string): void {
  if (!import.meta.env.DEV) return;
  const aviso = detectarTormenta(method, url);

  // eslint-disable-next-line no-console
  if (aviso) console.warn(aviso);
}

/** Para las pruebas: olvida lo contado. */
export function reiniciarDiagnostico(): void {
  historial.clear();
  yaAvisado.clear();
}
