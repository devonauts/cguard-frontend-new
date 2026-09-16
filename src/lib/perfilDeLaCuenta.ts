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
