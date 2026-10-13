import { useEffect, useState } from "react";

import {
  conexionAppService,
  type MarcaSinSenalDatos,
} from "@/lib/api/conexionAppService";

/**
 * ¿Cuáles de estos registros se hicieron sin señal y llegaron después?
 *
 * UNA petición por lista pintada (los ids de las filas visibles), no una por
 * fila. Si cambian los ids, otra; si no, ninguna. Un fallo deja la lista sin
 * etiquetas, nunca la rompe.
 */
export function useMarcasSinSenal(
  ids: Array<string | number | null | undefined>,
) {
  const [marcas, setMarcas] = useState<Record<string, MarcaSinSenalDatos>>({});
  const limpios = Array.from(
    new Set(ids.filter((x) => x != null && x !== "").map(String)),
  ).sort();
  const clave = limpios.join(",");

  useEffect(() => {
    if (!clave) {
      setMarcas({});

      return;
    }
    let vivo = true;

    conexionAppService
      .marcas(clave.split(","))
      .then((m) => {
        if (vivo) setMarcas(m || {});
      })
      .catch(() => {
        if (vivo) setMarcas({});
      });

    return () => {
      vivo = false;
    };
  }, [clave]);

  return marcas;
}
