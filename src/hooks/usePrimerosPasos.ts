/**
 * The getting-started progress of the active company (phase 3).
 *
 * One request shared by everyone who asks (the Panel guide, empty states that
 * want to know whether the company has stations at all), cached 60 s per
 * company so moving between pages doesn't re-ask.
 */
import { useCallback, useEffect, useState } from "react";

import { ApiService } from "@/services/api/apiService";
import {
  normalizarPrimerosPasos,
  type PrimerosPasos,
} from "@/lib/primerosPasos";

const TTL_MS = 60_000;
const cache = new Map<
  string,
  {
    at: number;
    valor: PrimerosPasos | null;
    promesa?: Promise<PrimerosPasos | null>;
  }
>();

const tenantActivo = () =>
  typeof window !== "undefined" ? localStorage.getItem("tenantId") || "" : "";

export async function pedirPrimerosPasos(
  tenantId: string,
  fresco = false,
): Promise<PrimerosPasos | null> {
  const ya = cache.get(tenantId);

  /* A request already on its way answers everyone, «fresco» included: the
     guide asking on mount and on focus, or two readers on one page, used to
     send two (QA 2026-11-01). */
  if (ya?.promesa) return ya.promesa;
  if (!fresco && ya && Date.now() - ya.at < TTL_MS) return ya.valor;
  const promesa = ApiService.get(`/tenant/${tenantId}/getting-started`)
    .then((r: unknown) => normalizarPrimerosPasos(r))
    .catch(() => null);

  cache.set(tenantId, { at: Date.now(), valor: ya?.valor ?? null, promesa });
  const valor = await promesa;

  cache.set(tenantId, { at: Date.now(), valor });

  return valor;
}

/** Forget the cached answer (after creating a station, publishing…). */
export function olvidarPrimerosPasos(tenantId?: string) {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

/**
 * `fresco`: the Panel guide asks the server again each time it mounts (and when
 * the window regains focus), showing the cached answer meanwhile, so a step
 * done on another page shows as done when the user comes back (QA 2026-11-01:
 * still 0/6 after creating a station, until a reload).
 */
export function usePrimerosPasos({ fresco = false }: { fresco?: boolean } = {}): {
  datos: PrimerosPasos | null;
  cargando: boolean;
  ocultar: () => Promise<void>;
  recargar: () => void;
} {
  const tenantId = tenantActivo();
  const [datos, setDatos] = useState<PrimerosPasos | null>(
    () => cache.get(tenantId)?.valor ?? null,
  );
  const [cargando, setCargando] = useState(!cache.get(tenantId)?.valor);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    let vivo = true;

    setCargando(!cache.get(tenantId)?.valor);
    pedirPrimerosPasos(tenantId, fresco || vuelta > 0).then((v) => {
      if (!vivo) return;
      setDatos(v);
      setCargando(false);
    });

    return () => {
      vivo = false;
    };
  }, [tenantId, vuelta, fresco]);

  useEffect(() => {
    if (!fresco || typeof window === "undefined") return;
    const alVolver = () => setVuelta((n) => n + 1);

    window.addEventListener("focus", alVolver);

    return () => window.removeEventListener("focus", alVolver);
  }, [fresco]);

  const ocultar = useCallback(async () => {
    if (!tenantId) return;
    const r = await ApiService.post(
      `/tenant/${tenantId}/getting-started/dismiss`,
      {},
    );
    const v = normalizarPrimerosPasos(r);

    cache.set(tenantId, { at: Date.now(), valor: v });
    setDatos(v);
  }, [tenantId]);

  const recargar = useCallback(() => setVuelta((n) => n + 1), []);

  return { datos, cargando, ocultar, recargar };
}

export default usePrimerosPasos;
