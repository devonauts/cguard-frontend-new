import { useQuery } from "@tanstack/react-query";
import { recargarSinCache } from "@/lib/offline/recargarSinCache";

import { useEntitlement } from "@/hooks/useEntitlement";
import { accesoService, espacioService } from "@/lib/api/sucursalesService";
import { elegirSucursal, sucursalElegida } from "@/lib/sucursalElegida";

/**
 * EL ESPACIO DE TRABAJO (Sucursales 2.0, fase 2): las opciones que tiene la
 * persona y en cuál está. Una sola fuente para la barra, la pastilla del
 * teléfono, la línea de color y el selector al entrar.
 *
 *   · «Vista global» sólo se ofrece si hay más de una sucursal a la vista
 *     (para quien ve una sola, global y esa sucursal son lo mismo).
 *   · Cambiar de espacio RECARGA en la misma ruta: media aplicación guarda sus
 *     listas en estado local, y sin recargar enseñaría una mezcla de antes y
 *     después. La ruta se conserva, así que no se pierde la pantalla.
 */
export interface OpcionDeEspacio {
  id: string; // 'global' o el id de la sucursal
  nombre: string;
  codigo: string | null;
  color: string | null;
  principal: boolean;
  global: boolean;
}

export function useEspacio() {
  const activo = useEntitlement("sucursales");
  const tenant =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const q = useQuery({
    queryKey: ["sucursales", "mias", tenant],
    queryFn: () => accesoService.mias(),
    enabled: activo && Boolean(tenant),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const lista = q.data?.sucursales ?? [];
  const opciones: OpcionDeEspacio[] = [
    ...(lista.length > 1
      ? [
          {
            id: "global",
            nombre: "",
            codigo: null,
            color: null,
            principal: false,
            global: true,
          },
        ]
      : []),
    ...lista.map((b) => ({
      id: b.id,
      nombre: b.name,
      codigo: b.code,
      color: b.color,
      principal: !!b.isHeadquarters,
      global: false,
    })),
  ];
  const elegida = sucursalElegida();
  const actual =
    opciones.find((o) => !o.global && o.id === elegida) ??
    opciones.find((o) => o.global) ??
    opciones[0] ??
    null;

  /** Entra en un espacio: lo guarda aquí y en la cuenta, y recarga si cambió. */
  const entrar = async (id: string) => {
    const antes = sucursalElegida();
    const nueva = id === "global" ? null : id;

    elegirSucursal(nueva);
    try {
      await espacioService.fijar(id);
    } catch {
      /* la copia del navegador ya manda; la de la cuenta es para la próxima vez */
    }
    if ((antes || null) !== nueva) await recargarSinCache();
  };

  return {
    activo,
    cargado: q.isSuccess,
    opciones,
    actual,
    guardado: q.data?.espacio ?? null,
    todas: q.data?.todas ?? false,
    entrar,
  };
}
