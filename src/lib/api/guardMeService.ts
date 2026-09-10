import api from "../api";

const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
    );

  return t;
};

const guardMeService = {
  /** Guard dashboard: assigned stations, current shift, clock status */
  async dashboard() {
    const tenantId = getTenantId();
    const resp = await api.get(`/tenant/${tenantId}/guard/me`);

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  /** Guard schedule: upcoming shifts + free days */
  async schedule() {
    const tenantId = getTenantId();
    const resp = await api.get(`/tenant/${tenantId}/guard/me/schedule`);

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  /** Clock in with GPS */
  async clockIn(data: {
    stationId: string;
    latitude: number;
    longitude: number;
    shiftSchedule?: string;
  }) {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/guard/me/clock-in`, {
      data,
    });

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  /** Clock out with optional GPS */
  async clockOut(data: {
    latitude?: number;
    longitude?: number;
    observations?: string;
  }) {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/guard/me/clock-out`, {
      data,
    });

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  /** My time-off requests */
  async timeOffList() {
    const tenantId = getTenantId();
    const resp = await api.get(`/tenant/${tenantId}/guard/me/time-off`);

    return resp && resp.data !== undefined ? resp.data : resp;
  },

  /** Request time off */
  async timeOffCreate(data: {
    type: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }) {
    const tenantId = getTenantId();
    const resp = await api.post(`/tenant/${tenantId}/guard/me/time-off`, {
      data,
    });

    return resp && resp.data !== undefined ? resp.data : resp;
  },
};

export default guardMeService;
