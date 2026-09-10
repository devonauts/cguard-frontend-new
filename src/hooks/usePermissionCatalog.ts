import { useEffect, useState } from "react";

import { ApiService } from "@/services/api/apiService";

/**
 * El catálogo de permisos, pedido al servidor.
 *
 * La pantalla de Roles pintaba una copia a mano (`@/config/permissions`) que se
 * quedó 33 permisos por detrás: había funciones —VigIA, cobertura, facturación,
 * ajustes de desempeño— que no se podían conceder ni quitar porque no aparecían
 * en la lista. Pedirlo al servidor hace imposible que vuelva a pasar: un permiso
 * nuevo en el backend sale aquí sin tocar el CRM.
 *
 * Se cachea en memoria por sesión — es una lista fija de ~350 cadenas y la
 * pantalla se abre y se cierra mucho.
 */
let cache: string[] | null = null;

export function usePermissionCatalog(): { ids: string[]; cargando: boolean } {
  const [ids, setIds] = useState<string[]>(cache || []);
  const [cargando, setCargando] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let vivo = true;
    const tenantId = localStorage.getItem("tenantId");

    if (!tenantId) {
      setCargando(false);

      return;
    }

    ApiService.get(`/tenant/${tenantId}/permission-catalog`)
      .then((res: any) => {
        if (!vivo) return;
        const lista = (res && (res.ids || res.data?.ids)) || [];

        if (Array.isArray(lista) && lista.length) {
          cache = lista;
          setIds(lista);
        }
      })
      // Silencio a propósito: si falla, el llamador cae a su copia local y la
      // pantalla sigue siendo usable. Un error aquí no debe vaciar la lista.
      .catch(() => undefined)
      .finally(() => vivo && setCargando(false));

    return () => {
      vivo = false;
    };
  }, []);

  return { ids, cargando };
}
