import { AuthService } from "@/services/auth/authService";
import { crearLecturaCompartida } from "@/lib/lecturaCompartida";

/**
 * QUIÉN ES EL QUE ENTRÓ — UNA sola vez por arranque.
 *
 * `/auth/me` se pedía TRES veces en cada carga en frío, medido en un build de
 * producción, y las tres salían en el mismo tic porque los tres proveedores se
 * montan en el mismo commit de React:
 *
 *   · `AuthProvider`  — la sesión: permisos, empresa, si es superadmin.
 *   · `ThemeProvider` + `AccentProvider` — sólo querían `appearance`
 *     (compartían la suya entre ellos dos, eso ya estaba bien resuelto).
 *   · `LanguageProvider` — sólo quería `languageChoice`.
 *
 * Tres respuestas al «¿quién soy?» no son sólo tres veces el tráfico: son tres
 * sitios que pueden DISCREPAR mientras dura la carrera, cada uno con su propio
 * manejo del fallo. Aquí hay un único dueño y los tres leen de él.
 *
 * POR QUÉ PASA POR `AuthService` Y NO POR AXIOS. Los otros dos usaban el
 * cliente de axios, que no hace nada ante un 401. `ApiService` —el que hay
 * debajo de `AuthService`— sí: limpia el token y devuelve al login. Al
 * compartir el de la sesión, una sesión revocada se comporta igual mire quien
 * mire, en vez de dejar la pantalla a medias.
 *
 * La ventana de frescura es corta a propósito: lo justo para que un arranque
 * entero se sirva de una sola respuesta, y no tanto como para que un cambio de
 * permisos tarde en verse. El backend ya cachea la identidad 20 s por su
 * cuenta, así que retener menos que eso no ganaría frescura ninguna.
 */
const lector = crearLecturaCompartida<any>(() => AuthService.getProfile(), 15_000);

/**
 * El perfil de la cuenta. Devuelve la misma respuesta a todo el que pregunte
 * durante el arranque. Lanza si la petición falla — quien quiera reintentar
 * puede volver a llamar, porque un fallo no se memoriza.
 */
export const leerPerfil = lector.leer;

/**
 * Olvida lo leído. Se llama al cerrar sesión y al cambiar de cuenta: sin esto,
 * el siguiente que entre en la misma pestaña —que es una navegación del SPA,
 * sin recarga— se encontraría con la identidad del anterior.
 */
export const olvidarPerfil = lector.olvidar;

/**
 * PREGUNTA «¿QUIÉN SOY?» ANTES DE QUE HAYA ÁRBOL DE REACT.
 *
 * Medido en el arranque de producción 6764d243, con la caché del service
 * worker caliente:
 *
 *      97 ms  React inyectado
 *     159 ms  sale `/platform/context`  (la marca del anfitrión)
 *     301 ms  sale `/auth/me`           ← espera a la anterior
 *     678 ms  salen las 38 peticiones de la empresa  ← esperan a `/auth/me`
 *
 * Los 142 ms entre la primera y la segunda no los gasta nadie trabajando: son
 * de espera. `WhiteLabelProvider` (main.tsx) no pinta a sus hijos hasta saber
 * de quién es el anfitrión —lo cual es correcto, evita el parpadeo de marca—,
 * así que `AuthProvider` ni siquiera se MONTA hasta entonces, y su `checkAuth`
 * no puede arrancar. La identidad acaba encolada detrás de una decisión
 * puramente visual de la que no depende en absoluto.
 *
 * Esto rompe esa dependencia sin tocar el orden de los proveedores: se lanza la
 * lectura desde `main.tsx`, fuera de React. Cuando `AuthProvider` monta y llama
 * a `leerPerfil()`, el lector compartido le entrega ESA MISMA petición —en
 * vuelo o ya resuelta—, así que no hay una segunda llamada.
 *
 * Lo que NO cambia:
 *  · Sin `authToken` no se pide nada, igual que hoy.
 *  · Un fallo no se memoriza (ver `crearLecturaCompartida`), así que el bucle
 *    de reintentos con retroceso de `checkAuth` sigue funcionando igual ante un
 *    429 o un 503.
 *  · Un 401 lo sigue tratando `ApiService` como siempre; sólo ocurre antes.
 */
export function adelantarPerfil(): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (!localStorage.getItem("authToken")) return;
    // El rechazo se traga AQUÍ para que no salga como «unhandled rejection»:
    // quien de verdad maneja el fallo es `checkAuth`, que volverá a pedir.
    void leerPerfil().catch(() => {});
  } catch {
    /* almacenamiento bloqueado: se pedirá desde React, como siempre */
  }
}
