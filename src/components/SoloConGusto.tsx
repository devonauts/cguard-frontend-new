import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { SkeletonCards } from "@/components/kit";
import { useGusto } from "@/hooks/useGusto";

/**
 * Gusto es nómina de EE. UU.: sus pantallas sólo existen para empresas de allí.
 *
 * El menú ya escondía «Nómina › Gusto» fuera de EE. UU., pero las dos rutas
 * seguían abriéndose por enlace directo (o desde un aviso) y la de empleados
 * pedía la lista a un servidor que, con razón, contestaba «sólo EE. UU.» — un
 * error en pantalla para una empresa mexicana que nunca debió llegar ahí.
 * Fuera de EE. UU. (o sin permiso) se vuelve a `fuera`.
 */
export default function SoloConGusto({ children, fuera }: { children: ReactNode; fuera: string }) {
  const { isLoading, disponible } = useGusto();

  if (isLoading) return <SkeletonCards count={3} />;
  if (!disponible) return <Navigate replace to={fuera} />;

  return <>{children}</>;
}
