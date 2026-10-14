import { useCallback, useEffect, useMemo, useState } from "react";

import {
  conexionAppService,
  type EpisodioDeConexion,
  type EstadoDeConexion,
} from "@/lib/api/conexionAppService";
import { useEventoEnVivo } from "@/hooks/useEventoEnVivo";

/**
 * ¿Tienen conexión las personas de las apps de campo? Un mapa por userId.
 *
 * NO se sondea. Se lee una vez y se vuelve a leer cuando el servidor avisa por
 * el socket (`presencia:update`: alguien recuperó la conexión) o al reconectar
 * el propio CRM (`useEventoEnVivo` lo hace solo).
 *
 * Perder la conexión no lo puede avisar nadie —el teléfono que se queda sin
 * señal no manda nada—, así que eso se calcula AQUÍ: con la última señal y el
 * umbral del servidor se pone un reloj al instante exacto en que alguien
 * cruza el umbral, y en ese momento pasa a «sin conexión». Un temporizador al
 * cruce, no un intervalo.
 *
 * «Sin conexión» (`conectado: false`) no es «perdió la conexión»
 * (`perdioConexion`): callar es lo normal con la app cerrada. Sólo lo segundo
 * se pinta en rojo o se lista como problema (caso B.A.S., 2026-10-14).
 */
export function useConexionApp(userIds?: string[]) {
  const [filas, setFilas] = useState<EstadoDeConexion[]>([]);
  const [umbralMs, setUmbralMs] = useState(6 * 60_000);
  /* Diferencia entre el reloj del servidor y el de este equipo: el umbral se
     mide con la hora del servidor, no con la de un portátil desajustado. */
  const [desfaseMs, setDesfaseMs] = useState(0);
  const [tic, setTic] = useState(0);
  const clave = (userIds || []).slice().sort().join(",");

  const cargar = useCallback(() => {
    conexionAppService
      .estado(clave ? clave.split(",") : undefined)
      .then((r) => {
        setFilas(Array.isArray(r?.rows) ? r.rows : []);
        if (r?.umbralMs) setUmbralMs(r.umbralMs);
        if (r?.ahora) setDesfaseMs(new Date(r.ahora).getTime() - Date.now());
      })
      .catch(() => {
        /* sin permiso o sin red: no se enseña nada, no se rompe la pantalla */
      });
  }, [clave]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEventoEnVivo(["presencia:update"], cargar);

  const porUsuario = useMemo(() => {
    const ahora = Date.now() + desfaseMs;
    const m = new Map<string, EstadoDeConexion>();

    for (const f of filas) {
      const callado = ahora - new Date(f.ultimaSenal).getTime();
      const conectado = callado <= umbralMs;

      m.set(String(f.userId), {
        ...f,
        conectado,
        // Callar sólo es «perdió la conexión» si venía mandando GPS solo:
        // con la app cerrada todos callan, y eso es lo normal.
        perdioConexion: !conectado && !!f.conRastro,
        desde: conectado ? f.desde : f.ultimaSenal,
      });
    }

    return m;
    // `tic` salta con el reloj de abajo, al cruzar alguien el umbral.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, umbralMs, desfaseMs, tic]);

  // El próximo cruce del umbral: a esa hora exacta se repinta.
  useEffect(() => {
    let proximo = Infinity;

    for (const f of filas) {
      const cruce =
        new Date(f.ultimaSenal).getTime() + umbralMs - (Date.now() + desfaseMs);

      if (cruce > 0 && cruce < proximo) proximo = cruce;
    }
    if (!Number.isFinite(proximo)) return;
    const t = setTimeout(
      () => setTic((n) => n + 1),
      Math.min(proximo + 250, 2 ** 31 - 1),
    );

    return () => clearTimeout(t);
  }, [filas, umbralMs, desfaseMs, tic]);

  return { porUsuario, recargar: cargar };
}

/** Los huecos sin conexión de una persona en las últimas 24 h (ficha). */
export function useEpisodiosDeConexion(userId?: string | null) {
  const [episodios, setEpisodios] = useState<EpisodioDeConexion[]>([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(() => {
    if (!userId) return;
    setCargando(true);
    conexionAppService
      .episodios(String(userId))
      .then(setEpisodios)
      .catch(() => setEpisodios([]))
      .finally(() => setCargando(false));
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEventoEnVivo(["presencia:update"], cargar, { activo: !!userId });

  return { episodios, cargando };
}
