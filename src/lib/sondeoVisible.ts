/**
 * EL RELOJ QUE SÓLO CORRE CUANDO ALGUIEN ESTÁ MIRANDO — sin React.
 *
 * La lógica vive aquí y no dentro del hook por la misma razón que
 * `shiftStatus.ts`: así se puede probar con relojes falsos, sin montar un
 * componente ni traer un entorno de pruebas de navegador. `useSondeoVisible`
 * es sólo la envoltura que lo ata al ciclo de vida de React.
 *
 * Qué garantiza (y qué comprueban las pruebas):
 *  · con la pestaña oculta NO se arma ningún temporizador;
 *  · al volver a verse se dispara EN EL ACTO y se rearma — quien vuelve no se
 *    queda mirando datos de hace un rato;
 *  · ocultar dos veces seguidas no deja temporizadores sueltos;
 *  · `detener()` lo deja todo limpio: ni intervalo ni escucha.
 */
export interface SondeoOpciones {
  /** Qué hacer en cada tic y al recuperar la visibilidad. */
  tarea: () => void;
  /** Periodo en milisegundos. */
  cadaMs: number;
  /** Cómo se pregunta si la pestaña se ve. Inyectable para las pruebas. */
  visible: () => boolean;
  /** Registro del evento de visibilidad. Inyectable para las pruebas. */
  alCambiarVisibilidad: (fn: () => void) => () => void;
  /** Temporizadores. Inyectables para las pruebas. */
  armar?: (fn: () => void, ms: number) => unknown;
  desarmar?: (id: unknown) => void;
  /**
   * `false` = no armar nada. Es lo que permite un sondeo de respaldo que sólo
   * corre cuando hace falta: la ruta sigue abierta Y el socket está caído. Con
   * el socket sano no debe existir ningún reloj — un websocket sano más un
   * reloj permanente es exactamente lo que no queremos.
   */
  activo?: boolean;
}

export interface Sondeo {
  detener: () => void;
  /** Sólo para pruebas/diagnóstico: ¿hay un temporizador vivo ahora mismo? */
  activo: () => boolean;
}

export function iniciarSondeoVisible(op: SondeoOpciones): Sondeo {
  const armar = op.armar ?? ((fn, ms) => setInterval(fn, ms));
  const desarmar = op.desarmar ?? ((id) => clearInterval(id as never));

  let id: unknown = null;

  const activo = op.activo !== false;
  const arrancar = () => {
    // El `!id` es lo que impide que dos avisos de visibilidad seguidos dejen
    // dos relojes corriendo sobre el mismo endpoint.
    if (activo && !id && op.visible()) id = armar(op.tarea, op.cadaMs);
  };
  const parar = () => {
    if (id) {
      desarmar(id);
      id = null;
    }
  };
  const alVerse = () => {
    if (activo && op.visible()) {
      op.tarea();
      arrancar();
    } else parar();
  };

  arrancar();
  const soltarEscucha = op.alCambiarVisibilidad(alVerse);

  return {
    detener: () => {
      parar();
      soltarEscucha();
    },
    activo: () => id !== null,
  };
}
