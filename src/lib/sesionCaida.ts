import { cerrarSesionDeCodigo } from "@/lib/sesionDeCodigo";
import {
  esAccesoBloqueado,
  RUTA_ACCESO_BLOQUEADO,
  sacarDeLaSesion,
} from "@/lib/accesoBloqueado";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UNA PETICIÓN CON SESIÓN RECIBIÓ 401: LA SESIÓN MURIÓ
 *
 * Un solo sitio para los DOS clientes HTTP del CRM (`ApiService` y el axios de
 * `lib/api`). Antes sólo `ApiService` cerraba la sesión; axios se tragaba el
 * 401 y quien lo usaba en un sondeo —el contador de mensajes sin leer, cada
 * minuto— seguía preguntando con el token muerto. Una pestaña con la sesión
 * superada por un login en otro equipo mandó 159 peticiones rechazadas en
 * tres horas, todos los días (2026-11-04 y 2026-11-05).
 *
 *  · 401 `auth.accessBlocked` → «Acceso bloqueado», con su cierre normal.
 *  · Cualquier otro 401 → se borra la sesión y se va al login, guardando el
 *    motivo para enseñarlo allí.
 *  · Ya en /login o en «Acceso bloqueado» no se hace nada (no hay bucle).
 *
 * Devuelve `true` si cerró la sesión.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function cerrarPorSesionCaida(datos: unknown, mensaje?: unknown): boolean {
  let ruta = "";

  try {
    ruta = String(window.location.pathname || "");
  } catch {
    return false;
  }
  if (ruta.startsWith(RUTA_ACCESO_BLOQUEADO)) return false;
  if (esAccesoBloqueado(datos)) {
    void sacarDeLaSesion({ motivo: "bloqueo" });

    return true;
  }
  if (ruta.startsWith("/login")) return false;
  // POR QUÉ se cerró la sesión. Sin esto, al centralista que ficha salida le
  // aparecía la pantalla de login sin explicación y parecía una avería.
  try {
    sessionStorage.setItem("authExitReason", String(mensaje || ""));
  } catch {
    /* */
  }
  try {
    localStorage.removeItem("authToken");
  } catch {
    /* */
  }
  // El perfil cacheado para la sesión offline pertenece a la sesión que acaba
  // de morir (auditoría 2026-08-18).
  try {
    localStorage.removeItem("authUserCache");
  } catch {
    /* */
  }
  void cerrarSesionDeCodigo();
  try {
    window.location.replace("/login");
  } catch {
    /* */
  }

  return true;
}
