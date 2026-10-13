import { useCallback, useEffect, useState } from "react";

import {
  conexionAppService,
  type AccionRechazada,
} from "@/lib/api/conexionAppService";
import { useEventoEnVivo } from "@/hooks/useEventoEnVivo";

const SIETE_DIAS = 7 * 24 * 3600 * 1000;

/**
 * Lo que el servidor NO aceptó al llegar desde un teléfono sin señal (y lo que
 * la persona quitó sin enviar), de una persona o de toda la empresa, últimos 7
 * días. Se vuelve a leer cuando alguien recupera la conexión — que es cuando
 * llegan las acciones y salen los rechazos —, nunca con un sondeo.
 */
export function useAccionesRechazadas(userId?: string | null, opts: { activo?: boolean } = {}) {
  const activo = opts.activo !== false;
  const [filas, setFilas] = useState<AccionRechazada[]>([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(() => {
    if (!activo) return;
    setCargando(true);
    conexionAppService
      .rechazadas({ userId: userId || undefined, desde: new Date(Date.now() - SIETE_DIAS) })
      .then(setFilas)
      .catch(() => setFilas([]))
      .finally(() => setCargando(false));
  }, [userId, activo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEventoEnVivo(["presencia:update"], cargar, { activo });

  return { rechazadas: filas, cargando, recargar: cargar };
}
