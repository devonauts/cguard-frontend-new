/**
 * ════════════════════════════════════════════════════════════════════════════
 * «TARJETAS O LISTA» ES UN GUSTO DE LA PERSONA, NO DEL NAVEGADOR
 *
 * Cinco pantallas —Clientes, Vigilantes, Supervisores, Estaciones y Usuarios
 * administrativos— guardaban su conmutador en `localStorage` con el mismo
 * bloque copiado cinco veces:
 *
 *     const [v, setV] = useState(() => localStorage.getItem("x.viewMode") || "cards");
 *     useEffect(() => { localStorage.setItem("x.viewMode", v); }, [v]);
 *
 * Eso sobrevive a un refresco pero no a cambiar de equipo: quien prefiere la
 * lista tenía que volver a elegirla en cada pantalla y en cada navegador. Es el
 * mismo problema que ya se resolvió para el tema y el acento, y con la misma
 * respuesta: la fuente de verdad es la CUENTA (`users.appearance.vistas`) y el
 * almacenamiento local se queda como caché de pintado, que es lo que evita ver
 * las tarjetas un instante antes de que llegue «lista».
 *
 * El orden importa y es el mismo que en `AccentContext`: primero se pinta con
 * la caché (síncrono, sin parpadeo), y cuando la cuenta responde manda ella —
 * salvo que en ESTE navegador se acabe de cambiar algo, porque `/auth/me` se
 * sirve de una caché de identidad por instancia y puede ir unos segundos
 * atrasada (ver la ventana de eco en `appearanceSync`).
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useState } from "react";

import {
  cambioLocalReciente,
  guardarApariencia,
  leerAparienciaDeLaCuenta,
} from "@/lib/appearanceSync";

/**
 * Una preferencia de vista que sigue a la persona entre equipos.
 *
 * @param clave      Identificador estable — el mismo que usaba `localStorage`,
 *                   para que quien ya tenía una preferencia no la pierda.
 * @param porDefecto Lo que se ve cuando nadie ha elegido nada.
 */
export function useVistaGuardada<T extends string>(
  clave: string,
  porDefecto: T,
): [T, (v: T) => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      return (localStorage.getItem(clave) as T) || porDefecto;
    } catch {
      return porDefecto;
    }
  });

  // Al arrancar: lo que diga la cuenta manda sobre la caché de este navegador.
  useEffect(() => {
    let vivo = true;

    leerAparienciaDeLaCuenta().then((a) => {
      if (!vivo || cambioLocalReciente()) return;
      const guardado = a?.vistas?.[clave];

      if (!guardado || typeof guardado !== "string") return;
      setValor(guardado as T);
      try {
        localStorage.setItem(clave, guardado);
      } catch {}
    });

    return () => {
      vivo = false;
    };
  }, [clave]);

  const elegir = useCallback(
    (v: T) => {
      setValor(v);
      try {
        localStorage.setItem(clave, v);
      } catch {}
      /* `vistas` se FUSIONA en el servidor (ver `mergeAppearance`), así que
         mandar sólo esta clave no borra las de las otras pantallas. */
      guardarApariencia({ vistas: { [clave]: v } });
    },
    [clave],
  );

  return [valor, elegir];
}
