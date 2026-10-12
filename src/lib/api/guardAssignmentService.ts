import { ApiService } from "@/services/api/apiService";

const tid = () => localStorage.getItem("tenantId") || "";

/** Lo que responde `shift-cycle` (con o sin `dryRun`). */
export interface CorrerCicloResultado {
  platoonOffsetBefore: number;
  platoonOffsetAfter: number;
  /** Turnos de hoy que se retiran (número, o la lista de turnos). */
  removedToday: number | unknown[];
  /** Turnos que se crean (número, o la lista de turnos). */
  created: number | unknown[];
  /** Próximos bloques de descanso, días civiles o instantes. */
  nextRestBlocks: Array<{ from: string; to: string }>;
  /** Cuándo vuelve a trabajar (instante ISO o día civil). */
  nextWorkStart: string | null;
}

/** Cuántos: el servidor puede devolver la cuenta o la lista. */
export const cuantos = (x: number | unknown[] | null | undefined) =>
  Array.isArray(x) ? x.length : Number(x) || 0;

export const guardAssignmentService = {
  /**
   * Corre el ciclo de rotación de UNA asignación `days` días (positivo = más
   * tarde). Con `dryRun` no escribe nada: devuelve cómo quedaría.
   */
  shiftCycle: async (
    assignmentId: string,
    days: number,
    dryRun: boolean,
  ): Promise<CorrerCicloResultado> => {
    const r: any = await ApiService.post(
      `/tenant/${tid()}/guard-assignment/${encodeURIComponent(assignmentId)}/shift-cycle${dryRun ? "?dryRun=true" : ""}`,
      // `days` arriba y en `data`: el resto de rutas del backend leen `data`.
      { days, data: { days } },
    );

    return (
      r && r.platoonOffsetAfter === undefined && r.data ? r.data : r
    ) as CorrerCicloResultado;
  },
};

export default guardAssignmentService;
