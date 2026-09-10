import api from "@/lib/api";

const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
    );

  return t;
};

const routeService = {
  /** Daily run records for a given date (which routes were completed). */
  async runs(date: string) {
    const tenantId = getTenantId();
    const { data: resp } = await api.get<any>(
      `/tenant/${tenantId}/route-runs?date=${encodeURIComponent(date)}`,
    );

    return Array.isArray(resp) ? resp : (resp?.rows ?? []);
  },
  /** Mark a route completed for a date (upsert). */
  async markRun(routeId: string, date: string, note?: string) {
    const tenantId = getTenantId();
    const { data } = await api.post<any>(
      `/tenant/${tenantId}/route/${routeId}/run`,
      { data: { date, note } },
    );

    return data;
  },
  /** Undo a completion for a date. */
  async unmarkRun(routeId: string, date: string) {
    const tenantId = getTenantId();

    await api.delete(
      `/tenant/${tenantId}/route/${routeId}/run?date=${encodeURIComponent(date)}`,
    );
  },
  async list(params?: Record<string, unknown>) {
    const tenantId = getTenantId();
    const qs = params
      ? `?${new URLSearchParams(params as Record<string, string>).toString()}`
      : "";
    const { data: resp } = await api.get<any>(`/tenant/${tenantId}/route${qs}`);

    if (!resp) return { rows: [], count: 0 };
    if (Array.isArray(resp)) return { rows: resp, count: resp.length };
    if (resp.rows && Array.isArray(resp.rows)) return resp;
    if (resp.data && Array.isArray(resp.data))
      return { rows: resp.data, count: resp.data.length };

    return { rows: [], count: 0 };
  },

  async autocomplete(query: string, limit = 10) {
    const tenantId = getTenantId();
    const { data: resp } = await api.get<any>(
      `/tenant/${tenantId}/route/autocomplete?query=${encodeURIComponent(query)}&limit=${limit}`,
    );

    return resp || [];
  },

  async find(id: string) {
    const tenantId = getTenantId();
    const { data: resp } = await api.get<any>(
      `/tenant/${tenantId}/route/${id}`,
    );

    return resp;
  },

  async create(data: Record<string, unknown>) {
    const tenantId = getTenantId();
    const payload = { ...data, tenantId };
    const { data: resp } = await api.post<any>(`/tenant/${tenantId}/route`, {
      data: payload,
    });

    return resp;
  },

  async update(id: string, data: Record<string, unknown>) {
    const tenantId = getTenantId();
    const payload = { ...data, tenantId };
    const { data: resp } = await api.put<any>(
      `/tenant/${tenantId}/route/${id}`,
      { data: payload },
    );

    return resp;
  },

  /**
   * Reordena las paradas para recortar kilómetros y minutos.
   *
   * GRATIS: el servidor calcula el orden con las coordenadas que ya tiene, sin
   * preguntarle a nadie. Devuelve `{ optimized, optimizedAt, changed, meta,
   * points }`; `meta.savings` es la cifra que justifica el botón y `changed`
   * distingue «ha mejorado» de «ya estaba en el mejor orden».
   *
   * Los 400 traen `message` YA TRADUCIDO (`runInProgress`, `notEnoughStops`,
   * `noCoordinates`) y el interceptor de `api` los enseña tal cual: quien llama
   * NO debe reescribirlos.
   */
  async optimize(id: string, speedKmh?: number) {
    const tenantId = getTenantId();
    const payload = speedKmh != null ? { speedKmh } : {};
    const { data: resp } = await api.post<any>(
      `/tenant/${tenantId}/route/${id}/optimize`,
      { data: payload },
    );

    return resp;
  },

  /**
   * Trazado REAL por calles de la ruta.
   *
   * ESTO SE PAGA. Devuelve `{ polyline, source: 'cache'|'google'|'none', reason }`
   * y NUNCA falla: sin clave o con demasiadas paradas devuelve `polyline: null`
   * y quien llama sigue pintando la línea recta.
   *
   * `source: 'cache'` es una respuesta GRATIS —ya había trazado guardado—; sólo
   * `force` vuelve a consultar el servicio de mapas, y por eso `force` no se
   * manda nunca solo: va detrás de un aviso explícito.
   */
  async roadShape(id: string, force = false) {
    const tenantId = getTenantId();
    const { data: resp } = await api.post<any>(
      `/tenant/${tenantId}/route/${id}/road-shape`,
      {
        data: force ? { force: true } : {},
      },
    );

    return resp;
  },

  /* ── Ejecución guiada (2026-09) ─────────────────────────────────────────
     Las EJECUCIONES (`routeRun`) de las rutas: el tablero en vivo, el
     historial, el detalle de una ejecución y las modificaciones de despacho
     sobre un plan en curso. La central sólo cambia el PLAN (añadir, quitar,
     reordenar, omitir, abortar); las visitas las registra el supervisor. */
  async activeRuns() {
    const tenantId = getTenantId();
    const { data } = await api.get<any>(
      `/tenant/${tenantId}/route-runs/active`,
    );

    return Array.isArray(data?.rows) ? data.rows : [];
  },
  async runHistory(params: {
    from?: string;
    to?: string;
    supervisorUserId?: string;
    routeId?: string;
    status?: string;
    clientAccountId?: string;
    limit?: number;
    offset?: number;
  }) {
    const tenantId = getTenantId();
    const qs = new URLSearchParams();

    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    });
    const { data } = await api.get<any>(
      `/tenant/${tenantId}/route-runs/history?${qs.toString()}`,
    );

    return {
      rows: Array.isArray(data?.rows) ? data.rows : [],
      count: Number(data?.count) || 0,
    };
  },
  async runDetail(runId: string) {
    const tenantId = getTenantId();
    const { data } = await api.get<any>(
      `/tenant/${tenantId}/route-runs/${runId}`,
    );

    return data;
  },
  async dispatchAddStop(
    runId: string,
    body: {
      siteType?: string;
      siteId: string;
      afterOrder?: number | null;
      reason?: string;
      instructions?: string;
      priority?: string;
      inspectionTemplateId?: string | null;
      duration?: number | null;
    },
  ) {
    const tenantId = getTenantId();
    const { data } = await api.post<any>(
      `/tenant/${tenantId}/route-runs/${runId}/stops`,
      { data: body },
    );

    return data;
  },
  async dispatchReorder(
    runId: string,
    routePointIds: string[],
    reason?: string,
  ) {
    const tenantId = getTenantId();
    const { data } = await api.post<any>(
      `/tenant/${tenantId}/route-runs/${runId}/stops/reorder`,
      { data: { routePointIds, reason } },
    );

    return data;
  },
  async dispatchRemoveStop(runId: string, pointId: string, reason?: string) {
    const tenantId = getTenantId();
    const { data } = await api.delete<any>(
      `/tenant/${tenantId}/route-runs/${runId}/stops/${pointId}`,
      { data: { reason } },
    );

    return data;
  },
  async dispatchSkipStop(
    runId: string,
    pointId: string,
    body: { reason?: string; notes?: string },
  ) {
    const tenantId = getTenantId();
    const { data } = await api.post<any>(
      `/tenant/${tenantId}/route-runs/${runId}/stops/${pointId}/skip`,
      { data: body },
    );

    return data;
  },
  async dispatchAbort(runId: string, reason: string) {
    const tenantId = getTenantId();
    const { data } = await api.post<any>(
      `/tenant/${tenantId}/route-runs/${runId}/abort`,
      { data: { reason } },
    );

    return data;
  },

  async destroy(ids: string[] | string) {
    const tenantId = getTenantId();
    const payload = Array.isArray(ids) ? ids : [ids];

    await api.delete(`/tenant/${tenantId}/route`, { data: { ids: payload } });

    return true;
  },
};

export default routeService;
