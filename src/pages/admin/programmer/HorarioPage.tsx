/**
 * Turnos › Horario: `/schedule` is the live schedule, `/schedule?modo=borrador`
 * the shared draft. `/planificador` (the old entry) lands on the draft with
 * its query intact (`?busca=` from a client's setup keeps working).
 */
import { Suspense, lazy } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { rutaDelModo } from "./HorarioModos";

const Planificador = lazy(() => import("./Planificador"));
const Schedule = lazy(() => import("./Schedule"));

export default function HorarioPage() {
  const { search } = useLocation();
  const modo = new URLSearchParams(search).get("modo");

  return (
    <Suspense fallback={null}>
      {modo === "borrador" ? <Planificador /> : <Schedule />}
    </Suspense>
  );
}

export function PlanificadorAlHorario() {
  const { search } = useLocation();

  return <Navigate replace to={rutaDelModo("borrador", search)} />;
}
