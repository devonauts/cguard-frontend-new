/**
 * EL DISPOSITIVO CON EL QUE SE ENTRA A LA RADIO.
 *
 * LiveKit exige identidad ÚNICA por sala y EXPULSA a quien ya esté dentro con
 * la misma. La identidad era el `userId` pelado, así que la misma persona con
 * el CRM abierto en el ordenador y la app en el teléfono se echaba a sí misma
 * en bucle: 6.087 expulsiones `DUPLICATE_IDENTITY` en 36 h medidas en
 * producción, con la sesión durando segundos. La radio no iba lenta — no
 * llegaba a estar conectada.
 *
 * Se manda al backend, que compone `<userId>#<dispositivo>`
 * (backend/src/lib/radioIdentity.ts). Es ESTABLE por instalación a propósito:
 * al reconectar, el mismo aparato vuelve con la misma identidad y expulsa a su
 * propio fantasma —la sesión que quedó colgada sin cerrar—, que es justo lo que
 * se quiere. Un id nuevo en cada conexión dejaría al fantasma dentro y la
 * persona aparecería dos veces en el canal.
 *
 * `superficie` separa la radio NATIVA de la del WebView dentro del mismo
 * teléfono: no corren a la vez, pero durante un relevo pueden solaparse un
 * instante, y ese instante es una expulsión.
 */

const CLAVE = "radio.deviceId";

function base(): string {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) return guardado;
    const nuevo = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem(CLAVE, nuevo);
    return nuevo;
  } catch {
    // Sin almacenamiento (modo privado, cuota): uno por sesión. Peor —cada
    // recarga es un dispositivo nuevo— pero sigue sin colisionar con nadie.
    return Math.random().toString(36).slice(2, 12);
  }
}

/** `w` = radio del WebView/navegador · `n` = radio nativa (plugin Ptt). */
export function radioDeviceId(superficie: "w" | "n" = "w"): string {
  return `${base()}${superficie}`;
}

/**
 * El `userId` que hay detrás de una identidad de sala. Lo que se enseña y lo
 * que se compara con la plantilla son PERSONAS, no conexiones.
 * Tolera las identidades antiguas (sin `#`).
 */
export function usuarioDeIdentidad(identity: string | null | undefined): string {
  const s = String(identity || "");
  const i = s.indexOf("#");
  return i === -1 ? s : s.slice(0, i);
}
