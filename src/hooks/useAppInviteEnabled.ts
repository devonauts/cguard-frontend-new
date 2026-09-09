/**
 * ════════════════════════════════════════════════════════════════════════════
 * ¿SE PUEDE INVITAR A LA APP?
 *
 * El correo «Invitar a la app» se puede apagar en Configuración → Preferencias
 * de correo. Cuando está apagado, el servidor rechaza el envío con un 400. Pero
 * enterarse así es tarde: el administrador ya abrió el diálogo, leyó a quién se
 * le iba a enviar y confirmó. La acción no debe ofrecerse siquiera.
 *
 * POR QUÉ UN HOOK Y NO TRES `useEffect`. La acción vive en tres sitios —el menú
 * de la lista de clientes, la pestaña Portal y la de Usuarios con acceso— y los
 * tres se montan en la misma ficha. Preguntando cada uno por su cuenta serían
 * tres peticiones idénticas por visita. La promesa se guarda a nivel de módulo,
 * así que se pregunta UNA vez por sesión y los tres leen la misma respuesta.
 *
 * ANTE UN FALLO, SE DEJA ENCENDIDA. `settingsRead` lo tiene todo el personal,
 * así que un fallo aquí es de red y no de permisos — y esconder una acción por
 * un fallo de red es peor que ofrecerla y dejar que el servidor decida. El 400
 * sigue ahí como red de seguridad; esto sólo evita el camino sin salida.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useState } from 'react';
import { emailPreferencesService } from '@/lib/api/emailPreferencesService';

let enVuelo: Promise<boolean> | null = null;

/** Pregunta una vez por sesión; las siguientes llamadas reutilizan la respuesta. */
function preguntar(): Promise<boolean> {
  if (!enVuelo) {
    enVuelo = emailPreferencesService
      .get()
      .then((res) => res?.preferences?.appInvite !== false)
      .catch(() => true); // ver la nota de arriba: ante la duda, se ofrece
  }
  return enVuelo;
}

/** Olvida la respuesta guardada — para cuando se guarda la pantalla de preferencias. */
export function olvidarPreferenciaDeInvitacion(): void {
  enVuelo = null;
}

export function useAppInviteEnabled(): boolean {
  const [encendida, setEncendida] = useState(true);
  useEffect(() => {
    let vivo = true;
    preguntar().then((v) => {
      if (vivo) setEncendida(v);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return encendida;
}

export default useAppInviteEnabled;
